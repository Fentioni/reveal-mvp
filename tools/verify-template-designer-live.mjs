import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const origin='https://reveal-stage4b-test.michael-fenton9.workers.dev';
let ready=false;
for(let n=0;n<35;n++){
 try{const r=await fetch(origin+'/admin-template-designer?v=person-labels-1&check='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(r.ok&&(await r.text()).includes('person-labels-1')){const api=await fetch(origin+'/api/template-designs/candlelight',{cache:'no-store'});if(api.ok){await api.json();ready=true;break;}}}catch{}
 await new Promise(r=>setTimeout(r,7000));
}
assert.ok(ready,'Template Studio is not deployed yet');
const browser=await chromium.launch({headless:true});
try{
 await mkdir('test-output/template-designer-live',{recursive:true});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/admin-template-designer?check='+Date.now());await page.locator('[data-layer="zone:eventName"]').waitFor();
  const catalogue=await (await page.request.get(origin+'/api/template-catalogue')).json();
  assert.equal(await page.locator('#template option').count(),catalogue.templates.filter(t=>!t.archived).length);
  assert.equal(await page.locator('#editText').isVisible(),true);
  await page.locator('#editText').click();
  const sample=page.locator('#prop-templateText'),original=await sample.inputValue();
  await sample.fill('Test title');assert.equal(await page.locator('#save').isEnabled(),true);
  assert.match(await page.locator('#render [data-field="eventName"]').textContent(),/Test\s*title/i);
  await page.locator('#undo').click();assert.equal(await sample.inputValue(),original);
  await page.locator('#redo').click();assert.equal(await sample.inputValue(),'Test title');
  await page.locator('#undo').click();assert.equal(await sample.inputValue(),original);
  assert.equal(await page.locator('#photoOrientation').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#artworkShortcut').click();assert.equal(await page.locator('#artworkUpload').isVisible(),true);assert.equal(await page.locator('#restoreArtwork').isVisible(),true);
  await page.locator('#prop-artworkSource').selectOption('spotlight');assert.equal(await page.locator('[data-template-artwork]').getAttribute('href'),'/post-scratch-artwork/spotlight.webp');await page.locator('#undo').click();
  await page.screenshot({path:'test-output/template-designer-live/'+viewport.width+'.png',fullPage:true});
  await page.locator('[data-layer="zone:eventName"]').click();
  const x=Number(await page.locator('#prop-x').inputValue());
  await page.locator('#prop-x').fill(String(x+15));await page.locator('#prop-x').press('Tab');
  assert.equal(Number(await page.locator('#prop-x').inputValue()),x+15);assert.equal(await page.locator('#save').isEnabled(),true);
  await page.locator('#undo').click();assert.equal(Number(await page.locator('#prop-x').inputValue()),x);
  const noAuth=await page.request.put(origin+'/api/template-designs/candlelight',{data:{revision:'base'}});assert.ok([401,503].includes(noAuth.status()),'Unauthenticated writes must be blocked');
  assert.deepEqual(errors,[]);await page.close();
  console.log('LIVE Template Studio',viewport.width,'passed; no changes published.');
 }
}finally{await browser.close();}
