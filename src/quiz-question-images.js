/**
 * Three independent optional question images, stored privately in the existing
 * reveal_assets / R2 infrastructure. The original final-surprise upload is
 * deliberately not affected. Every purchaser request requires the established
 * owner edit token before any image metadata or bytes can be accessed.
 */
const MAX_IMAGE=10*1024*1024;
const TYPES=Object.freeze({'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'});
const kindFor=n=>'quiz-question-'+n;
const HEADERS={'cache-control':'private, no-store','x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
  ...HEADERS,'content-type':'application/json; charset=utf-8'
}});
const fail=(error,status=400)=>json({success:false,error},status);
const isValidFile=async file=>{
  if(!file || typeof file==='string' || !file.size || file.size>MAX_IMAGE ||
      !Object.hasOwn(TYPES,file.type)) return false;
  const start=new Uint8Array(await file.slice(0,16).arrayBuffer());
  if(file.type==='image/png')return [137,80,78,71,13,10,26,10].every((b,i)=>start[i]===b);
  if(file.type==='image/jpeg')return start[0]===255 && start[1]===216 && start[2]===255;
  if(file.type==='image/webp'){
    return String.fromCharCode(...start.slice(0,4))==='RIFF' &&
      String.fromCharCode(...start.slice(8,12))==='WEBP';
  }
  return false;
};

export async function quizQuestionImageResponse(request,env,ctx,originalWorker){
  const url=new URL(request.url);
  const match=url.pathname.match(/^\/api\/reveals\/([A-Za-z0-9_-]+)\/quiz\/question-image\/([1-3])\/?$/);
  if(!match)return null;
  if(env.STAGING_DISABLE_CHECKOUT!=='true')return fail('Not available.',404);
  if(!['GET','HEAD','PUT','DELETE'].includes(request.method))return fail('Method not allowed.',405);
  if(['PUT','DELETE'].includes(request.method)&&request.headers.get('Origin')&&
     request.headers.get('Origin')!==url.origin)return fail('Cross-origin changes are not allowed.',403);
  if(!env.DB || !env.IMAGES)return fail('Quiz image storage unavailable.',503);
  const [,revealId,num]=match;
  // Verify token using the original Worker before looking up image keys.
  const headers=new Headers();
  const token=request.headers.get('X-Edit-Token');
  if(token)headers.set('X-Edit-Token',token);
  const owner=await originalWorker.fetch(new Request(
    new URL('/api/reveals/'+revealId,url),{headers}),env,ctx);
  if(!owner.ok)return owner;
  const ownerJson=await owner.json();
  if(!ownerJson.success || !ownerJson.reveal)return fail('Reveal unavailable.',404);
  const kind=kindFor(num);
  try{
    const config=await env.DB.prepare(
      'SELECT product_id FROM reveal_configurations WHERE reveal_id=?'
    ).bind(revealId).first();
    if(!config || config.product_id!=='three-question-quiz')return fail('Quiz not configured.',404);
    const existing=await env.DB.prepare(
      'SELECT id,r2_key FROM reveal_assets WHERE reveal_id=? AND kind=? LIMIT 1'
    ).bind(revealId,kind).first();

    if(request.method==='GET'||request.method==='HEAD'){
      if(!existing)return fail('No image for this question.',404);
      const object=await env.IMAGES.get(existing.r2_key);
      if(!object)return fail('Question image unavailable.',404);
      const meta=new Headers();
      object.writeHttpMetadata(meta);
      const type=meta.get('Content-Type');
      if(!Object.hasOwn(TYPES,type))return fail('Unsupported saved image.',415);
      return new Response(request.method==='HEAD'?null:object.body,{
        headers:{...HEADERS,'content-type':type}
      });
    }

    if(ownerJson.reveal.status!=='draft')return fail('Amend this reveal before changing question images.',409);
    if(request.method==='DELETE'){
      if(!existing)return json({success:true,hasImage:false});
      await env.DB.prepare(
        'DELETE FROM reveal_assets WHERE id=? AND reveal_id=? AND kind=?'
      ).bind(existing.id,revealId,kind).run();
      await env.IMAGES.delete(existing.r2_key).catch(()=>{});
      return json({success:true,hasImage:false});
    }

    if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('multipart/form-data')){
      return fail('Upload an image using multipart form data.',415);
    }
    if(Number(request.headers.get('Content-Length'))>MAX_IMAGE+65536){
      return fail('Image is too large.',413);
    }
    const form=await request.formData();
    const image=form.get('image');
    if(!await isValidFile(image)){
      return fail('Choose a valid JPEG, PNG or WebP image up to 10 MB.');
    }
    const key='quiz-questions/'+revealId+'/'+num+'/'+crypto.randomUUID()+TYPES[image.type];
    await env.IMAGES.put(key,await image.arrayBuffer(),{
      httpMetadata:{contentType:image.type},
      customMetadata:{revealId,question:num,kind}
    });
    try{
      const stamp=new Date().toISOString();
      if(existing){
        const result=await env.DB.prepare(
          'UPDATE reveal_assets SET r2_key=? WHERE id=? AND reveal_id=? AND kind=?'
        ).bind(key,existing.id,revealId,kind).run();
        if(result.meta?.changes!==1)throw Error('Image changed while saving.');
      }else{
        await env.DB.prepare(
          'INSERT INTO reveal_assets(id,reveal_id,r2_key,kind,created_at) VALUES(?,?,?,?,?)'
        ).bind(crypto.randomUUID(),revealId,key,kind,stamp).run();
      }
    }catch(error){
      await env.IMAGES.delete(key).catch(()=>{});
      throw error;
    }
    if(existing)await env.IMAGES.delete(existing.r2_key).catch(()=>{});
    return json({success:true,hasImage:true});
  }catch(error){
    console.error('Question image request failed:',error?.name||'Error');
    return fail('Question image could not be saved or retrieved.',503);
  }
}
