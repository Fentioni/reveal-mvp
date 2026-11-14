import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const script=resolve(root,'scripts/build-quest-staging.mjs');
const output=resolve(root,'wrangler.staging.generated.jsonc');
const production=JSON.parse(readFileSync(resolve(root,'wrangler.jsonc'),'utf8'));
const fakeEnvironment={
 ...process.env,
 REVEAL_STAGING_D1_ID:'11111111-2222-3333-4444-555555555555',
 REVEAL_STAGING_D1_NAME:'reveal-quest-staging-db-test',
 REVEAL_STAGING_R2_BUCKET:'reveal-quest-staging-image-test',
 REVEAL_STAGING_STRIPE_PRICE_ID:'price_STAGINGTESTONLY'
};
function run(env){return spawnSync(process.execPath,[script],{cwd:root,env,encoding:'utf8'});}
test('staging config generator cannot reuse production D1, R2 or Worker name',()=>{
 try{
  let r=run(fakeEnvironment);
  assert.equal(r.status,0,r.stderr);
  const staging=JSON.parse(readFileSync(output,'utf8'));
  assert.equal(staging.name,'reveal-quest-staging');
  assert.equal(staging.vars.STRIPE_LIVE_MODE,'false');
  assert.notEqual(staging.d1_databases[0].database_id,production.d1_databases[0].database_id);
  assert.notEqual(staging.r2_buckets[0].bucket_name,production.r2_buckets[0].bucket_name);
  assert.equal(staging.d1_databases[0].database_name,'reveal-quest-staging-db-test');
  r=run({...fakeEnvironment,REVEAL_STAGING_D1_ID:production.d1_databases[0].database_id});
  assert.notEqual(r.status,0,'Production D1 ID must be rejected.');
  r=run({...fakeEnvironment,REVEAL_STAGING_R2_BUCKET:production.r2_buckets[0].bucket_name});
  assert.notEqual(r.status,0,'Production R2 name must be rejected.');
  r=run({...fakeEnvironment,REVEAL_STAGING_D1_NAME:production.d1_databases[0].database_name});
  assert.notEqual(r.status,0,'Production D1 name must be rejected.');
  r=run({...fakeEnvironment,REVEAL_STAGING_STRIPE_PRICE_ID:''});
  assert.notEqual(r.status,0,'Missing staging price is not allowed.');
 }finally{rmSync(output,{force:true});}
});
