// Prepare an isolated Cloudflare Worker configuration for an explicitly provisioned
// staging account. This script does NOT create resources, copy production data,
// deploy anything, or load Stripe credentials.
import {readFile,writeFile} from 'node:fs/promises';

const source=JSON.parse(await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const required=(name,pattern)=>{
 const value=String(process.env[name]||'').trim();
 if(!pattern.test(value))throw new Error('Missing or invalid GitHub staging variable: '+name);
 return value;
};
const id=required('REVEAL_STAGING_D1_ID',/^[a-f0-9-]{36}$/i);
const dbname=required('REVEAL_STAGING_D1_NAME',/^[A-Za-z0-9_-]{3,100}$/);
const r2=required('REVEAL_STAGING_R2_BUCKET',/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/);
const price=required('REVEAL_STAGING_STRIPE_PRICE_ID',/^price_[A-Za-z0-9]+$/);

if(id===source.d1_databases?.[0]?.database_id)throw new Error('Refusing to bind the production D1 database.');
if(dbname===source.d1_databases?.[0]?.database_name)throw new Error('Refusing to use the production D1 database name.');
if(r2===source.r2_buckets?.[0]?.bucket_name)throw new Error('Refusing to bind the production R2 bucket.');
if(source.name==='reveal-quest-staging')throw new Error('Production and staging Worker names must differ.');

const staging={
 name:'reveal-quest-staging',
 main:'./src/quest-router.js',
 compatibility_date:source.compatibility_date,
 assets:{directory:'./',binding:'ASSETS',run_worker_first:true},
 vars:{STRIPE_PRICE_ID:price,STRIPE_LIVE_MODE:'false'},
 d1_databases:[{binding:'DB',database_name:dbname,database_id:id}],
 r2_buckets:[{binding:'IMAGES',bucket_name:r2}]
};
await writeFile(new URL('../wrangler.staging.generated.jsonc',import.meta.url),JSON.stringify(staging,null,2)+'\n');
console.log('Isolated staging configuration generated. No production database, bucket or live Stripe mode.');
