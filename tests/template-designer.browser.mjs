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
 if(url.pathname.startsWith('/api/template-designs/')||url.pathname==='/api/admin/template-designer'||url.pathname==='/api/template-catalogue'){
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
 await page.mouse.move(stage.x+(x+w/2)*stage.width/900,stage.y+(y+h/2)*stage.height/1200);await page.mouse.down();await page.mouse.move(stage.x+(x+w/2+25)*stage.width/900,stage.y+(y+h/2-15)*stage.height/1200,{steps:8});await page.mouse.up();
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
 await page.locator('#reload').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Template loaded.');
 // Check every approved design has ten editable text layers and an image frame.
 for(const templateId of await page.locator('#template option[value^="bg-"]').evaluateAll(opts=>opts.map(o=>o.value))){
  await page.locator('#template').selectOption(templateId);
  await page.waitForFunction(id=>document.querySelector('#render svg')?.dataset.postTemplate===id,templateId);
  assert.equal(await page.locator('[data-layer^="zone:"]').count(),10);
  assert.equal(await page.locator('[data-layer="photo"]').count(),1);
  await page.locator('#sample').selectOption('blank');
  assert.equal(await page.locator('#render [data-slot]').count(),10);
  for(const orientation of ['portrait','landscape']){
   await page.locator('#photoOrientation').selectOption(orientation);
   const ratio=await page.locator('#render [data-photo-slot] rect').first().evaluate(el=>Number(el.getAttribute('width'))/Number(el.getAttribute('height')));
   assert.ok(Math.abs(ratio-(orientation==='portrait'?.75:4/3))<.001);
  }
  await page.locator('#sample').selectOption('normal');
 }
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'test-output/template-designer/mobile.png',fullPage:true});
 // New template management, including persistence and protected deletion.
 await page.locator('#newTemplate').click();
 await page.locator('#newTemplateName').fill('New blank studio template');
 await page.locator('#newTemplateBase').selectOption('candlelight');
 await page.locator('#createTemplateForm button[type=submit]').click();
 await page.locator('#token').fill(secret);await page.locator('#authSave').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('New template created.'));
 const newId=await page.locator('#template').inputValue();
 assert.match(newId,/^studio-/);assert.equal(await page.locator('#template option').count(),80);
 assert.equal(await page.locator('[data-layer^="zone:"]').count(),10);
 assert.equal(await page.locator('[data-template-artwork]').count(),0);
 await page.locator('#prop-ink').fill('#445566');await page.locator('#prop-ink').dispatchEvent('change');
 await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Saved.'));
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#deleteTemplate').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Template deleted'));
 assert.equal(await page.locator('#template option').count(),79);
 const archived=await (await page.request.get(base+'/api/template-designs/'+newId)).json();
 assert.equal(archived.template.zones[0].ink,'#445566');
 await page.reload();await page.locator('[data-layer="zone:eventName"]').waitFor();
 assert.equal(await page.locator('#template option').count(),79);
 assert.deepEqual(errors,[]);
 await page.close();
 for(const viewport of [{width:390,height:844},{width:1380,height:900}]){
  const creator=await browser.newPage({viewport}),errors=[];creator.on('pageerror',e=>errors.push(e.message));
  await creator.goto(base+'/legacy-create.html?variant=ticket');
  await creator.locator('#reviewButton:enabled').waitFor();
  assert.equal(await creator.locator('#scratchCreatorActual').getAttribute('data-preview-mode'),'revealed');
  assert.equal(await creator.locator('#recipient:visible,#sender:visible,#eventName:visible,#ticketUrl:visible').count(),0);
  assert.equal(await creator.locator('#scratchActualRevealed [data-edit-field]').count(),10);
  assert.equal(await creator.locator('#scratchActualCovered [data-edit-field]').count(),0);
  const sizes=await creator.evaluate(()=>['scratchActualCovered','scratchActualRevealed'].map(id=>{const r=document.getElementById(id).shadowRoot.querySelector('#card').getBoundingClientRect();return [r.width,r.height];}));assert.deepEqual(sizes[0],sizes[1],'Cover and editable reveal retain equal dimensions');
  await creator.locator('#reviewButton').click();
  assert.match(await creator.locator('#messageBox').textContent(),/recipient/);
  for(const [key,value] of Object.entries({recipient:'Chloe',sender:'Michael',eventName:'Theatre Night',postSubtitle:'Just for you',eventDate:'2027-04-10',eventTime:'19:30',venue:'Theatre Royal',postVenueAddress:'London',personalMessage:'A special night',ticketUrl:'https://example.org'})){
   const input=creator.locator('#scratchActualRevealed [data-edit-field="'+key+'"]');
   if(['eventDate','eventTime'].includes(key))await input.focus();else await input.click();await input.fill(value);
   assert.equal(await creator.locator('#'+key).inputValue(),value);
  }
  await creator.locator('[data-scratch-preview-mode="covered"]').click();
  assert.equal(await creator.locator('#scratchActualRevealed').getAttribute('aria-hidden'),'true');
  await creator.locator('[data-scratch-preview-mode="revealed"]').click();
  assert.match(await creator.locator('#scratchActualRevealed [data-field=eventName]').textContent(),/THEATRE NIGHT/i);
  assert.match(await creator.locator('#scratchActualRevealed [data-field=recipient]').textContent(),/Chloe/i);
  await creator.locator('#postTemplate').selectOption('blue-ink');
  await creator.waitForFunction(()=>document.querySelector('#scratchActualRevealed').shadowRoot?.querySelector('#card')?.dataset.postTemplate==='blue-ink');
  assert.equal(await creator.locator('#scratchActualRevealed [data-edit-field="eventName"]').inputValue(),'Theatre Night');
  await creator.screenshot({path:'test-output/template-designer/inline-'+viewport.width+'.png',fullPage:true});
  assert.equal(await creator.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);await creator.close();
 }
 // Regression: stored values are not enough; each rendered glyph must
 // actually lie inside its clipping rectangle immediately after Amend.
 for(const viewport of [{width:390,height:844},{width:1380,height:900}]){
  for(const [templateId,hasImage] of [['candlelight',false],['custom-image',true]]){
   const creator=await browser.newPage({viewport}),errors=[];creator.on('pageerror',e=>errors.push(e.message));
   const data={recipient:'Chloe',sender:'Michael',eventName:'Theatre Night',eventDate:'2027-04-10',eventTime:'19:30',venue:'Theatre Royal',personalMessage:'A special night',ticketUrl:'https://example.org',hasImage,status:'draft',revision:2,id:'amend-test'};
   const settings={templateId,subtitle:'Just for you',venueAddress:'London'};
   await creator.addInitScript(()=>localStorage.setItem('reveal_edit_amend-test','test-owner'));
   await creator.route('**/api/reveals/amend-test',route=>route.fulfill({json:{success:true,reveal:data}}));
   await creator.route('**/api/reveals/amend-test/scratch-surface',route=>route.fulfill({json:{success:true,surface:{variant:'ticket',style:'classic',foil:'gold',artworkId:'champagne-ribbons',postScratch:settings},audio:{enabled:false}}}));
   if(hasImage)await creator.route('**/api/reveals/amend-test/image',route=>route.fulfill({contentType:'image/webp',path:resolve(root,'post-scratch-artwork/editorial.webp')}));
   await creator.goto(base+'/legacy-create.html?edit=amend-test');
   await creator.locator('#reviewButton:enabled').waitFor();
   assert.equal(await creator.locator('#savedRevealLoadStatus:visible').count(),0);
   const host=creator.locator('#scratchActualRevealed');
   for(const key of ['recipient','sender','eventName','eventDate','eventTime','venue','personalMessage','ticketUrl','postSubtitle','postVenueAddress']){
    const value=key==='postSubtitle'?settings.subtitle:key==='postVenueAddress'?settings.venueAddress:data[key];
    assert.equal(await host.locator('[data-edit-field="'+key+'"]').inputValue(),value);
   }
   const measured=await host.evaluate(el=>{
    const svg=el.shadowRoot.querySelector('svg[data-post-template]');
    return [...svg.querySelectorAll('[data-slot]')].map(slot=>{
     const text=slot.querySelector('[data-field]'),zone=slot.querySelector(':scope > rect');
     if(!text||!zone)return {key:slot.dataset.slot,ok:false};
     const b=text.getBBox(),m=text.transform.baseVal.consolidate()?.matrix||new DOMMatrix();
     const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));
     const x=Number(zone.getAttribute('x')),y=Number(zone.getAttribute('y')),w=Number(zone.getAttribute('width')),h=Number(zone.getAttribute('height'));
     const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
     return {key:slot.dataset.slot,ok:b.width>0&&b.height>0&&Math.min(...xs)>=x-1&&Math.max(...xs)<=x+w+1&&Math.min(...ys)>=y-1&&Math.max(...ys)<=y+h+1};
    });
   });
   assert.equal(measured.length,10);assert.deepEqual(measured.filter(x=>!x.ok),[],'All saved text must be inside its visible field after Amend: '+templateId+' / '+viewport.width);
   await host.locator('[data-edit-field="recipient"]').fill('Chloe Rose');
   await creator.locator('#postTemplate').focus();
   assert.match(await host.locator('[data-field=recipient]').textContent(),/Chloe Rose/i);
   await creator.screenshot({path:'test-output/template-designer/amend-'+templateId+'-'+viewport.width+'.png',fullPage:true});
   assert.deepEqual(errors,[]);await creator.close();
  }
 }
 console.log('Visual designer, direct creator editing and visible Amend text on desktop/mobile passed.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
