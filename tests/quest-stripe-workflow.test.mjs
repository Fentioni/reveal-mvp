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
   amount_subtotal:overrides.amount_subtotal??199,amount_total:239,currency:'gbp',
   payment_intent:'pi_FAKE123'}}
});
event.counter=0;
function signed(body,signingSecret=secret){
 const timestamp=Math.floor(Date.now()/1000);
 const signature=createHmac('sha256',signingSecret).update(timestamp+'.'+body).digest('hex');
 return makeReq('/api/webhooks/stripe',{method:'POST',headers:{'Stripe-Signature':'t='+timestamp+',v1='+signature},body});
}
test('Stripe test checkout with location-based tax only unlocks after correctly signed webhook',async()=>{
 const {sql,env}=setup();
 const originalFetch=globalThis.fetch;
 let session=null,form=null;
 globalThis.fetch=async(uri,options={})=>{
  assert.equal(String(uri),'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(options.headers.get('Authorization'),'Bearer '+env.STRIPE_SECRET_KEY);
  form=new URLSearchParams(options.body);
  assert.equal(form.get('automatic_tax[enabled]'),'true');
  assert.equal(form.get('billing_address_collection'),'required');
  assert.equal(form.get('line_items[0][price]'),price);
  assert.equal(form.get('line_items[0][quantity]'),'1');
  assert.equal(form.get('mode'),'payment');
  session={
   id:'cs_test_fake_123',url:'https://checkout.stripe.com/c/pay/cs_test_fake_123',
   object:'checkout.session',status:'open',mode:'payment',payment_status:'unpaid',
   livemode:false,amount_subtotal:199,amount_total:239,currency:'gbp',
   automatic_tax:{enabled:true,status:'complete'},
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
  assert.equal(payment.amount_minor,199);
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
  const wrongTax=await worker.fetch(signed(event(session,{automatic_tax:{enabled:false}})),env,{});
  assert.equal(wrongTax.status,200);
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
