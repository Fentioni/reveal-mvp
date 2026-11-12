/**
 * Stage 4D private scratch-surface preferences and uploaded covers.
 * Only available in staging; entry-point explicitly gates this endpoint.
 * Every request must first pass the existing legacy owner-token authorisation.
 */
const MAX_IMAGE = 10 * 1024 * 1024;
const IMAGE_TYPES = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
});
const STYLES = new Set(['classic', 'theatre', 'concert', 'custom']);
const FOILS = new Set(['gold', 'silver', 'midnight', 'rose']);
const DEFAULT_SURFACE = Object.freeze({
  style: 'classic',
  foil: 'gold',
  coverAssetId: null
});

function error(message, status = 400) {
  return new Response(JSON.stringify({success: false, error: message}), {
    status,
    headers: {'content-type': 'application/json; charset=utf-8','cache-control': 'no-store','x-content-type-options': 'nosniff'}
  });
}
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {'content-type': 'application/json; charset=utf-8','cache-control': 'no-store','x-content-type-options': 'nosniff'}
  });
}
const timestamp = () => new Date().toISOString();

function parseFields(row) {
  if (!row) return {};
  try {
    const fields = JSON.parse(row.fields_json || '{}');
    return fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : {};
  } catch {
    return {};
  }
}
async function details(env, id) {
  const [config, asset] = await Promise.all([
    env.DB.prepare('SELECT fields_json FROM reveal_configurations WHERE reveal_id=? AND product_id=?')
      .bind(id, 'ticket-reveal').first(),
    env.DB.prepare('SELECT id,r2_key FROM reveal_assets WHERE reveal_id=? AND kind=? LIMIT 1')
      .bind(id,'scratch-cover').first()
  ]);
  const fields = parseFields(config);
  const saved = fields.scratchSurface && typeof fields.scratchSurface === 'object'
    ? fields.scratchSurface : DEFAULT_SURFACE;
  const surface = {
    style: STYLES.has(saved.style) ? saved.style : 'classic',
    foil: FOILS.has(saved.foil) ? saved.foil : 'gold',
    coverAssetId: asset ? asset.id : null
  };
  return {fields, surface, asset};
}

async function dimensions(file) {
  const b = new Uint8Array(await file.slice(0, Math.min(file.size, 262144)).arrayBuffer());
  if(file.type === 'image/png') {
    const ok = [137,80,78,71,13,10,26,10].every((v,i) => b[i] === v);
    if(!ok || b.length < 24) return null;
    return {width:(b[16]*16777216+b[17]*65536+b[18]*256+b[19]), height:(b[20]*16777216+b[21]*65536+b[22]*256+b[23])};
  }
  if(file.type === 'image/jpeg') {
    if (b[0] !== 255 || b[1] !== 216 || b[2] !== 255) return null;
    let p = 2;
    while(p + 8 < b.length) {
      if(b[p] !== 255) {p++;continue;}
      while(b[p] === 255 && p < b.length) p++;
      const marker = b[p++];
      if(marker === 0xD9 || marker === 0xDA) break;
      if(marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
      if(p + 2 >= b.length) break;
      const segmentLength = (b[p] << 8) + b[p+1];
      if(segmentLength < 2 || p + segmentLength > b.length) break;
      if ([0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF].includes(marker)) {
        return {height:(b[p+3]<<8)+b[p+4],width:(b[p+5]<<8)+b[p+6]};
      }
      p += segmentLength;
    }
    return null;
  }
  if(file.type === 'image/webp') {
    const ascii = (start,count) => String.fromCharCode(...b.slice(start,start+count));
    if(b.length < 30 || ascii(0,4) !== 'RIFF' || ascii(8,4) !== 'WEBP') return null;
    if(ascii(12,4) === 'VP8X') {
      const width = 1 + b[24] + (b[25]<<8) + (b[26]<<16);
      const height = 1 + b[27] + (b[28]<<8) + (b[29]<<16);
      return {width,height};
    }
    if(ascii(12,4) === 'VP8L') {
      if (b[20] !== 47) return null;
      return {
        width: 1 + (((b[21] & 63) << 8) | b[20 + 1 - 1 + 1 - 1 + 0]),
        height: 1 + (((b[24] & 15) << 10) | (b[23] << 2) | ((b[22] & 192) >> 6))
      };
    }
    if(ascii(12,4) === 'VP8 ') {
      for(let p=20;p<Math.min(75,b.length-8);p++) {
        if(b[p] === 0x9d && b[p+1] === 1 && b[p+2] === 0x2a) {
          return {width:(b[p+3]+(b[p+4]<<8)) & 0x3fff,height:(b[p+5]+(b[p+6]<<8)) & 0x3fff};
        }
      }
    }
    return null;
  }
  return null;
}

async function validateImage(file) {
  if (!file || typeof file === 'string' || typeof file.size !== 'number') {
    return error('Please select an image file.');
  }
  if (!file.size || file.size > MAX_IMAGE) return error('Image must be between 1 byte and 10 MB.',413);
  if (!Object.hasOwn(IMAGE_TYPES, file.type)) return error('Choose a JPEG, PNG or WebP image.');
  const size = await dimensions(file);
  if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height)) {
    return error('Image contents or dimensions could not be verified.');
  }
  if (size.width < 640 || size.height < 640 || size.width > 12000 || size.height > 12000) {
    return error('Choose an image between 640 × 640 and 12,000 × 12,000 pixels.');
  }
  return null;
}

export async function scratchSurfaceResponse(request, env, ctx, originalWorker) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/reveals\/([A-Za-z0-9_-]+)\/scratch-surface(?:\/(image))?\/?$/);
  if (!match) return null;
  if (!env.DB || !env.IMAGES) return error('Scratch-surface storage unavailable.', 503);
  const [,id,action] = match;
  if (action ? request.method !== 'GET' : !['GET','PUT'].includes(request.method)) {
    return error('Method not allowed.',405);
  }
  const origin = request.headers.get('Origin');
  if (request.method === 'PUT' && origin && origin !== url.origin) {
    return error('Cross-origin changes are not allowed.',403);
  }

  // Reuse the established owner edit-token validation and timing-safe check.
  // No private cover or settings are served without an authorised owner GET.
  const headers = new Headers();
  const token = request.headers.get('X-Edit-Token');
  if (token) headers.set('X-Edit-Token',token);
  const auth = await originalWorker.fetch(new Request(new URL('/api/reveals/' + id, url), {headers}),env,ctx);
  if (!auth.ok) return auth;
  const {reveal} = await auth.json();
  if (!reveal) return error('Reveal not found.',404);

  try {
    const current = await details(env,id);
    if (action === 'image') {
      if (!current.asset || current.surface.style !== 'custom') return error('Image not found.',404);
      const object = await env.IMAGES.get(current.asset.r2_key);
      if (!object) return error('Image not found.',404);
      const metadata = new Headers();
      object.writeHttpMetadata(metadata);
      const contentType = metadata.get('Content-Type');
      if (!Object.hasOwn(IMAGE_TYPES, contentType)) return error('Unsupported saved image.',415);
      return new Response(object.body, {headers:{
        'content-type':contentType, 'cache-control':'private, no-store',
        'x-content-type-options':'nosniff', 'content-disposition':'inline',
        'referrer-policy':'no-referrer'
      }});
    }
    if (request.method === 'GET') {
      return json({
        success:true,
        surface:{
          style:current.surface.style,
          foil:current.surface.foil,
          hasImage:Boolean(current.asset && current.surface.style==='custom')
        }
      });
    }
    if (reveal.status !== 'draft') return error('Amend the reveal before changing its surface.',409);
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('multipart/form-data')) {
      return error('Submit surface details using multipart form data.',415);
    }
    if (Number(request.headers.get('Content-Length')) > MAX_IMAGE + 65536) {
      return error('Upload is too large.',413);
    }
    const body = await request.formData();
    const style = body.get('style');
    const foil = body.get('foil');
    const uploaded = body.get('coverImage');
    if (typeof style !== 'string' || !STYLES.has(style) || typeof foil !== 'string' || !FOILS.has(foil)) {
      return error('Choose a valid scratch surface and foil finish.');
    }
    if (uploaded !== null && (typeof uploaded === 'string' || typeof uploaded.size !== 'number')) {
      return error('Invalid uploaded image.');
    }
    const file = uploaded?.size ? uploaded : null;
    if (file && style !== 'custom') return error('Uploaded scratch photos require the custom style.');
    if (file) {
      const validationError = await validateImage(file);
      if (validationError) return validationError;
    }
    if (style === 'custom' && !file && !current.asset) {
      return error('Choose an image for the custom scratch surface.');
    }

    const keepExisting = style === 'custom' && !file && Boolean(current.asset);
    let replacementKey = null;
    let newAssetId = current.asset?.id || null;
    const oldKey = current.asset?.r2_key || null;

    try {
      if (file) {
        replacementKey = 'scratch-covers/' + id + '/' + crypto.randomUUID() + IMAGE_TYPES[file.type];
        await env.IMAGES.put(replacementKey, await file.arrayBuffer(), {
          httpMetadata:{contentType:file.type},
          customMetadata:{revealId:id,kind:'scratch-cover',uploadedAt:timestamp()}
        });
        if (!newAssetId) newAssetId = crypto.randomUUID();
      } else if (!keepExisting) {
        newAssetId = null;
      }

      const fields = {
        ...current.fields,
        scratchSurface:{
          style,
          foil,
          coverAssetId:style==='custom' ? newAssetId : null
        }
      };
      const stamp = timestamp();
      const statements = [];
      if (replacementKey) {
        if (current.asset) {
          statements.push(env.DB.prepare('UPDATE reveal_assets SET r2_key=? WHERE id=? AND reveal_id=? AND kind=?')
            .bind(replacementKey,current.asset.id,id,'scratch-cover'));
        } else {
          statements.push(env.DB.prepare('INSERT INTO reveal_assets(id,reveal_id,r2_key,kind,created_at) VALUES (?,?,?,?,?)')
            .bind(newAssetId,id,replacementKey,'scratch-cover',stamp));
        }
      } else if (!keepExisting && current.asset) {
        statements.push(env.DB.prepare('DELETE FROM reveal_assets WHERE id=? AND reveal_id=? AND kind=?')
          .bind(current.asset.id,id,'scratch-cover'));
      }
      statements.push(env.DB.prepare(
        'INSERT INTO reveal_configurations(reveal_id,product_id,fields_json,created_at,updated_at) VALUES (?,?,?,?,?) ' +
        'ON CONFLICT(reveal_id) DO UPDATE SET fields_json=excluded.fields_json, updated_at=excluded.updated_at'
      ).bind(id,'ticket-reveal',JSON.stringify(fields),stamp,stamp));
      await env.DB.batch(statements);
      // Delete obsolete objects only after the D1 commit succeeds.
      if (oldKey && oldKey !== replacementKey && !keepExisting) {
        await env.IMAGES.delete(oldKey).catch(() => {});
      }
      return json({success:true,surface:{style,foil,hasImage:style==='custom'}});
    } catch (cause) {
      if (replacementKey) await env.IMAGES.delete(replacementKey).catch(() => {});
      throw cause;
    }
  } catch {
    return error('The scratch surface could not be saved or retrieved. Please try again.',503);
  }
}
