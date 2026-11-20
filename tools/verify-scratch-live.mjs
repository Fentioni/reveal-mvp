// Read-only browser verification against the actual staging worker, not
// mocked APIs. The creator is filled locally but never saved or paid.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {POST_TEMPLATES} from '../public/post-scratch-catalogue.js';
const origin='https://reveal-stage4b-test.michael-fenton9.workers.dev';
const marker='paired-products.js?v=2';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ready=false;
for(let i=0;i<35;i++){
 try{
  const res=await fetch(origin+'/legacy-create?variant=ticket&verify='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(res.ok&&(await res.text()).includes(marker)){
   const module=await fetch(origin+'/scratch-owner-preview.js?verify='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(module.ok&&(await module.text()).includes('A rendered card must never become visible or measurable')){ready=true;break;}
  }
 }catch(e){console.log('Cloudflare request:',e.message);}
 await pause(7000);
}
assert.ok(ready,'Cloudflare has not published the new layouts yet');
const browser=await chromium.launch({headless:true});
try{
 await mkdir('test-output/scratch-live',{recursive:true});
 for(const viewport of [{width:1380,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport});
  try{
   const res=await page.goto(origin+'/legacy-create?variant=ticket&verify='+Date.now());
   assert.ok(res.ok());assert.ok((await res.text()).includes(marker));
   await page.locator('#postTemplate:enabled').waitFor();
   const options=await page.locator('#postTemplate option').evaluateAll(nodes=>nodes.map(n=>n.value));
   const standard=options.find(id=>id!=='custom-image');assert.ok(standard);
   await page.locator('#postTemplate').selectOption(standard);
   await page.locator('#scratchActualRevealed .inline-ticket-photo').waitFor({state:'visible'});
   assert.equal(await page.locator('#scratchImageUpload').isVisible(),false);
   assert.equal(await page.locator('#postImageControls').isVisible(),false);
   if(options.includes('custom-image')){
    await page.locator('#postTemplate').selectOption('custom-image');
    await page.locator('#scratchImageUpload').waitFor({state:'visible'});
    assert.match(await page.locator('#imageUploadLabel').textContent(),/required/);
   }
   console.log('LIVE INLINE PHOTO PICKER AND HIDDEN DUPLICATE UPLOAD',viewport.width);
  }finally{await page.close();}
 }
 for(const viewport of [{width:1380,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const res=await page.goto(origin+'/legacy-create?variant=ticket&verify='+Date.now());
  assert.ok(res.ok());assert.ok((await res.text()).includes(marker));
  await page.locator('#reviewButton:enabled').waitFor({timeout:20000});
  await page.locator('#scratchActualRevealed [data-edit-field="eventName"]').waitFor({state:'visible',timeout:20000});
  assert.equal(await page.locator('#concertZoomButton:visible').count(),0);
  const activeIds=await page.locator('#postTemplate option').evaluateAll(nodes=>nodes.map(n=>n.value));assert.equal(activeIds.length,26);assert.equal(new Set(activeIds).size,26);
  assert.equal(await page.locator('#recipient:visible,#eventName:visible,#ticketUrl:visible').count(),0);
  assert.equal(await page.locator('#scratchActualRevealed [data-edit-field]').count(),10);
  assert.equal(await page.locator('#venue:visible,#postVenueAddress:visible').count(),0);
  assert.equal(await page.locator('#postImageControls').isVisible(),false);
  assert.equal(await page.locator('#postImageZoom').isEnabled(),false);
  assert.equal(await page.locator('#postImageReset').isVisible(),false);
  assert.equal(await page.locator('#postImageReset').isEnabled(),false);
  assert.equal(await page.locator('#eventName:visible,#postSubtitle:visible').count(),0);
  for(const [field,value] of Object.entries({recipient:'Chloe',sender:'Michael',eventName:'Jesus Christ Superstar',eventDate:'2027-03-20',eventTime:'19:30',venue:'Theatre Royal',postVenueAddress:'Drury Lane, London',postSubtitle:'A night to remember',personalMessage:'A wonderful evening, just for you.',ticketUrl:'https://example.org'})){const input=page.locator('#scratchActualRevealed [data-edit-field="'+field+'"]');await input.focus();await input.fill(value);}
  const img=await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=900;c.height=1200;const g=c.getContext('2d');
   const gradient=g.createLinearGradient(0,0,900,1200);gradient.addColorStop(0,'#151a40');gradient.addColorStop(1,'#8a3b6e');g.fillStyle=gradient;g.fillRect(0,0,900,1200);
   g.fillStyle='#f3cf8b';g.font='bold 64px Georgia';g.textAlign='center';g.fillText('THEATRE NIGHT',450,220);
   for(let i=0;i<18;i++){g.beginPath();g.arc((i*197)%900,300+(i*79)%460,5+(i%4)*2,0,Math.PI*2);g.fill();}
   g.strokeStyle='#f3cf8b';g.lineWidth=8;g.strokeRect(40,40,820,1120);
   return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#image').setInputFiles({name:'sample-poster.png',mimeType:'image/png',buffer:Buffer.from(img,'base64')});
  await page.locator('#postImageZoom:enabled').waitFor({state:'visible'});
  assert.equal(await page.locator('#postImageReset').isEnabled(),true);
  await page.locator('#postImageZoom').fill('150');
  await page.locator('#postImageFit').selectOption('cover');
  await page.locator('#postImagePanX').fill('20');
  await page.locator('#postImagePanY').fill('-15');
  await page.locator('[data-scratch-preview-mode="revealed"]').click();
  for(const template of POST_TEMPLATES.filter(t=>activeIds.includes(t.id))){
   await page.locator('#postTemplate').selectOption(template.id);
   const expected=await page.evaluate(async id=>(await import('/paired-products.js')).coversForTemplate(id),template.id);
   assert.deepEqual(await page.locator('#scratchArtwork option').evaluateAll(nodes=>nodes.map(n=>n.value)),expected);
   assert.equal(await page.locator('#pairedCoverChoice').isVisible(),expected.length===2);
   if(expected.length===2){await page.locator('#scratchArtwork').selectOption(expected[1]);await page.waitForFunction(id=>document.querySelector('#scratchActualCovered').dataset.renderedArtwork===id,expected[1]);}
   assert.equal(await page.locator('#postImageControls').isVisible(),true);
   assert.equal(await page.locator('#postImageZoom').isEnabled(),true);
   assert.equal(await page.locator('#postImageReset').isVisible(),true);
   assert.equal(await page.locator('#postImageReset').isEnabled(),true);
   const host=page.locator('#scratchActualRevealed');
   await page.waitForFunction(id=>{
    const root=document.querySelector('#scratchActualRevealed')?.shadowRoot,card=root?.querySelector('#card'),svg=card?.querySelector('svg');
    const image=svg?.querySelector('[data-photo-slot] image');
    return card?.dataset.postTemplate===id&&svg?.querySelectorAll('[data-field]').length===10&&!!image&&image.getAttribute('preserveAspectRatio')==='xMidYMid slice';
   },template.id,{timeout:15000});
   const result=await host.evaluate(el=>{
    const root=el.shadowRoot,card=root.querySelector('#card'),svg=card.querySelector('svg'),r=card.getBoundingClientRect();
    return {id:card.dataset.postTemplate,width:r.width,height:r.height,cssRatio:getComputedStyle(card).aspectRatio,ratio:r.width/r.height,overflow:card.dataset.textOverflow,fields:svg.querySelectorAll('[data-field]').length,panels:svg.querySelectorAll('[data-layout-panel]').length,headings:root.querySelectorAll('h1,.eyebrow,.intro').length};
   });
   assert.equal(result.headings,0);assert.equal(result.fields,10);assert.equal(result.overflow,'');assert.ok(Math.abs(result.ratio-.75)<.001,'3:4 geometry: '+JSON.stringify(result));
   assert.equal(result.panels,0);
   const geometry=await host.evaluate(el=>{const svg=el.shadowRoot.querySelector('svg[data-post-template]'),g=svg.querySelector('[data-photo-slot]'),i=g.querySelector('image');return {w:Number(i.getAttribute('width')),h:Number(i.getAttribute('height')),x:Number(i.getAttribute('x')),y:Number(i.getAttribute('y')),fit:i.getAttribute('preserveAspectRatio'),clip:g.getAttribute('clip-path')};});
   assert.ok(geometry.w>0&&geometry.h>0);assert.ok(geometry.fit.endsWith('slice'));assert.ok(geometry.clip.startsWith('url(#'));
   await page.locator('#scratchActualRevealed #card').screenshot({path:'test-output/scratch-live/'+viewport.width+'-'+template.id+'.png'});
   console.log('LIVE:',viewport.width,JSON.stringify(result));
  }
  await page.locator('#postImageReset').click();
  for(const [id,value] of Object.entries({postImageZoom:'100',postImagePanX:'0',postImagePanY:'0',postImageFit:'auto',postImagePosition:'xMidYMid',postTextContrast:'light',postShade:'70'}))assert.equal(await page.locator('#'+id).inputValue(),value);
  await page.waitForFunction(()=>Number(document.querySelector('#scratchActualRevealed').shadowRoot.querySelector('[data-photo-slot] image')?.getAttribute('width'))>0);
  await page.locator('[data-scratch-preview-mode="covered"]').click();
  assert.equal(await page.locator('#scratchActualCovered').evaluate(el=>getComputedStyle(el).opacity),'1');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Available built-in templates verified on both LIVE staging viewports; no drafts saved or payments made.');
}finally{await browser.close();}
