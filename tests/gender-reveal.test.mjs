import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {genderOwnerResponse,genderAudienceResponse,validateGenderConfig} from '../src/gender-reveal.js';
import worker from '../src/index.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BASE='https://stage.example';
const ID='gender-test-id',SLUG='gender-join';
const SECRET='private-owner-token';
const VOTERS=[
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
];
function mock({paid=false,configured=true,product='gender-reveal'}={}){
  const row={
    id:ID,public_slug:SLUG,status:paid?'paid':'draft',
    paid_at:paid?'2026-11-13T09:00:00Z':null,
    recipient:'Family & Friends',sender:'Mum & Dad',
    event_name:'Boy or Girl?',personal_message:'Our happy news!'
  };
  const data={row,product,
    config:configured?{gender:{version:1,result:'girl',theme:'confetti'}}:null,
    events:new Map(),ownerHits:0,assetHits:0,mutationCount:0};
  const DB={prepare(sql){
    return {args:[],bind(...args){this.args=args;return this},
      async first(){
        if(sql.includes('FROM reveals WHERE public_slug=?'))return data.row;
        if(sql.includes('SELECT product_id,fields_json FROM reveal_configurations')){
          return data.config?{product_id:data.product,fields_json:JSON.stringify(data.config)}:null;
        }
        if(sql.includes('SELECT metadata_json FROM reveal_events')){
          const key=this.args.find(value=>typeof value==='string'&&value.endsWith('-start'));
          const event=data.events.get(key);
          return event?{metadata_json:event.metadata_json}:null;
        }
        if(sql.startsWith('SELECT event_type,metadata_json FROM reveal_events')){
          const event=data.events.get(this.args[1]);
          return event?{event_type:event.event_type,metadata_json:event.metadata_json}:null;
        }
        throw Error('Unexpected FIRST: '+sql);
      },
      async all(){
        if(sql.includes('GROUP BY event_type')){
          const counts=new Map();
          for(const event of data.events.values()){
            if(event.event_type==='gender-vote-boy'||event.event_type==='gender-vote-girl'){
              counts.set(event.event_type,(counts.get(event.event_type)||0)+1);
            }
          }
          return {results:[...counts].map(([event_type,total])=>({event_type,total}))};
        }
        if(sql.includes('ORDER BY created_at ASC,id ASC LIMIT ?')){
          const rows=[...data.events.values()]
            .filter(event=>['gender-vote-boy','gender-vote-girl'].includes(event.event_type))
            .sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))
            .slice(0,this.args[1]);
          return {results:rows.map(x=>({event_type:x.event_type,metadata_json:x.metadata_json}))};
        }
        throw Error('Unexpected ALL: '+sql);
      },
      async run(){
        if(sql.includes('INSERT INTO reveal_configurations')){
          const [revealId,productId,fields]=this.args;
          assert.equal(revealId,ID);
          if(data.config&&data.product!==productId)return {meta:{changes:0}};
          data.product=productId;
          data.config=JSON.parse(fields);data.mutationCount++;
          return {meta:{changes:1}};
        }
        if(sql.startsWith('INSERT OR IGNORE INTO reveal_events')){
          const [id,revealId,event_type,metadata_json,created_at]=this.args;
          assert.equal(revealId,ID);
          if(this.args.length===7){
            assert.equal(this.args[5],ID);
            if(data.events.has(this.args[6]))return {meta:{changes:0}};
          }
          if(data.events.has(id))return {meta:{changes:0}};
          data.events.set(id,{id,revealId,event_type,metadata_json,created_at});
          data.mutationCount++;
          return {meta:{changes:1}};
        }
        throw Error('Unexpected RUN: '+sql);
      }
    };
  }};
  const ASSETS={async fetch(request){
    data.assetHits++;
    assert.equal(new URL(request.url).pathname,'/gender-audience');
    return new Response('<html>gender audience shell</html>',{headers:{'content-type':'text/html'}});
  }};
  const env={STAGING_DISABLE_CHECKOUT:'true',DB,ASSETS};
  const originalWorker={async fetch(request){
    data.ownerHits++;
    assert.equal(new URL(request.url).pathname,'/api/reveals/'+ID);
    if(request.headers.get('X-Edit-Token')!==SECRET){
      return new Response(JSON.stringify({success:false,error:'Not authorised'}),{status:403,
        headers:{'content-type':'application/json'}});
    }
    return new Response(JSON.stringify({success:true,reveal:{
      status:data.row.status,paidAt:data.row.paid_at,
      ...(data.row.status==='paid'?{shareUrl:'/r/'+SLUG}:{})
    }}),{headers:{'content-type':'application/json'}});
  }};
  return {data,env,originalWorker};
}
const ownerReq=(action='',method='GET',payload={result:'boy',theme:'pastel'},secret=SECRET)=>
  new Request(BASE+'/api/reveals/'+ID+'/gender'+(action?'/'+action:''),{
    method,headers:{'X-Edit-Token':secret,...(method==='PUT'?{'Content-Type':'application/json'}:{})},
    ...(method==='PUT'?{body:JSON.stringify(payload)}:{})
  });
const publicReq=(action='',{method='GET',voter=null,choice=null,name='Test Guest'}={})=>{
  const headers={};
  if(voter)headers['X-Gender-Voter']=voter;
  if(method==='POST')headers['Content-Type']='application/json';
  return new Request(BASE+'/r/'+SLUG+(action?'/'+action:''),{
    method,headers,...(method==='POST'?{body:JSON.stringify({voterId:voter,choice,name})}:{})
  });
};
const owner=(m,action='',method='GET',payload={result:'boy',theme:'pastel'},secret=SECRET)=>
  genderOwnerResponse(ownerReq(action,method,payload,secret),m.env,{},m.originalWorker);
const guest=(m,action='',opts={})=>genderAudienceResponse(publicReq(action,opts),m.env,{});

test('gender configuration only accepts a secret boy/girl result and supported theme',()=>{
  assert.deepEqual(validateGenderConfig({result:'Girl',theme:'confetti'}),{
    gender:{version:1,result:'girl',theme:'confetti'}
  });
  for(const invalid of [
    null,{},[],{result:'unknown',theme:'pastel'},
    {result:'boy',theme:'malicious'},{result:'two',theme:'confetti'}
  ])assert.ok(validateGenderConfig(invalid).error);
});

test('owner must have original private edit token to see or configure secret result',async()=>{
  const m=mock({configured:false});
  assert.equal((await owner(m,'','PUT',{},'wrong')).status,403);
  assert.equal((await owner(m,'','GET',{},'wrong')).status,403);
  assert.equal(m.data.config,null);
  const saved=await owner(m,'','PUT',{result:'girl',theme:'pastel'});
  assert.equal(saved.status,200);
  assert.deepEqual((await saved.json()).gender,{version:1,result:'girl',theme:'pastel'});
  const ownerView=await owner(m);
  const json=await ownerView.json();
  assert.equal(json.gender.result,'girl');
  assert.equal(json.status,'draft');
  assert.equal(json.shareUrl,undefined);
  assert.equal(m.data.ownerHits,4);
});

test('configurations cannot overwrite another product and can only be changed in draft',async()=>{
  const other=mock({product:'three-question-quiz'});
  assert.equal((await owner(other,'','GET')).status,404);
  assert.equal((await owner(other,'','PUT')).status,409);
  const paid=mock({paid:true});
  assert.equal((await owner(paid,'','PUT')).status,409);
  assert.equal(paid.data.config.gender.result,'girl');
  const unconfigured=mock({paid:true,configured:false});
  assert.equal((await owner(unconfigured,'start','POST')).status,404);
  assert.equal(unconfigured.data.events.size,0);
});

test('paid audience gets shared live counts but no secret outcome while voting',async()=>{
  const m=mock({paid:true});
  const lobby=await guest(m,'gender-state',{voter:VOTERS[0]});
  assert.equal(lobby.status,200);
  const state=await lobby.json();
  assert.equal(state.phase,'voting');
  assert.deepEqual(state.counts,{boy:0,girl:0});
  assert.deepEqual(state.names,{boy:[],girl:[]});
  assert.deepEqual(state.remaining,{boy:0,girl:0});
  assert.equal(state.myVote,null);
  assert.equal(state.myName,null);
  assert.equal(state.result,undefined);
  assert.equal(state.message,undefined);
  assert.ok(!JSON.stringify(state).includes("Our happy news!"));
  assert.equal(lobby.headers.get('cache-control'),'private, no-store');
  const html=await guest(m);
  assert.equal(html.status,200);
  assert.match(await html.text(),/gender audience shell/);
});

test('one participant can vote only once; all guests see live totals',async()=>{
  const m=mock({paid:true});
  const one=await guest(m,'gender-vote',{method:'POST',voter:VOTERS[0],choice:'boy'});
  assert.equal(one.status,200);
  assert.equal((await one.json()).accepted,true);
  const duplicate=await guest(m,'gender-vote',{method:'POST',voter:VOTERS[0],choice:'girl'});
  const repeated=await duplicate.json();
  assert.equal(repeated.accepted,false);
  assert.equal(repeated.myVote,'boy');
  assert.equal(repeated.myName,'Test Guest');
  assert.deepEqual(repeated.counts,{boy:1,girl:0});
  assert.deepEqual(repeated.names,{boy:['Test Guest'],girl:[]});
  assert.equal((await guest(m,'gender-vote',{method:'POST',voter:VOTERS[1],choice:'girl'})).status,200);
  assert.equal((await guest(m,'gender-vote',{method:'POST',voter:VOTERS[2],choice:'boy'})).status,200);
  const shared=(await (await guest(m,'gender-state')).json());
  assert.deepEqual(shared.counts,{boy:2,girl:1});
  assert.deepEqual(shared.names,{boy:['Test Guest','Test Guest'],girl:['Test Guest']});
  assert.equal((await (await guest(m,'gender-state',{voter:VOTERS[1]})).json()).myVote,'girl');
  assert.equal(m.data.events.size,3);
});

test('only private creator can open reveal; voting closes at start; all share the same countdown',async()=>{
  const m=mock({paid:true});
  assert.equal((await owner(m,'start','POST',{},'wrong')).status,403);
  assert.equal(m.data.events.size,0);
  const first=await owner(m,'start','POST');
  assert.equal(first.status,200);
  const started=await first.json();
  assert.equal(started.alreadyStarted,false);
  assert.ok(started.revealAtMs-started.serverNowMs>4700);
  const replay=await owner(m,'start','POST');
  assert.equal((await replay.json()).alreadyStarted,true);
  assert.equal(m.data.events.size,1);
  const guestState=(await (await guest(m,'gender-state')).json());
  assert.equal(guestState.phase,'countdown');
  assert.equal(guestState.revealAtMs,started.revealAtMs);
  assert.equal(guestState.result,undefined,'gender remains secret through the countdown');
  assert.equal((await guest(m,'gender-vote',{method:'POST',voter:VOTERS[0],choice:'boy'})).status,409);
  assert.equal(m.data.events.size,1,'no votes after countdown begins');
  // Move the saved start time into the past rather than sleeping five seconds.
  const id='gender-'+ID+'-start';
  m.data.events.get(id).metadata_json=JSON.stringify({revealAtMs:Date.now()-1});
  const finished=await (await guest(m,'gender-state')).json();
  assert.equal(finished.phase,'revealed');
  assert.equal(finished.result,'girl');
  assert.equal(finished.message,'Our happy news!');
  assert.deepEqual(finished.counts,{boy:0,girl:0});
  assert.equal((await (await guest(m,'gender-state')).json()).result,'girl');
});

test('unpaid and unconfigured recipients never see voting lobby, counts or result',async()=>{
  for(const status of ['draft','confirmed','checkout','paid']){
    const m=mock({paid:false});
    m.data.row.status=status;
    m.data.row.paid_at=null;
    for(const action of ['','gender-state']){
      assert.equal((await guest(m,action)).status,404);
    }
    assert.equal((await guest(m,'gender-vote',{
      method:'POST',voter:VOTERS[0],choice:'girl'
    })).status,404);
    assert.equal(m.data.events.size,0);
    assert.equal(m.data.assetHits,0);
  }
  const unconfigured=mock({paid:true,configured:false});
  assert.equal(await guest(unconfigured),null,'other product routes can continue');
  assert.equal((await guest(unconfigured,'gender-state')).status,404);
  const other=mock({paid:true,product:'ticket-reveal'});
  assert.equal(await guest(other),null);
  assert.equal((await guest(other,'gender-state')).status,404);
});

test('reject cross-origin votes, malformed inputs and unauthorized attempts to start',async()=>{
  const m=mock({paid:true});
  assert.equal((await guest(m,'gender-vote',{method:'POST',voter:VOTERS[0],choice:'other'})).status,400);
  assert.equal((await guest(m,'gender-vote',{method:'POST',voter:'invalid',choice:'boy'})).status,400);
  assert.equal(m.data.events.size,0);
  const foreign=new Request(BASE+'/r/'+SLUG+'/gender-vote',{
    method:'POST',headers:{Origin:'https://foreign.example','Content-Type':'application/json'},
    body:JSON.stringify({voterId:VOTERS[0],choice:'boy'})
  });
  assert.equal((await genderAudienceResponse(foreign,m.env,{})).status,403);
  const wrongMethod=await guest(m,'gender-vote');
  assert.equal(wrongMethod.status,405);
});

test('Gender Reveal UI has creator, host, audience demo, live count, and protected timed animation',()=>{
  const creator=fs.readFileSync(path.join(root,'public/gender-create.html'),'utf8');
  const audience=fs.readFileSync(path.join(root,'public/gender-audience.html'),'utf8');
  const host=fs.readFileSync(path.join(root,'public/gender-host.html'),'utf8');
  const storefront=fs.readFileSync(path.join(root,'public/storefront.js'),'utf8');
  const review=fs.readFileSync(path.join(root,'public/reveal.html'),'utf8');
  const routes=fs.readFileSync(path.join(root,'src/index.js'),'utf8');
  assert.ok(creator.includes("body:JSON.stringify({result,theme})"));
  assert.ok(creator.includes("'/gender-create?edit='")||creator.includes("'/gender-create?edit'+"));
  assert.ok(audience.includes("const demo=location.pathname.replace(/\\/$/,'')==='/gender-demo'"));
  assert.ok(audience.includes('id="boys"'));
  assert.ok(audience.includes('id="girls"'));
  assert.ok(audience.includes('id="clock"'));
  assert.ok(audience.includes("data.result==='boy'"));
  assert.ok(audience.includes('gender-vote'));
  assert.ok(audience.includes('gender-state'));
  assert.ok(host.includes("'/gender/start'")||host.includes("+'/gender/start'"));
  assert.ok(host.includes("id=\"audienceLink\""));
  assert.ok(review.includes("'/gender-host?edit='"));
  assert.ok(review.includes("loadGenderReview()"));
  assert.ok(routes.includes('genderAudienceResponse(request,env,ctx)'));
  assert.ok(routes.includes('genderOwnerResponse(request,env,ctx,originalWorker)'));
  assert.ok(storefront.includes("href:'/gender-create'"));
  assert.ok(storefront.includes("href:'/gender-demo'"));
  for(const html of [creator,audience,host]){
    const scripts=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length,1);
    assert.doesNotThrow(()=>new Function(scripts[0][1]));
  }
});

test('staging gender pages route to existing static assets but reject methods beyond GET/HEAD',async()=>{
  const sent=[];
  const env={STAGING_DISABLE_CHECKOUT:'true',ASSETS:{async fetch(request){
    const url=new URL(request.url);
    sent.push(url.pathname);
    return new Response('<html>test page</html>',{headers:{'content-type':'text/html'}});
  }}};
  for(const url of ['/gender-create','/gender-host','/gender-demo']){
    assert.equal((await worker.fetch(new Request(BASE+url),env,{})).status,200);
  }
  assert.deepEqual(sent,['/gender-create','/gender-host','/gender-audience']);
  assert.equal((await worker.fetch(new Request(BASE+'/gender-demo',{method:'POST'}),env,{})).status,405);
});
