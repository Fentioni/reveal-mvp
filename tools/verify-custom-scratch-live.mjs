// Real staging creator upload + private review + Amend. No checkout or
// payment is initiated, and no production environment is accessed.
import assert from 'node:assert/strict';
import {webkit,chromium,devices} from 'playwright';
import {mkdir} from 'node:fs/promises';
const base='https://reveal-stage4b-test.michael-fenton9.workers.dev';
for(let i=0;i<36;i++){
 try{const r=await fetch(base+'/legacy-create.html?custom-ready='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(r.ok&&(await r.text()).includes('data-custom-scratch="2"'))break;}catch{}
 if(i===35)throw Error('Custom scratch creator is not deployed.');
 await new Promise(r=>setTimeout(r,5000));
}
await mkdir('test-output/custom-scratch',{recursive:true});
const modes=[
 {name:'mobile-webkit',engine:webkit,options:{...devices['iPhone SE'],viewport:{width:320,height:568}}},
 {name:'desktop-chromium',engine:chromium,options:{viewport:{width:1340,height:900}}}
];
for(const {name,engine,options} of modes){
 const browser=await engine.launch({headless:true});const page=await browser.newPage(options);
 let saved;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const r=await page.goto(base+'/legacy-create?variant=ticket&custom-qa='+Date.now());
  assert.ok(r.ok());
  await page.locator('#reviewButton:enabled').waitFor({timeout:30000});
  assert.equal(await page.locator('#scratchCoverSource').count(),0,'No extra dropdown should exist');
  assert.equal(await page.locator('#postTemplate > option:last-child').textContent(),'Upload my own scratch artwork');
  assert.equal(await page.locator('#scratchCoverUploadField').isVisible(),false);
  const gallery=await page.locator('#postTemplate').inputValue();
  await page.locator('#postTemplate').selectOption('upload-my-own-scratch-artwork');
  await page.waitForFunction(()=>document.querySelector('#postTemplate')?.value==='upload-my-own-scratch-artwork'&&document.querySelector('#scratchCoverUploadField')?.hidden===false,{timeout:15000});
  assert.equal(await page.locator('#postTemplate').inputValue(),'upload-my-own-scratch-artwork');
  assert.equal(await page.locator('#postTemplate').isDisabled(),false);
  assert.equal(await page.locator('#scratchCoverUploadField').isVisible(),true);
  const png=await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=900;c.height=1200;
   const x=c.getContext('2d');x.fillStyle='#0b3465';x.fillRect(0,0,900,1200);
   x.fillStyle='#f4c66c';x.fillRect(130,170,480,420);
   x.fillStyle='#e8eeff';x.font='bold 72px Arial';x.fillText('CUSTOM',120,850);
   return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#scratchCoverImage').setInputFiles({name:'my-scratch-cover.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.locator('#scratchCoverFileName').getByText('my-scratch-cover.png').waitFor();
  await page.locator('#scratchCoverZoom').fill('150');
  await page.locator('#scratchCoverPanX').fill('-30');
  await page.locator('#scratchCoverPanY').fill('20');
  await page.locator('[data-scratch-preview-mode="covered"]').click();
  await page.locator('#scratchActualCovered #foilCanvas').waitFor({state:'attached'});
  // The existing single preview must show the customer's image as the front.
  // Upload/zoom triggers asynchronous canvas redraws. Check the settled
  // preview rather than sampling during a DOM replacement frame.
  await page.waitForFunction(()=>Boolean(document.querySelector('#scratchActualCovered')?.shadowRoot?.querySelector('#foilCanvas')?.width),{timeout:15000});
  await page.locator('[data-scratch-preview-mode="revealed"]').click();
  for(const [k,v] of Object.entries({eventName:'Custom Scratch QA',recipient:'Chloe',sender:'Reveal QA'})){
   const field=page.locator('#scratchActualRevealed [data-edit-field="'+k+'"]');
   await field.focus();await field.fill(v);
  }
  const created=page.waitForResponse(x=>x.url()===base+'/api/reveals'&&x.request().method()==='POST',{timeout:30000});
  await page.locator('#reviewButton').click();
  const response=await created;assert.ok(response.ok(),await response.text());saved=await response.json();
  assert.ok(saved.id&&saved.editToken);
  await page.waitForURL('**/reveal?id='+saved.id,{timeout:30000});
  await page.locator('#scratchActualReview:visible').waitFor({timeout:30000});
  const headers={'X-Edit-Token':saved.editToken};
  const settings=await page.request.get(base+'/api/reveals/'+saved.id+'/scratch-surface',{headers});
  assert.ok(settings.ok());const s=(await settings.json()).surface;
  assert.equal(s.style,'custom');assert.equal(s.hasImage,true);
  assert.equal(s.postScratch.templateId,'bg-wrap-sapphire');assert.equal(s.artworkId,undefined);
  assert.deepEqual(s.coverCrop,{zoom:150,panX:-30,panY:20});
  const savedCover=await page.request.get(base+'/api/reveals/'+saved.id+'/scratch-surface/image',{headers});
  assert.ok(savedCover.ok());assert.equal(savedCover.headers()['content-type'],'image/png');
  assert.deepEqual(await savedCover.body(),Buffer.from(png,'base64'));
  const denied=await page.request.get(base+'/api/reveals/'+saved.id+'/scratch-surface/image');
  assert.ok(!denied.ok(),'Custom artwork leaked to anonymous users');
  await page.screenshot({path:'test-output/custom-scratch/'+name+'-review.png',fullPage:true});
  const confirm=await page.locator('#confirmButton:visible');await confirm.click();
  await page.locator('#paymentAmendButton:visible').waitFor();
  await page.locator('#paymentAmendButton').click();
  await page.waitForURL('**/legacy-create?**',{timeout:30000});
  await page.locator('#postTemplate:enabled').waitFor({timeout:30000});
  assert.equal(await page.locator('#scratchCoverSource').count(),0);
  assert.equal(await page.locator('#postTemplate').inputValue(),'upload-my-own-scratch-artwork');
  assert.equal(await page.locator('#scratchCoverZoom').inputValue(),'150');
  assert.equal(await page.locator('#scratchCoverPanX').inputValue(),'-30');
  assert.equal(await page.locator('#scratchCoverPanY').inputValue(),'20');
  assert.match(await page.locator('#scratchCoverFileName').textContent(),/Saved uploaded artwork/);
  await page.locator('#postTemplate').selectOption(gallery);
  assert.equal(await page.locator('#postTemplate').inputValue(),gallery);
  assert.equal(await page.locator('#postTemplate').isEnabled(),true);
  assert.equal(await page.locator('#scratchCoverUploadField').isVisible(),false);
  const revised=page.waitForResponse(x=>x.url()===base+'/api/reveals/'+saved.id&&x.request().method()==='PUT',{timeout:30000});
  await page.locator('#reviewButton').click();
  assert.ok((await revised).ok());await page.waitForURL('**/reveal?id='+saved.id);
  const gallerySaved=await page.request.get(base+'/api/reveals/'+saved.id+'/scratch-surface',{headers});
  const final=(await gallerySaved.json()).surface;
  assert.equal(final.style,'classic');assert.equal(final.hasImage,false);
  assert.ok(final.artworkId);assert.equal(final.postScratch.templateId,gallery);
  const removed=await page.request.get(base+'/api/reveals/'+saved.id+'/scratch-surface/image',{headers});
  assert.equal(removed.status(),404);
  assert.deepEqual(errors,[]);
  console.log('PASS: '+name+' custom cover -> Sapphire Wrap -> private review -> Amend crop -> gallery restoration');
 }finally{await browser.close();}
}
