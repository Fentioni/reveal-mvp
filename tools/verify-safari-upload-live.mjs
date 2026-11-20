// Real browser, real staging Worker and private staging storage.
// Creates one synthetic draft per browser, confirms and amends it, never pays or publishes.
import assert from 'node:assert/strict';
import {webkit,chromium} from 'playwright';
import {createHash} from 'node:crypto';
const origin='https://reveal-stage4b-test.michael-fenton9.workers.dev';
const hash=b=>createHash('sha256').update(b).digest('hex');
const browserType=process.env.REVEAL_QA_BROWSER==='chromium'?chromium:webkit;
const label=browserType===webkit?'WebKit mobile':'Chromium desktop';
const browser=await browserType.launch({headless:true});
try{
 const page=await browser.newPage({viewport:browserType===webkit?{width:390,height:844}:{width:1380,height:900},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let result;
 for(let i=0;i<25;i++){
  result=await page.goto(origin+'/legacy-create?variant=ticket&verify='+Date.now(),{waitUntil:'domcontentloaded'});
  if(result?.ok()&&(await result.text()).includes('data-customer-design="picker-handles-1"'))break;
  await new Promise(r=>setTimeout(r,5000));
 }
 assert.ok(result?.ok(),'Live staging creator responds');
 assert.match(await result.text(),/selectedImage\.arrayBuffer\(\)/,'Byte-backed upload patch is deployed');
 assert.match(await result.text(),/data-customer-design="picker-handles-1"/,'Integrated editor must be live');
 assert.equal(await page.locator('#personaliseMode,#customiseMode').count(),0);
 await page.locator('#postTemplate:enabled').waitFor({timeout:30000});
 await page.locator('#postTemplate').selectOption('bg-luxury-coral-ribbon');
 const art='luxury-coral-ribbon-primary';
 const field=(key)=>page.locator('#scratchActualRevealed [data-edit-field="'+key+'"]');
 const putField=async(key,value)=>{const target=field(key);await target.focus();await target.fill(value);};
 // Required fields must prevent an incomplete draft from being submitted.
 let premature=0;
 const countPremature=req=>{if(req.url()===origin+'/api/reveals'&&req.method()==='POST')premature++;};
 page.on('request',countPremature);
 await field('recipient').fill('');
 await page.locator('#reviewButton').click();
 await page.locator('#inlineValidation:visible').waitFor();
 assert.equal(premature,0);
 page.off('request',countPremature);
 await page.waitForFunction(id=>document.querySelector('#scratchActualCovered')?.dataset.renderedArtwork===id,art);
 for(const [key,value] of Object.entries({recipient:'Safari QA',sender:'Reveal QA',eventName:'Automated upload test',venue:'Test venue',personalMessage:'Private staging test only'})){
  const field=page.locator('#scratchActualRevealed [data-edit-field="'+key+'"]');
  await field.focus();await field.fill(value);
 }
 // Editing text selects that exact field for formatting without any mode.
 const host=page.locator('#scratchActualRevealed'),toolbar=host.locator('.customer-design-tools');
 // Date and time keep their entire native input exposed: neither handle
 // may sit over the calendar/clock icon, on desktop or on touch viewports.
 for(const [key,zoneKey,value] of [['eventDate','date','2026-12-03'],['eventTime','time','23:43']]){
  const input=field(key);
  await input.focus();await input.fill(value);
  assert.equal(await input.inputValue(),value);
  const selected=host.locator('[data-zone="'+zoneKey+'"].customer-zone');
  assert.equal(await selected.getAttribute('data-selected'),'true');
  assert.equal(await selected.locator('button').count(),0);
  const controls=toolbar.locator('.customer-picker-handles');
  const movePicker=controls.locator('[data-zone="'+zoneKey+'"][data-resize="0"]');
  const resizePicker=controls.locator('[data-zone="'+zoneKey+'"][data-resize="1"]');
  assert.ok(await movePicker.isVisible()&&await resizePicker.isVisible());
  const rect=await input.boundingBox();
  for(const handle of [movePicker,resizePicker]){
   const b=await handle.boundingBox();
   assert.ok(b.x+b.width<=rect.x||b.x>=rect.x+rect.width||b.y+b.height<=rect.y||b.y>=rect.y+rect.height,'native picker input must not overlap a design handle');
  }
  // Scroll may be needed before hit testing the native icon on a narrow screen.
  await input.scrollIntoViewIfNeeded();
  assert.ok(await input.evaluate(e=>{const r=e.getBoundingClientRect();return e.getRootNode().elementFromPoint(r.right-5,r.top+r.height/2)===e}),'calendar/clock side must hit the native input');
  const original=await selected.evaluate(z=>z.style.width);
  await resizePicker.focus();await resizePicker.press('ArrowLeft');
  assert.notEqual(await selected.evaluate(z=>z.style.width),original);
  await toolbar.getByRole('button',{name:'Undo',exact:true}).click();
  assert.equal(await selected.evaluate(z=>z.style.width),original);
  assert.equal(await input.inputValue(),value);
  await toolbar.getByRole('button',{name:'Done',exact:true}).click();
 }
 await field('eventName').focus();
 await toolbar.waitFor({state:'visible'});
 assert.equal(await toolbar.locator('.customer-field-name').textContent(),'Surprise title');
 assert.equal(await field('eventName').isVisible(),true);
 const zone=host.locator('[data-zone="eventName"]'),move=zone.locator('.customer-move-handle'),resize=zone.locator('.customer-resize-handle');
 assert.ok(await move.isVisible()&&await resize.isVisible());
 assert.equal(await host.locator('.customer-zone[data-selected="true"]').count(),1);
 const ink=toolbar.locator('[data-style-control="ink"]');
 await ink.fill('#d18b47');await ink.dispatchEvent('change');
 assert.equal(await field('eventName').inputValue(),'Automated upload test');
 const undo=toolbar.getByRole('button',{name:'Undo',exact:true}),redo=toolbar.getByRole('button',{name:'Redo',exact:true});
 await undo.click();assert.notEqual(await ink.inputValue(),'#d18b47');
 await redo.click();assert.equal(await ink.inputValue(),'#d18b47');
 const bounds=async()=>zone.evaluate(z=>[z.style.left,z.style.top,z.style.width,z.style.height]);
 const initialBounds=await bounds();
 // Keyboard movement/resize uses the same commit/validation path as drag.
 await move.focus();await move.press('ArrowRight');
 assert.notDeepEqual(await bounds(),initialBounds,'field should move using its dedicated handle');
 const moved=await bounds();
 await resize.focus();await resize.press('ArrowLeft');
 assert.notDeepEqual(await bounds(),moved,'field should resize independently of its text');
 await undo.click();await undo.click();
 assert.deepEqual(await bounds(),initialBounds);
 // Check actual drag on a separately selected, narrow movement target.
 await move.scrollIntoViewIfNeeded();const grip=await move.boundingBox();
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
 await page.mouse.move(grip.x+grip.width/2+2,grip.y+grip.height/2,{steps:3});await page.mouse.up();
 assert.notDeepEqual(await bounds(),initialBounds,'drag must reposition selected field');
 await undo.click();assert.deepEqual(await bounds(),initialBounds);
 await field('venue').focus();assert.equal(await toolbar.locator('.customer-field-name').textContent(),'Venue');
 await toolbar.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await toolbar.isVisible(),false);
 await field('eventName').focus();assert.equal(await ink.inputValue(),'#d18b47');
 await toolbar.getByRole('button',{name:'Done',exact:true}).click();
 const source=Buffer.from(await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=800;c.height=1000;
  const g=c.getContext('2d');g.fillStyle='#f12b34';g.fillRect(0,0,800,1000);
  g.fillStyle='#183552';g.fillRect(40,40,300,200);
  return c.toDataURL('image/png').split(',')[1];
 }),'base64');
 await page.locator('#image').setInputFiles({name:'safari-qa.png',mimeType:'image/png',buffer:source});
 await page.waitForFunction(()=>Boolean(document.querySelector('#scratchActualRevealed')?.dataset.renderedImage));
 await page.locator('#postImageControls').waitFor();
 await page.locator('#postImageFit').selectOption('cover');
 await page.locator('#postImageZoom').fill('160');
 await page.locator('#postImagePanX').fill('25');
 await page.locator('#postImagePanY').fill('-20');
 const savedResponse=page.waitForResponse(r=>r.url()===origin+'/api/reveals'&&r.request().method()==='POST',{timeout:30000});
 await page.locator('#reviewButton').click();
 const response=await savedResponse;
 assert.ok(response.ok(),'Staging save failed: '+response.status()+' '+await response.text());
 const saved=await response.json();assert.ok(saved.success&&saved.id&&saved.editToken);
 await page.waitForURL('**/reveal?id='+saved.id,{timeout:30000,waitUntil:'domcontentloaded'});
 await page.locator('#scratchActualReview:visible').waitFor({timeout:30000});
 const headers={'X-Edit-Token':saved.editToken};
 const image=await page.request.get(origin+'/api/reveals/'+saved.id+'/image',{headers});
 assert.ok(image.ok(),'Owner image retrieval failed');
 assert.match(image.headers()['content-type'],/^image\/png/i);
 const stored=await image.body();
 assert.deepEqual(stored,source,'R2 image bytes must match file selected through WebKit');
 const state=await page.request.get(origin+'/api/reveals/'+saved.id,{headers});
 assert.ok(state.ok());const {reveal}=await state.json();
 assert.equal(reveal.status,'draft');assert.equal(reveal.hasImage,true);
 const surfaceResponse=await page.request.get(origin+'/api/reveals/'+saved.id+'/scratch-surface',{headers});
 assert.ok(surfaceResponse.ok());const {surface}=await surfaceResponse.json();
 assert.equal(surface.artworkId,art);assert.equal(surface.hasImage,false);
 assert.equal(surface.postScratch.imageZoom,160);assert.equal(surface.postScratch.imagePanX,25);assert.equal(surface.postScratch.imagePanY,-20);
 assert.equal(surface.postScratch.imageFit,'cover');
 assert.equal(surface.postScratch.layout.eventName.ink,'#d18b47');
 assert.equal(reveal.recipient,'Safari QA');
 assert.equal(reveal.sender,'Reveal QA');
 assert.equal(reveal.eventName,'Automated upload test');
 assert.equal(reveal.venue,'Test venue');
 assert.equal(reveal.eventDate,'2026-12-03');assert.equal(reveal.eventTime,'23:43');
 assert.equal(reveal.personalMessage,'Private staging test only');
 assert.equal(reveal.shareUrl,undefined);
 assert.equal(await page.locator('#paidStage').isVisible(),false);
 const unowned=await page.request.get(origin+'/api/reveals/'+saved.id);
 assert.ok(!unowned.ok(),'Private draft must be inaccessible without the edit token');
 const unownedImage=await page.request.get(origin+'/api/reveals/'+saved.id+'/image');
 assert.ok(!unownedImage.ok(),'Private uploaded image must not be public');
 const geometry=async()=>page.locator('#scratchActualRevealed [data-photo-slot] image').evaluate(i=>['x','y','width','height','preserveAspectRatio'].map(k=>i.getAttribute(k)));
 await page.locator('#scratchActualReview [data-scratch-preview-mode="revealed"]').click();
 const initial=await geometry();
 assert.equal(await page.locator('#scratchActualCovered').getAttribute('data-rendered-artwork'),art);
 await page.locator('#editButton').click();
 await page.waitForURL('**/legacy-create?**',{timeout:30000,waitUntil:'domcontentloaded'});
 await page.locator('#postTemplate:enabled').waitFor({timeout:30000});
 await page.waitForFunction(()=>Boolean(document.querySelector('#scratchActualRevealed')?.dataset.renderedImage));
 assert.deepEqual(await geometry(),initial,'Amend retains photograph composition');
 assert.equal(await page.locator('#scratchArtwork').inputValue(),art);
 assert.equal(await field('recipient').inputValue(),'Safari QA');
 assert.equal(await field('eventName').inputValue(),'Automated upload test');
 await field('eventName').focus();assert.equal(await ink.inputValue(),'#d18b47');
 await toolbar.getByRole('button',{name:'Done',exact:true}).click();
 assert.equal(await page.locator('#postImageZoom').inputValue(),'160');
 const owner=async()=>{const response=await page.request.get(origin+'/api/reveals/'+saved.id,{headers});assert.ok(response.ok());return (await response.json()).reveal;};
 const savedSurface=async()=>{const response=await page.request.get(origin+'/api/reveals/'+saved.id+'/scratch-surface',{headers});assert.ok(response.ok());return (await response.json()).surface;};
 const reviewAgain=async()=>{
  const editResponse=page.waitForResponse(r=>r.url()===origin+'/api/reveals/'+saved.id&&r.request().method()==='PUT',{timeout:30000});
  await page.locator('#reviewButton').click();
  const result=await editResponse;assert.ok(result.ok(),'Amended draft save failed');
  await page.waitForURL('**/reveal?id='+saved.id,{timeout:30000,waitUntil:'domcontentloaded'});
  await page.locator('#scratchActualReview:visible').waitFor({timeout:30000});
 };
 await putField('eventName','Updated surprise');
 await putField('personalMessage','Amended private message');
 await page.locator('#postImageZoom').fill('175');
 await reviewAgain();
 const amended=await owner();
 assert.equal(amended.id,saved.id);
 assert.ok(amended.revision>reveal.revision);
 assert.equal(amended.eventName,'Updated surprise');
 assert.equal(amended.personalMessage,'Amended private message');
 assert.equal(amended.hasImage,true);
 const editedSurface=await savedSurface();
 assert.equal(editedSurface.artworkId,art);
 assert.equal(editedSurface.postScratch.imageZoom,175);
 assert.equal(editedSurface.postScratch.layout.eventName.ink,'#d18b47');
 assert.equal(editedSurface.postScratch.imagePanX,25);
 const sameImage=await page.request.get(origin+'/api/reveals/'+saved.id+'/image',{headers});
 assert.deepEqual(await sameImage.body(),source,'Text/layout changes must not replace the image');
 // Confirm without checkout, then use the confirmation-state Amend route.
 await page.locator('#confirmButton').click();
 await page.locator('#paymentAmendButton:visible').waitFor({timeout:30000});
 const confirmed=await owner();
 assert.equal(confirmed.status,'confirmed');assert.equal(confirmed.shareUrl,undefined);
 const capability=await page.request.get(origin+'/api/scratch/test-payment-status');
 assert.equal(await page.locator('#payButton').isVisible(),capability.ok()&&(await capability.json()).enabled===true);
 assert.equal(await page.locator('#paidStage').isVisible(),false);
 await page.locator('#paymentAmendButton').click();
 await page.waitForURL('**/legacy-create?**',{timeout:30000,waitUntil:'domcontentloaded'});
 await page.locator('#postTemplate:enabled').waitFor({timeout:30000});
 await page.waitForFunction(()=>Boolean(document.querySelector('#scratchActualRevealed')?.dataset.renderedImage));
 assert.equal((await owner()).status,'draft');
 assert.equal(await field('eventName').inputValue(),'Updated surprise');
 assert.equal(await page.locator('#postImageZoom').inputValue(),'175');
 await page.locator('#scratchActualRevealed .inline-photo-remove').click();
 await page.waitForFunction(()=>!document.querySelector('#scratchActualRevealed')?.shadowRoot?.querySelector('[data-photo-slot] image'));
 await putField('recipient','Amended recipient');
 await reviewAgain();
 const final=await owner();
 assert.equal(final.status,'draft');assert.equal(final.id,saved.id);
 assert.equal(final.recipient,'Amended recipient');assert.equal(final.eventName,'Updated surprise');
 assert.equal(final.hasImage,false);assert.equal(final.shareUrl,undefined);
 const removed=await page.request.get(origin+'/api/reveals/'+saved.id+'/image',{headers});
 assert.ok(!removed.ok(),'Explicitly removed image must no longer be retrievable');
 assert.equal((await savedSurface()).artworkId,art);
 assert.equal(await page.locator('#paidStage').isVisible(),false);
 assert.deepEqual(errors,[]);
 console.log('PASS: '+label+' live create, required fields, owner-only review, repeated Amend, confirmation-state Amend, original upload retention and image removal; SHA256 '+hash(stored)+'; unpaid test draft '+saved.id);
}finally{await browser.close();}
