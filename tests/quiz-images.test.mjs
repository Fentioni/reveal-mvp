import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {quizQuestionImageResponse} from '../src/quiz-question-images.js';
import {quizRecipientResponse} from '../src/quiz.js';
import worker from '../src/index.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base='https://stage.example';
const mockFile=()=>{
  // One-pixel PNG signature is sufficient for the upload's strict MIME/header check.
  const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0,0]);
  return new File([bytes],'question.png',{type:'image/png'});
};
const sample={
  theme:'classic-gold',
  questions:[
    {prompt:'Where was our first holiday?',options:['Paris','Rome','Lisbon','Berlin'],correctIndex:1,hint:''},
    {prompt:'What is our favourite food?',options:['Noodles','Nachos','Pizza','Pasta'],correctIndex:2,hint:''},
    {prompt:'Where would we go next?',options:['Prague','Athens','Oslo','Venice'],correctIndex:3,hint:''}
  ]
};
function mock({status='draft',configured=true,token='secret'}={}){
  const assets=new Map(),blobs=new Map(),deletions=[];
  const info={assets,blobs,deletions,reads:0,writes:0,checks:0};
  const db={
    prepare(sql){
      return {args:[],bind(...args){this.args=args;return this},
        async first(){
          if(sql.includes('SELECT product_id FROM reveal_configurations')){
            return configured?{product_id:'three-question-quiz'}:null;
          }
          if(sql.includes('SELECT id,r2_key FROM reveal_assets')){
            const [id,kind]=this.args;
            assert.equal(id,'quiz-id');
            return assets.get(kind)||null;
          }
          if(sql.includes('SELECT id FROM reveal_assets')){
            return assets.has(this.args[1])?{id:assets.get(this.args[1]).id}:null;
          }
          if(sql.includes('SELECT r2_key FROM reveal_assets')){
            return assets.get(this.args[1])||null;
          }
          if(sql.includes('SELECT * FROM reveals WHERE public_slug=')){
            return {id:'quiz-id',public_slug:'quiz-slug',status:'paid',
              paid_at:'2026-11-12T20:00:00Z',recipient:'Chloe',sender:'Alex',
              event_name:'A surprise',ticket_url:null,image_key:null};
          }
          if(sql.includes('SELECT fields_json FROM reveal_configurations')){
            return configured?{fields_json:JSON.stringify({quiz:sample})}:null;
          }
          throw Error('Unknown DB FIRST query: '+sql);
        },
        async all(){
          if(sql.includes('FROM reveal_events'))return {results:[]};
          throw Error('Unknown DB ALL query: '+sql);
        },
        async run(){
          if(sql.startsWith('INSERT INTO reveal_assets')){
            const [id,revealId,key,kind]=this.args;
            assert.equal(revealId,'quiz-id');
            assets.set(kind,{id,r2_key:key});
            info.writes++;
            return {meta:{changes:1}};
          }
          if(sql.startsWith('UPDATE reveal_assets')){
            const [key,id,revealId,kind]=this.args;
            assert.equal(revealId,'quiz-id');
            if(assets.get(kind)?.id!==id) return {meta:{changes:0}};
            assets.set(kind,{id,r2_key:key});
            info.writes++;
            return {meta:{changes:1}};
          }
          if(sql.startsWith('DELETE FROM reveal_assets')){
            const [id,revealId,kind]=this.args;
            assert.equal(revealId,'quiz-id');
            if(assets.get(kind)?.id===id)assets.delete(kind);
            info.writes++;
            return {meta:{changes:1}};
          }
          throw Error('Unknown DB RUN query: '+sql);
        }
      };
    }
  };
  const env={
    DB:db,STAGING_DISABLE_CHECKOUT:'true',
    IMAGES:{
      async put(key,bytes,{httpMetadata}){
        blobs.set(key,{bytes,type:httpMetadata.contentType});
      },
      async get(key){
        info.reads++;
        const image=blobs.get(key);
        if(!image)return null;
        return {body:new Blob([image.bytes],{type:image.type}),
          writeHttpMetadata(h){h.set('Content-Type',image.type)}};
      },
      async delete(key){deletions.push(key);blobs.delete(key);}
    }
  };
  const originalWorker={
    async fetch(req){
      info.checks++;
      assert.equal(new URL(req.url).pathname,'/api/reveals/quiz-id');
      if(req.headers.get('X-Edit-Token')!==token)return new Response('Forbidden',{status:403});
      return new Response(JSON.stringify({success:true,reveal:{status}}),{
        headers:{'content-type':'application/json'}
      });
    }
  };
  return {env,originalWorker,info};
}
function ownerReq(n,method='GET',{file=mockFile(),token='secret',origin=null}={}){
  const headers={'X-Edit-Token':token};
  if(origin)headers.Origin=origin;
  const init={method,headers};
  if(method==='PUT'){
    const form=new FormData();form.append('image',file);init.body=form;
  }
  return new Request(base+'/api/reveals/quiz-id/quiz/question-image/'+n,init);
}
async function owner(m,n,method='GET',opts={}){
  return quizQuestionImageResponse(ownerReq(n,method,opts),m.env,{},m.originalWorker);
}
const recipientReq=(path,method='GET')=>new Request(base+'/r/quiz-slug'+path,{method});

test('each question has one independent optional image upload, private retrieval, replacement and removal',async()=>{
  const m=mock();
  const first=await owner(m,1,'PUT');
  assert.equal(first.status,200);
  assert.deepEqual(await first.json(),{success:true,hasImage:true});
  assert.equal(m.info.assets.size,1);
  const second=await owner(m,2,'PUT');
  assert.equal(second.status,200);
  const third=await owner(m,3,'PUT');
  assert.equal(third.status,200);
  assert.equal(m.info.assets.size,3);
  assert.equal(m.info.blobs.size,3);

  for(let i=1;i<=3;i++){
    const read=await owner(m,i);
    assert.equal(read.status,200);
    assert.equal(read.headers.get('cache-control'),'private, no-store');
    assert.equal(read.headers.get('content-type'),'image/png');
    assert.equal((await read.arrayBuffer()).byteLength,17);
    assert.equal((await owner(m,i,'HEAD')).body,null);
  }
  const previous=m.info.assets.get('quiz-question-2').r2_key;
  const replaced=await owner(m,2,'PUT');
  assert.equal(replaced.status,200);
  assert.equal(m.info.assets.size,3);
  assert.ok(!m.info.blobs.has(previous),'old file deleted only after replacement save');
  assert.equal((await owner(m,2)).status,200);

  const removed=await owner(m,1,'DELETE');
  assert.equal(removed.status,200);
  assert.equal((await owner(m,1)).status,404);
  assert.equal((await owner(m,2)).status,200);
  assert.equal((await owner(m,3)).status,200);
  assert.equal(m.info.assets.size,2);
  assert.equal((await owner(m,1,'DELETE')).status,200,'repeat delete is harmless');
});

test('question images require original owner token before any R2 or SQL metadata leaks',async()=>{
  const m=mock();
  assert.equal((await owner(m,1,'GET',{token:'wrong'})).status,403);
  assert.equal((await owner(m,1,'PUT',{token:'wrong'})).status,403);
  assert.equal((await owner(m,1,'DELETE',{token:'wrong'})).status,403);
  assert.equal(m.info.writes,0);
  assert.equal(m.info.reads,0);
  const other=mock({configured:false});
  assert.equal((await owner(other,1,'PUT')).status,404);
  assert.equal((await owner(other,1,'GET')).status,404);
});

test('question image changes are draft-only, reject unsafe upload types and foreign origins',async()=>{
  const paid=mock({status:'paid'});
  assert.equal((await owner(paid,1,'PUT')).status,409);
  assert.equal((await owner(paid,1,'DELETE')).status,409);
  assert.equal(paid.info.blobs.size,0);
  const m=mock();
  const wrongType=new File(['<script>alert(1)</script>'],'evil.svg',{type:'image/svg+xml'});
  assert.equal((await owner(m,1,'PUT',{file:wrongType})).status,400);
  const wrongMagic=new File(['not a png'],'faked.png',{type:'image/png'});
  assert.equal((await owner(m,1,'PUT',{file:wrongMagic})).status,400);
  const tooBig=new File([new Uint8Array(10*1024*1024+1)],'huge.png',{type:'image/png'});
  assert.equal((await owner(m,1,'PUT',{file:tooBig})).status,400);
  assert.equal((await owner(m,1,'PUT',{origin:'https://foreign.example'})).status,403);
  assert.equal(m.info.blobs.size,0);
});

test('paid recipient sees only current question image, never later question media',async()=>{
  const m=mock();
  for(let i=1;i<=3;i++) assert.equal((await owner(m,i,'PUT')).status,200);
  const firstState=await quizRecipientResponse(recipientReq('/quiz-state'),m.env,{});
  const data=await firstState.json();
  assert.equal(data.question.hasImage,true);
  assert.equal(data.question.number,1);
  assert.equal(data.question.correctIndex,undefined);
  const first=await quizRecipientResponse(recipientReq('/quiz-question-image/1'),m.env,{});
  assert.equal(first.status,200);
  assert.equal(first.headers.get('cache-control'),'private, no-store');
  for(let i=2;i<=3;i++){
    assert.equal((await quizRecipientResponse(recipientReq('/quiz-question-image/'+i),m.env,{})).status,404);
  }
  // No image in a missing/unpaid or incomplete quiz can be retrieved.
  m.env.STAGING_DISABLE_CHECKOUT='false';
  assert.equal(await quizRecipientResponse(recipientReq('/quiz-question-image/1'),m.env,{}),null);
});

test('creator, purchaser review, paid recipient and worker include per-question image flow',()=>{
  const creator=fs.readFileSync(path.join(root,'public/quiz-create.html'),'utf8');
  const review=fs.readFileSync(path.join(root,'public/reveal.html'),'utf8');
  const recipient=fs.readFileSync(path.join(root,'public/quiz-recipient.html'),'utf8');
  const routes=fs.readFileSync(path.join(root,'src/index.js'),'utf8');
  assert.ok(creator.includes("for(let q=0;q<3;q++)"));
  assert.ok(creator.includes("id:'questionImage'+q"));
  assert.ok(creator.includes('Add an image to question '));
  assert.ok(creator.includes('previewQuestionImage'));
  assert.ok(creator.includes("await syncQuestionImages()"));
  assert.ok(creator.includes("+'/quiz/question-image/'+(q+1)"));
  assert.ok(creator.includes('setQuestionImage(q,blob)'));
  assert.ok(review.includes("+'/quiz/question-image/'+(index+1)"));
  assert.ok(review.includes('Uploaded image for question '));
  assert.ok(recipient.includes("+'/quiz-question-image/'+activeQuestion"));
  assert.ok(recipient.includes("if(state.question.hasImage&&!demo)"));
  assert.ok(routes.includes("quizQuestionImageResponse(request,env,ctx,originalWorker)"));
  assert.ok(routes.includes("quiz-question-image\\/[1-3]"));
  assert.equal((creator.match(/id="image" type="file"/g)||[]).length,1,
    'final surprise still has one upload, separate from the question images');
});
