/**
 * Staging-only paid recipient scratch route. Every private response requires
 * status=paid + paid_at, matching the established legacy recipient gate.
 * No public or owner review can retrieve personalised scratch data pre-payment.
 */
const hide = () => new Response('This reveal is not available.', {
  status:404,
  headers:{'cache-control':'no-store','content-type':'text/plain; charset=utf-8','x-content-type-options':'nosniff'}
});
const json = body => new Response(JSON.stringify(body), {
  headers:{'cache-control':'private, no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'}
});
const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp']);
const STYLES = new Set(['classic','theatre','concert','festival','backstage','custom']);
const FOILS = new Set(['gold','silver','midnight','rose']);

export async function scratchRecipientResponse(request, env, ctx) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/r\/([A-Za-z0-9_-]+)(?:\/(scratch-data|scratch-cover|scratch-image))?\/?$/);
  if (!match) return null;
  // Existing legacy /r route remains untouched outside the staging Worker.
  if (env.STAGING_DISABLE_CHECKOUT !== 'true') return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed.',{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
  }
  if (!env.DB) return hide();
  const [,slug,action] = match;
  try {
    const row = await env.DB.prepare('SELECT * FROM reveals WHERE public_slug = ?').bind(slug).first();
    if (!row || row.status !== 'paid' || !row.paid_at) return hide();

    const configuration = await env.DB.prepare(
      'SELECT fields_json FROM reveal_configurations WHERE reveal_id=? AND product_id=?'
    ).bind(row.id,'ticket-reveal').first();

    if (!configuration) return action ? hide() : null; // Preserve legacy paid page.
    let fields;
    try { fields = JSON.parse(configuration.fields_json || '{}'); } catch { return hide(); }
    const settings = fields?.scratchSurface;
    if (!settings || !STYLES.has(settings.style) || !FOILS.has(settings.foil)) {
      return action ? hide() : null;
    }
    const audio = fields.audio && typeof fields.audio === 'object' ? fields.audio : {};
    const audioSettings = {
      enabled:audio.enabled !== false,
      cue:'cinematic-drum-roll',
      trigger:'first-scratch',
      delayMs:3000
    };

    if (action === 'scratch-data') {
      const hasCover = settings.style === 'custom' && typeof settings.coverAssetId === 'string';
      return json({
        success:true,
        scratchSurface:{style:settings.style,foil:settings.foil,hasImage:hasCover,variant:settings.variant === 'concert' ? 'concert' : 'ticket'},
        audio:audioSettings,
        reveal:{
          recipient:row.recipient,
          sender:row.sender,
          eventName:row.event_name,
          eventDate:row.event_date,
          eventTime:row.event_time,
          venue:row.venue,
          admit:row.admit,
          personalMessage:row.personal_message,
          ticketUrl:row.ticket_url,
          hasEventImage:Boolean(row.image_key)
        }
      });
    }
    // The recipient sees the purchaser's one uploaded event image only
    // after the identical payment gate checked above. Never expose the R2 key.
    if (action === 'scratch-image') {
      if (!row.image_key || !env.IMAGES) return hide();
      const object = await env.IMAGES.get(row.image_key);
      if (!object) return hide();
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      const type = headers.get('Content-Type');
      if (!IMAGE_TYPES.has(type)) return hide();
      return new Response(request.method === 'HEAD' ? null : object.body,{
        headers:{
          'content-type':type, 'cache-control':'private, no-store',
          'x-content-type-options':'nosniff','referrer-policy':'no-referrer'
        }
      });
    }
    if (action === 'scratch-cover') {
      if (settings.style !== 'custom' || !settings.coverAssetId || !env.IMAGES) return hide();
      const asset = await env.DB.prepare(
        'SELECT r2_key FROM reveal_assets WHERE id=? AND reveal_id=? AND kind=?'
      ).bind(settings.coverAssetId,row.id,'scratch-cover').first();
      if (!asset) return hide();
      const object = await env.IMAGES.get(asset.r2_key);
      if (!object) return hide();
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      const type = headers.get('Content-Type');
      if (!IMAGE_TYPES.has(type)) return hide();
      return new Response(request.method === 'HEAD' ? null : object.body,{
        headers:{
          'content-type':type, 'cache-control':'private, no-store',
          'x-content-type-options':'nosniff','referrer-policy':'no-referrer'
        }
      });
    }

    if (!env.ASSETS) return hide();
    const asset = await env.ASSETS.fetch(
      new Request(new URL('/recipient-scratch',url),request)
    );
    const headers = new Headers(asset.headers);
    headers.set('cache-control','private, no-store');
    headers.set('referrer-policy','no-referrer');
    return new Response(request.method === 'HEAD' ? null : asset.body,{
      status:asset.status,
      headers
    });
  } catch {
    return hide();
  }
}
