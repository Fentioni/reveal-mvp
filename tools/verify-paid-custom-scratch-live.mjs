/**
 * STAGING ONLY: real customer journey, Stripe TEST CARD, signed Stripe webhook,
 * private paid recipient, customer-uploaded cover, QR, PNG and PDF.
 * Synthetic recipient/details; neither production nor live keys are touched.
 */
import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
const origin='https://reveal-stage4b-test.michael-fenton9.workers.dev';
if(process.env.REVEAL_PAID_TEST!=='STAGING_TEST_ONLY')throw Error('Explicit staging-only opt-in required.');
let cfg=null;
for(let i=0;i<40;i++){
 try {
  const res=await fetch(origin+'/api/scratch/test-payment-status',{cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(res.ok){const data=await res.json();if(data.fixedGbp===true){cfg=data;break;}}
 }catch{}
 await new Promise(done=>setTimeout(done,5000));
}
assert.ok(cfg,'The fixed GBP staging Worker is not deployed yet.');
assert.equal(cfg.environment,'staging');assert.equal(cfg.mode,'test');assert.equal(cfg.enabled,true);
assert.equal(cfg.baseAmountMinor,99);assert.equal(cfg.currency,'gbp');assert.equal(cfg.automaticTax,false);
assert.equal(cfg.fixedGbp,true);assert.equal(cfg.checkoutRevision,'no-vat-99p-1');
await mkdir('test-output/paid-custom-scratch',{recursive:true});
const browser=await chromium.launch({headless:true});
const purchaser=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true,reducedMotion:'reduce'});
const owner=await purchaser.newPage();
const steps=[];
let saved,submittedPayment=false,checkoutUrl='',recipientUrl='';
const pass=message=>{steps.push(message);console.log('PASS: '+message);};
const issues=[];owner.on('pageerror',e=>issues.push(e.message));
async function assertResponse(promise,label){
 const r=await promise;if(!r.ok())throw Error(label+': '+r.status()+' '+(await r.text()).slice(0,360));
 return r.json();
}
async function collectInputs(page){
 const all=[];
 for(const f of page.frames()){
  const v=await f.locator('input,button[type=submit]').evaluateAll(nodes=>nodes.map(n=>({
   tag:n.tagName,type:n.type,name:n.name,id:n.id,autocomplete:n.autocomplete,
   placeholder:n.placeholder,aria:n.getAttribute('aria-label'),text:n.tagName==='BUTTON'?n.textContent?.trim().slice(0,100):''
  }))).catch(()=>[]);
  all.push({frame:f.url().slice(0,140),fields:v});
 }
 return all;
}
async function findInput(page,selectors,timeout=24000){
 const start=Date.now();
 while(Date.now()-start<timeout){
  for(const f of page.frames()){
   const locator=f.locator(selectors).first();
   if(await locator.count().catch(()=>0) && await locator.isVisible().catch(()=>false))return locator;
  }
  await page.waitForTimeout(350);
 }
 throw Error('Hosted Stripe field unavailable ('+selectors+'): '+JSON.stringify(await collectInputs(page)).slice(0,3500));
}
async function optionalFill(page,selectors,value){
 try{const input=await findInput(page,selectors,1800);await input.fill(value);return true;}catch{return false;}
}
try{
 const response=await owner.goto(origin+'/legacy-create?variant=ticket&paid-custom-e2e='+Date.now(),{waitUntil:'domcontentloaded'});
 assert.ok(response.ok());assert.match(await response.text(),/data-custom-scratch="2"/);
 await owner.locator('#reviewButton:enabled').waitFor({timeout:25000});
 assert.equal(await owner.locator('#scratchCoverSource').count(),0);
 assert.equal(await owner.locator('#postTemplate > option:last-child').textContent(),'Upload my own scratch artwork');
 await owner.locator('#postTemplate').selectOption('upload-my-own-scratch-artwork');
 assert.equal(await owner.locator('#scratchCoverUploadField').isVisible(),true);
 const image=await owner.evaluate(()=>{
  const c=document.createElement('canvas');c.width=900;c.height=1200;
  const x=c.getContext('2d');x.fillStyle='#174177';x.fillRect(0,0,900,1200);
  x.fillStyle='#e5b95f';for(let i=0;i<22;i++)x.fillRect(0,i*70,900,12);
  x.fillStyle='white';x.font='bold 78px Arial';x.fillText('TEST REVEAL',112,590);
  return c.toDataURL('image/png').split(',')[1];
 });
 const uploaded=Buffer.from(image,'base64');
 await owner.locator('#scratchCoverImage').setInputFiles({name:'staging-qa-cover.png',mimeType:'image/png',buffer:uploaded});
 await owner.locator('#scratchCoverFileName').getByText('staging-qa-cover.png').waitFor();
 for(const [key,val] of [['scratchCoverZoom','150'],['scratchCoverPanX','-30'],['scratchCoverPanY','20']]){
  await owner.locator('#'+key).fill(val);
 }
 await owner.locator('[data-scratch-preview-mode="covered"]').click();
 await owner.locator('#scratchActualCovered #foilCanvas').waitFor({state:'attached'});
 await owner.screenshot({path:'test-output/paid-custom-scratch/creator-cover.png',fullPage:true});
 await owner.locator('[data-scratch-preview-mode="revealed"]').click();
 for(const [key,val] of Object.entries({eventName:'Your special Sapphire Wrap surprise',recipient:'Chloe',sender:'Reveal QA',
   eventDate:'2027-04-10',eventTime:'19:30',venue:'A very special place',
   personalMessage:'This is a synthetic paid staging checkout test.'})){
  const f=owner.locator('#scratchActualRevealed [data-edit-field="'+key+'"]');
  await f.focus();await f.fill(val);
 }
 const createdP=owner.waitForResponse(x=>x.url()===origin+'/api/reveals'&&x.request().method()==='POST',{timeout:20000});
 await owner.locator('#reviewButton').click();
 const created=await assertResponse(createdP,'Save custom draft');saved=created;
 assert.ok(saved.id&&saved.editToken);
 await owner.waitForURL('**/reveal?id='+saved.id,{timeout:20000});
 await owner.locator('#scratchActualReview:visible').waitFor({timeout:20000});
 const headers={'X-Edit-Token':saved.editToken,origin};
 const ownerData=async()=>{
  const rr=await purchaser.request.get(origin+'/api/reveals/'+saved.id,{headers});
  assert.equal(rr.status(),200);return(await rr.json()).reveal;
 };
 const draft=await ownerData();assert.equal(draft.status,'draft');assert.equal(draft.shareUrl,undefined);
 const config=await purchaser.request.get(origin+'/api/reveals/'+saved.id+'/scratch-surface',{headers});
 assert.ok(config.ok());const surface=(await config.json()).surface;
 assert.equal(surface.style,'custom');assert.equal(surface.postScratch.templateId,'bg-wrap-sapphire');
 assert.deepEqual(surface.coverCrop,{zoom:150,panX:-30,panY:20});
 const privateCover=await purchaser.request.get(origin+'/api/reveals/'+saved.id+'/scratch-surface/image',{headers});
 assert.ok(privateCover.ok());assert.deepEqual(await privateCover.body(),uploaded);
 assert.notEqual((await purchaser.request.get(origin+'/api/reveals/'+saved.id+'/scratch-surface/image')).status(),200);
 pass('Custom cover saved privately; Sapphire Wrap and exact crop retained; no unpaid share link');
 await owner.screenshot({path:'test-output/paid-custom-scratch/private-review.png',fullPage:true});
 await owner.locator('#confirmButton:visible').click();
 await owner.locator('#payButton:visible').waitFor({timeout:25000});
 const confirmed=await ownerData();assert.equal(confirmed.status,'confirmed');assert.equal(confirmed.shareUrl,undefined);
 let checkout;
 for(let attempt=0;attempt<16;attempt++){
  const wait=owner.waitForResponse(x=>x.url()===origin+'/api/reveals/'+saved.id+'/checkout'&&x.request().method()==='POST',{timeout:25000});
  await owner.locator('#payButton:visible').click();
  const result=await wait;
  if(result.ok()){checkout={accepted:true};break;}
  const body=(await result.json()).error;
  if(result.status()===403&&/only enabled|test checkout/i.test(String(body))){
   console.log('INFO: staging Worker checkout gate still deploying; retrying');await owner.waitForTimeout(4500);continue;
  }
  throw Error('Staging checkout denied '+result.status()+': '+body);
 }
 assert.ok(checkout?.accepted,'Updated custom-artwork payment gate did not deploy.');
 // Hosted navigation may discard the response body before Playwright reads it.
 await owner.waitForURL(u=>u.hostname==='checkout.stripe.com',{timeout:30000,waitUntil:'domcontentloaded'});
 checkoutUrl=owner.url();
 const stripe=new URL(checkoutUrl);
 assert.equal(stripe.hostname,'checkout.stripe.com');assert.match(stripe.pathname,/cs_test_/);
 assert.equal((await ownerData()).shareUrl,undefined,'Payment must not unlock before a signed webhook');
 pass('Owner clicked checkout; hosted Stripe TEST session opened; paid link still locked');
 await owner.screenshot({path:'test-output/paid-custom-scratch/stripe-before-payment.png',fullPage:true});
 // The fixed GBP 99p Checkout disables Stripe's auto-conversion. Select
 // the customer-facing Card method; Stripe renders the card form only
 // after it is expanded inside the secure payment iframe.
 const email='qa-custom-scratch-'+Date.now()+'@example.com';
 await (await findInput(owner,'input[type="email"],input[name="email"],input[autocomplete="email"]')).fill(email);
 const paymentFrame=owner.frames().find(f=>f.url().includes('elements-inner-habanero'));
 assert.ok(paymentFrame,'Stripe hosted payment methods did not load.');
 await paymentFrame.getByText('Card',{exact:true}).first().click({timeout:15000});
 await findInput(owner,'input[autocomplete="cc-number"],input[aria-label*="Card number" i]');
 await optionalFill(owner,'input[name="billingName"],input[autocomplete="cc-name"],input[placeholder*="cardholder" i]','Reveal QA');
 const card=await findInput(owner,'input[name="cardNumber"],input[autocomplete="cc-number"],input[placeholder*="1234"],input[aria-label*="Card number" i]',25000);
 await card.fill('4242424242424242');
 const exp=await findInput(owner,'input[name="cardExpiry"],input[autocomplete="cc-exp"],input[placeholder*="MM"],input[aria-label*="Expiration" i]');
 await exp.fill('12 / 34');
 const cvc=await findInput(owner,'input[name="cardCvc"],input[autocomplete="cc-csc"],input[placeholder*="CVC"],input[aria-label*="Security code" i]');
 await cvc.fill('123');
 // This CI browser is geolocated in the USA; use a syntactically valid
 // ZIP for its displayed US billing-address field. The charge remains GBP.
 await optionalFill(owner,'input[name="billingPostalCode"],input[autocomplete*="postal-code"],input[placeholder*="ZIP" i],input[placeholder*="Postcode" i]','10001');
 // Stripe prechecks Link's optional "Save my information" checkbox. Without a
 // mobile number that opt-in can stop the submit before any PaymentIntent.
 // This is a one-off QA purchase, so decline the optional account creation.
 const saveDetails=await findInput(owner,'input[name="linkOptIn"]',5000);
 if(await saveDetails.isChecked())await saveDetails.uncheck({timeout:8000});
 assert.equal(await saveDetails.isChecked(),false);
 await owner.screenshot({path:'test-output/paid-custom-scratch/stripe-filled-test-card.png',fullPage:true});
 // Only Stripe test checkout, validated above; no real money/card details.
 const submit=await findInput(owner,'button[type="submit"]',25000);
 assert.ok(!(await submit.isDisabled()),'Stripe payment button disabled: '+JSON.stringify(await collectInputs(owner)).slice(0,3200));
 submittedPayment=true;
 await submit.click();
 await owner.waitForURL(u=>u.hostname==='reveal-stage4b-test.michael-fenton9.workers.dev'&&u.pathname.includes('reveal'),{timeout:80000,waitUntil:'domcontentloaded'});
 pass('Stripe TEST card 4242 completed hosted checkout, returned to staging');
 await owner.locator('#paidStage:visible').waitFor({timeout:65000});
 const paid=await ownerData();assert.equal(paid.status,'paid');
 recipientUrl=new URL(paid.shareUrl,origin).toString();
 assert.match(recipientUrl,/^https:\/\/reveal-stage4b-test\.michael-fenton9\.workers\.dev\/r\/[A-Za-z0-9_-]{32,64}$/);
 assert.equal(await owner.locator('#shareInput').inputValue(),recipientUrl);
 assert.equal(await owner.locator('#openRevealButton').getAttribute('href'),recipientUrl);
 for(const id of ['whatsAppShare','smsShare','emailShare']){
  assert.ok(decodeURIComponent(await owner.locator('#'+id).getAttribute('href')).includes(recipientUrl),id+' must include the same paid link');
 }
 await owner.locator('#qrShare').click();await owner.locator('#qrCodeArea svg').waitFor();
 const [qr]=await Promise.all([owner.waitForEvent('download'),owner.locator('#qrDownload').click()]);
 const qrBytes=await readFile(await qr.path());assert.equal(qrBytes.subarray(1,4).toString(),'PNG');
 await qr.saveAs('test-output/paid-custom-scratch/recipient-qr.png');
 pass('Signed webhook marked reveal paid; clean link and QR/WhatsApp/SMS/email sharing verified');
 const recipientBrowser=await webkit.launch({headless:true});
 try{
  const recipientCtx=await recipientBrowser.newContext({...devices['iPhone 13'],acceptDownloads:true,reducedMotion:'reduce'});
  const rec=await recipientCtx.newPage();const errs=[];rec.on('pageerror',e=>errs.push(e.message));
  await rec.goto(recipientUrl,{waitUntil:'domcontentloaded'});
  await rec.locator('#card.foil-ready').waitFor({timeout:35000});
  const slug=new URL(recipientUrl).pathname.split('/')[2];
  const snap=await recipientCtx.request.get(origin+'/r/'+slug+'/scratch-data');
  assert.ok(snap.ok());const data=await snap.json();
  assert.equal(data.scratchSurface.style,'custom');
  assert.equal(data.scratchSurface.postScratch.templateId,'bg-wrap-sapphire');
  assert.deepEqual(data.scratchSurface.coverCrop,{zoom:150,panX:-30,panY:20});
  const served=await recipientCtx.request.get(origin+'/r/'+slug+'/scratch-cover');
  assert.ok(served.ok());assert.deepEqual(await served.body(),uploaded);
  assert.equal(await rec.locator('#keepsake').isVisible(),false);
  assert.equal(await rec.locator('#progress').evaluate(el=>el.value),0);
  await rec.screenshot({path:'test-output/paid-custom-scratch/mobile-recipient-covered.png',fullPage:true});
  const canvas=rec.locator('#foilCanvas');await canvas.scrollIntoViewIfNeeded();
  const b=await canvas.boundingBox();
  await rec.touchscreen.tap(b.x+b.width*.35,b.y+b.height*.4);
  assert.ok(await rec.locator('#progress').evaluate(el=>el.value)>0,'Native mobile touch must scratch the uploaded cover');
  for(let y=2,step=0;y<b.height;y+=18,step++){
   await rec.mouse.move(b.x+(step%2?b.width-2:2),b.y+y);
   await rec.mouse.down();
   await rec.mouse.move(b.x+(step%2?2:b.width-2),b.y+y,{steps:8});
   await rec.mouse.up();
  }
  await rec.locator('#keepsakePng:visible').waitFor({timeout:35000});
  assert.equal(await rec.locator('#progress').evaluate(e=>e.value),100);
  assert.equal(await rec.locator('#underlay svg[data-post-template="bg-wrap-sapphire"]').count(),1);
  await rec.screenshot({path:'test-output/paid-custom-scratch/mobile-recipient-revealed.png',fullPage:true});
  const [png]=await Promise.all([rec.waitForEvent('download'),rec.locator('#keepsakePng').click()]);
  const pngBytes=await readFile(await png.path());assert.equal(pngBytes.subarray(1,4).toString(),'PNG');
  assert.equal(pngBytes.readUInt32BE(16),1800);assert.equal(pngBytes.readUInt32BE(20),2400);
  assert.ok(pngBytes.length>50000);await png.saveAs('test-output/paid-custom-scratch/paid-keepsake.png');
  const [pdf]=await Promise.all([rec.waitForEvent('download'),rec.locator('#keepsakePdf').click()]);
  const pdfBytes=await readFile(await pdf.path());const pdfText=pdfBytes.toString('latin1');
  assert.ok(pdfText.startsWith('%PDF-1.4'));assert.match(pdfText,/\/MediaBox \[0 0 432 576\]/);
  assert.match(pdfText,/\/Width 1800 \/Height 2400/);await pdf.saveAs('test-output/paid-custom-scratch/paid-keepsake.pdf');
  assert.deepEqual(errs,[]);
  pass('Separate iPhone WebKit recipient scratched the paid custom image and downloaded real 1800×2400 PNG + 300dpi PDF');
  await rec.locator('#replayButton').click();assert.equal(await rec.locator('#keepsake').isVisible(),false);
  await rec.reload();await rec.locator('#card.foil-ready').waitFor();assert.equal(await rec.locator('#progress').evaluate(e=>e.value),0);
  pass('Paid link revisits safely; replay starts covered and downloadable files are gated again');
 }finally{await recipientBrowser.close();}
 assert.deepEqual(issues,[]);
} catch(err) {
 console.error('CUSTOM PAID E2E FAILED: '+String(err?.stack||err));
 console.error('E2E PHASES: '+steps.join(' | '));
 if(checkoutUrl)console.error('INFO: Stripe TEST checkout was created');
 try{console.error('DIAGNOSTIC FIELDS: '+JSON.stringify(await collectInputs(owner)).slice(0,4200));}catch{}
 try{await owner.screenshot({path:'test-output/paid-custom-scratch/failure.png',fullPage:true,timeout:12000});}catch{}
 if(saved && !submittedPayment){
  // If a test session was created but no card was submitted, ensure it is
  // expired. Never amend a potentially processing or already paid checkout.
  try{
   const status=await purchaser.request.get(origin+'/api/reveals/'+saved.id,{headers:{'X-Edit-Token':saved.editToken,origin}});
   const state=(await status.json()).reveal?.status;
   if(state==='checkout'||state==='confirmed'){
    await purchaser.request.post(origin+'/api/reveals/'+saved.id+'/amend',{headers:{'X-Edit-Token':saved.editToken,origin}});
   }
  }catch{}
 }
 throw err;
}finally{await browser.close();}
