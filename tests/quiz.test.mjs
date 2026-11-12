import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateQuizConfig,quizOwnerResponse,quizRecipientResponse} from '../src/quiz.js';
import worker from '../src/index.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const url='https://stage.example';
const answers=(route,method='GET',data)=>new Request(url+route,{
  method,headers:method==='POST'?{'Content-Type':'application/json'}:{},
  ...(data===undefined?{}:{body:JSON.stringify(data)})
});
const quiz={
  theme:'travel-adventure',
  questions:[
    {prompt:'Where was our first holiday?',options:['Paris','Rome','Lisbon','Berlin'],correctIndex:1,hint:'Think pasta.'},
    {prompt:'Which food do we always choose?',options:['Noodles','Nachos','Pizza','Pasta'],correctIndex:2,hint:''},
    {prompt:'Which city is our next adventure?',options:['Prague','Athens','Oslo','Venice'],correctIndex:3,hint:'Canals!'}
  ]
};
const paid={
  id:'my-quiz-id',public_slug:'quiz-link',status:'paid',paid_at:'2026-11-12',
  recipient:'Chloe',sender:'Alex',event_name:"You're going to Rome!",
  event_date:'2027-05-21',event_time:null,venue:'Rome, Italy',admit:'Chloe + 1',
  personal_message:'Pack your bags!',ticket_url:'https://example.invalid/booking/topsecret',
  image_key:'private-r2-object-key'
};
function mock(row=paid,initial=quiz){
  const data={row,events:new Set(),fields:initial?{quiz:initial}:null,product:initial?'three-question-quiz':null,
    ownerHits:0,imageHits:0,htmlHits:0,changes:0};
  const db={prepare(sql){
    return {args:[],bind(...args){this.args=args;return this},
      async first(){
        if(sql.includes('FROM reveals WHERE public_slug='))return data.row;
        if(sql.includes('FROM reveal_configurations WHERE reveal_id=? AND product_id=?')){
          return data.product==='three-question-quiz'?{fields_json:JSON.stringify(data.fields)}:null;
        }
        if(sql.includes('FROM reveal_configurations WHERE reveal_id=?')){
          return data.fields?{product_id:data.product,fields_json:JSON.stringify(data.fields)}:null;
        }
        return null;
      },
      async all(){
        if(sql.includes('FROM reveal_events')){
          return {results:this.args.slice(1).filter(id=>data.events.has(id)).map(id=>({id}))};
        }
        return {results:[]};
      },
      async run(){
        if(sql.includes('INSERT INTO reveal_configurations')){
          const [id,product,fieldJson]=this.args;
          if(data.product && data.product!==product)return {meta:{changes:0}};
          assert.equal(id,'my-quiz-id');
          data.fields=JSON.parse(fieldJson);data.product=product;data.changes++;
          return {meta:{changes:1}};
        }
        if(sql.includes('INSERT OR IGNORE INTO reveal_events')){
          const [id,revealId,eventType]=this.args;
          assert.equal(revealId,'my-quiz-id');
          assert.match(eventType,/^(quiz-step-[123]|quiz-wrong-answer)$/);
          const changes=data.events.has(id)?0:1;
          data.events.add(id);return {meta:{changes}};
        }
        throw Error('Unexpected query: '+sql);
      }
    };
  }};
  const env={DB:db,STAGING_DISABLE_CHECKOUT:'true',
    IMAGES:{async get(key){
      data.imageHits++;
      assert.equal(key,'private-r2-object-key');
      return {body:new Blob(['image'],{type:'image/png'}),
        writeHttpMetadata(headers){headers.set('Content-Type','image/png')}};
    }},
    ASSETS:{async fetch(request){
      data.htmlHits++;
      assert.equal(new URL(request.url).pathname,'/quiz-recipient');
      return new Response('<!doctype html>Quiz recipient static shell',{
        headers:{'content-type':'text/html'}
      });
    }}
  };
  const originalWorker={async fetch(request){
    data.ownerHits++;
    assert.equal(new URL(request.url).pathname,'/api/reveals/my-quiz-id');
    if(request.headers.get('X-Edit-Token')!=='private-token'){
      return new Response(JSON.stringify({success:false,error:'Forbidden'}),{status:403,
        headers:{'content-type':'application/json'}});
    }
    return new Response(JSON.stringify({success:true,reveal:{
      id:'my-quiz-id',status:row.status,revision:1
    }}),{headers:{'content-type':'application/json'}});
  }};
  return {env,data,originalWorker};
}
const ownerRequest=(method='GET',obj=quiz,token='private-token')=>new Request(url+'/api/reveals/my-quiz-id/quiz',{
  method,headers:{'X-Edit-Token':token,...(method==='PUT'?{'Content-Type':'application/json'}:{})},
  ...(method==='PUT'?{body:JSON.stringify(obj)}:{})
});
const publicRequest=(suffix='',method='GET',data)=>answers('/r/quiz-link'+suffix,method,data);

test('quiz configuration requires exactly three questions, exactly four distinct answers and a correct index',()=>{
  assert.deepEqual(validateQuizConfig(quiz).quiz.questions,quiz.questions);
  for(const invalid of [
    {...quiz,questions:quiz.questions.slice(0,2)},
    {...quiz,questions:quiz.questions.concat(quiz.questions[0])},
    {...quiz,questions:[{...quiz.questions[0],options:['one','two','three']},...quiz.questions.slice(1)]},
    {...quiz,questions:[{...quiz.questions[0],options:['same','Same','third','fourth']},...quiz.questions.slice(1)]},
    {...quiz,questions:[{...quiz.questions[0],correctIndex:4},...quiz.questions.slice(1)]},
    {...quiz,questions:[{...quiz.questions[0],correctIndex:-1},...quiz.questions.slice(1)]},
    {...quiz,theme:'scripted'},
  ]) assert.ok(validateQuizConfig(invalid).error);
});

test('owner must present original private hashed edit-token authorization before quiz keys can be fetched or saved',async()=>{
  const {env,data,originalWorker}=mock();
  for(const method of ['GET','PUT']){
    const denied=await quizOwnerResponse(ownerRequest(method,quiz,'incorrect'),env,{},originalWorker);
    assert.equal(denied.status,403);
  }
  assert.equal(data.changes,0);
  assert.equal(data.ownerHits,2);
  const owner=await quizOwnerResponse(ownerRequest(),env,{},originalWorker);
  assert.equal(owner.status,200);
  assert.deepEqual((await owner.json()).quiz.questions,quiz.questions);
});

test('quiz drafts use existing D1 reveal configurations and prevent changing other products',async()=>{
  const m=mock({...paid,status:'draft',paid_at:null},null);
  const saved=await quizOwnerResponse(ownerRequest('PUT'),m.env,{},m.originalWorker);
  assert.equal(saved.status,200);
  assert.equal(m.data.product,'three-question-quiz');
  const restored=await quizOwnerResponse(ownerRequest(),m.env,{},m.originalWorker);
  assert.deepEqual((await restored.json()).quiz,validateQuizConfig(quiz).quiz);
  assert.equal(m.data.changes,1);

  const paidQuiz=mock();
  const blocked=await quizOwnerResponse(ownerRequest('PUT'),paidQuiz.env,{},paidQuiz.originalWorker);
  assert.equal(blocked.status,409);
  const other=mock({...paid,status:'draft',paid_at:null},quiz);
  other.data.product='ticket-reveal';
  assert.equal((await quizOwnerResponse(ownerRequest('PUT'),other.env,{},other.originalWorker)).status,409);
});

test('no answer keys or final reveal details appear to unsolved paid recipients',async()=>{
  const m=mock();
  const state=await quizRecipientResponse(publicRequest('/quiz-state'),m.env,{});
  assert.equal(state.status,200);
  assert.equal(state.headers.get('cache-control'),'private, no-store');
  const body=await state.json();
  assert.deepEqual(body.question,{number:1,prompt:quiz.questions[0].prompt,
    options:quiz.questions[0].options,wrongOptions:[],wrongAttempts:0});
  assert.equal(body.question.hint,undefined,'the hint is hidden until the second incorrect answer');
  assert.equal(body.completed,0);
  assert.equal(body.unlocked,false);
  assert.equal(body.reveal,undefined);
  assert.ok(!JSON.stringify(body).includes('correctIndex'));
  assert.ok(!JSON.stringify(body).includes('topsecret'));
  assert.equal(m.data.imageHits,0);
  const photo=await quizRecipientResponse(publicRequest('/quiz-image'),m.env,{});
  assert.equal(photo.status,404);
  const legacyPhoto=await quizRecipientResponse(publicRequest('/image'),m.env,{});
  assert.equal(legacyPhoto.status,404,'original paid image URL must not bypass quiz');
});

test('wrong options cannot progress; only the active correct answer advances',async()=>{
  const m=mock();
  const wrong=await quizRecipientResponse(publicRequest('/quiz-answer','POST',{
    questionIndex:0,optionIndex:0
  }),m.env,{});
  assert.equal(wrong.status,200);
  const miss=await wrong.json();
  assert.equal(miss.correct,false);
  assert.equal(miss.completed,0);
  assert.equal(m.data.events.size,1,'the first wrong choice must remain recorded');
  assert.deepEqual(miss.question.wrongOptions,[0]);
  assert.equal(miss.question.wrongAttempts,1);
  assert.equal(miss.question.hint,undefined);
  const jump=await quizRecipientResponse(publicRequest('/quiz-answer','POST',{
    questionIndex:2,optionIndex:3
  }),m.env,{});
  assert.equal(jump.status,400);

  for(let i=0;i<3;i++){
    const good=await quizRecipientResponse(publicRequest('/quiz-answer','POST',{
      questionIndex:i,optionIndex:quiz.questions[i].correctIndex
    }),m.env,{});
    assert.equal(good.status,200);
    const body=await good.json();
    assert.equal(body.correct,true);
    assert.equal(body.completed,i+1);
    if(i<2){
      assert.equal(body.unlocked,false);
      assert.equal(body.reveal,undefined);
      assert.equal(body.question.number,i+2);
    }else{
      assert.equal(body.unlocked,true);
      assert.equal(body.reveal.eventName,"You're going to Rome!");
      assert.equal(body.reveal.ticketUrl,'https://example.invalid/booking/topsecret');
      assert.equal(body.reveal.hasEventImage,true);
    }
  }
  assert.equal(m.data.events.size,3);
  const revisit=await quizRecipientResponse(publicRequest('/quiz-state'),m.env,{});
  const returned=await revisit.json();
  assert.equal(returned.unlocked,true);
  assert.equal(returned.reveal.personalMessage,'Pack your bags!');
  const again=await quizRecipientResponse(publicRequest('/quiz-answer','POST',{
    questionIndex:0,optionIndex:0
  }),m.env,{});
  assert.equal((await again.json()).completed,3,'completion remains single-use and permanent');
  const picture=await quizRecipientResponse(publicRequest('/quiz-image'),m.env,{});
  assert.equal(picture.status,200);
  assert.equal(picture.headers.get('content-type'),'image/png');
  assert.equal(picture.headers.get('cache-control'),'private, no-store');
  assert.equal(m.data.imageHits,1);
});


test('three distinct wrong answers grey out permanently and leave one correct choice to select',async()=>{
  const m=mock();
  const picks=[0,2,3]; // Correct answer for question 1 is index 1.
  for(let attempt=1;attempt<=3;attempt++){
    const reply=await quizRecipientResponse(publicRequest('/quiz-answer','POST',{
      questionIndex:0,optionIndex:picks[attempt-1]
    }),m.env,{});
    assert.equal(reply.status,200);
    const body=await reply.json();
    assert.equal(body.correct,false);
    assert.equal(body.completed,0,'wrong guesses cannot advance');
    assert.equal(body.unlocked,false);
    assert.equal(body.question.wrongAttempts,attempt);
    assert.deepEqual(body.question.wrongOptions,picks.slice(0,attempt).sort((a,b)=>a-b));
    if(attempt<2)assert.equal(body.question.hint,undefined);
    else assert.equal(body.question.hint,'Think pasta.');
    // A reload must preserve eliminated answers and the newly unlocked hint.
    const refreshed=await quizRecipientResponse(publicRequest('/quiz-state'),m.env,{});
    assert.deepEqual((await refreshed.json()).question,body.question);
  }
  assert.equal(m.data.events.size,3);
  const stale=await quizRecipientResponse(publicRequest('/quiz-answer','POST',{
    questionIndex:0,optionIndex:0
  }),m.env,{});
  assert.equal(stale.status,409,'a greyed-out choice cannot be submitted again');
  assert.equal(m.data.events.size,3,'replaying invalid answers cannot add attempts');
  const last=await quizRecipientResponse(publicRequest('/quiz-answer','POST',{
    questionIndex:0,optionIndex:1
  }),m.env,{});
  assert.equal(last.status,200);
  const next=await last.json();
  assert.equal(next.correct,true);
  assert.equal(next.completed,1);
  assert.equal(next.question.number,2);
  assert.deepEqual(next.question.wrongOptions,[]);
  assert.equal(next.question.hint,undefined,'hint counter resets for each question');
  assert.equal(m.data.events.size,4,'three failures and one correct completion');
  const again=await quizRecipientResponse(publicRequest('/quiz-state'),m.env,{});
  assert.equal((await again.json()).question.number,2);
});

test('an unanswered optional hint uses a neutral fallback after the second wrong answer',async()=>{
  const m=mock();
  for(const optionIndex of [0,1]){
    const reply=await quizRecipientResponse(publicRequest('/quiz-answer','POST',{
      questionIndex:1,optionIndex
    }),m.env,{});
    assert.equal(reply.status,400,'cannot skip to question two');
  }
  const passFirst=await quizRecipientResponse(publicRequest('/quiz-answer','POST',{
    questionIndex:0,optionIndex:quiz.questions[0].correctIndex
  }),m.env,{});
  assert.equal(passFirst.status,200);
  for(const optionIndex of [0,1]){
    const answer=await quizRecipientResponse(publicRequest('/quiz-answer','POST',{
      questionIndex:1,optionIndex
    }),m.env,{});
    const state=await answer.json();
    assert.equal(state.correct,false);
    if(optionIndex===0)assert.equal(state.question.hint,undefined);
    else assert.equal(state.question.hint,'Look closely at the answers that are still available.');
  }
});

test('recipient choices are visually greyed and cannot be selected after wrong attempts',()=>{
  const html=fs.readFileSync(path.join(root,'public/quiz-recipient.html'),'utf8');
  assert.ok(html.includes('.choice.ruled-out,.choice.ruled-out:disabled'));
  assert.ok(html.includes('button.disabled=ruledOut'));
  assert.ok(html.includes('wrongOptions.includes(index)'));
  assert.ok(html.includes("const showHint=attempts>=2"));
  assert.ok(html.includes("$('hintText').hidden=!showHint"));
  assert.ok(html.includes("Three wrong answers ruled out. Tap the remaining choice to continue."));
  assert.ok(html.includes('const demoWrong=Array.from({length:3},()=>new Set())'));
  assert.ok(html.includes('demoWrong[demoStep].add(optionIndex)'));
  assert.ok(!html.includes('id="hintButton"'));
});

test('recipient quiz remains unavailable until both status paid and paid_at are verified',async()=>{
  for(const state of ['draft','confirmed','checkout','failed','paid']){
    const m=mock({...paid,status:state,paid_at:null});
    for(const suffix of ['', '/quiz-state','/quiz-image','/image']){
      const denied=await quizRecipientResponse(publicRequest(suffix),m.env,{});
      assert.equal(denied.status,404,state+suffix);
    }
    assert.equal((await quizRecipientResponse(publicRequest('/quiz-answer','POST',{
      questionIndex:0,optionIndex:1
    }),m.env,{})).status,404);
    assert.equal(m.data.events.size,0);
    assert.equal(m.data.htmlHits,0);
    assert.equal(m.data.imageHits,0);
  }
});

test('non-quiz paid reveals retain existing scratch and legacy routes',async()=>{
  const m=mock(paid,null);
  assert.equal(await quizRecipientResponse(publicRequest(),m.env,{}),null);
  assert.equal(await quizRecipientResponse(publicRequest('/image'),m.env,{}),null);
  assert.equal((await quizRecipientResponse(publicRequest('/quiz-state'),m.env,{})).status,404);
});

test('a paid quiz is served only as a static HTML shell, with data requested separately',async()=>{
  const m=mock();
  const response=await quizRecipientResponse(publicRequest(),m.env,{});
  assert.equal(response.status,200);
  assert.match(await response.text(),/Quiz recipient static shell/);
  assert.equal(m.data.htmlHits,1);
  assert.equal(m.data.ownerHits,0);
  const disabled=mock();
  disabled.env.STAGING_DISABLE_CHECKOUT='false';
  assert.equal(await quizRecipientResponse(publicRequest(),disabled.env,{}),null);
});

test('quiz creator and recipient pages are mobile-first, four-choice and do not disclose real answers',()=>{
  const creator=fs.readFileSync(path.join(root,'public/quiz-create.html'),'utf8');
  const recipient=fs.readFileSync(path.join(root,'public/quiz-recipient.html'),'utf8');
  const review=fs.readFileSync(path.join(root,'public/reveal.html'),'utf8');
  const storefront=fs.readFileSync(path.join(root,'public/storefront.js'),'utf8');
  assert.ok(creator.includes('for(let q=0;q<3;q++)'));
  assert.ok(creator.includes('for(let a=0;a<4;a++)'));
  assert.ok(creator.includes("correctIndex:"));
  assert.ok(creator.includes('id="preview"'));
  assert.equal((creator.match(/id="image" type="file"/g)||[]).length,1);
  assert.ok(creator.includes('"/reveal?id="') || creator.includes("'/reveal?id='"));
  assert.ok(creator.includes('method:id?'));
  assert.ok(creator.includes("'/api/reveals/'+encodeURIComponent(id)+'/quiz'"));
  assert.ok(recipient.includes('recipientCardModel(reveal)'));
  assert.ok(recipient.includes('questionIndex:latestState.completed,optionIndex'));
  assert.ok(recipient.includes("'/quiz-image'") || recipient.includes("+'/quiz-image'"));
  assert.ok(recipient.includes('Not quite! Try another answer.'));
  assert.ok(recipient.includes("if(demoStep===3)"));
  assert.ok(review.includes('loadQuizReview()'));
  assert.ok(review.includes("'/quiz-create?edit='"));
  assert.ok(review.includes('quizReviewQuestions'));
  assert.ok(storefront.includes("href:'/quiz-create'"));
  assert.ok(storefront.includes("href:'/quiz-demo'"));
  for(const html of [creator,recipient]){
    const scripts=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length,1);
    const clean=scripts[0][1].replace(/^[ \t]*import[ \t]+\{[^}]*\}[ \t]+from[ \t]+['"][^'"]+['"];[ \t]*$/gm,'');
    assert.doesNotThrow(()=>new Function(clean));
  }
});


test('staging-only quiz creator and fictional recipient demonstration have working asset routes',async()=>{
  const mapped=[];
  const env={STAGING_DISABLE_CHECKOUT:'true',ASSETS:{
    async fetch(request){
      const destination=new URL(request.url).pathname;
      mapped.push(destination);
      return new Response('<!doctype html>quiz asset',{headers:{'content-type':'text/html'}});
    }
  }};
  const creator=await worker.fetch(answers('/quiz-create'),env,{});
  const demo=await worker.fetch(answers('/quiz-demo'),env,{});
  assert.equal(creator.status,200);
  assert.equal(demo.status,200);
  assert.deepEqual(mapped,['/quiz-create','/quiz-recipient']);
  const blocked=await worker.fetch(answers('/quiz-demo','POST'),env,{});
  assert.equal(blocked.status,405);
});

test('quiz authoring blocks foreign-origin changes and rejects malformed content and paid edits',async()=>{
  const m=mock({...paid,status:'draft',paid_at:null},null);
  const foreign=new Request(url+'/api/reveals/my-quiz-id/quiz',{
    method:'PUT',headers:{'X-Edit-Token':'private-token',
      'Content-Type':'application/json','Origin':'https://another.example'},
    body:JSON.stringify(quiz)
  });
  assert.equal((await quizOwnerResponse(foreign,m.env,{},m.originalWorker)).status,403);
  assert.equal(m.data.changes,0);
  const malformed=new Request(url+'/api/reveals/my-quiz-id/quiz',{
    method:'PUT',headers:{'X-Edit-Token':'private-token','Content-Type':'application/json'},
    body:'{not JSON}'
  });
  assert.equal((await quizOwnerResponse(malformed,m.env,{},m.originalWorker)).status,400);
  assert.equal(m.data.changes,0);
});

test('quiz answers require the current step and same-origin JSON requests',async()=>{
  const m=mock();
  const badOrigin=new Request(url+'/r/quiz-link/quiz-answer',{
    method:'POST',headers:{'Content-Type':'application/json','Origin':'https://another.example'},
    body:JSON.stringify({questionIndex:0,optionIndex:1})
  });
  assert.equal((await quizRecipientResponse(badOrigin,m.env,{})).status,403);
  const invalidIndex=await quizRecipientResponse(publicRequest('/quiz-answer','POST',{
    questionIndex:0,optionIndex:4
  }),m.env,{});
  assert.equal(invalidIndex.status,400);
  assert.equal(m.data.events.size,0);
});


test('each quiz theme button shows its own full colour fill and accessible chosen state',()=>{
  const html=fs.readFileSync(path.join(root,'public/quiz-create.html'),'utf8');
  const themeNames=['classic-gold','travel-adventure','romantic','birthday-celebration'];
  assert.equal((html.match(/class="theme-choice" data-theme=/g)||[]).length,4);
  for(const theme of themeNames){
    assert.ok(html.includes('.theme-choice[data-theme="'+theme+'"]{'),theme+' has themed filled background');
    assert.ok(html.includes('data-theme="'+theme+'" aria-pressed='),theme+' remains selectable');
    const anchor='.theme-choice[data-theme="'+theme+'"]{';
    const pos=html.indexOf(anchor);
    const section=html.slice(pos+anchor.length,html.indexOf('}',pos));
    assert.ok(section.includes('background:'),theme+' has actual gradient fill');
  }
  assert.ok(html.includes('class="theme-visual-icon" aria-hidden="true"'));
  assert.ok(html.includes('class="theme-description"'));
  assert.ok(html.includes('.theme-choice[aria-pressed="true"]'));
  assert.ok(html.includes('button.setAttribute(\'aria-pressed\',String(button.dataset.theme===theme))'));
  assert.ok(html.includes("$('preview').dataset.theme=theme"));
});


test('quiz creator optional fields stay inside their container at narrow and iOS viewport sizes',()=>{
  const html=fs.readFileSync(path.join(root,'public/quiz-create.html'),'utf8');
  assert.ok(html.includes('.small-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'));
  assert.ok(html.includes('.field{margin:0 0 18px;min-width:0;max-width:100%}'));
  assert.ok(html.includes('#quizForm input:not([type="radio"]),#quizForm textarea,#quizForm select'));
  assert.ok(html.includes('display:block;width:100%;min-width:0;max-width:100%'));
  assert.equal((html.match(/class="native-picker-shell"/g)||[]).length,2,
    'date and time each use a constrained visual shell');
  assert.ok(html.includes('inline-size:100%;min-inline-size:0;max-inline-size:100%'));
  assert.ok(html.includes('min-height:47px;padding:10px 12px;overflow:hidden'));
  assert.ok(html.includes('#quizForm .native-picker-shell > input[type="date"]'));
  assert.ok(html.includes('#quizForm .native-picker-shell > input[type="time"]'));
  assert.ok(html.includes('position:absolute;z-index:1;inset:0;display:block'));
  assert.ok(html.includes('border:0;opacity:0;cursor:pointer;font-size:16px'));
  assert.ok(html.includes('id="eventDateDisplay"'));
  assert.ok(html.includes('id="eventTimeDisplay"'));
  assert.ok(html.includes('function updatePickerLabels()'));
  assert.ok(html.includes("control.addEventListener('change',updatePickerLabels)"));
  assert.ok(html.includes('control.showPicker()'));
  assert.ok(html.includes('@media(max-width:650px){.small-grid{grid-template-columns:minmax(0,1fr)}}'));
  for(const field of ['eventDate','eventTime','venue','admit','personalMessage','ticketUrl']){
    assert.ok(html.includes('id="'+field+'"'),field+' remains available');
  }
});
