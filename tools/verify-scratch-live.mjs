// Read-only check against actual Cloudflare staging assets. No mocked requests.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const origin='https://reveal-stage4b-test.michael-fenton9.workers.dev';
const marker='post-preview-compact-2';
const forbidden='Scratch the surface with your finger or mouse. Every piece of foil stays until you remove it.';
const browser=await chromium.launch({headless:true});
try{
 await mkdir('test-output/scratch-live',{recursive:true});
 for(const viewport of [{width:1380,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(origin+'/legacy-create?variant=ticket&verify='+Date.now(),{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200);
  const html=await response.text();
  console.log('Live HTML',viewport.width,JSON.stringify({url:response.url(),marker:html.includes(marker),cache:response.headers()['cache-control'],age:response.headers().age}));
  assert.ok(html.includes(marker),'Live HTML does not reference compact module');
  const module=await page.request.get(origin+'/scratch-owner-preview.js?v='+marker,{headers:{'cache-control':'no-cache'}});
  const code=await module.text();
  console.log('Live module',JSON.stringify({status:module.status(),oldHeader:code.includes(forbidden),compact:code.includes('main.append(card);'),cache:module.headers()['cache-control']}));
  assert.equal(module.status(),200);assert.ok(code.includes('main.append(card);'));assert.ok(!code.includes(forbidden));
  await page.locator('#scratchActualCovered canvas').waitFor({state:'visible',timeout:20000});
  assert.equal(await page.locator('#concertZoomButton:visible').count(),0,'Concert-only full-size control must not appear in Scratch Ticket creator');
  await page.locator('#scratchCreatorActual').screenshot({path:'test-output/scratch-live/'+viewport.width+'-covered.png'});
  for(const mode of ['covered','revealed']){
   await page.locator('[data-scratch-preview-mode="'+mode+'"]').click();
   const panel=page.locator(mode==='covered'?'#scratchActualCovered':'#scratchActualRevealed');
   const data=await panel.evaluate(el=>({headings:el.shadowRoot.querySelectorAll('h1,.eyebrow,.intro').length,top:getComputedStyle(el.shadowRoot.querySelector('main')).paddingTop,card:!!el.shadowRoot.querySelector('#card')}));
   console.log(viewport.width,mode,JSON.stringify(data));
   assert.equal(data.headings,0);assert.equal(data.top,'0px');assert.ok(data.card);
   if(mode==='revealed')await page.locator('#scratchCreatorActual').screenshot({path:'test-output/scratch-live/'+viewport.width+'-revealed.png'});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
}finally{await browser.close();}
