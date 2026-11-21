// Real staging WebKit iPhone-emulated creation and payment button.
// No card or payment is submitted; expire the test session when finished.
import assert from 'node:assert/strict';
import {webkit,devices} from 'playwright';
const origin='https://reveal-stage4b-test.michael-fenton9.workers.dev';
const ready=await fetch(origin+'/api/scratch/test-payment-status',{cache:'no-store'});
assert.ok(ready.ok);const capability=await ready.json();
assert.equal(capability.checkoutRevision,'no-vat-99p-1');assert.equal(capability.mode,'test');assert.equal(capability.enabled,true);assert.equal(capability.baseAmountMinor,99);assert.equal(capability.automaticTax,false);
// Cloudflare asset publishing can lag behind the Worker API deployment.
// Do not test the mobile button against the previous HTML version.
let uiReady=false;
for(let i=0;i<35;i++){
 try{
  const res=await fetch(origin+'/reveal.html?ui-version-check='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(res.ok&&(await res.text()).includes("data.automaticTax===false&&data.baseAmountMinor===99&&data.currency==='gbp'&&data.checkoutRevision==='no-vat-99p-1'")){uiReady=true;break;}
 }catch{}
 await new Promise(r=>setTimeout(r,5000));
}
assert.ok(uiReady,'Updated no-VAT payment interface has not deployed yet.');
const browser=await webkit.launch({headless:true});
let saved;
const page=await browser.newPage({...devices['iPhone SE'],viewport:{width:320,height:568}});
try{
 await page.goto(origin+'/legacy-create?variant=ticket&mobile-payment='+Date.now());
 await page.locator('#postTemplate:enabled').waitFor({timeout:30000});
 for(const [key,value] of Object.entries({eventName:'Synthetic mobile payment QA',recipient:'Payment QA',sender:'Reveal QA'})){
  const field=page.locator('#scratchActualRevealed [data-edit-field="'+key+'"]');await field.focus();await field.fill(value);
 }
 const created=page.waitForResponse(r=>r.url()===origin+'/api/reveals'&&r.request().method()==='POST');
 await page.locator('#reviewButton').click();const response=await created;assert.ok(response.ok(),await response.text());saved=await response.json();
 await page.waitForURL('**/reveal?id='+saved.id);await page.locator('#confirmButton:visible').click();
 // Confirm the same live payment-status contract used by the purchaser UI.
 const state=await page.request.get(origin+'/api/scratch/test-payment-status');
 assert.equal((await state.json()).automaticTax,false);
 await page.locator('#payButton:visible').waitFor({timeout:30000});
 const checkout=page.waitForResponse(r=>r.url()===origin+'/api/reveals/'+saved.id+'/checkout'&&r.request().method()==='POST');
 await page.locator('#payButton').click();
 const result=await checkout;assert.ok(result.ok(),await result.text());
 const data=await result.json();assert.match(data.checkoutUrl,/^https:\/\/checkout\.stripe\.com\/.*cs_test_/);
 await page.waitForURL(u=>u.hostname==='checkout.stripe.com',{timeout:30000,waitUntil:'commit'});
 console.log('PASS: real mobile WebKit creator, confirmation, payment button and hosted Stripe TEST navigation.');
}finally{
 if(saved?.editToken){
  const r=await page.request.post(origin+'/api/reveals/'+saved.id+'/amend',{headers:{'X-Edit-Token':saved.editToken,origin}});
  assert.ok(r.ok(),'Could not expire unused test checkout');
 }
 await browser.close();
}
