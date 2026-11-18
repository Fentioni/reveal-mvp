import {test} from 'node:test';
import assert from 'node:assert/strict';
import {POST_TEMPLATES} from '../public/post-scratch-catalogue.js';
import {defaultDesign,validateDesign,clone} from '../public/template-design-schema.js';
import {templateDesignResponse} from '../src/template-designs.js';
import {SCRATCH_ARTWORKS} from '../public/scratch-artwork-catalogue.js';
class Bucket{
 constructor(){this.map=new Map();this.n=0;}
 async get(key){const o=this.map.get(key);return o?{etag:o.etag,json:async()=>JSON.parse(o.value)}:null;}
 async put(key,value,opts){const old=this.map.get(key),c=opts.onlyIf;if(c?.etagMatches&&old?.etag!==c.etagMatches||c?.etagDoesNotMatch==='*'&&old)return null;const o={etag:String(++this.n),value};this.map.set(key,o);return o;}
}
const secret='administrator-test-secret-long-enough';
const req=(id,method='GET',body,auth=secret,origin='https://stage.example')=>new Request('https://stage.example/api/template-designs/'+id,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth,Origin:origin},...(body?{body:JSON.stringify(body)}:{})});
test('all 15 original designs validate, with every field retained',()=>{
 for(const t of POST_TEMPLATES){const d=validateDesign(t.id,defaultDesign(t.id));assert.equal(d.zones.length,10);assert.equal(d.id,t.id);}
});
test('style, geometry, static text and removal are preserved without executable markup',()=>{
 const id='candlelight',d=defaultDesign(id);d.zones[0].x+=20;d.zones[0].family='Verdana, sans-serif';d.zones[0].ink='#445566';d.zones[1].hidden=true;d.photo.w-=20;
 d.decor.push({kind:'text',x:50,y:60,w:300,h:100,size:40,family:'Arial, sans-serif',weight:600,ink:'#ff0000',align:'center',text:'A decorative heading'});
 d.panels=d.panels.slice(1);const v=validateDesign(id,d);
 assert.equal(v.zones[0].family,'Verdana, sans-serif');assert.equal(v.zones[1].hidden,true);assert.equal(v.photo.w,d.photo.w);assert.equal(v.decor.at(-1).text,'A decorative heading');assert.equal(v.panels.length,d.panels.length);
 const bad=clone(d);bad.zones[0].x=900;assert.throws(()=>validateDesign(id,bad));
 bad.zones[0].x=10;bad.zones[0].family='url(javascript:alert(1))';assert.throws(()=>validateDesign(id,bad));
 const malicious=clone(d);malicious.decor.push({kind:'path',d:'<script>',fill:'#111',stroke:'none',sw:0});assert.throws(()=>validateDesign(id,malicious));
});
test('staging API protects publishing, persists updates and rejects stale revisions',async()=>{
 const env={STAGING_DISABLE_CHECKOUT:'true',TEMPLATE_ADMIN_TOKEN:secret,IMAGES:new Bucket()},id='candlelight',d=defaultDesign(id);
 assert.equal((await templateDesignResponse(req(id,'GET'),env)).status,200);
 assert.equal((await templateDesignResponse(req(id,'PUT',{revision:'base',template:d},'wrong'),env)).status,401);
 assert.equal((await templateDesignResponse(req(id,'PUT',{revision:'base',template:d},secret,'https://evil.example'),env)).status,403);
 assert.equal((await templateDesignResponse(req(id,'PUT',{revision:'base',template:d},secret),{...env,TEMPLATE_ADMIN_TOKEN:undefined})).status,503);
 assert.equal((await templateDesignResponse(req(id,'GET'),{...env,STAGING_DISABLE_CHECKOUT:'false'})).status,404);
 d.zones[0].ink='#123456';d.zones[0].templateText='A saved title';d.zones[0].textMode='fixed';const save=await templateDesignResponse(req(id,'PUT',{revision:'base',template:d}),env);assert.equal(save.status,200);const value=await save.json();assert.ok(value.revision);assert.equal(value.template.zones[0].ink,'#123456');
 const read=await templateDesignResponse(req(id,'GET',null,'no-access'),env);const persisted=(await read.json()).template.zones[0];assert.equal(persisted.ink,'#123456');assert.equal(persisted.templateText,'A saved title');assert.equal(persisted.textMode,'fixed');
 assert.equal((await templateDesignResponse(req(id,'PUT',{revision:'base',template:d}),env)).status,409);
 const bad=clone(d);bad.zones.pop();assert.equal((await templateDesignResponse(req(id,'PUT',{revision:value.revision,template:bad}),env)).status,400);
 const restore=await templateDesignResponse(req(id,'PUT',{revision:value.revision,template:defaultDesign(id)}),env);assert.equal(restore.status,200);
});

test('published artwork is raster-only, template-specific and backwards-compatible',async()=>{
 const id='candlelight',d=defaultDesign(id);
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
 d.artworkSource='upload';d.artworkData=png;d.artworkFit='cover';
 const env={STAGING_DISABLE_CHECKOUT:'true',TEMPLATE_ADMIN_TOKEN:secret,IMAGES:new Bucket()};
 const save=await templateDesignResponse(req(id,'PUT',{revision:'base',template:d}),env);assert.equal(save.status,200);
 const read=await (await templateDesignResponse(req(id),env)).json();assert.equal(read.template.artworkData,png);assert.equal(read.template.artworkFit,'cover');
 assert.equal((await (await templateDesignResponse(req('spotlight'),env)).json()).template,null);
 for(const data of ['data:image/svg+xml;base64,PHN2Zz4=','https://example.org/art.png','data:image/png;base64,'+'A'.repeat(64),'data:image/png;base64,'+'A'.repeat(2400001)])assert.throws(()=>validateDesign(id,{...d,artworkData:data}));
 assert.throws(()=>validateDesign(id,{...d,artworkSource:'https://example.org'}));
 const builtIn=validateDesign(id,{...d,artworkSource:'spotlight'});assert.equal(builtIn.artworkData,'');
 const old=clone(d);delete old.artworkSource;delete old.artworkData;delete old.artworkFit;assert.equal(validateDesign(id,old).artworkSource,'original');
 const restore=await templateDesignResponse(req(id,'PUT',{revision:read.revision,template:{...d,artworkSource:'original',artworkData:''}}),env);assert.equal(restore.status,200);
});

test('studio templates can be created, edited and deleted while existing designs remain readable',async()=>{
 const env={STAGING_DISABLE_CHECKOUT:'true',TEMPLATE_ADMIN_TOKEN:secret,IMAGES:new Bucket()};
 const catalogue=(method='GET',body,auth=secret)=>new Request('https://stage.example/api/template-catalogue',{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},...(body?{body:JSON.stringify(body)}:{})});
 const args={name:'My new design',baseId:'candlelight',blank:true};
 assert.equal((await templateDesignResponse(catalogue('POST',args,'wrong'),env)).status,401);
 const created=await templateDesignResponse(catalogue('POST',args),env);assert.equal(created.status,201);
 const {id}=await created.json();
 const list=async()=> (await (await templateDesignResponse(catalogue(),env)).json()).templates;
 assert.equal((await list()).length,POST_TEMPLATES.length+1);
 const initial=await (await templateDesignResponse(req(id),env)).json();assert.equal(initial.template.name,args.name);assert.equal(initial.template.showBackground,false);
 initial.template.zones[0].ink='#123456';
 const saved=await templateDesignResponse(req(id,'PUT',initial),env);assert.equal(saved.status,200);
 assert.equal((await templateDesignResponse(catalogue('DELETE',{id},'wrong'),env)).status,401);
 assert.equal((await templateDesignResponse(catalogue('DELETE',{id}),env)).status,200);
 assert.equal((await list()).find(t=>t.id===id).archived,true);
 assert.equal((await (await templateDesignResponse(req(id),env)).json()).template.zones[0].ink,'#123456');
 assert.equal((await templateDesignResponse(catalogue('DELETE',{id:'candlelight'}),env)).status,200);
 assert.equal((await list()).find(t=>t.id==='candlelight').archived,true);
 assert.equal((await templateDesignResponse(req('candlelight'),env)).status,200);
 assert.equal((await templateDesignResponse(catalogue('POST',args),{...env,STAGING_DISABLE_CHECKOUT:'false'})).status,404);
});

test('scratch cover admin upload, authorization, catalogue removal and restoration preserve existing images',async()=>{
 const {scratchArtworkResponse,resolveStoredArtwork,availableScratchArtwork}=await import('../src/scratch-artwork-admin.js');
 const {readFile}=await import('node:fs/promises');
 const bucket=new Bucket();const originalGet=bucket.get.bind(bucket);bucket.get=async k=>{const item=await originalGet(k);return item?{...item,body:bucket.map.get(k).value}:null;};
 bucket.delete=async k=>bucket.map.delete(k);
 const env={STAGING_DISABLE_CHECKOUT:'true',TEMPLATE_ADMIN_TOKEN:secret,IMAGES:bucket};
 const request=(method='GET',body,auth=secret,origin='https://stage.example')=>new Request('https://stage.example/api/scratch-artwork',{method,headers:{Authorization:'Bearer '+auth,Origin:origin,...(typeof body==='string'?{'Content-Type':'application/json'}:{})},...(body?{body}:{})});
 const list=async()=> (await (await scratchArtworkResponse(request(),env)).json()).artworks;
 assert.equal((await list()).length,SCRATCH_ARTWORKS.length);
 // Use an original real raster cover, preserving its actual bytes.
 const source=await readFile(new URL('../public/scratch-artwork/Azure_Kaleidoscope.jpg',import.meta.url));
 const {dimensions}=await import('../src/image-dimensions.js');
 const original=new File([source],'cover.jpg',{type:'image/jpeg'});
 let file=original;const size=await dimensions(file);
 // A small deterministic header fixture covers the API's dimension guard if original aspect is not exact.
 if(size.width*4!==size.height*3||size.width<900){const b=new Uint8Array(24);b.set([137,80,78,71,13,10,26,10]);new DataView(b.buffer).setUint32(16,1800);new DataView(b.buffer).setUint32(20,2400);file=new File([b],'cover.png',{type:'image/png'});}
 const form=()=>{const f=new FormData();f.set('name','New cover');f.set('image',file);return f;};
 assert.equal((await scratchArtworkResponse(request('POST',form(),'wrong'),env)).status,401);
 assert.equal((await scratchArtworkResponse(request('POST',form(),secret,'https://evil.example'),env)).status,403);
 const created=await scratchArtworkResponse(request('POST',form()),env);assert.equal(created.status,201);const {id}=await created.json();
 assert.equal((await list()).filter(a=>!a.archived).length,SCRATCH_ARTWORKS.length+1);
 assert.ok(await availableScratchArtwork(env,id));assert.equal((await scratchArtworkResponse(request('POST',form()),env)).status,409);
 const drop=JSON.stringify({id});
 assert.equal((await scratchArtworkResponse(request('DELETE',drop),env)).status,200);
 assert.equal(await availableScratchArtwork(env,id),null);assert.ok(await resolveStoredArtwork(env,id));
 const image=await scratchArtworkResponse(new Request('https://stage.example/api/scratch-artwork/'+id),env);assert.equal(image.status,200);assert.deepEqual(new Uint8Array(await image.arrayBuffer()),new Uint8Array(await file.arrayBuffer()));
 assert.equal((await scratchArtworkResponse(request('PATCH',drop),env)).status,200);assert.ok(await availableScratchArtwork(env,id));
 assert.equal((await scratchArtworkResponse(request('DELETE',JSON.stringify({id:'azure-kaleidoscope'})),env)).status,200);
 assert.equal(await availableScratchArtwork(env,'azure-kaleidoscope'),null);assert.ok(await resolveStoredArtwork(env,'azure-kaleidoscope'));
 assert.equal((await scratchArtworkResponse(request('GET'),{...env,STAGING_DISABLE_CHECKOUT:'false'})).status,404);
});

test('saved wording validates and older customer-driven templates remain unchanged',()=>{const id='candlelight',d=defaultDesign(id);assert.equal(validateDesign(id,d).zones[0].textMode,undefined);const z=d.zones[0];z.templateText='My permanent title';z.textMode='fixed';assert.equal(validateDesign(id,d).zones[0].templateText,z.templateText);z.textMode='customer';assert.equal(validateDesign(id,d).zones[0].templateText,z.templateText);z.textMode='fixed';z.templateText='';assert.throws(()=>validateDesign(id,d));z.templateText='a'.repeat(1001);assert.throws(()=>validateDesign(id,d));});

test('all template person headings are canonical; legacy saved designs retain geometry and personalised values',async()=>{
 const {templateFieldText}=await import('../public/post-scratch-renderer.js');
 for(const t of POST_TEMPLATES){
  const d=defaultDesign(t.id);
  for(const p of d.panels.filter(p=>['recipient','sender','senderLine'].includes(p.key)&&p.labelH>0))assert.equal(p.label,p.key==='recipient'?'For You':'From Me',t.id);
  const old=clone(d);for(const p of old.panels.filter(p=>['recipient','sender','senderLine'].includes(p.key)&&p.labelH>0))p.label=p.key==='recipient'?'RECIPIENT':'FROM / HOST';
  const v=validateDesign(t.id,old);for(const p of v.panels.filter(p=>['recipient','sender','senderLine'].includes(p.key)&&p.labelH>0))assert.equal(p.label,p.key==='recipient'?'For You':'From Me',t.id);
  for(const z of v.zones.filter(z=>['recipient','sender','senderLine'].includes(z.key))){const name=z.key==='recipient'?'Chloe':'Michael';const heading=z.key==='recipient'?'For You':'From Me';const hasLabel=v.panels.some(p=>p.key===z.key&&p.labelH>0&&p.label);assert.equal(templateFieldText(v,z.key,{recipient:'Chloe',sender:'Michael'}),hasLabel?name:heading+': '+name,t.id);}
 }
 const id='travel-collage',d=defaultDesign(id);const p=d.panels.find(p=>p.key==='recipient');p.label='Recipient';const env={STAGING_DISABLE_CHECKOUT:'true',TEMPLATE_ADMIN_TOKEN:secret,IMAGES:new Bucket()};
 await env.IMAGES.put('admin-template-designs/v1/'+id+'.json',JSON.stringify({revision:'legacy-revision',template:d}),{});
 const saved=await (await templateDesignResponse(req(id),env)).json();assert.equal(saved.revision,'legacy-revision');assert.equal(saved.template.panels.find(p=>p.key==='recipient').label,'For You');assert.deepEqual(saved.template.photo,validateDesign(id,d).photo);
 const custom=clone(d);custom.panels.find(p=>p.key==='recipient').label='Guest of honour';assert.equal(validateDesign(id,custom).panels.find(p=>p.key==='recipient').label,'Guest of honour');
});
