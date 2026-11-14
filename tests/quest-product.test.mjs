import test from 'node:test';
import assert from 'node:assert/strict';
import {QUEST_CHAPTERS,QUEST_PRESETS,validateQuestConfig,questResponse} from '../src/quest.js';

const origin='https://reveal-stage4b-test.example';
const fixture=preset=>({
  story:'missing-itinerary',preset,mode:'ready',
  clues:QUEST_PRESETS[preset].map(key=>{
    const chapter=QUEST_CHAPTERS[key];
    return {key,question:chapter.question,answer:chapter.answer,
      hint1:chapter.hints[0],hint2:chapter.hints[1],options:[...chapter.options]};
  })
});
const toRequest=(path,opts={})=>new Request(origin+path,opts);

test('Quick 3, Classic 5 and Epic 7 have ordered, solvable unique chapters',()=>{
 for(const [name,count] of [['quick',3],['classic',5],['epic',7]]){
  const config=validateQuestConfig(fixture(name));
  assert.ok(config,'Missing valid '+name+' preset');
  assert.equal(config.clues.length,count);
  assert.equal(new Set(config.clues.map(x=>x.key)).size,count);
  assert.equal(config.clues.at(-1).key,'ticket');
  for(const puzzle of config.clues){
   assert.ok(puzzle.question);
   assert.equal(puzzle.hints.length,2);
   if(puzzle.kind==='lock')assert.match(puzzle.answer,/^\d{3}$/);
   if(puzzle.kind==='order')assert.equal(puzzle.answer.split('|').length,3);
  }
 }
});

test('Reject changed sequence keys, invalid answers and unsolicited puzzle types',()=>{
 const x=fixture('epic');
 x.clues[2].key='ticket';
 assert.equal(validateQuestConfig(x),null);
 const y=fixture('quick');y.clues[1].answer='abc';
 assert.equal(validateQuestConfig(y),null);
 const z=fixture('classic');z.clues[2].answer='Rome · 08 Apr|Rome · 08 Apr|Lisbon · 19 Apr';
 assert.equal(validateQuestConfig(z),null);
 const bad=fixture('classic');bad.preset='unlimited';
 assert.equal(validateQuestConfig(bad),null);
});

function fakeStagingDb(){
 let config=null,session=null;const paidReveal={
  id:'rev-quest',public_slug:'sample-quest',status:'paid',paid_at:'2026-11-14T00:00:00Z',
  recipient:'Chloe',sender:'Reveal',event_name:'SECRET DESTINATION',personal_message:'Hidden until solved',
  event_date:'2027-05-21',event_time:'18:30',venue:'Private',admit:'Two guests',
  ticket_url:'https://example.com/details',image_key:'r2-hidden-file'
 };
 return {
  pendingConfig:()=>config,
  data:{
   prepare(sql){
    let args=[];
    return{
      bind(...items){args=items;return this;},
      async first(){
       if(sql.includes('SELECT * FROM reveals WHERE public_slug'))return paidReveal;
       if(sql.includes('SELECT config_json FROM quest_configs'))return config?{config_json:JSON.stringify(config)}:null;
       if(sql.includes('SELECT * FROM quest_sessions'))return session;
       return null;
      },
      async all(){
       if(sql.includes('sqlite_master'))return {results:['reveals','payments','quest_configs','quest_sessions'].map(name=>({name}))};
       return {results:[]};
      },
      async run(){
       if(sql.includes('INSERT INTO quest_configs'))config=JSON.parse(args[1]);
       if(sql.includes('UPDATE quest_configs'))config=JSON.parse(args[0]);
       if(sql.includes('INSERT INTO quest_sessions'))session={
        session_hash:args[0],reveal_id:args[1],step:0,attempts:0,last_attempt_at:null,completed_at:null
       };
       if(sql.includes('UPDATE quest_sessions SET attempts=')){
        session.attempts=args[0];session.last_attempt_at=args[1];
       }
       if(sql.includes('UPDATE quest_sessions SET step=')){
        if(session.step!==args.at(-1))return {meta:{changes:0}};
        session.step=args[0];session.completed_at=args[1];session.attempts=0;
       }
       return {meta:{changes:1}};
      }
    };
   }
  }
 };
}

test('Create a real staged Quest draft and retrieve its answers only with owner authorisation',async()=>{
 const fake=fakeStagingDb();
 const env={STAGING_DISABLE_CHECKOUT:'true',STRIPE_LIVE_MODE:'false',DB:fake.data,IMAGES:{}};
 const config=fixture('epic');
 const form=new FormData();form.set('questConfig',JSON.stringify(config));
 form.set('recipient','Chloe');form.set('sender','Reveal');form.set('eventName','SECRET DESTINATION');
 const legacy={
  async fetch(req){
   if(req.method==='POST'&&new URL(req.url).pathname==='/api/reveals')return new Response(
    JSON.stringify({success:true,id:'rev-quest',editToken:'owner-secret'}),{status:201,headers:{'content-type':'application/json'}});
   if(req.method==='GET'&&req.headers.get('x-edit-token')==='owner-secret')return new Response(JSON.stringify({
    success:true,reveal:{id:'rev-quest',status:'draft',revision:0,recipient:'Chloe',sender:'Reveal',eventName:'SECRET DESTINATION'}
   }),{status:200,headers:{'content-type':'application/json'}});
   return new Response(JSON.stringify({error:'Not authorised'}),{status:403,headers:{'content-type':'application/json'}});
  }
 };
 const created=await questResponse(toRequest('/api/quest/create',{method:'POST',body:form,headers:{Origin:origin}}),env,{},legacy);
 assert.equal(created.status,201);
 const result=await created.json();
 assert.equal(result.id,'rev-quest');
 assert.equal(result.reviewUrl,'/reveal?id=rev-quest');
 assert.equal(JSON.stringify(result).includes('SECRET DESTINATION'),false);
 assert.equal(fake.pendingConfig().clues.length,7);
 const unauth=await questResponse(toRequest('/api/quest/owner/rev-quest'),env,{},legacy);
 assert.equal(unauth.status,403);
 const auth=await questResponse(toRequest('/api/quest/owner/rev-quest',{headers:{'X-Edit-Token':'owner-secret'}}),env,{},legacy);
 assert.equal(auth.status,200);
 assert.equal((await auth.json()).config.clues[2].answer,'427');
 const blocked=await questResponse(toRequest('/api/quest/create',{method:'POST',body:new FormData(),headers:{Origin:'https://evil.invalid'}}),env,{},legacy);
 assert.equal(blocked.status,403);
});

test('Recipient never receives purchaser surprise until final correctly ordered answer',async()=>{
 const fake=fakeStagingDb();
 const config=fixture('quick');
 const env={STAGING_DISABLE_CHECKOUT:'true',STRIPE_LIVE_MODE:'false',DB:fake.data,IMAGES:{}};
 const create=new FormData();
 create.set('questConfig',JSON.stringify(config));create.set('recipient','Chloe');create.set('sender','Reveal');create.set('eventName','SECRET DESTINATION');
 const legacy={async fetch(request){
  if(request.method==='POST' && new URL(request.url).pathname==='/api/reveals')
   return new Response(JSON.stringify({id:'rev-quest',editToken:'secret'}),{status:201,headers:{'content-type':'application/json'}});
  if(new URL(request.url).pathname.endsWith('/image'))return new Response('PRIVATE FILE');
  return new Response('Unexpected legacy route',{status:500});
 }};
 assert.equal((await questResponse(toRequest('/api/quest/create',{method:'POST',body:create,headers:{Origin:origin}}),env,{},legacy)).status,201);
 const first=await questResponse(toRequest('/api/quest/sample-quest/state'),env,{},legacy);
 const cookie=first.headers.get('set-cookie').split(';')[0];
 const firstState=await first.json();
 assert.equal(firstState.step,0);
 assert.equal(firstState.total,3);
 assert.equal(firstState.scene,'letter');
 assert.equal(JSON.stringify(firstState).includes('SECRET DESTINATION'),false);
 const imageBefore=await questResponse(toRequest('/r/sample-quest/image',{headers:{cookie}}),env,{},legacy);
 assert.equal(imageBefore.status,404);
 const hint=await questResponse(toRequest('/api/quest/sample-quest/hint?level=1',{headers:{cookie}}),env,{},legacy);
 assert.ok((await hint.json()).hint);
 const wrong=await questResponse(toRequest('/api/quest/sample-quest/answer',{method:'POST',headers:{cookie,Origin:origin},body:JSON.stringify({step:0,answer:'Wrong'})}),env,{},legacy);
 assert.equal((await wrong.json()).correct,false);
 for(const [step,answer] of [[0,'A compass'],[1,'427'],[2,'Route line|Flight symbol|Gold seal']]){
  const res=await questResponse(toRequest('/api/quest/sample-quest/answer',{
   method:'POST',headers:{cookie,Origin:origin},body:JSON.stringify({step,answer})
  }),env,{},legacy);
  assert.equal(res.status,200);
  const data=await res.json();
  assert.equal(data.correct,true);
  assert.equal(data.step,step+1);
  if(step<2)assert.equal(JSON.stringify(data).includes('SECRET DESTINATION'),false);
  else assert.equal(data.final.title,'SECRET DESTINATION');
 }
 const imageAfter=await questResponse(toRequest('/r/sample-quest/image',{headers:{cookie}}),env,{},legacy);
 assert.equal(await imageAfter.text(),'PRIVATE FILE');
});

test('Staging health and production payment environment remain isolated',async()=>{
 const fake=fakeStagingDb();
 const health=await questResponse(toRequest('/api/quest/staging-health'),{
  STAGING_DISABLE_CHECKOUT:'true',STRIPE_LIVE_MODE:'false',DB:fake.data
 },{},{});
 const report=await health.json();
 assert.equal(report.checkoutEnabled,false);
 assert.equal(report.questSchemaReady,true);
 const noProd=await questResponse(toRequest('/api/quest/staging-health'),{
  STAGING_DISABLE_CHECKOUT:'false',STRIPE_LIVE_MODE:'true',DB:fake.data
 },{},{});
 assert.equal(noProd.status,404);
});
