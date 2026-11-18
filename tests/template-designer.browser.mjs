import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import {templateDesignResponse} from '../src/template-designs.js';
const root=resolve('public'),secret='browser-test-admin-secret-2026';
const objects=new Map();let etag=0;
const bucket={async get(k){const x=objects.get(k);return x?{etag:x.etag,json:async()=>JSON.parse(x.value)}:null;},async put(k,value,opts){const old=objects.get(k),c=opts.onlyIf;if(c?.etagMatches&&old?.etag!==c.etagMatches||c?.etagDoesNotMatch==='*'&&old)return null;const next={etag:String(++etag),value};objects.set(k,next);return next;}};
const env={STAGING_DISABLE_CHECKOUT:'true',TEMPLATE_ADMIN_TOKEN:secret,IMAGES:bucket};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname.startsWith('/api/template-designs/')||url.pathname==='/api/admin/template-designer'){
  const chunks=[];for await(const c of req)chunks.push(c);
  const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  const response=await templateDesignResponse(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 const p=url.pathname==='/admin-template-designer'?'/admin-template-designer.html':url.pathname;
 if(p==='/matrix'){res.setHeader('content-type','text/html');res.end('<div id="card" style="width:450px"></div>');return;}
 const f=resolve(root,'.'+p);if(!f.startsWith(root+'/'))throw Error();
 res.setHeader('content-type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));
 }catch(e){console.error(e);res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
 await mkdir('test-output/template-designer',{recursive:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/admin-template-designer');await page.locator('[data-layer="zone:eventName"]').waitFor();
 assert.equal(await page.locator('#template option').count(),79);
 const initial=Number(await page.locator('#prop-x').inputValue());
 // Move the title by dragging its actual visual area.
 const stage=await page.locator('#stage').boundingBox(),x=Number(await page.locator('#prop-x').inputValue()),y=Number(await page.locator('#prop-y').inputValue()),w=Number(await page.locator('#prop-w').inputValue()),h=Number(await page.locator('#prop-h').inputValue());
 await page.mouse.move(stage.x+(x+w/2)*stage.width/900,stage.y+(y+h/2)*stage.height/1200);await page.mouse.down();await page.mouse.move(stage.x+(x+w/2+25)*stage.width/900,stage.y+(y+h/2+15)*stage.height/1200,{steps:8});await page.mouse.up();
 assert.ok(Number(await page.locator('#prop-x').inputValue())>initial);
 await page.locator('#prop-family').selectOption('Verdana, sans-serif');
 await page.locator('#prop-size').fill('55');await page.locator('#prop-size').press('Tab');
 await page.locator('#prop-ink').fill('#99ccee');await page.locator('#prop-ink').dispatchEvent('change');
 await page.locator('[data-layer="photo"]').click();const oldW=Number(await page.locator('#prop-w').inputValue());
 await page.locator('#prop-w').fill(String(oldW-25));await page.locator('#prop-w').press('Tab');
 assert.equal(Number(await page.locator('#prop-w').inputValue()),oldW-25);
 await page.locator('[data-layer="panel:image"]').click();await page.locator('#prop-sw').fill('5');await page.locator('#prop-sw').press('Tab');
 const originalDecor=await page.locator('[data-layer^="decor:"]').count();await page.locator('#add').click();await page.locator('[data-add="ellipse"]').click();assert.equal(await page.locator('[data-layer^="decor:"]').count(),originalDecor+1);
 await page.locator('#remove').click();assert.equal(await page.locator('[data-layer^="decor:"]').count(),originalDecor);await page.locator('#undo').click();assert.equal(await page.locator('[data-layer^="decor:"]').count(),originalDecor+1);
 await page.locator('#redo').click();assert.equal(await page.locator('[data-layer^="decor:"]').count(),originalDecor);
 await page.locator('#add').click();await page.locator('[data-add="text"]').click();await page.locator('#prop-text').fill('Special occasion');await page.locator('#prop-text').press('Tab');
 await page.locator('#artworkShortcut').click();
 await page.locator('#prop-artworkSource').selectOption('spotlight');
 assert.equal(await page.locator('[data-template-artwork]').getAttribute('href'),'/post-scratch-artwork/spotlight.webp');
 await page.locator('#undo').click();
 assert.equal(await page.locator('[data-template-artwork]').getAttribute('href'),'/post-scratch-artwork/candlelight.webp');
 const artwork=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=900;c.height=1200;const g=c.getContext('2d');g.fillStyle='#176b74';g.fillRect(0,0,900,1200);g.fillStyle='#f2db91';g.fillRect(0,0,900,220);return c.toDataURL('image/png').split(',')[1]});
 await page.locator('#artworkUpload').setInputFiles({name:'new-template.png',mimeType:'image/png',buffer:Buffer.from(artwork,'base64')});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('New artwork ready'));
 assert.match(await page.locator('[data-template-artwork]').getAttribute('href'),/^data:image\/(webp|png);base64,/);
 await page.locator('#prop-artworkFit').selectOption('cover');
 assert.equal(await page.locator('[data-template-artwork]').getAttribute('preserveAspectRatio'),'xMidYMid slice');
 await page.locator('#showSampleImage').uncheck();assert.equal(await page.locator('[data-photo-slot] image').count(),0);
 await page.locator('#showSampleImage').check();assert.equal(await page.locator('[data-photo-slot] image').count(),1);
 await page.locator('#save').click();await page.locator('#token').fill(secret);await page.locator('#authSave').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Saved.'));
 const api=await (await page.request.get(base+'/api/template-designs/candlelight')).json();
 assert.equal(api.template.artworkSource,'upload');assert.equal(api.template.artworkFit,'cover');assert.match(api.template.artworkData,/^data:image\//);
 assert.equal(api.template.zones[0].family,'Verdana, sans-serif');assert.equal(api.template.zones[0].ink,'#99ccee');assert.equal(api.template.photo.w,oldW-25);assert.equal(api.template.decor.at(-1).text,'Special occasion');
 await page.reload();await page.locator('[data-layer="zone:eventName"]').waitFor();assert.equal(await page.locator('#prop-family').inputValue(),'Verdana, sans-serif');assert.equal(await page.locator('[data-template-artwork]').getAttribute('href'),api.template.artworkData);
 // The same published design is loaded by the actual customer-facing renderer.
 await page.goto(base+'/matrix');
 const actual=await page.evaluate(async()=>{const {renderPostScratchFace}=await import('/post-scratch-face.js?v=artwork-2');const card=document.querySelector('#card');await renderPostScratchFace(card,{eventName:'A special night'},{templateId:'candlelight'});return {font:card.querySelector('[data-field="eventName"]').getAttribute('font-family'),fill:card.querySelector('[data-field="eventName"]').getAttribute('fill'),artwork:card.querySelector('[data-template-artwork]').getAttribute('href'),fit:card.querySelector('[data-template-artwork]').getAttribute('preserveAspectRatio')};});
 assert.deepEqual(actual,{font:'Verdana, sans-serif',fill:'#99ccee',artwork:api.template.artworkData,fit:'xMidYMid slice'});
 await page.goto(base+'/admin-template-designer');await page.locator('[data-layer="zone:eventName"]').waitFor();await page.locator('#artworkShortcut').click();await page.screenshot({path:'test-output/template-designer/desktop.png',fullPage:true});
 await page.locator('#restoreArtwork').click();assert.equal(await page.locator('[data-template-artwork]').getAttribute('href'),'/post-scratch-artwork/candlelight.webp');await page.locator('#undo').click();assert.equal(await page.locator('[data-template-artwork]').getAttribute('href'),api.template.artworkData);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'test-output/template-designer/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 await page.close();console.log('Visual designer: drag, resize, typography, borders, add/remove, undo/redo, save, reload, public renderer and mobile passed.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
