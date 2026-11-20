// Real Stripe TEST session creation, no card submission or real charge.
import assert from 'node:assert/strict';
const origin='https://reveal-stage4b-test.michael-fenton9.workers.dev';
const get=(path,init={})=>fetch(origin+path,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000),...init});
let ready;
for(let i=0;i<30;i++){
 try{const r=await get('/api/scratch/test-payment-status');if(r.ok){const d=await r.json();if(d.environment==='staging'&&d.mode==='test'&&d.enabled===true&&d.automaticTax===true&&d.baseAmountMinor===199&&d.currency==='gbp'){ready=d;break;}}}catch{}
 await new Promise(r=>setTimeout(r,5000));
}
assert.ok(ready,'Isolated Scratch test payment capability is unavailable; verify staging secrets and deployment.');
const body=new FormData();
body.set('recipient','Payment QA');body.set('sender','Reveal QA');body.set('eventName','Synthetic Stripe TEST ticket');
const created=await get('/api/reveals',{method:'POST',body});assert.equal(created.status,201,await created.clone().text());
const {id,editToken}=await created.json();assert.ok(id&&editToken);
const headers={'X-Edit-Token':editToken,origin};
const form=new FormData();
for(const [k,v] of Object.entries({variant:'ticket',style:'classic',foil:'gold',artworkId:'luxury-coral-ribbon-primary',postScratch:JSON.stringify({templateId:'bg-luxury-coral-ribbon'}),audioEnabled:'false'}))form.set(k,v);
const saved=await get('/api/reveals/'+id+'/scratch-surface',{method:'PUT',headers,body:form});
assert.ok(saved.ok,await saved.clone().text());
const owner=async()=>{const r=await get('/api/reveals/'+id,{headers});assert.ok(r.ok);return(await r.json()).reveal};
assert.equal((await owner()).shareUrl,undefined);
const confirm=await get('/api/reveals/'+id+'/confirm',{method:'POST',headers});assert.ok(confirm.ok,await confirm.clone().text());
assert.equal((await owner()).status,'confirmed');
const notOwner=await get('/api/reveals/'+id+'/checkout',{method:'POST',headers:{origin}});assert.equal(notOwner.status,403);
const checkout=await get('/api/reveals/'+id+'/checkout',{method:'POST',headers});
assert.ok(checkout.ok,await checkout.clone().text());
const result=await checkout.json();const url=new URL(result.checkoutUrl);
assert.equal(url.protocol,'https:');assert.equal(url.hostname,'checkout.stripe.com');assert.match(url.pathname,/cs_test_/);
const current=await owner();assert.equal(current.status,'checkout');assert.equal(current.shareUrl,undefined);
console.log('PASS: genuine Stripe-hosted TEST session created; unsigned owner request rejected; unpaid recipient link absent.');
const amend=await get('/api/reveals/'+id+'/amend',{method:'POST',headers});
assert.ok(amend.ok,await amend.clone().text());
assert.equal((await owner()).status,'draft');assert.equal((await owner()).shareUrl,undefined);
console.log('PASS: unused TEST checkout expired through Amend; draft remained locked. No payment submitted.');
