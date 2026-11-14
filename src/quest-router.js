// Reveal Quest extension: payment-gated, server-validated sequential adventure.
// Imports the existing Stage 3 Worker without modifying its payment/webhook code.
import legacy from './index.js';

const STEPS = [
  { title:'The Mysterious Letter', kind:'choice', question:'I travel without moving and always point north. Which object am I?', options:['A map','A compass','A telescope'], answer:'A compass', hints:['Look for the object that helps travellers find north.','It has a magnetic needle.'] },
  { title:'The Locked Suitcase', kind:'lock', question:'The letter reveals the order of three symbols. Use the tags to unlock the suitcase.', options:[], answer:'427', hints:['Inspect the luggage tags, not the travel stickers.','The compass tag is 4, the mountain tag is 2 and the star tag is 7.'] },
  { title:'The Passport Mystery', kind:'order', question:'Arrange the three stamps in chronological order, earliest first.', options:['Lisbon · 19 Apr','Barcelona · 12 Apr','Rome · 08 Apr'], answer:'Rome · 08 Apr|Barcelona · 12 Apr|Lisbon · 19 Apr', hints:['The dates are more important than the cities.','Start with 08 April, followed by 12 April.'] },
  { title:'The Secret Map', kind:'order', question:'Follow the clues and visit the landmarks in the correct sequence.', options:['Mountain peak','Lighthouse','Forest'], answer:'Lighthouse|Forest|Mountain peak', hints:['The sea is where your route begins.','Start at the lighthouse, then visit the forest.'] },
  { title:'The Missing Itinerary', kind:'order', question:'Reassemble the recovered ticket fragments in their proper order.', options:['Gold seal','Flight symbol','Route line'], answer:'Route line|Flight symbol|Gold seal', hints:['The route is the beginning of this ticket.','The flight symbol sits between the route and the gold seal.'] }
];

const res = (data, status=200, cookie='') => new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer', ...(cookie?{'set-cookie':cookie}:{})}
});
const txt = (x,max=150) => typeof x==='string' ? x.trim().slice(0,max) : '';
const safe = (x,max=150) => typeof x==='string' && x.trim().length>0 && x.trim().length<=max;
const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const token = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const normalize = (v) => String(v||'').trim().toLocaleLowerCase('en-GB').replace(/\s+/g,' ');
function originOK(req) {let origin=req.headers.get('Origin');return !origin||origin===new URL(req.url).origin;}
function configCheck(config) {
  if (!config || config.story!=='missing-itinerary' || !['ready','adaptable','custom'].includes(config.mode) || !Array.isArray(config.clues) || config.clues.length!==5) return null;
  const clues = [];
  for(let i=0;i<5;i++) {
    let c=config.clues[i], base=STEPS[i];
    if(!c || typeof c!=='object')return null;
    const question=txt(c.question,260)||base.question;
    const answer=txt(c.answer,130)||base.answer;
    const hint1=txt(c.hint1,220)||base.hints[0];
    const hint2=txt(c.hint2,220)||base.hints[1];
    const options=Array.isArray(c.options)?c.options.map(x=>txt(x,60)):[...base.options];
    if(!question||!answer||options.some(x=>!x)||options.length>6||options.length!==(base.kind==='lock'?0:3))return null;
    if(base.kind==='choice' && !options.some(x=>normalize(x)===normalize(answer)))return null;
    if(base.kind==='lock' && !/^\d{3}$/.test(answer))return null;
    if(base.kind==='order'){
      const sequence=answer.split('|').map(normalize);
      if(sequence.length!==options.length || new Set(sequence).size!==sequence.length || sequence.some(x=>!options.some(y=>normalize(y)===x)))return null;
    }
    clues.push({title:base.title,kind:base.kind,question,answer,hints:[hint1,hint2],options});
  }
  return {story:'missing-itinerary',theme:'travel-adventure',mode:config.mode,clues};
}
async function configFor(env, revealId) {
  const row=await env.DB.prepare('SELECT config_json FROM quest_configs WHERE reveal_id=?').bind(revealId).first();
  if(!row)return null;
  try{return JSON.parse(row.config_json);}catch{return null;}
}
async function findPaid(env,slug){
  const row=await env.DB.prepare('SELECT * FROM reveals WHERE public_slug=?').bind(slug).first();
  if(!row||row.status!=='paid'||!row.paid_at)return null;
  return row;
}
async function getSession(req,env,row,create) {
  const cookieName='rq_'+row.public_slug;
  const match=(req.headers.get('cookie')||'').match(new RegExp('(?:^|;\\s*)'+cookieName+'=([A-Za-z0-9_-]{30,64})'));
  if(match){
    const hash=await digest(match[1]);
    const session=await env.DB.prepare('SELECT * FROM quest_sessions WHERE session_hash=? AND reveal_id=?').bind(hash,row.id).first();
    if(session) return {session,cookie:''};
  }
  if(!create)return null;
  const raw=token(), hash=await digest(raw);
  const time=new Date().toISOString();
  await env.DB.prepare('INSERT INTO quest_sessions(session_hash,reveal_id,step,created_at,updated_at) VALUES(?,?,0,?,?)').bind(hash,row.id,time,time).run();
  return {session:{session_hash:hash,step:0,attempts:0,last_attempt_at:null,completed_at:null}, cookie:'rq_'+row.public_slug+'='+raw+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000'};
}
function currentView(cfg,session,row){
  if(session.step>=cfg.clues.length || session.completed_at) {
    return {success:true,completed:true,step:5,total:5,chapter:'The Final Discovery',final:{
      recipient:row.recipient,sender:row.sender,title:row.event_name,message:row.personal_message,
      date:row.event_date,time:row.event_time,venue:row.venue,admit:row.admit,
      ticketUrl:row.ticket_url, imageUrl:row.image_key?'/r/'+row.public_slug+'/image':null
    }};
  }
  const c=cfg.clues[session.step];
  return {success:true,completed:false,step:session.step,total:cfg.clues.length,
    chapter:c.title,kind:c.kind,question:c.question,options:c.options,recipient:row.recipient};
}
async function handleApi(req,env,url){
  if(!env.DB)return res({error:'Database unavailable'},503);
  const path=url.pathname;
  if(path==='/api/quest/create' && req.method==='POST'){
    if(!originOK(req))return res({error:'Invalid origin'},403);
    if(Number(req.headers.get('content-length')||0)>11*1024*1024)return res({error:'Submission too large'},413);
    let form;try{form=await req.formData();}catch{return res({error:'Invalid form data'},400);}
    let incoming;try{incoming=JSON.parse(String(form.get('questConfig')||''));}catch{return res({error:'Invalid quest configuration'},400);}
    const config=configCheck(incoming);
    if(!config)return res({error:'Check clue answers and sequences before saving'},400);
    if(!safe(form.get('recipient'),80)||!safe(form.get('sender'),80)||!safe(form.get('eventName'),160))return res({error:'Recipient, sender and surprise are required'},400);
    const fd=new FormData();
    for(const key of ['recipient','sender','eventName','eventDate','eventTime','venue','admit','personalMessage','ticketUrl']){
      const val=form.get(key);fd.set(key,typeof val==='string'?val:'');
    }
    const img=form.get('image');if(img&&typeof img!=='string'&&img.size>0)fd.set('image',img,img.name);
    const forwarded=new Request(new URL('/api/reveals',req.url),{method:'POST',body:fd,headers:{Origin:url.origin}});
    const created=await legacy.fetch(forwarded,env);
    if(!created.ok)return created;
    const data=await created.json();
    await env.DB.prepare('INSERT INTO quest_configs(reveal_id,config_json,created_at,updated_at) VALUES(?,?,?,?)').bind(data.id,JSON.stringify(config),new Date().toISOString(),new Date().toISOString()).run();
    return res({success:true,id:data.id,editToken:data.editToken,reviewUrl:'/reveal.html?id='+encodeURIComponent(data.id)},201);
  }
  const owner=path.match(/^\/api\/quest\/owner\/([A-Za-z0-9_-]+)$/);
  if(owner && (req.method==='GET'||req.method==='PUT')){
    if(!originOK(req))return res({error:'Invalid origin'},403);
    const id=owner[1];
    const row=await env.DB.prepare('SELECT * FROM reveals WHERE id=?').bind(id).first();
    if(!row)return res({error:'Reveal not found'},404);
    const cfg=await configFor(env,id);if(!cfg)return res({error:'Quest not found'},404);
    const check=await legacy.fetch(new Request(new URL('/api/reveals/'+id,req.url),{method:'GET',headers:{'X-Edit-Token':req.headers.get('X-Edit-Token')||''}}),env);
    if(!check.ok)return check;
    if(req.method==='GET')return res({success:true,config:cfg,reveal:(await check.json()).reveal});
    if(row.status!=='draft')return res({error:'Use Amend before updating this Quest'},409);
    if(Number(req.headers.get('content-length')||0)>11*1024*1024)return res({error:'Submission too large'},413);
    let form;try{form=await req.formData();}catch{return res({error:'Invalid form data'},400);}
    let input;try{input=JSON.parse(String(form.get('questConfig')||''));}catch{return res({error:'Invalid quest config'},400);}
    const next=configCheck(input);if(!next)return res({error:'Invalid clue configuration'},400);
    const fd=new FormData();
    for(const key of ['recipient','sender','eventName','eventDate','eventTime','venue','admit','personalMessage','ticketUrl','revision']){
      const val=form.get(key);if(typeof val==='string')fd.set(key,val);
    }
    const img=form.get('image');if(img&&typeof img!=='string'&&img.size>0)fd.set('image',img,img.name);
    const updated=await legacy.fetch(new Request(new URL('/api/reveals/'+id,req.url),{method:'PUT',headers:{'X-Edit-Token':req.headers.get('X-Edit-Token')||'',Origin:url.origin},body:fd}),env);
    if(!updated.ok)return updated;
    await env.DB.prepare('UPDATE quest_configs SET config_json=?,updated_at=? WHERE reveal_id=?').bind(JSON.stringify(next),new Date().toISOString(),id).run();
    return res({success:true,id,reviewUrl:'/reveal.html?id='+encodeURIComponent(id)});
  }
  const match=path.match(/^\/api\/quest\/([A-Za-z0-9_-]+)\/(state|answer|hint|assist)$/);
  if(!match)return res({error:'Not found'},404);
  const [,slug,action]=match;
  const row=await findPaid(env,slug);
  if(!row)return res({error:'This quest is not available'},404);
  const cfg=await configFor(env,row.id);
  if(!cfg)return res({error:'Quest not found'},404);
  if(action==='state' && req.method==='GET'){
    const {session,cookie}=await getSession(req,env,row,true);
    return res(currentView(cfg,session,row),200,cookie);
  }
  if(!originOK(req))return res({error:'Invalid origin'},403);
  const sess=await getSession(req,env,row,false);
  if(!sess)return res({error:'Your quest session has expired. Refresh to begin again.'},401);
  const session=sess.session;
  if(action==='hint' && req.method==='GET'){
    const level=Number(url.searchParams.get('level'));
    if(![1,2].includes(level)||session.step>=5)return res({error:'Hint not available'},400);
    return res({success:true,hint:cfg.clues[session.step].hints[level-1]});
  }
  if(!['answer','assist'].includes(action)||req.method!=='POST')return res({error:'Method not allowed'},405);
  if(session.step>=5)return res(currentView(cfg,session,row));
  let body={};try{body=await req.json();}catch{return res({error:'Invalid answer'},400);}
  if(body.step!==session.step)return res({error:'This chapter has moved on. Refresh the page.'},409);
  const time=new Date().toISOString();
  const attempts=Number(session.attempts)||0;
  if(action==='answer') {
    if(typeof body.answer!=='string'||body.answer.length>250)return res({error:'Answer is too long'},400);
    const cooldown=session.last_attempt_at&&Date.now()-Date.parse(session.last_attempt_at)<60000;
    if(cooldown&&attempts>=12)return res({error:'Too many attempts; request a hint or try again shortly.'},429);
    const correct=normalize(body.answer.replaceAll('|', '|'))===normalize(cfg.clues[session.step].answer);
    if(!correct){
      await env.DB.prepare('UPDATE quest_sessions SET attempts=?,last_attempt_at=?,updated_at=? WHERE session_hash=?').bind(cooldown?attempts+1:1,time,time,session.session_hash).run();
      return res({success:false,correct:false,message:'Not quite. Try again, or request a hint.'});
    }
  } else if(body.confirm!==true)return res({error:'Confirm that you want the assisted solution'},400);
  const next=session.step+1;
  const result=await env.DB.prepare('UPDATE quest_sessions SET step=?,completed_at=?,attempts=0,last_attempt_at=NULL,updated_at=? WHERE session_hash=? AND step=?').bind(next,next===5?time:null,time,session.session_hash,session.step).run();
  if(result.meta.changes!==1)return res({error:'This chapter was already solved. Refresh the page.'},409);
  return res({success:true,correct:true,assisted:action==='assist',...currentView(cfg,{...session,step:next,completed_at:next===5?time:null},row)});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const path=url.pathname;
    try{
      if(path.startsWith('/api/quest/'))return await handleApi(request,env,url);
      if(path==='/quest'||path==='/quest/'){
        return env.ASSETS.fetch(new Request(new URL('/quest.html',url),request));
      }
      const found=path.match(/^\/r\/([A-Za-z0-9_-]+)(\/image)?\/?$/);
      if(found && (request.method==='GET'||request.method==='HEAD')){
        const row=await findPaid(env,found[1]);
        if(!row)return legacy.fetch(request,env,ctx);
        const config=await configFor(env,row.id);
        if(config){
          if(found[2]){
            const sess=await getSession(request,env,row,false);
            if(!sess||!sess.session.completed_at)return res({error:'This image is not yet unlocked'},404);
            return legacy.fetch(request,env,ctx);
          }
          const page=await env.ASSETS.fetch(new Request(new URL('/quest.html',url)));
          return new Response(request.method==='HEAD'?null:page.body,{
            status:page.status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store',
              'x-robots-tag':'noindex, nofollow','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
              'content-security-policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'"}});
        }
      }
      return legacy.fetch(request,env,ctx);
    }catch(e){console.error('Quest request failed',e?.message);return res({success:false,error:'Quest service temporarily unavailable'},500);}
  }
};
