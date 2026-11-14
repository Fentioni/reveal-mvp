// Temporary demo deployment helper. Captures Wrangler output so a private
// Cloudflare account-claim bearer URL is NEVER written to public CI logs.
// Only the public sample Worker URL is published.
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';

const result=spawnSync('npx',[
  '--yes','wrangler@4.102.0','deploy','--temporary',
  '--config','wrangler.preview.jsonc'
],{encoding:'utf8',timeout:230000,maxBuffer:2*1024*1024,env:{
  ...process.env,WRANGLER_SEND_METRICS:'false'
}});

const combined=String(result.stdout||'')+'\n'+String(result.stderr||'');
const candidates=[...combined.matchAll(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/gi)].map(x=>x[0]);
const urls=[...new Set(candidates.filter(x=>x.includes('reveal-quest-temporary-demo')))];
if(result.status!==0||!urls.length){
  // Do not print CLI output: Wrangler may include an account-claim token.
  console.error('Temporary preview unavailable. Wrangler exit status:',result.status,'; public URL count:',urls.length);
  process.exit(1);
}
writeFileSync('preview-url.txt',urls[0]+'/quest.html\n','utf8');
console.log('Sample-only Quest preview:',urls[0]+'/quest.html');
console.log('No purchaser records, payment processing, D1 or R2 resources in this preview.');
console.log('Cloudflare temporary previews expire after approximately 60 minutes unless claimed.');
