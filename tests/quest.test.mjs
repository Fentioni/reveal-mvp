import test from 'node:test';
import assert from 'node:assert/strict';
import quest from '../src/quest-router.js';

const ROOT='https://reveal.example';
const cfg={
  story:'missing-itinerary',theme:'travel-adventure',mode:'ready',
  clues:[
    {title:'The Mysterious Letter',kind:'choice',question:'Find north',options:['Map','A compass','Telescope'],answer:'A compass',hints:['north','needle']},
    {title:'The Locked Suitcase',kind:'lock',question:'Open case',options:[],answer:'427',hints:['tags','three digits']},
    {title:'The Passport Mystery',kind:'order',question:'Sort stamps',options:['Lisbon','Rome','Barcelona'],answer:'Rome|Barcelona|Lisbon',hints:['date','order']},
    {title:'The Secret Map',kind:'order',question:'Choose route',options:['Forest','Peak','Lighthouse'],answer:'Lighthouse|Forest|Peak',hints:['sea','forest']},
    {title:'The Missing Itinerary',kind:'order',question:'Complete ticket',options:['Wing','Seal','Route'],answer:'Route|Wing|Seal',hints:['start','middle']}
  ]
};
class MockDB{
  constructor(paid=true){this.row={id:'id01',public_slug:'test123',status:paid?'paid':'confirmed',paid_at:paid?'2026-11-14T08:00:00Z':null,event_name:'SECRET SURPRISE',recipient:'Chloe',sender:'Someone',personal_message:'Surprise!',event_date:'',event_time:'',venue:'',admit:'',ticket_url:'',image_key:null};this.sessions=new Map();}
  prepare(sql){
    let args=[];
    const db=this;
    return{
      bind(...xs){args=xs;return this;},
      async first(){
        if(/FROM reveals WHERE public_slug/.test(sql))return args[0]===db.row.public_slug?db.row:null;
        if(/FROM quest_configs WHERE reveal_id/.test(sql))return args[0]===db.row.id?{config_json:JSON.stringify(cfg)}:null;
        if(/FROM quest_sessions WHERE session_hash/.test(sql))return db.sessions.get(args[0])||null;
        return null;
      },
      async run(){
        if(/INSERT INTO quest_sessions/.test(sql)){db.sessions.set(args[0],{session_hash:args[0],reveal_id:args[1],step:0,created_at:args[2],updated_at:args[3],attempts:0,last_attempt_at:null,completed_at:null});return {meta:{changes:1}};}
        if(/UPDATE quest_sessions SET step/.test(sql)){
          const row=db.sessions.get(args[3]);if(!row||row.step!==args[4])return {meta:{changes:0}};
          row.step=args[0];row.completed_at=args[1];row.updated_at=args[2];row.attempts=0;return {meta:{changes:1}};
        }
        if(/UPDATE quest_sessions SET attempts/.test(sql)){const row=db.sessions.get(args[3]);row.attempts=args[0];row.last_attempt_at=args[1];row.updated_at=args[2];return {meta:{changes:1}};}
        return {meta:{changes:1}};
      }
    };
  }
}
function env(db){return {DB:db,ASSETS:{fetch:async()=>new Response('<main>QUEST TEMPLATE</main>',{headers:{'content-type':'text/html'}})}};}
const answer=(step,a,cookie)=>new Request(ROOT+'/api/quest/test123/answer',{method:'POST',headers:{Origin:ROOT,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({step,answer:a})});
test('unpaid Quest cannot get session state',async()=>{
 const r=await quest.fetch(new Request(ROOT+'/api/quest/test123/state'),env(new MockDB(false)),{});
 assert.equal(r.status,404);
});
test('paid Quest HTML contains no purchaser surprise',async()=>{
 const r=await quest.fetch(new Request(ROOT+'/r/test123'),env(new MockDB()),{});
 assert.equal(r.status,200);
 assert.doesNotMatch(await r.text(),/SECRET SURPRISE/);
});
test('session, wrong answer, correct answer and final gating',async()=>{
 const e=env(new MockDB());
 const state=await quest.fetch(new Request(ROOT+'/api/quest/test123/state'),e,{});
 assert.equal(state.status,200);
 const cookie=state.headers.get('set-cookie').split(';')[0];
 const first=await state.json();
 assert.equal(first.step,0);
 assert.equal(JSON.stringify(first).includes('SECRET SURPRISE'),false);
 const wrong=await quest.fetch(answer(0,'map',cookie),e,{});
 assert.equal((await wrong.json()).correct,false);
 const correct=await quest.fetch(answer(0,'A compass',cookie),e,{});
 assert.equal((await correct.json()).step,1);
 let image=await quest.fetch(new Request(ROOT+'/r/test123/image',{headers:{Cookie:cookie}}),e,{});
 assert.equal(image.status,404);
 const answers=['427','Rome|Barcelona|Lisbon','Lighthouse|Forest|Peak','Route|Wing|Seal'];
 for(let i=0;i<4;i++){
   const r=await quest.fetch(answer(i+1,answers[i],cookie),e,{});
   assert.equal(r.status,200);
   const data=await r.json();
   assert.equal(data.correct,true);
   assert.equal(data.step,i+2);
 }
 const final=await quest.fetch(new Request(ROOT+'/api/quest/test123/state',{headers:{Cookie:cookie}}),e,{});
 const revealed=await final.json();
 assert.equal(revealed.completed,true);
 assert.equal(revealed.final.title,'SECRET SURPRISE');
});
