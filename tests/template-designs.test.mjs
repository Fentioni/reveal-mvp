import {test} from 'node:test';
import assert from 'node:assert/strict';
import {POST_TEMPLATES} from '../public/post-scratch-catalogue.js';
import {defaultDesign,validateDesign,clone} from '../public/template-design-schema.js';
import {templateDesignResponse} from '../src/template-designs.js';
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
 d.zones[0].ink='#123456';const save=await templateDesignResponse(req(id,'PUT',{revision:'base',template:d}),env);assert.equal(save.status,200);const value=await save.json();assert.ok(value.revision);assert.equal(value.template.zones[0].ink,'#123456');
 const read=await templateDesignResponse(req(id,'GET',null,'no-access'),env);assert.equal((await read.json()).template.zones[0].ink,'#123456');
 assert.equal((await templateDesignResponse(req(id,'PUT',{revision:'base',template:d}),env)).status,409);
 const bad=clone(d);bad.zones.pop();assert.equal((await templateDesignResponse(req(id,'PUT',{revision:value.revision,template:bad}),env)).status,400);
 const restore=await templateDesignResponse(req(id,'PUT',{revision:value.revision,template:defaultDesign(id)}),env);assert.equal(restore.status,200);
});
