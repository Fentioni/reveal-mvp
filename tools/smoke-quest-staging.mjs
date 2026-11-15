// Public, read-only smoke test of the already connected Stage 4B Cloudflare
// Worker. No secrets, payment calls, customer data or database mutations.
const origin='https://reveal-stage4b-test.michael-fenton9.workers.dev';
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
let state=null;
for(let attempt=0;attempt<8;attempt++){
 try{
  const res=await fetch(origin+'/api/quest/staging-health',{headers:{'accept':'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
  let data;try{data=await res.json();}catch{}
  if(res.status===200 && data?.environment==='staging'&&data?.checkoutEnabled===false){
   state=data;break;
  }
  console.log('Stage '+(attempt+1)+': expected staging Quest health not yet ready (HTTP '+res.status+').');
 }catch(e){console.log('Stage '+(attempt+1)+': staging request unavailable: '+e.message);}
 await sleep(7000);
}
if(!state){console.error('STAGING_QUEST_UNAVAILABLE: Cloudflare Worker has not served the new Quest API yet.');process.exit(1);}
console.log('Quest staging health:',JSON.stringify({
 environment:state.environment,checkoutEnabled:state.checkoutEnabled,
 legacySchemaReady:state.legacySchemaReady,questSchemaReady:state.questSchemaReady
}));
if(!state.legacySchemaReady)console.log('Legacy Reveal tables need staging-only initialisation before creator saves.');
if(!state.questSchemaReady)console.log('Quest tables will be created on first validated staging creator save.');
const creator=await fetch(origin+'/quest',{signal:AbortSignal.timeout(10000)});
if(!creator.ok){console.error('Quest creator route missing: HTTP '+creator.status);process.exit(1);}
const html=await creator.text();
if(!html.includes('Reveal Quest')&&!html.includes('REVEAL QUEST')){console.error('Quest creator content could not be verified.');process.exit(1);}
console.log('Quest creator route: HTTP '+creator.status+' — published to existing staging Worker.');
let payment=null;
for(let attempt=0;attempt<12;attempt++){
  try{
    const res=await fetch(origin+'/api/quest/test-payment-status',{
      headers:{accept:'application/json'},signal:AbortSignal.timeout(10000),cache:'no-store'
    });
    const data=res.ok?await res.json():null;
    if(data?.environment==='staging' && data.mode==='test' && data.enabled===false &&
      data.automaticTax===true && data.baseAmountMinor===199 && data.currency==='gbp'){
      payment=data;break;
    }
    console.log('Quest checkout readiness '+(attempt+1)+'/12: '+JSON.stringify({
      http:res.status,staging:data?.environment==='staging',enabled:data?.enabled??null
    }));
  }catch(err){console.log('Quest readiness request '+(attempt+1)+'/12 failed: '+err.message);}
  await sleep(7000);
}
if(!payment)throw Error('Quest TEST checkout did not become ready. Verify staging deployment, both encrypted secrets and correct test-mode keys.');
console.log('Quest Stripe TEST integration is present, tax-aware and DISABLED until both secrets are available.');
const blocked=await fetch(origin+'/api/reveals/not-a-quest/checkout',{method:'POST',signal:AbortSignal.timeout(10000)});
if(blocked.status!==503)throw Error('Staging checkout safety gate was not enforced.');
console.log('Unrelated staging products cannot start checkout.');

