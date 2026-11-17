// Read-only browser verification against the actual staging worker, not
// mocked APIs. The creator is filled locally but never saved or paid.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {POST_TEMPLATES} from '../public/post-scratch-catalogue.js';
const origin='https://reveal-stage4b-test.michael-fenton9.workers.dev';
const marker='reference-panels-1';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ready=false;
for(let i=0;i<15;i++){
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
  const page=await browser.newPage({viewport}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const res=await page.goto(origin+'/legacy-create?variant=ticket&verify='+Date.now());
  assert.ok(res.ok());assert.ok((await res.text()).includes(marker));
  await page.locator('#scratchActualCovered canvas').waitFor({state:'visible',timeout:20000});
  assert.equal(await page.locator('#concertZoomButton:visible').count(),0);
  assert.equal(await page.locator('#postTemplate option').count(),15);
  for(const [field,value] of Object.entries({recipient:'Chloe',sender:'Michael',eventName:'Jesus Christ Superstar',eventDate:'2027-03-20',eventTime:'19:30',venue:'Theatre Royal',postVenueAddress:'Drury Lane, London',postSubtitle:'A night to remember',personalMessage:'A wonderful evening, just for you.',ticketUrl:'https://example.org'}))await page.locator('#'+field).fill(value);
  await page.locator('#image').setInputFiles('public/post-scratch-artwork/editorial.webp');
  await page.locator('[data-scratch-preview-mode="revealed"]').click();
  for(const template of POST_TEMPLATES){
   await page.locator('#postTemplate').selectOption(template.id);
   const host=page.locator('#scratchActualRevealed');
   await page.waitForFunction(id=>{
    const root=document.querySelector('#scratchActualRevealed')?.shadowRoot,card=root?.querySelector('#card'),svg=card?.querySelector('svg');
    return card?.dataset.postTemplate===id&&svg?.querySelectorAll('[data-field]').length===10&&!!svg?.querySelector('[data-photo-slot] image, image[data-photo-slot]');
   },template.id,{timeout:15000});
   const result=await host.evaluate(el=>{
    const root=el.shadowRoot,card=root.querySelector('#card'),svg=card.querySelector('svg'),r=card.getBoundingClientRect();
    return {id:card.dataset.postTemplate,ratio:r.width/r.height,overflow:card.dataset.textOverflow,fields:svg.querySelectorAll('[data-field]').length,panels:svg.querySelectorAll('[data-layout-panel]').length,headings:root.querySelectorAll('h1,.eyebrow,.intro').length};
   });
   assert.equal(result.headings,0);assert.equal(result.fields,10);assert.equal(result.overflow,'');assert.ok(Math.abs(result.ratio-.75)<.001);
   if(template.id!=='custom-image')assert.ok(result.panels>=8);
   await page.locator('#scratchActualRevealed #card').screenshot({path:'test-output/scratch-live/'+viewport.width+'-'+template.id+'.png'});
   console.log('LIVE:',viewport.width,JSON.stringify(result));
  }
  await page.locator('[data-scratch-preview-mode="covered"]').click();
  assert.equal(await page.locator('#scratchActualCovered').evaluate(el=>getComputedStyle(el).opacity),'1');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('All 15 templates verified on both LIVE staging viewports; no drafts saved or payments made.');
}finally{await browser.close();}
