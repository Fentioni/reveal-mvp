// Read-only browser verification against the actual staging worker, not
// mocked APIs. The creator is filled locally but never saved or paid.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {POST_TEMPLATES} from '../public/post-scratch-catalogue.js';
const origin='https://reveal-stage4b-test.michael-fenton9.workers.dev';
const marker='data-editor-revision="2"';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ready=false;
for(let i=0;i<35;i++){
 try{
  const res=await fetch(origin+'/legacy-create?variant=ticket&verify='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(res.ok&&(await res.text()).includes(marker)){ready=true;break;}
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
   await page.locator('#scratchArtwork:enabled').waitFor();
   const coords=await page.evaluate(()=>{
    const editor=document.querySelector('#postImageControls'),link=document.querySelector('#ticketUrl'),review=document.querySelector('#reviewButton');
    const bounds=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom}};
    return {sameForm:editor.parentElement===review.parentElement,link:bounds(link),editor:bounds(editor),review:bounds(review),visible:!editor.hidden};
   });
   assert.ok(coords.sameForm&&coords.visible&&coords.link.bottom<=coords.editor.top&&coords.editor.bottom<=coords.review.top);
   console.log('LIVE EDITOR POSITION',viewport.width,JSON.stringify(coords));
   await page.locator('#postImageControls').screenshot({path:'test-output/scratch-live/'+viewport.width+'-editor-at-bottom.png'});
  }finally{await page.close();}
 }
 for(const viewport of [{width:1380,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const res=await page.goto(origin+'/legacy-create?variant=ticket&verify='+Date.now());
  assert.ok(res.ok());assert.ok((await res.text()).includes(marker));
  await page.locator('#scratchActualCovered canvas').waitFor({state:'visible',timeout:20000});
  assert.equal(await page.locator('#concertZoomButton:visible').count(),0);
  assert.equal(await page.locator('#postTemplate option').count(),15);
  assert.equal(await page.evaluate(()=>{const editor=document.querySelector('#postImageControls'),link=document.querySelector('#ticketUrl'),review=document.querySelector('#reviewButton');return editor.parentElement===review.parentElement&&Boolean(link.compareDocumentPosition(editor)&Node.DOCUMENT_POSITION_FOLLOWING)&&Boolean(editor.compareDocumentPosition(review)&Node.DOCUMENT_POSITION_FOLLOWING)&&link.getBoundingClientRect().bottom<=editor.getBoundingClientRect().top&&editor.getBoundingClientRect().bottom<=review.getBoundingClientRect().top;}),true,'Image editor follows all details and precedes review');
  assert.equal(await page.evaluate(()=>{const a=document.querySelector('#venue'),b=document.querySelector('#postVenueAddress');return a.closest('.field').nextElementSibling===b.closest('.field')&&!b.closest('.field').hidden&&a.getBoundingClientRect().bottom<=b.getBoundingClientRect().top;}),true,'Address directly follows venue');
  assert.equal(await page.locator('#postImageControls').isVisible(),true);
  assert.equal(await page.locator('#postImageZoom').isEnabled(),false);
  assert.equal(await page.locator('#postImageReset').isVisible(),true);
  assert.equal(await page.locator('#postImageReset').isEnabled(),false);
  assert.equal(await page.evaluate(()=>{const a=document.querySelector('#eventName'),b=document.querySelector('#postSubtitle');return a.closest('.field').nextElementSibling===b.closest('.field')&&!b.closest('.field').hidden&&a.getBoundingClientRect().bottom<=b.getBoundingClientRect().top;}),true,'Surprise field directly precedes subtitle');
  for(const [field,value] of Object.entries({recipient:'Chloe',sender:'Michael',eventName:'Jesus Christ Superstar',eventDate:'2027-03-20',eventTime:'19:30',venue:'Theatre Royal',postVenueAddress:'Drury Lane, London',postSubtitle:'A night to remember',personalMessage:'A wonderful evening, just for you.',ticketUrl:'https://example.org'}))await page.locator('#'+field).fill(value);
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
  for(const template of POST_TEMPLATES){
   await page.locator('#postTemplate').selectOption(template.id);
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
    return {id:card.dataset.postTemplate,ratio:r.width/r.height,overflow:card.dataset.textOverflow,fields:svg.querySelectorAll('[data-field]').length,panels:svg.querySelectorAll('[data-layout-panel]').length,headings:root.querySelectorAll('h1,.eyebrow,.intro').length};
   });
   assert.equal(result.headings,0);assert.equal(result.fields,10);assert.equal(result.overflow,'');assert.ok(Math.abs(result.ratio-.75)<.001);
   if(template.id!=='custom-image')assert.ok(result.panels>=8);
   const geometry=await host.evaluate(el=>{const svg=el.shadowRoot.querySelector('svg[data-post-template]'),g=svg.querySelector('[data-photo-slot]'),i=g.querySelector('image');return {w:Number(i.getAttribute('width')),h:Number(i.getAttribute('height')),x:Number(i.getAttribute('x')),y:Number(i.getAttribute('y')),fit:i.getAttribute('preserveAspectRatio'),clip:g.getAttribute('clip-path')};});
   const p=template.photo;assert.equal(geometry.w,p.w*1.5);assert.equal(geometry.h,p.h*1.5);assert.ok(Math.abs(geometry.x-(p.x-p.w*.25+p.w*.1))<.0001);assert.ok(Math.abs(geometry.y-(p.y-p.h*.25-p.h*.075))<.0001);assert.ok(geometry.fit.endsWith('slice'));assert.ok(geometry.clip.startsWith('url(#'));
   await page.locator('#scratchActualRevealed #card').screenshot({path:'test-output/scratch-live/'+viewport.width+'-'+template.id+'.png'});
   console.log('LIVE:',viewport.width,JSON.stringify(result));
  }
  await page.locator('#postImageReset').click();
  for(const [id,value] of Object.entries({postImageZoom:'100',postImagePanX:'0',postImagePanY:'0',postImageFit:'auto',postImagePosition:'xMidYMid',postTextContrast:'light',postShade:'70'}))assert.equal(await page.locator('#'+id).inputValue(),value);
  await page.waitForFunction(()=>document.querySelector('#scratchActualRevealed').shadowRoot.querySelector('[data-photo-slot] image')?.getAttribute('width')==='900');
  await page.locator('[data-scratch-preview-mode="covered"]').click();
  assert.equal(await page.locator('#scratchActualCovered').evaluate(el=>getComputedStyle(el).opacity),'1');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('All 15 templates verified on both LIVE staging viewports; no drafts saved or payments made.');
}finally{await browser.close();}
