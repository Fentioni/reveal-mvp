import {POST_TEMPLATES} from '../public/post-scratch-catalogue.js';
import {defaultDesign,validateDesign,assertTemplateLayout,MAX_ARTWORK_DATA,isStudioTemplateId,purgeTemplateDemoText} from '../public/template-design-schema.js';
const MAX_DESIGN_BYTES=MAX_ARTWORK_DATA+120000;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const prefix='admin-template-designs/v1/';
const encoder=new TextEncoder(),manifestKey=prefix+'catalogue.json';
async function manifest(env){
 const object=env.IMAGES?await env.IMAGES.get(manifestKey):null;
 return {object,value:object?await object.json():{custom:[],archived:[]}};
}
export async function getTemplateCatalogue(env){
 const {value}=await manifest(env);
 return [...POST_TEMPLATES.map(({id,name,collection})=>({id,name,collection:collection||'Existing templates'})),...value.custom].map(t=>({...t,archived:value.archived.includes(t.id)}));
}
async function mutateCatalogue(request,env,url){
 const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'Cross-origin update denied.'},403);
 const access=await authorised(request,env);if(access===null)return json({error:'Set TEMPLATE_ADMIN_TOKEN as a Cloudflare Worker secret (at least 24 characters).'},503);
 if(!access)return json({error:'Invalid administrator token.'},401);
 if(!env.IMAGES)return json({error:'Design storage unavailable.'},503);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required.'},415);
 const reader=request.body?.getReader();if(!reader)return json({error:'JSON required.'},400);
 const chunks=[];let length=0;for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>4096){await reader.cancel();return json({error:'Catalogue request is too large.'},413);}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'Invalid request.'},400);}
 if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid request.'},400);
 const {object,value}=await manifest(env);
 const all=[...POST_TEMPLATES,...value.custom],active=all.filter(t=>!value.archived.includes(t.id));
 let id;
 if(request.method==='POST'){
  const name=typeof body.name==='string'?body.name.trim():'';
  if(!name||name.length>80||/[\x00-\x1f\x7f]/.test(name)||!POST_TEMPLATES.some(t=>t.id===body.baseId&&t.id!=='custom-image')||typeof body.blank!=='boolean')return json({error:'Enter a template name and choose a starting layout.'},400);
  if(active.some(t=>t.name.toLowerCase()===name.toLowerCase()))return json({error:'A template with this name already exists.'},409);
  if(value.custom.length>=300)return json({error:'The studio template limit has been reached.'},409);
  id='studio-'+crypto.randomUUID();const entry={id,name,baseId:body.baseId,blank:body.blank,collection:'Studio templates'};
  try{assertTemplateLayout(validateDesign(id,defaultDesign(id,entry),entry));}catch(e){return json({error:e.message},400);}
  value.custom.push(entry);
 }else{
  id=body.id;if(typeof id!=='string'||!active.some(t=>t.id===id))return json({error:'Template not found.'},404);
  if(active.length<=1)return json({error:'At least one template must remain available.'},409);
  value.archived.push(id);
 }
 const written=await env.IMAGES.put(manifestKey,JSON.stringify(value),{httpMetadata:{contentType:'application/json'},onlyIf:object?{etagMatches:object.etag}:{etagDoesNotMatch:'*'}});
 if(!written)return json({error:'The catalogue changed. Reload and try again.'},409);
 return json({success:true,id},request.method==='POST'?201:200);
}
export async function authorised(request,env){
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
 const match=/^\/api\/template-designs\/([a-z0-9-]+)$/.exec(path),check=path==='/api/admin/template-designer',catalogue=path==='/api/template-catalogue';
 if(!match&&!check&&!catalogue)return null;
 if(env.STAGING_DISABLE_CHECKOUT!=='true')return json({error:'Not available.'},404);
 if(check){
  if(request.method!=='GET')return json({error:'Method not allowed.'},405);
  const access=await authorised(request,env);return access===null?json({error:'Set TEMPLATE_ADMIN_TOKEN as a Cloudflare Worker secret (at least 24 characters).'},503):access?json({success:true}):json({error:'Invalid administrator token.'},401);
 }
 if(catalogue){
  try{if(request.method==='GET')return json({templates:await getTemplateCatalogue(env)});
   if(['POST','DELETE'].includes(request.method))return await mutateCatalogue(request,env,url);
   return json({error:'Method not allowed.'},405);
  }catch{return json({error:'Template catalogue unavailable.'},503);}
 }
 const id=match[1];
 if(!defaultDesign(id)&&!isStudioTemplateId(id))return json({error:'Template not found.'},404);
 if(!env.IMAGES)return json({error:'Design storage unavailable.'},503);
 try{
  const entry=(await getTemplateCatalogue(env)).find(t=>t.id===id),base=defaultDesign(id,entry);
  if(!entry||!base)return json({error:'Template not found.'},404);
  const key=prefix+id+'.json';
  if(request.method==='GET'){
   // One-time content migration, scoped to template storage only. Compare-and-swap
   // protects concurrent editing, and bump the revision so stale drafts cannot reintroduce names.
   for(let attempt=0;attempt<3;attempt++){
    const object=await env.IMAGES.get(key);
    if(!object)return json({revision:'base',template:isStudioTemplateId(id)?base:null});
    const value=await object.json(),cleaned=purgeTemplateDemoText(value.template);
    const template=validateDesign(id,cleaned,entry);
    if(cleaned===value.template)return json({revision:value.revision,template});
    const revision=crypto.randomUUID();
    const written=await env.IMAGES.put(key,JSON.stringify({...value,revision,template:cleaned,savedAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json'},onlyIf:{etagMatches:object.etag}});
    if(written)return json({revision,template});
   }
   return json({error:'The template is being updated. Reload and try again.'},409);
  }
  if(request.method!=='PUT')return json({error:'Method not allowed.'},405);
  const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'Cross-origin update denied.'},403);
  const access=await authorised(request,env);if(access===null)return json({error:'Set TEMPLATE_ADMIN_TOKEN as a Cloudflare Worker secret (at least 24 characters).'},503);
  if(!access)return json({error:'Invalid administrator token.'},401);
  if(entry.archived)return json({error:'This template has been deleted from the catalogue.'},409);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required.'},415);
  if(Number(request.headers.get('Content-Length'))>MAX_DESIGN_BYTES)return json({error:'Design or artwork is too large.'},413);
  const reader=request.body?.getReader();if(!reader)return json({error:'JSON required.'},400);
  const chunks=[];let length=0;
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_DESIGN_BYTES){await reader.cancel();return json({error:'Design or artwork is too large.'},413);}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const raw=new TextDecoder().decode(bytes);
  let body,template;try{body=JSON.parse(raw);template=assertTemplateLayout(validateDesign(id,body.template,entry));}catch(e){return json({error:e.message||'Invalid design.'},400);}
  const current=await env.IMAGES.get(key),saved=current?await current.json():null;
  if(body.revision!==(saved?.revision||'base'))return json({error:'This design has changed since you opened it. Reload before saving.'},409);
  const revision=crypto.randomUUID(),value={revision,template,savedAt:new Date().toISOString()};
  const written=await env.IMAGES.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'},onlyIf:current?{etagMatches:current.etag}:{etagDoesNotMatch:'*'}});
  if(!written)return json({error:'Another update was saved. Reload before saving.'},409);
  return json({success:true,revision,template});
 }catch{return json({error:'Template storage unavailable.'},503);}
}
