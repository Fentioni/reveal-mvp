import {SCRATCH_ARTWORKS,getScratchArtwork,isStudioScratchArtwork} from '../public/scratch-artwork-catalogue.js';
import {authorised} from './template-designs.js';
import {dimensions} from './image-dimensions.js';
const prefix='admin-scratch-artwork/v2/',key=prefix+'catalogue.json',MAX=10*1024*1024;
const types=new Set(['image/jpeg','image/png','image/webp']);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
async function manifest(env){
 const object=env.IMAGES?await env.IMAGES.get(key):null;
 return {object,value:object?await object.json():{custom:[],archived:[]}};
}
function entries(value){return [...SCRATCH_ARTWORKS,...value.custom].map(a=>({...a,archived:value.archived.includes(a.id)}));}
export async function resolveStoredArtwork(env,id){
 if(!getScratchArtwork(id))return null;
 if(!isStudioScratchArtwork(id))return getScratchArtwork(id);
 return (await manifest(env)).value.custom.find(a=>a.id===id)||null;
}
export async function availableScratchArtwork(env,id){
 if(!getScratchArtwork(id))return null;
 return entries((await manifest(env)).value).find(a=>a.id===id&&!a.archived)||null;
}
async function bounded(request,limit){
 const reader=request.body?.getReader();if(!reader)throw Error('No request body.');
 const chunks=[];let n=0;
 for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>limit){await reader.cancel();return null;}chunks.push(value);}
 const bytes=new Uint8Array(n);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.byteLength;}return bytes;
}
export async function scratchArtworkResponse(request,env){
 const url=new URL(request.url),catalogue=url.pathname==='/api/scratch-artwork',id=url.pathname.match(/^\/api\/scratch-artwork\/(cover-[a-f0-9-]+)$/)?.[1];
 if(!catalogue&&!id)return null;
 if(env.STAGING_DISABLE_CHECKOUT!=='true')return json({error:'Not available.'},404);
 try{
  if(id){
   if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed.'},405);
   const entry=await resolveStoredArtwork(env,id);if(!entry)return json({error:'Artwork not found.'},404);
   const object=await env.IMAGES.get(prefix+id);if(!object)return json({error:'Artwork unavailable.'},404);
   return new Response(request.method==='HEAD'?null:object.body,{headers:{'content-type':entry.contentType,'cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}});
  }
  if(request.method==='GET')return json({artworks:entries((await manifest(env)).value)});
  if(!['POST','DELETE','PATCH'].includes(request.method))return json({error:'Method not allowed.'},405);
  const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'Cross-origin update denied.'},403);
  const access=await authorised(request,env);if(access===null)return json({error:'Set TEMPLATE_ADMIN_TOKEN as a Cloudflare Worker secret.'},503);
  if(!access)return json({error:'Invalid administrator token.'},401);
  if(!env.IMAGES)return json({error:'Artwork storage unavailable.'},503);
  const {object,value}=await manifest(env);const all=entries(value),active=all.filter(a=>!a.archived);
  let selected,uploaded=false;
  if(request.method==='POST'){
   if(!request.headers.get('Content-Type')?.startsWith('multipart/form-data;'))return json({error:'Select an image and name.'},415);
   const bytes=await bounded(request,MAX+65536);if(!bytes)return json({error:'Image must be no larger than 10 MB.'},413);
   const form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('Content-Type')}}).formData();
   const label=typeof form.get('name')==='string'?form.get('name').trim():'',file=form.get('image');
   if(!label||label.length>80||/[\x00-\x1f\x7f]/.test(label))return json({error:'Enter an artwork name (up to 80 characters).'},400);
   if(all.some(a=>a.label.toLowerCase()===label.toLowerCase()))return json({error:'This artwork name already exists. Restore it or use another name.'},409);
   if(value.custom.length>=300)return json({error:'Artwork collection limit reached.'},409);
   if(!file||typeof file==='string'||!file.size||file.size>MAX||!types.has(file.type))return json({error:'Choose JPEG, PNG or WebP up to 10 MB.'},400);
   const size=await dimensions(file);
   if(!size||size.width*4!==size.height*3||size.width<900||size.height>12000)return json({error:'Choose a 3:4 portrait image, at least 900 × 1200 pixels (1800 × 2400 recommended).'},400);
   selected='cover-'+crypto.randomUUID();
   await env.IMAGES.put(prefix+selected,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});
   uploaded=true;value.custom.push({id:selected,label,src:'/api/scratch-artwork/'+selected,contentType:file.type,width:size.width,height:size.height});
  }else{
   const bytes=await bounded(request,4096);if(!bytes)return json({error:'Request too large.'},413);
   let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'Invalid request.'},400);}
   selected=body?.id;const entry=all.find(a=>a.id===selected);
   if(!entry)return json({error:'Artwork not found.'},404);
   if(request.method==='DELETE'){
    if(entry.archived)return json({error:'Artwork is already deleted.'},409);
    if(active.length<=1)return json({error:'Keep at least one available scratch cover.'},409);
    value.archived.push(selected);
   }else{
    if(!entry.archived)return json({error:'Artwork is already available.'},409);
    value.archived=value.archived.filter(a=>a!==selected);
   }
  }
  let written;try{written=await env.IMAGES.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'},onlyIf:object?{etagMatches:object.etag}:{etagDoesNotMatch:'*'}});}
  catch(e){if(uploaded)await env.IMAGES.delete(prefix+selected).catch(()=>{});throw e;}
  if(!written){if(uploaded)await env.IMAGES.delete(prefix+selected).catch(()=>{});return json({error:'Collection changed. Reload and try again.'},409);}
  return json({success:true,id:selected},request.method==='POST'?201:200);
 }catch(e){return json({error:'Scratch artwork could not be processed. Check the file or try again.'},503);}
}
