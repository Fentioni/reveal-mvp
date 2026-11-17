import {defaultDesign,validateDesign,MAX_ARTWORK_DATA} from '../public/template-design-schema.js';
const MAX_DESIGN_BYTES=MAX_ARTWORK_DATA+120000;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const prefix='admin-template-designs/v1/';
const encoder=new TextEncoder();
async function authorised(request,env){
 const secret=env.TEMPLATE_ADMIN_TOKEN;
 if(typeof secret!=='string'||secret.length<24)return null;
 const auth=request.headers.get('Authorization')||'';
 if(!auth.startsWith('Bearer ')||auth.length>512)return false;
 const a=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(auth.slice(7))));
 const b=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(secret)));
 let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0;
}
export async function templateDesignResponse(request,env){
 const url=new URL(request.url),path=url.pathname;
 const match=/^\/api\/template-designs\/([a-z-]+)$/.exec(path),check=path==='/api/admin/template-designer';
 if(!match&&!check)return null;
 if(env.STAGING_DISABLE_CHECKOUT!=='true')return json({error:'Not available.'},404);
 if(check){
  if(request.method!=='GET')return json({error:'Method not allowed.'},405);
  const access=await authorised(request,env);return access===null?json({error:'Set TEMPLATE_ADMIN_TOKEN as a Cloudflare Worker secret (at least 24 characters).'},503):access?json({success:true}):json({error:'Invalid administrator token.'},401);
 }
 const id=match[1],base=defaultDesign(id);if(!base)return json({error:'Template not found.'},404);
 if(!env.IMAGES)return json({error:'Design storage unavailable.'},503);
 try{
  const key=prefix+id+'.json';
  if(request.method==='GET'){
   const object=await env.IMAGES.get(key);
   if(!object)return json({revision:'base',template:null});
   const value=await object.json();return json({revision:value.revision,template:validateDesign(id,value.template)});
  }
  if(request.method!=='PUT')return json({error:'Method not allowed.'},405);
  const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'Cross-origin update denied.'},403);
  const access=await authorised(request,env);if(access===null)return json({error:'Set TEMPLATE_ADMIN_TOKEN as a Cloudflare Worker secret (at least 24 characters).'},503);
  if(!access)return json({error:'Invalid administrator token.'},401);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required.'},415);
  if(Number(request.headers.get('Content-Length'))>MAX_DESIGN_BYTES)return json({error:'Design or artwork is too large.'},413);
  const reader=request.body?.getReader();if(!reader)return json({error:'JSON required.'},400);
  const chunks=[];let length=0;
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_DESIGN_BYTES){await reader.cancel();return json({error:'Design or artwork is too large.'},413);}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const raw=new TextDecoder().decode(bytes);
  let body,template;try{body=JSON.parse(raw);template=validateDesign(id,body.template);}catch(e){return json({error:e.message||'Invalid design.'},400);}
  const current=await env.IMAGES.get(key),saved=current?await current.json():null;
  if(body.revision!==(saved?.revision||'base'))return json({error:'This design has changed since you opened it. Reload before saving.'},409);
  const revision=crypto.randomUUID(),value={revision,template,savedAt:new Date().toISOString()};
  const written=await env.IMAGES.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'},onlyIf:current?{etagMatches:current.etag}:{etagDoesNotMatch:'*'}});
  if(!written)return json({error:'Another update was saved. Reload before saving.'},409);
  return json({success:true,revision,template});
 }catch{return json({error:'Template storage unavailable.'},503);}
}
