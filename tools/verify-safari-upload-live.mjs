// Real WebKit browser, real staging Worker and private staging storage.
// Creates one unpaid synthetic draft; never confirms, pays, or publishes it.
import assert from 'node:assert/strict';
import {webkit} from 'playwright';
import {createHash} from 'node:crypto';
const origin='https://reveal-stage4b-test.michael-fenton9.workers.dev';
const hash=b=>createHash('sha256').update(b).digest('hex');
const browser=await webkit.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const result=await page.goto(origin+'/legacy-create?variant=ticket&verify='+Date.now(),{waitUntil:'domcontentloaded'});
 assert.ok(result?.ok(),'Live staging creator responds');
 assert.match(await result.text(),/selectedImage\.arrayBuffer\(\)/,'Byte-backed upload patch is deployed');
 await page.locator('#postTemplate:enabled').waitFor({timeout:30000});
 await page.locator('#postTemplate').selectOption('bg-envelope-coral-ginkgo');
 const art='envelope-coral-ginkgo-alternative';
 await page.locator('#scratchArtwork').selectOption(art);
 await page.waitForFunction(id=>document.querySelector('#scratchActualCovered')?.dataset.renderedArtwork===id,art);
 for(const [key,value] of Object.entries({recipient:'Safari QA',sender:'Reveal QA',eventName:'Automated upload test',venue:'Test venue',personalMessage:'Private staging test only'})){
  const field=page.locator('#scratchActualRevealed [data-edit-field="'+key+'"]');
  await field.focus();await field.fill(value);
 }
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
 const geometry=async()=>page.locator('#scratchActualRevealed [data-photo-slot] image').evaluate(i=>['x','y','width','height','preserveAspectRatio'].map(k=>i.getAttribute(k)));
 const initial=await geometry();
 assert.equal(await page.locator('#scratchActualCovered').getAttribute('data-rendered-artwork'),art);
 await page.locator('#editButton').click();
 await page.waitForURL('**/legacy-create?**',{timeout:30000,waitUntil:'domcontentloaded'});
 await page.locator('#postTemplate:enabled').waitFor({timeout:30000});
 await page.waitForFunction(()=>Boolean(document.querySelector('#scratchActualRevealed')?.dataset.renderedImage));
 assert.deepEqual(await geometry(),initial,'Amend retains photograph composition');
 assert.equal(await page.locator('#scratchArtwork').inputValue(),art);
 assert.deepEqual(errors,[]);
 console.log('PASS: Live WebKit upload, exact stored PNG bytes, private purchaser review and Amend; SHA256 '+hash(stored)+'; unpaid draft '+saved.id);
}finally{await browser.close();}
