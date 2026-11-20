import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {questStripeTestReady,scratchStripeTestReady,questStripeTestResponse} from '../src/quest-stripe-test.js';
import worker from '../src/index.js';

const origin='https://reveal-stage4b-test.example';
const envBase={
 STAGING_DISABLE_CHECKOUT:'true',
 STRIPE_LIVE_MODE:'false',
 QUEST_TEST_CHECKOUT_ENABLED:'true',
 STRIPE_SECRET_KEY:'sk_test_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
 STRIPE_WEBHOOK_SECRET:'whsec_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
 STRIPE_PRICE_ID:'price_123456789TEST',
 DB:{
  databaseId:'fbc9687a-642b-42e6-ba8d-56430867e857',
  prepare(sql){
   assert.match(sql,/quest_configs/);
   return{bind(id){return this;},async first(){return{reveal_id:'quest-record'};}};
  }
 },
 IMAGES:{bucketName:'reveal-images-stage4b'}
};
const req=(route,method='GET',headers={})=>new Request(origin+route,{method,headers});
const legacy={
 calls:[],
 async fetch(request,env){this.calls.push({url:request.url,method:request.method,autoTax:env.STRIPE_AUTOMATIC_TAX});
 return new Response(JSON.stringify({success:true,handledBy:'legacy'}),{headers:{'content-type':'application/json'}});}
};
test('Quest staging test checkout is explicitly enabled in repository only for authorised test mode',()=>{
 const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.equal(config.name,'reveal-stage4b-test');
 assert.equal(config.vars.STRIPE_LIVE_MODE,'false');
 assert.equal(config.vars.STAGING_DISABLE_CHECKOUT,'true');
 assert.equal(config.vars.QUEST_TEST_CHECKOUT_ENABLED,'true');
 assert.equal(config.vars.STRIPE_PRICE_ID,'price_1USbNbKEVPKWz2E9zmH0mabR');
 assert.notEqual(config.d1_databases[0].database_name,'reveal-db');
 assert.equal(questStripeTestReady({...envBase,QUEST_TEST_CHECKOUT_ENABLED:'false'}),false);
 assert.equal(questStripeTestReady({...envBase,QUEST_TEST_CHECKOUT_ENABLED:undefined}),false);
});
test('Never enable Stripe live keys, wrong account or absent test webhook secret',()=>{
 for(const overrides of [
  {STRIPE_LIVE_MODE:'true'},
  {STRIPE_SECRET_KEY:'sk_live_abc123'},
  {STRIPE_SECRET_KEY:'rk_live_abc123'},
  {STRIPE_WEBHOOK_SECRET:'whsec_invalid!!!'},
  {STRIPE_WEBHOOK_SECRET:undefined},
  {STRIPE_PRICE_ID:'price_missing#'},
  {STAGING_DISABLE_CHECKOUT:'false'},
  {DB:{databaseId:'94356ca3-17f9-4b9a-9f5c-f103c13b9173'}},
  {IMAGES:{bucketName:'reveal-images'}},
 ]){
  assert.equal(questStripeTestReady({...envBase,...overrides}),false,JSON.stringify(overrides));
 }
 assert.equal(questStripeTestReady(envBase),true);
 assert.equal(questStripeTestReady({...envBase,STRIPE_SECRET_KEY:'rk_test_RestrictedKeyFromPriorRevealSetup123'}),true);
});
test('Payment capability is published safely, without credentials or tax-inclusive price',async()=>{
 const off=await questStripeTestResponse(req('/api/quest/test-payment-status'),{
  ...envBase,QUEST_TEST_CHECKOUT_ENABLED:'false'
 },{},legacy);
 assert.equal(off.status,200);
 assert.deepEqual(await off.json(),{success:true,environment:'staging',mode:'test',enabled:false,automaticTax:true,baseAmountMinor:199,currency:'gbp',checkoutRevision:'stable-retry-1'});
 const on=await questStripeTestResponse(req('/api/quest/test-payment-status'),envBase,{},legacy);
 const onBody=await on.clone().text();
 assert.equal((await on.json()).enabled,true);
 assert.equal(on.headers.get('cache-control'),'no-store');
 assert.ok(!onBody.includes('sk_test_'));
});
test('All other product checkouts stay blocked even when Quest test mode is switched on',async()=>{
 const notQuest={
 ...envBase,
 DB:{...envBase.DB,prepare(){return{bind(){return this;},async first(){return null;}};}}
 };
 const response=await questStripeTestResponse(req('/api/reveals/not-quest/checkout','POST'),notQuest,{},legacy);
 assert.equal(response.status,403);
 assert.match((await response.json()).error,/only Reveal Quest/i);
});
test('Quest checkout requires valid origin and server-side record lookup',async()=>{
 const count=legacy.calls.length;
 const invalid=await questStripeTestResponse(req('/api/reveals/quest-record/checkout','POST',{origin:'https://attacker.invalid'}),envBase,{},legacy);
 assert.equal(invalid.status,403);
 assert.equal(legacy.calls.length,count);
 const valid=await questStripeTestResponse(req('/api/reveals/quest-record/checkout','POST',{
  'X-Edit-Token':'fake-owner-token',origin
 }),envBase,{},legacy);
 assert.equal(valid.status,200);
 assert.equal(legacy.calls.at(-1).autoTax,'true');
 assert.equal(legacy.calls.at(-1).method,'POST');
});
test('Webhooks fail closed when disabled and never forward to legacy with missing Stripe TEST keys',async()=>{
 const count=legacy.calls.length;
 const blocked=await questStripeTestResponse(req('/api/webhooks/stripe','POST'),{
  ...envBase,STRIPE_SECRET_KEY:undefined
 },{},legacy);
 assert.equal(blocked.status,503);
 assert.equal(legacy.calls.length,count);
 const allowed=await questStripeTestResponse(req('/api/webhooks/stripe','POST'),envBase,{},legacy);
 assert.equal(allowed.status,200);
 assert.equal(legacy.calls.at(-1).autoTax,'true');
 assert.equal(legacy.calls.at(-1).url,origin+'/api/webhooks/stripe');
});
test('Existing staging Worker blocks checkout without credentials and does not unlock other products',async()=>{
 const off={STAGING_DISABLE_CHECKOUT:'true',STRIPE_LIVE_MODE:'false',QUEST_TEST_CHECKOUT_ENABLED:'false'};
 const result=await worker.fetch(req('/api/reveals/quest-record/checkout','POST'),off,{});
 assert.equal(result.status,503);
 assert.match((await result.json()).error,/disabled/i);
 const webhook=await worker.fetch(req('/api/webhooks/stripe','POST'),off,{});
 assert.equal(webhook.status,503);
});
test('Checkout uses Stripe Automatic Tax and remains at £1.99 before location-specific tax',()=>{
 const legacyCode=readFileSync(new URL('../src/legacy.js',import.meta.url),'utf8');
 const review=readFileSync(new URL('../public/reveal.html',import.meta.url),'utf8');
 assert.ok(legacyCode.includes("form.set('automatic_tax[enabled]', 'true')"));
 assert.ok(legacyCode.includes("(env.STRIPE_AUTOMATIC_TAX !== 'true' || session.automatic_tax?.enabled === true)"));
 assert.ok(legacyCode.includes("form.set(\n    'billing_address_collection',\n    'required'\n  )"));
 assert.ok(review.includes("if(isStagingTest && isQuestReview && questTestPaymentReady)"));
 assert.ok(review.includes("isQuestReview && questTestPaymentReady"));
 assert.ok(review.includes('base price £1.99'));
 assert.ok(!review.includes('£2.39'));
});


test('Scratch test checkout is separate, requires test keys and permits only saved portrait Scratch Tickets',async()=>{
 const scratch={...envBase,QUEST_TEST_CHECKOUT_ENABLED:'false',SCRATCH_TEST_CHECKOUT_ENABLED:'true',
 DB:{...envBase.DB,prepare(sql){return{bind(...args){this.args=args;return this;},async first(){
 if(sql.includes('quest_configs'))return null;
 if(this.args[0]==='scratch-record')return{fields_json:JSON.stringify({scratchSurface:{variant:'ticket',style:'classic',artworkId:'luxury-coral-ribbon-primary'}})};
 if(this.args[0]==='concert-record')return{fields_json:JSON.stringify({scratchSurface:{variant:'concert',style:'concert'}})};
 return null;
 }}}}};
 assert.equal(scratchStripeTestReady(scratch),true);
 assert.equal(scratchStripeTestReady({...scratch,STRIPE_SECRET_KEY:'sk_live_bad'}),false);
 assert.equal(scratchStripeTestReady({...scratch,SCRATCH_TEST_CHECKOUT_ENABLED:'false'}),false);
 const status=await questStripeTestResponse(req('/api/scratch/test-payment-status'),scratch,{},legacy);
 assert.equal((await status.json()).enabled,true);
 const count=legacy.calls.length;
 for(const id of ['concert-record','quiz-record','missing-record']){
  assert.equal((await questStripeTestResponse(req('/api/reveals/'+id+'/checkout','POST'),scratch,{},legacy)).status,403);
 }
 assert.equal(legacy.calls.length,count);
 assert.equal((await questStripeTestResponse(req('/api/reveals/scratch-record/checkout','POST',{origin}),scratch,{},legacy)).status,200);
 assert.equal(legacy.calls.at(-1).autoTax,'true');
});
