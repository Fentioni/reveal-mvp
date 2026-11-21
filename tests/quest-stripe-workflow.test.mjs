import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac} from 'node:crypto';
import worker from '../src/index.js';

const origin='https://reveal-stage4b-test.example';
const revealId='quest-stripe-e2e',slug='secret-quest-e2e';
const token='owner-test-edit-token',secret='whsec_FAKE123TestOnly',price='price_FAKE123TEST';
const hash=t=>createHash('sha256').update(t).digest('hex');

function setup(){
 const sql=new DatabaseSync(':memory:');
 const schema=[
  "CREATE TABLE reveals (id TEXT PRIMARY KEY, edit_token TEXT, public_slug TEXT UNIQUE, status TEXT, paid_at TEXT, revision INTEGER, recipient TEXT, sender TEXT, event_name TEXT, personal_message TEXT, event_date TEXT, event_time TEXT, venue TEXT, admit TEXT, ticket_url TEXT, image_key TEXT, confirmed_at TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE payments (id TEXT PRIMARY KEY, reveal_id TEXT, provider TEXT, amount_minor INTEGER, currency TEXT, status TEXT, checkout_session_id TEXT, checkout_url TEXT, expires_at TEXT, payment_intent_id TEXT, paid_at TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE stripe_events (id TEXT PRIMARY KEY, event_type TEXT, livemode INTEGER, received_at TEXT, processed_at TEXT)",
  "CREATE TABLE reveal_configurations (reveal_id TEXT PRIMARY KEY, product_id TEXT, fields_json TEXT)",
  "CREATE TABLE quest_configs (reveal_id TEXT PRIMARY KEY, config_json TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE quest_sessions (session_hash TEXT PRIMARY KEY, reveal_id TEXT, step INTEGER, attempts INTEGER, last_attempt_at TEXT, created_at TEXT, updated_at TEXT, completed_at TEXT)"
 ];
 sql.exec(schema.join(';\n')+';');
 const now=new Date().toISOString();
 sql.prepare("INSERT INTO reveals (id,edit_token,public_slug,status,revision,recipient,sender,event_name,personal_message,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
  .run(revealId,hash(token),slug,'confirmed',1,'Chloe','From Reveal','Surprise: a trip to Rome!','You solved it!',now,now);
 const clues=[
  {key:'letter',scene:'letter',kind:'choice',title:'Mysterious Letter',question:'What points north?',options:['A compass','An apple','A star'],answer:'A compass',hints:['Direction','A compass']},
  {key:'suitcase',scene:'suitcase',kind:'lock',title:'Locked Suitcase',question:'What code?',options:[],answer:'427',hints:['Luggage','427']},
  {key:'ticket',scene:'ticket',kind:'order',title:'Missing Itinerary',question:'Order fragments',options:['Gold seal','Route line','Flight symbol'],answer:'Route line|Flight symbol|Gold seal',hints:['Route','Then flight']}
 ];
 sql.prepare('INSERT INTO quest_configs (reveal_id,config_json,created_at,updated_at) VALUES (?,?,?,?)')
  .run(revealId,JSON.stringify({preset:'quick',mode:'ready',clues}),now,now);
 const DB={
  databaseId:'fbc9687a-642b-42e6-ba8d-56430867e857',
  prepare(text){
   const statement=sql.prepare(text);
   return {args:[],
    bind(...args){this.args=args;return this},
    async first(){return statement.get(...this.args)||null},
    async run(){const v=statement.run(...this.args);return {meta:{changes:Number(v.changes)}}},
    async all(){return {results:statement.all(...this.args)}}
   };
  },
  async batch(items){const result=[];for(const item of items)result.push(await item.run());return result;}
 };
 return {
  DB,sql,env:{
   DB,IMAGES:{bucketName:'reveal-images-stage4b'},ASSETS:{async fetch(){return new Response('sample')}},
   STRIPE_LIVE_MODE:'false',STAGING_DISABLE_CHECKOUT:'true',QUEST_TEST_CHECKOUT_ENABLED:'true',
   STRIPE_SECRET_KEY:'sk_test_FAKEKEY123',STRIPE_WEBHOOK_SECRET:secret,STRIPE_PRICE_ID:price
  }
 };
}
const makeReq=(path,options={})=>new Request(origin+path,options);
const event=(session,overrides={})=>JSON.stringify({
 id:'evt_FAKE_'+(++event.counter),type:'checkout.session.completed',livemode:false,
 data:{object:{...session,...overrides,object:'checkout.session',mode:'payment',payment_status:'paid',
   amount_subtotal:overrides.amount_subtotal??99,amount_total:overrides.amount_total??99,currency:'gbp',
   payment_intent:'pi_FAKE123'}}
});
event.counter=0;
function signed(body,signingSecret=secret){
 const timestamp=Math.floor(Date.now()/1000);
 const signature=createHmac('sha256',signingSecret).update(timestamp+'.'+body).digest('hex');
 return makeReq('/api/webhooks/stripe',{method:'POST',headers:{'Stripe-Signature':'t='+timestamp+',v1='+signature},body});
}
test('99p Stripe test checkout with no VAT only unlocks after correctly signed webhook',async()=>{
 const {sql,env}=setup();
 const originalFetch=globalThis.fetch;
 let session=null,form=null;
 globalThis.fetch=async(uri,options={})=>{
  assert.equal(String(uri),'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(options.headers.get('Authorization'),'Bearer '+env.STRIPE_SECRET_KEY);
  assert.equal(options.headers.get('Stripe-Version'),'2025-03-31.basil');
  form=new URLSearchParams(options.body);
  assert.equal(form.get('automatic_tax[enabled]'),'false');
  assert.equal(form.get('managed_payments[enabled]'),'false');
  assert.equal(form.get('adaptive_pricing[enabled]'),'false');
  assert.equal(form.get('billing_address_collection'),null);
  assert.equal(form.has('custom_text[submit][message]'),false);
  assert.equal(form.get('line_items[0][price]'),price);
  assert.equal(form.get('line_items[0][quantity]'),'1');
  assert.equal(form.get('mode'),'payment');
  session={
   id:'cs_test_fake_123',url:'https://checkout.stripe.com/c/pay/cs_test_fake_123',
   object:'checkout.session',status:'open',mode:'payment',payment_status:'unpaid',
   livemode:false,amount_subtotal:99,amount_total:99,currency:'gbp',
   automatic_tax:{enabled:false,status:'complete'},
   expires_at:Math.floor(Date.now()/1000)+3600,
   client_reference_id:revealId,metadata:{
    integration:form.get('metadata[integration]'),reveal_id:form.get('metadata[reveal_id]'),
    payment_id:form.get('metadata[payment_id]'),price_id:form.get('metadata[price_id]'),
    revision:form.get('metadata[revision]')
   }
  };
  return new Response(JSON.stringify(session),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
  const closed=await worker.fetch(makeReq('/api/quest/'+slug+'/state'),env,{});
  assert.equal(closed.status,404);
  const checkout=await worker.fetch(makeReq('/api/reveals/'+revealId+'/checkout',{
   method:'POST',headers:{'X-Edit-Token':token,origin}
  }),env,{});
  assert.equal(checkout.status,200,await checkout.clone().text());
  const response=await checkout.json();
  assert.equal(response.checkoutUrl,session.url);
  const payment=sql.prepare('SELECT * FROM payments WHERE reveal_id=?').get(revealId);
  assert.equal(payment.status,'pending');
  assert.equal(payment.amount_minor,99);
  assert.equal(payment.currency,'gbp');
  assert.equal(sql.prepare('SELECT status FROM reveals').get().status,'checkout');
  assert.equal((await worker.fetch(makeReq('/api/quest/'+slug+'/state'),env,{})).status,404);

  const missing=await worker.fetch(makeReq('/api/webhooks/stripe',{method:'POST',body:event(session)}),env,{});
  assert.equal(missing.status,400);
  const wrong=await worker.fetch(signed(event(session),'whsec_WRONGKEY'),env,{});
  assert.equal(wrong.status,400);
  const wrongAmount=await worker.fetch(signed(event(session,{amount_subtotal:100})),env,{});
  assert.equal(wrongAmount.status,200);
  assert.equal(sql.prepare('SELECT status FROM reveals').get().status,'checkout');
  const wrongMode=await worker.fetch(signed(event(session,{livemode:true})),env,{});
  assert.equal(wrongMode.status,200);
  assert.equal(sql.prepare('SELECT status FROM reveals').get().status,'checkout');
  const managed=await worker.fetch(signed(event(session,{managed_payments:{enabled:true}})),env,{});
  assert.equal(managed.status,200);
  const wrongCurrency=await worker.fetch(signed(event(session,{adaptive_pricing:{enabled:true}})),env,{});
  assert.equal(wrongCurrency.status,200);
  assert.equal(sql.prepare('SELECT status FROM reveals').get().status,'checkout');
  const wrongTax=await worker.fetch(signed(event(session,{automatic_tax:{enabled:true}})),env,{});
  assert.equal(wrongTax.status,200);
  await worker.fetch(signed(event(session,{managed_payments:{enabled:true}})),env,{});
  await worker.fetch(signed(event(session,{amount_total:119})),env,{});
  assert.equal(sql.prepare('SELECT status FROM reveals').get().status,'checkout');
  assert.equal(sql.prepare('SELECT status FROM reveals').get().status,'checkout');

  const priorEventCount=sql.prepare('SELECT COUNT(*) AS count FROM stripe_events').get().count;
  const successfulEvent=event(session);
  const success=await worker.fetch(signed(successfulEvent),env,{});
  assert.equal(success.status,200,await success.clone().text());
  const paidAt=sql.prepare('SELECT paid_at FROM payments').get().paid_at;
  // A repeated signed webhook must not create a second payment or reissue
  // the recipient reveal. Stripe retries events in ordinary operation.
  const repeat=await worker.fetch(signed(successfulEvent),env,{});
  assert.equal(repeat.status,200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM stripe_events').get().count,priorEventCount+1);
  assert.equal(sql.prepare('SELECT paid_at FROM payments').get().paid_at,paidAt);
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM payments').get().count,1);
  assert.equal(sql.prepare('SELECT status FROM payments').get().status,'paid');
  assert.equal(sql.prepare('SELECT status FROM reveals').get().status,'paid');
  const first=await worker.fetch(makeReq('/api/quest/'+slug+'/state'),env,{});
  assert.equal(first.status,200);
  assert.equal(JSON.stringify(await first.clone().json()).includes('Surprise: a trip to Rome!'),false);
  const cookie=first.headers.get('set-cookie').split(';')[0];
  for(const [step,answer] of [[0,'A compass'],[1,'427'],[2,'Route line|Flight symbol|Gold seal']]){
   const r=await worker.fetch(makeReq('/api/quest/'+slug+'/answer',{
    method:'POST',headers:{cookie,origin,'content-type':'application/json'},
    body:JSON.stringify({step,answer})
   }),env,{});
   assert.equal(r.status,200,await r.clone().text());
   const result=await r.json();
   assert.equal(result.correct,true);
   if(step<2)assert.equal(JSON.stringify(result).includes('Surprise: a trip to Rome!'),false);
   else assert.equal(result.final.title,'Surprise: a trip to Rome!');
  }
  const revisit=await worker.fetch(makeReq('/api/quest/'+slug+'/state',{headers:{cookie}}),env,{});
  assert.equal((await revisit.json()).completed,true);
 }finally{
  globalThis.fetch=originalFetch;
  sql.close();
 }
});


test('new drafts receive unique opaque recipient slugs, but stay unavailable before payment',async()=>{
 const {sql,env}=setup();
 try{
  const seen=new Set();
  for(let index=0;index<2;index++){
   const form=new FormData();
   form.set('recipient','Chloe');
   form.set('sender','Reveal');
   form.set('eventName','Surprise test');
   const created=await worker.fetch(makeReq('/api/reveals',{method:'POST',body:form}),env,{});
   assert.equal(created.status,201,await created.clone().text());
   const draft=await created.json();
   const saved=sql.prepare('SELECT public_slug,status FROM reveals WHERE id=?').get(draft.id);
   assert.match(saved.public_slug,/^[A-Za-z0-9_-]{32,64}$/);
   assert.notEqual(saved.public_slug,draft.id);
   assert.equal(seen.has(saved.public_slug),false);
   seen.add(saved.public_slug);
   assert.equal(saved.status,'draft');
   const owner=await worker.fetch(makeReq('/api/reveals/'+draft.id,{
    headers:{'X-Edit-Token':draft.editToken}
   }),env,{});
   assert.equal(owner.status,200);
   assert.equal((await owner.json()).reveal.shareUrl,undefined);
   const unpaid=await worker.fetch(makeReq('/r/'+saved.public_slug),env,{});
   assert.equal(unpaid.status,404);
  }
 }finally{sql.close()}
});

test('owner-authenticated review repairs already paid Quest without a public slug and never asks for another payment',async()=>{
 const {sql,env}=setup();
 try{
  const paidAt=new Date().toISOString();
  sql.prepare('UPDATE reveals SET status=?,paid_at=?,public_slug=NULL WHERE id=?')
    .run('paid',paidAt,revealId);
  const forbidden=await worker.fetch(makeReq('/api/reveals/'+revealId),env,{});
  assert.equal(forbidden.status,403);
  assert.equal(sql.prepare('SELECT public_slug FROM reveals WHERE id=?').get(revealId).public_slug,null);
  const ownerReq=()=>worker.fetch(makeReq('/api/reveals/'+revealId,{
    headers:{'X-Edit-Token':token}
  }),env,{});
  const verified=await ownerReq();
  assert.equal(verified.status,200,await verified.clone().text());
  const owner=(await verified.json()).reveal;
  assert.equal(owner.status,'paid');
  assert.equal(owner.paidAt,paidAt);
  assert.match(owner.shareUrl,/^\/r\/[A-Za-z0-9_-]{32,64}$/);
  assert.equal(owner.shareUrl.includes('/null'),false);
  const slugNow=sql.prepare('SELECT public_slug FROM reveals WHERE id=?').get(revealId).public_slug;
  assert.equal(owner.shareUrl,'/r/'+slugNow);
  const reopened=await ownerReq();
  assert.equal((await reopened.json()).reveal.shareUrl,owner.shareUrl);
  const payable=await worker.fetch(makeReq(owner.shareUrl),env,{});
  assert.equal(payable.status,200,await payable.clone().text());
  assert.equal((await worker.fetch(makeReq('/r/null'),env,{})).status,404);
  assert.equal(sql.prepare('SELECT status FROM reveals WHERE id=?').get(revealId).status,'paid');
 }finally{sql.close()}
});


test('paid Quest replay keeps the original completed session and starts independent resumable progress',async()=>{
 const {sql,env}=setup();
 try{
  const paidAt=new Date().toISOString();
  sql.prepare('UPDATE reveals SET status=?,paid_at=? WHERE id=?').run('paid',paidAt,revealId);
  const stateReq=(cookie='',query='')=>worker.fetch(makeReq('/api/quest/'+slug+'/state'+query,{
   headers:cookie?{cookie}:{}
  }),env,{});
  const replayReq=(cookie='',originHeader=origin)=>worker.fetch(makeReq('/api/quest/'+slug+'/replay',{
   method:'POST',headers:{...(cookie?{cookie}:{}),origin:originHeader}
  }),env,{});
  const initial=await stateReq();
  assert.equal(initial.status,200);
  const ordinaryCookie=initial.headers.get('set-cookie').split(';')[0];
  assert.match(ordinaryCookie,/^rq_secret-quest-e2e=/);
  assert.equal((await replayReq()).status,403,'A different visitor cannot hijack a replay');
  assert.equal((await replayReq(ordinaryCookie)).status,403,'An unfinished Quest cannot replay');
  assert.equal((await stateReq('', '?replay=1')).status,409,'Replay URL alone cannot create sessions');
  for(const [step,answer] of [[0,'A compass'],[1,'427'],[2,'Route line|Flight symbol|Gold seal']]){
   const answerResponse=await worker.fetch(makeReq('/api/quest/'+slug+'/answer',{
    method:'POST',headers:{cookie:ordinaryCookie,origin,'content-type':'application/json'},
    body:JSON.stringify({step,answer})
   }),env,{});
   assert.equal(answerResponse.status,200,await answerResponse.clone().text());
  }
  const complete=await stateReq(ordinaryCookie);
  assert.equal((await complete.json()).final.title,'Surprise: a trip to Rome!');
  assert.equal((await replayReq(ordinaryCookie,'https://evil.example')).status,403);
  assert.equal((await worker.fetch(makeReq('/api/quest/'+slug+'/replay',{
   method:'GET',headers:{cookie:ordinaryCookie}
  }),env,{})).status,405);
  const start=await replayReq(ordinaryCookie);
  assert.equal(start.status,200,await start.clone().text());
  const replayPayload=await start.clone().json();
  assert.equal(replayPayload.completed,false);
  assert.equal(replayPayload.step,0);
  assert.equal(JSON.stringify(replayPayload).includes('Surprise: a trip to Rome!'),false);
  const replayCookie=start.headers.get('set-cookie').split(';')[0];
  assert.match(replayCookie,/^rq_replay_secret-quest-e2e=/);
  assert.notEqual(replayCookie.split('=')[1],ordinaryCookie.split('=')[1]);
  const combined=ordinaryCookie+'; '+replayCookie;
  const fresh=await stateReq(combined,'?replay=1');
  assert.equal((await fresh.json()).step,0);
  const again=await stateReq(combined);
  assert.equal((await again.json()).completed,true,'Original completed reveal must remain directly revisitable');
  const replayAnswer=await worker.fetch(makeReq('/api/quest/'+slug+'/answer?replay=1',{
   method:'POST',headers:{cookie:combined,origin,'content-type':'application/json'},
   body:JSON.stringify({step:0,answer:'A compass'})
  }),env,{});
  assert.equal(replayAnswer.status,200,await replayAnswer.clone().text());
  assert.equal((await replayAnswer.json()).step,1);
  assert.equal((await (await stateReq(combined,'?replay=1')).json()).step,1,'Replay progress survives reopening');
  assert.equal((await (await stateReq(combined)).json()).completed,true,'Replay must not alter completed state');
  assert.equal((await replayReq(replayCookie)).status,403,'Replay progress cookie is not original completion proof');
  const restart=await replayReq(ordinaryCookie);
  assert.equal(restart.status,200);
  const newReplayCookie=restart.headers.get('set-cookie').split(';')[0];
  assert.notEqual(newReplayCookie,replayCookie,'A new replay must have a fresh isolated session');
  assert.equal((await (await stateReq(ordinaryCookie+'; '+newReplayCookie,'?replay=1')).json()).step,0);
  assert.equal((await (await stateReq(combined,'?replay=1')).json()).step,1,
   'Another existing replay session remains unaffected');
  assert.equal((await (await stateReq(ordinaryCookie)).json()).completed,true);
  assert.equal(sql.prepare('SELECT COUNT(*) AS total FROM payments').get().total,0,'Replay does not create a payment');
 }finally{sql.close()}
});


test('Scratch Ticket payment lifecycle: only verified signed test payment unlocks recipient and private image',async()=>{
 const {sql,env}=setup();
 env.SCRATCH_TEST_CHECKOUT_ENABLED='true';
 sql.prepare('DELETE FROM quest_configs WHERE reveal_id=?').run(revealId);
 const surface={variant:'ticket',style:'classic',foil:'gold',artworkId:'luxury-coral-ribbon-primary',postScratch:{templateId:'bg-luxury-coral-ribbon'}};
 sql.prepare('INSERT INTO reveal_configurations (reveal_id,product_id,fields_json) VALUES (?,?,?)').run(revealId,'ticket-reveal',JSON.stringify({scratchSurface:surface,audio:{enabled:false}}));
 sql.prepare('UPDATE reveals SET image_key=? WHERE id=?').run('private-test.png',revealId);
 const image=Uint8Array.from([137,80,78,71,13,10,26,10]);
 env.IMAGES={...env.IMAGES,async get(key){if(key!=='private-test.png')return null;return{body:image,writeHttpMetadata(h){h.set('content-type','image/png')}}}};
 let count=0,session;
 const old=globalThis.fetch;
 globalThis.fetch=async(uri,options={})=>{
  assert.equal(String(uri),'https://api.stripe.com/v1/checkout/sessions');
  const form=new URLSearchParams(options.body);
  assert.equal(form.get('automatic_tax[enabled]'),'false');
  assert.equal(form.get('managed_payments[enabled]'),'false');
  assert.equal(form.get('billing_address_collection'),null);
  assert.equal(form.has('custom_text[submit][message]'),false);
  assert.equal(form.get('line_items[0][price]'),price);
  const id='cs_test_scratch_'+(++count);
  session={id,url:'https://checkout.stripe.com/c/pay/'+id,object:'checkout.session',status:'open',mode:'payment',payment_status:'unpaid',
   livemode:false,amount_subtotal:99,amount_total:99,currency:'gbp',automatic_tax:{enabled:false,status:'complete'},
   expires_at:Math.floor(Date.now()/1000)+3600,client_reference_id:revealId,
   metadata:Object.fromEntries(['integration','reveal_id','payment_id','price_id','revision'].map(k=>[k,form.get('metadata['+k+']')]))};
  return new Response(JSON.stringify(session),{headers:{'content-type':'application/json'}});
 };
 const req=(path,opts={})=>worker.fetch(makeReq(path,opts),env,{});
 const owner=async()=> (await(await req('/api/reveals/'+revealId,{headers:{'X-Edit-Token':token}})).json()).reveal;
 const locked=async()=>{
  assert.equal((await owner()).shareUrl,undefined);
  for(const suffix of ['', '/scratch-data','/scratch-image'])assert.equal((await req('/r/'+slug+suffix)).status,404);
 };
 const checkout=async()=>{
  const r=await req('/api/reveals/'+revealId+'/checkout',{method:'POST',headers:{origin,'X-Edit-Token':token}});
  assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).checkoutUrl,session.url);
 };
 const failure=type=>{const e=JSON.parse(event(session));e.type=type;e.data.object.payment_status='unpaid';return JSON.stringify(e)};
 try{
  await locked();
  assert.equal((await req('/api/reveals/'+revealId+'/checkout',{method:'POST',headers:{origin}})).status,403);
  await checkout();await locked();
  assert.equal((await worker.fetch(signed(failure('checkout.session.async_payment_failed')),env,{})).status,200);
  assert.equal((await owner()).status,'confirmed');await locked();
  await checkout();await locked();
  assert.equal((await worker.fetch(signed(failure('checkout.session.expired')),env,{})).status,200);
  assert.equal((await owner()).status,'confirmed');await locked();
  await checkout();await locked();
  // Fake, wrong-account, mismatched-amount and unexpected-tax callbacks cannot unlock.
  assert.equal((await req('/api/webhooks/stripe',{method:'POST',body:event(session)})).status,400);
  assert.equal((await worker.fetch(signed(event(session),'whsec_WRONGKEY'),env,{})).status,400);
  await worker.fetch(signed(event(session,{amount_subtotal:100})),env,{});
  await worker.fetch(signed(event(session,{livemode:true})),env,{});
  await worker.fetch(signed(event(session,{automatic_tax:{enabled:true}})),env,{});
  await worker.fetch(signed(event(session,{amount_total:119})),env,{});
  await locked();
  const valid=event(session);
  assert.equal((await worker.fetch(signed(valid),env,{})).status,200);
  assert.equal((await owner()).status,'paid');
  assert.equal((await owner()).shareUrl,'/r/'+slug);
  assert.equal((await req('/r/'+slug)).status,200);
  const data=await req('/r/'+slug+'/scratch-data');
  assert.equal(data.status,200);assert.match(data.headers.get('cache-control'),/private.*no-store/);
  const payload=await data.json();assert.equal(payload.reveal.recipient,'Chloe');assert.equal(payload.scratchSurface.artworkId,surface.artworkId);
  const art=await req('/r/'+slug+'/scratch-image');assert.equal(art.status,200);assert.deepEqual(new Uint8Array(await art.arrayBuffer()),image);
  assert.equal((await req('/r/'+slug+'/scratch-data')).status,200,'paid link revisitable');
  const paidAt=(await owner()).paidAt;
  assert.equal((await worker.fetch(signed(valid),env,{})).status,200);
  assert.equal((await owner()).paidAt,paidAt);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM payments WHERE status='paid'").get().n,1);
  const again=await req('/api/reveals/'+revealId+'/checkout',{method:'POST',headers:{origin,'X-Edit-Token':token}});
  assert.equal((await again.json()).shareUrl,'/r/'+slug);assert.equal(count,3);
 }finally{globalThis.fetch=old;sql.close()}
});

test('checkout retries reuse identical Stripe form data and idempotency key after a network failure',async()=>{
 const {sql,env}=setup(),original=globalThis.fetch;
 let first,firstKey,calls=0;
 globalThis.fetch=async(uri,options)=>{
  calls++;
  const form=new URLSearchParams(options.body);
  const key=options.headers.get('Idempotency-Key');
  if(calls===1){first=options.body;firstKey=key;throw Error('simulated connection drop');}
  assert.equal(options.body,first,'retry must not change expires_at or any other Stripe parameter');
  assert.equal(key,firstKey);
  return new Response(JSON.stringify({id:'cs_test_retry123',url:'https://checkout.stripe.com/c/pay/cs_test_retry123',mode:'payment',status:'open',payment_status:'unpaid',amount_subtotal:99,amount_total:99,currency:'gbp',livemode:false,automatic_tax:{enabled:false},expires_at:Number(form.get('expires_at'))}),{headers:{'content-type':'application/json'}});
 };
 try{
  const req=()=>makeReq('/api/reveals/'+revealId+'/checkout',{method:'POST',headers:{origin,'X-Edit-Token':token}});
  assert.equal((await worker.fetch(req(),env,{})).status,502);
  const before=sql.prepare('SELECT * FROM payments').get();
  assert.equal(before.status,'pending');
  // Wall-clock advance must not mutate the request for a pending attempt.
  await new Promise(r=>setTimeout(r,1100));
  const retry=await worker.fetch(req(),env,{});
  assert.equal(retry.status,200,await retry.clone().text());
  const after=sql.prepare('SELECT * FROM payments').get();
  assert.equal(after.id,before.id);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM payments').get().n,1);
  assert.equal(after.status,'pending');
  assert.equal((await worker.fetch(makeReq('/r/'+slug),env,{})).status,404);
 }finally{globalThis.fetch=original;sql.close();}
});

test('already pending £1.99 staging test checkout is reconciled at its original amount after price change',async()=>{
 const {sql,env}=setup();
 env.STAGING_DISABLE_CHECKOUT='true';
 env.STRIPE_AUTOMATIC_TAX='false';
 const now=new Date().toISOString(),paymentId='older-price-payment';
 const oldPrice='price_1USbNbKEVPKWz2E9zmH0mabR';
 const session={
  id:'cs_test_older_pending',client_reference_id:revealId,mode:'payment',status:'complete',
  payment_status:'paid',livemode:false,object:'checkout.session',currency:'gbp',
  automatic_tax:{enabled:true,status:'complete'},amount_subtotal:199,amount_total:239,
  payment_intent:'pi_test_older',
  metadata:{integration:'reveal-mvp',reveal_id:revealId,payment_id:paymentId,price_id:oldPrice,revision:'1'}
 };
 try{
  sql.prepare('UPDATE reveals SET status=? WHERE id=?').run('checkout',revealId);
  sql.prepare("INSERT INTO payments (id,reveal_id,provider,amount_minor,currency,status,checkout_session_id,created_at,updated_at) VALUES (?,?, 'stripe',199,'gbp','pending',?,?,?)")
    .run(paymentId,revealId,session.id,now,now);
  const accepted=await worker.fetch(signed(event(session,{amount_subtotal:199,amount_total:239,automatic_tax:{enabled:true}})),env,{});
  assert.equal(accepted.status,200);
  assert.equal(sql.prepare('SELECT status FROM payments WHERE id=?').get(paymentId).status,'paid');
  assert.equal(sql.prepare('SELECT status FROM reveals WHERE id=?').get(revealId).status,'paid');
  const bad=new Date().toISOString();
  assert.ok(bad);
 }finally{sql.close();}
});


test('signed TEST payment unlocks only the saved custom Sapphire Wrap recipient and private R2 cover',async()=>{
 const {sql,env}=setup();
 const originalFetch=globalThis.fetch;
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
 const assetId='private-cover-qa',objectKey='scratch-covers/signed-qa/image.png';
 try{
  env.SCRATCH_TEST_CHECKOUT_ENABLED='true';
  sql.exec('DELETE FROM quest_configs');
  sql.exec("CREATE TABLE reveal_assets (id TEXT PRIMARY KEY, reveal_id TEXT, kind TEXT, r2_key TEXT)");
  sql.prepare('INSERT INTO reveal_assets (id,reveal_id,kind,r2_key) VALUES (?,?,?,?)')
    .run(assetId,revealId,'scratch-cover',objectKey);
  const saved={scratchSurface:{
   style:'custom',foil:'gold',variant:'ticket',theme:'luxury-elegant',
   coverAssetId:assetId,coverCrop:{zoom:150,panX:-30,panY:20},
   postScratch:{templateId:'bg-wrap-sapphire'}
  },audio:{enabled:false}};
  sql.prepare('INSERT INTO reveal_configurations(reveal_id,product_id,fields_json) VALUES (?,?,?)')
    .run(revealId,'ticket-reveal',JSON.stringify(saved));
  env.IMAGES={
   bucketName:'reveal-images-stage4b',
   async get(key){
    assert.equal(key,objectKey);
    return {body:new Response(bytes).body,writeHttpMetadata(h){h.set('Content-Type','image/png');}};
   }
  };
  const url='/r/'+slug;
  const before=await worker.fetch(makeReq(url+'/scratch-data'),env,{});
  assert.equal(before.status,404,'No recipient data before Stripe payment');
  assert.equal((await worker.fetch(makeReq(url+'/scratch-cover'),env,{})).status,404);
  assert.equal((await worker.fetch(makeReq(url),env,{})).status,404);
  const owner=()=>worker.fetch(makeReq('/api/reveals/'+revealId,{
   headers:{'X-Edit-Token':token}
  }),env,{});
  assert.equal((await (await owner()).json()).reveal.shareUrl,undefined);

  let stripeSession;
  globalThis.fetch=async(address,{body,headers}={})=>{
   assert.equal(String(address),'https://api.stripe.com/v1/checkout/sessions');
   assert.equal(headers.get('Stripe-Version'),'2025-03-31.basil');
   const form=new URLSearchParams(body);
   assert.equal(form.get('line_items[0][price]'),price);
   assert.equal(form.get('automatic_tax[enabled]'),'false');
   assert.equal(form.get('managed_payments[enabled]'),'false');
   assert.equal(form.get('adaptive_pricing[enabled]'),'false');
   stripeSession={
    id:'cs_test_custom_sapphire_local',url:'https://checkout.stripe.com/c/pay/cs_test_custom_sapphire_local',
    object:'checkout.session',mode:'payment',status:'open',payment_status:'unpaid',
    livemode:false,amount_subtotal:99,amount_total:99,currency:'gbp',
    automatic_tax:{enabled:false},managed_payments:{enabled:false},
    adaptive_pricing:{enabled:false},
    expires_at:Math.floor(Date.now()/1000)+3600,client_reference_id:revealId,
    metadata:{integration:'reveal-mvp',reveal_id:revealId,
      payment_id:form.get('metadata[payment_id]'),
      price_id:form.get('metadata[price_id]'),revision:'1'}
   };
   return new Response(JSON.stringify(stripeSession),{status:200,headers:{'content-type':'application/json'}});
  };
  const checkout=await worker.fetch(makeReq('/api/reveals/'+revealId+'/checkout',{
   method:'POST',headers:{'X-Edit-Token':token,origin}
  }),env,{});
  assert.equal(checkout.status,200,await checkout.clone().text());
  assert.equal((await checkout.json()).checkoutUrl,stripeSession.url);
  assert.equal(sql.prepare('SELECT status FROM reveals WHERE id=?').get(revealId).status,'checkout');
  assert.equal((await worker.fetch(makeReq(url+'/scratch-data'),env,{})).status,404);
  const wrong=await worker.fetch(signed(event(stripeSession,{amount_total:119})),env,{});
  assert.equal(wrong.status,200);
  assert.equal((await worker.fetch(makeReq(url+'/scratch-cover'),env,{})).status,404);
  const tax=await worker.fetch(signed(event(stripeSession,{automatic_tax:{enabled:true}})),env,{});
  assert.equal(tax.status,200);
  assert.equal(sql.prepare('SELECT status FROM reveals').get().status,'checkout');
  const realEvent=event(stripeSession);
  const fulfilled=await worker.fetch(signed(realEvent),env,{});
  assert.equal(fulfilled.status,200);
  assert.equal(sql.prepare('SELECT status FROM payments').get().status,'paid');
  assert.equal(sql.prepare('SELECT status FROM reveals').get().status,'paid');
  const paidOwner=(await (await owner()).json()).reveal;
  assert.equal(paidOwner.shareUrl,url);
  assert.equal(paidOwner.status,'paid');
  const response=await worker.fetch(makeReq(url+'/scratch-data'),env,{});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.success,true);
  assert.equal(data.scratchSurface.style,'custom');
  assert.equal(data.scratchSurface.hasImage,true);
  assert.equal(data.scratchSurface.postScratch.templateId,'bg-wrap-sapphire');
  assert.deepEqual(data.scratchSurface.coverCrop,{zoom:150,panX:-30,panY:20});
  assert.equal(data.reveal.eventName,'Surprise: a trip to Rome!');
  const cover=await worker.fetch(makeReq(url+'/scratch-cover'),env,{});
  assert.equal(cover.status,200);
  assert.equal(cover.headers.get('content-type'),'image/png');
  assert.deepEqual(Buffer.from(await cover.arrayBuffer()),bytes);
  assert.equal((await worker.fetch(makeReq(url+'/scratch-image'),env,{})).status,404);
  const repeated=await worker.fetch(signed(realEvent),env,{});
  assert.equal(repeated.status,200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM payments').get().n,1);
 }finally{
  globalThis.fetch=originalFetch;sql.close();
 }
});
