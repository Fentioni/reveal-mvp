import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import staging from '../src/quest-staging.js';

const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const productionId='94356ca3-17f9-4b9a-9f5c-f103c13b9173';
const stage4bId='fbc9687a-642b-42e6-ba8d-56430867e857';
const safeEnv={
 STAGING_DISABLE_CHECKOUT:'true',
 STRIPE_LIVE_MODE:'false',
 DB:{
   databaseId:stage4bId,
   prepare(sql){
     assert.match(sql,/sqlite_master/);
     return {async all(){return {results:[{name:'reveals'},{name:'payments'},{name:'quest_configs'},{name:'quest_sessions'}]};}};
   }
 }
};

test('Quest GitHub staging branch cannot target the production Worker, D1 or R2',()=>{
 assert.equal(config.name,'reveal-quest-staging');
 assert.equal(config.main,'./src/quest-staging.js');
 assert.equal(config.d1_databases[0].database_name,'revealstage4b');
 assert.equal(config.d1_databases[0].database_id,stage4bId);
 assert.notEqual(config.d1_databases[0].database_id,productionId);
 assert.equal(config.r2_buckets[0].bucket_name,'reveal-images-stage4b');
 assert.notEqual(config.r2_buckets[0].bucket_name,'reveal-images');
 assert.equal(config.vars.STAGING_DISABLE_CHECKOUT,'true');
 assert.equal(config.vars.STRIPE_LIVE_MODE,'false');
 assert.equal(config.vars.STRIPE_PRICE_ID,undefined);
});

test('Stripe checkout and webhook endpoints remain blocked on Quest staging',async()=>{
 for(const path of ['/api/webhooks/stripe','/api/reveals/abc123/checkout']){
   const response=await staging.fetch(new Request('https://staging.invalid'+path,{method:'POST'}),safeEnv,{});
   assert.equal(response.status,403);
   assert.match((await response.json()).error,/disabled/i);
 }
});

test('Missing staging safety flag prevents API operation',async()=>{
 const response=await staging.fetch(
  new Request('https://staging.invalid/api/webhooks/stripe',{method:'POST'}),
  {...safeEnv,STAGING_DISABLE_CHECKOUT:'false'},
  {}
 );
 assert.equal(response.status,503);
});

test('Staging health exposes only readiness flags, never records',async()=>{
 const response=await staging.fetch(
  new Request('https://staging.invalid/api/quest/staging-health'),
  safeEnv,{}
 );
 const out=await response.json();
 assert.equal(response.status,200);
 assert.deepEqual(out,{environment:'staging',checkoutEnabled:false,legacySchemaReady:true,questSchemaReady:true});
});
