/**
 * Reveal Quest product API for Stage 4B.
 *
 * IMPORTANT: No Stripe/paid-state changes here. The established legacy Worker
 * alone marks a reveal paid after a verified Stripe webhook. This module keeps
 * answer keys, personalised details and image links server-side until completion.
 * All Quest schema bootstrapping is restricted to the non-paying STAGING worker.
 */
export const QUEST_PRESETS = Object.freeze({
  quick: ['letter','suitcase','ticket'],
  classic: ['letter','suitcase','passport','map','ticket'],
  epic: ['letter','compass','suitcase','passport','map','cipher','ticket']
});

export const QUEST_CHAPTERS = Object.freeze({
  letter: {key:'letter',scene:'letter',title:'The Mysterious Letter',kind:'choice',
    question:'I travel without moving and always point north. Which object am I?',
    options:['A map','A compass','A telescope'],answer:'A compass',
    hints:['Find the object that always points north.','It has a magnetic needle.']},
  compass: {key:'compass',scene:'letter',title:'The Compass Rose',kind:'order',
    question:'Follow the compass rose clockwise, starting from North.',
    options:['West','South','East'],answer:'East|South|West',
    hints:['Imagine turning clockwise from north.','East, then south, then west.']},
  suitcase: {key:'suitcase',scene:'suitcase',title:'The Locked Suitcase',kind:'lock',
    question:'The letter lists the symbols: compass, mountain, star. Turn the brass wheels to match the numbers printed on the luggage tags.',
    options:[],answer:'427',
    hints:['Find the three numbered luggage tags.','Compass 4, mountain 2 and star 7.']},
  passport: {key:'passport',scene:'passport',title:'The Passport Mystery',kind:'order',
    question:'Put the three travel stamps in chronological order, earliest first.',
    options:['Lisbon · 19 Apr','Barcelona · 12 Apr','Rome · 08 Apr'],
    answer:'Rome · 08 Apr|Barcelona · 12 Apr|Lisbon · 19 Apr',
    hints:['Look at the dates, not the destinations.','8 April, then 12 April, then 19 April.']},
  map: {key:'map',scene:'map',title:'The Secret Map',kind:'order',
    question:'Follow the trail from the sea to the mountains. Select the three landmarks in order.',
    options:['Mountain peak','Lighthouse','Forest'],
    answer:'Lighthouse|Forest|Mountain peak',
    hints:['Start on the coast.','Lighthouse, forest, then mountain peak.']},
  cipher: {key:'cipher',scene:'ticket',title:'The Final Cipher',kind:'choice',
    question:'The last clue says: I take you somewhere new, yet never leave my page. What am I?',
    options:['An itinerary','A lantern','A suitcase'],answer:'An itinerary',
    hints:['The missing object describes the journey.','It is a written travel plan.']},
  ticket: {key:'ticket',scene:'ticket',title:'The Missing Itinerary',kind:'order',
    question:'Restore the ticket by placing the three fragments in the correct sequence.',
    options:['Gold seal','Flight symbol','Route line'],
    answer:'Route line|Flight symbol|Gold seal',
    hints:['The route line goes first.','The flight symbol belongs between the route line and gold seal.']}
});

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow'};
function json(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...extra}});}
function error(message,status=400){return json({success:false,error:message},status);}
const trim=(v,n=220)=>typeof v==='string'?v.trim().slice(0,n):'';
const norm=v=>String(v||'').trim().toLocaleLowerCase('en-GB').replace(/\s+/g,' ');
function originOK(request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}
function mustBeStaging(env){return env.STAGING_DISABLE_CHECKOUT==='true' && env.STRIPE_LIVE_MODE==='false';}
export function validateQuestConfig(input) {
  if(!input||typeof input!=='object'||!Object.hasOwn(QUEST_PRESETS,input.preset)||!['ready','adaptable','custom'].includes(input.mode))return null;
  const keys=QUEST_PRESETS[input.preset];
  if(!Array.isArray(input.clues)||input.clues.length!==keys.length)return null;
  const clues=[];
  for(let i=0;i<keys.length;i++){
    const base=QUEST_CHAPTERS[keys[i]],c=input.clues[i];
    if(!c||typeof c!=='object')return null;
    if(c.key&&c.key!==base.key)return null;
    const question=trim(c.question,280)||base.question;
    const answer=trim(c.answer,240)||base.answer;
    const hints=[trim(c.hint1,220)||base.hints[0],trim(c.hint2,220)||base.hints[1]];
    const options=Array.isArray(c.options)?c.options.map(x=>trim(x,70)):[...base.options];
    if(!question||!answer||options.length!==(base.kind==='lock'?0:3)||options.some(x=>!x))return null;
    if(base.kind==='choice'){
      if(new Set(options.map(norm)).size!==3||!options.some(x=>norm(x)===norm(answer)))return null;
    }else if(base.kind==='lock'){
      if(!/^\d{3}$/.test(answer))return null;
    }else{
      const sequence=answer.split('|').map(norm);
      if(sequence.length!==3||new Set(sequence).size!==3||new Set(options.map(norm)).size!==3||
        sequence.some(x=>!options.some(o=>norm(o)===x)))return null;
    }
    clues.push({key:base.key,title:base.title,scene:base.scene,kind:base.kind,question,options,answer,hints});
  }
  return {preset:input.preset,mode:input.mode,story:'missing-itinerary',theme:'travel-adventure',clues};
}
const queryPaid='SELECT * FROM reveals WHERE public_slug=?';
async function getConfig(env,id){
  const result=await env.DB.prepare('SELECT config_json FROM quest_configs WHERE reveal_id=?').bind(id).first();
  if(!result)return null;
  try{return JSON.parse(result.config_json);}catch{return null;}
}
async function sha256(text){
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function randomToken(){
 return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function getSession(req,env,reveal,create){
 const key='rq_'+reveal.public_slug;
 const cookie=(req.headers.get('cookie')||'').match(new RegExp('(?:^|;\\s*)'+key+'=([A-Za-z0-9_-]{30,64})'));
 if(cookie){
  const hash=await sha256(cookie[1]);
  const session=await env.DB.prepare('SELECT * FROM quest_sessions WHERE reveal_id=? AND session_hash=?').bind(reveal.id,hash).first();
  if(session)return {session,cookie:null};
 }
 if(!create)return null;
 const raw=randomToken(),hash=await sha256(raw),time=new Date().toISOString();
 await env.DB.prepare('INSERT INTO quest_sessions (session_hash,reveal_id,step,attempts,created_at,updated_at) VALUES (?,?,0,0,?,?)')
  .bind(hash,reveal.id,time,time).run();
 return {session:{session_hash:hash,step:0,attempts:0,completed_at:null,last_attempt_at:null},
   cookie:key+'='+raw+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000'};
}
function state(cfg,session,reveal){
 const total=cfg.clues.length,step=Math.min(total,Number(session.step));
 if(step>=total || session.completed_at){
  return {success:true,completed:true,total,step:total,chapter:'The Final Discovery',final:{
   recipient:reveal.recipient,sender:reveal.sender,title:reveal.event_name,
   message:reveal.personal_message,date:reveal.event_date,time:reveal.event_time,
   venue:reveal.venue,admit:reveal.admit,ticketUrl:reveal.ticket_url,
   imageUrl:reveal.image_key?'/r/'+reveal.public_slug+'/image':null
  }};
 }
 const c=cfg.clues[step];
 return {success:true,completed:false,total,step,chapter:c.title,scene:c.scene,kind:c.kind,question:c.question,options:c.options,recipient:reveal.recipient};
}
async function bootstrapStaging(env){
 // The only automatic schema creation in this product. It is a fixed DDL
 // migration for the already isolated non-paying Stage 4B staging database.
 if(!mustBeStaging(env))return;
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS quest_configs (reveal_id TEXT PRIMARY KEY REFERENCES reveals(id) ON DELETE CASCADE, config_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)').run();
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS quest_sessions (session_hash TEXT PRIMARY KEY,reveal_id TEXT NOT NULL REFERENCES reveals(id) ON DELETE CASCADE,step INTEGER NOT NULL DEFAULT 0 CHECK(step BETWEEN 0 AND 7),attempts INTEGER NOT NULL DEFAULT 0,last_attempt_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,completed_at TEXT)').run();
 await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_quest_sessions_reveal ON quest_sessions(reveal_id)').run();
}
async function health(env){
 if(!mustBeStaging(env))return error('Not available.',404);
 if(!env.DB)return error('Staging database binding missing.',503);
 try{
  const result=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('reveals','payments','quest_configs','quest_sessions')").all();
  const names=new Set((result.results||[]).map(r=>r.name));
  return json({success:true,environment:'staging',checkoutEnabled:false,
   legacySchemaReady:names.has('reveals')&&names.has('payments'),
   questSchemaReady:names.has('quest_configs')&&names.has('quest_sessions')});
 }catch{return error('Staging database unavailable.',503);}
}
async function getOwner(req,env,originalWorker,id){
 const token=req.headers.get('x-edit-token');
 if(!token)return {error:error('Owner edit token required.',403)};
 const auth=await originalWorker.fetch(new Request(new URL('/api/reveals/'+id,req.url),{
  method:'GET',headers:{'X-Edit-Token':token}}),env);
 if(!auth.ok)return {error:auth};
 const data=await auth.json();
 return {reveal:data.reveal};
}
function formFields(form){
 const fd=new FormData();
 for(const key of ['recipient','sender','eventName','eventDate','eventTime','venue','admit','personalMessage','ticketUrl','revision','removeImage']){
  const v=form.get(key);if(typeof v==='string')fd.set(key,v);
 }
 const image=form.get('image');if(image&&typeof image!=='string'&&image.size>0)fd.set('image',image,image.name);
 return fd;
}
async function creator(req,env,originalWorker,ownerId){
 if(!mustBeStaging(env))return error('Quest creator is not enabled in this environment.',503);
 if(!originOK(req))return error('Cross-origin changes are not allowed.',403);
 if(!env.DB||!env.IMAGES)return error('Staging database or image storage missing.',503);
 if(ownerId&&req.method==='GET'){
  const owner=await getOwner(req,env,originalWorker,ownerId);if(owner.error)return owner.error;
  const cfg=await getConfig(env,ownerId);if(!cfg)return error('Quest configuration unavailable.',404);
  return json({success:true,reveal:owner.reveal,config:cfg});
 }
 if(req.method!=='POST' && !(ownerId&&req.method==='PUT'))return error('Method not allowed.',405);
 if(Number(req.headers.get('content-length')||0)>11*1024*1024)return error('Upload too large.',413);
 let form;try{form=await req.formData();}catch{return error('Invalid form submission.',400);}
 let cfg;try{cfg=validateQuestConfig(JSON.parse(String(form.get('questConfig')||'')));}catch{}
 if(!cfg)return error('Check every clue, option, answer and hint before saving.',400);
 if(['recipient','sender','eventName'].some(k=>!trim(form.get(k),160)))return error('Recipient, sender and final surprise are required.',400);
 let owner;
 if(ownerId){
  owner=await getOwner(req,env,originalWorker,ownerId);if(owner.error)return owner.error;
  if(owner.reveal.status!=='draft')return error('Amend the confirmed draft before editing Quest.',409);
 }
 try{await bootstrapStaging(env);}catch{return error('Quest tables could not be prepared. Check staging legacy schema.',503);}
 const url=new URL(req.url);
 const target=ownerId?('/api/reveals/'+ownerId):'/api/reveals';
 const forwarded=new Request(new URL(target,url),{
  method:ownerId?'PUT':'POST',
  headers:{...(ownerId?{'X-Edit-Token':req.headers.get('x-edit-token')||''}:{}),Origin:url.origin},
  body:formFields(form)
 });
 const saved=await originalWorker.fetch(forwarded,env);
 if(!saved.ok)return saved;
 const data=await saved.json();
 const id=ownerId||data.id,time=new Date().toISOString();
 try{
  if(ownerId)await env.DB.prepare('UPDATE quest_configs SET config_json=?,updated_at=? WHERE reveal_id=?')
   .bind(JSON.stringify(cfg),time,id).run();
  else await env.DB.prepare('INSERT INTO quest_configs (reveal_id,config_json,created_at,updated_at) VALUES (?,?,?,?)')
   .bind(id,JSON.stringify(cfg),time,time).run();
 }catch{return error('Quest settings could not be saved. Your draft may need attention.',503);}
 return json({success:true,id,editToken:ownerId?undefined:data.editToken,
  revision:data.revision,reviewUrl:'/reveal?id='+encodeURIComponent(id)},ownerId?200:201);
}
async function recipient(req,env,url,slug,kind,originalWorker){
 if(!env.DB)return error('Quest unavailable.',503);
 const reveal=await env.DB.prepare(queryPaid).bind(slug).first();
 if(!reveal || reveal.status!=='paid' || !reveal.paid_at) {
  if(kind==='page'||kind==='image')return null; // Legacy handler retains the paid gate.
  return error('This Quest is not available.',404);
 }
 let cfg;try{cfg=await getConfig(env,reveal.id);}catch{return kind==='page'||kind==='image'?null:error('Quest unavailable.',503);}
 if(!cfg)return kind==='page'||kind==='image'?null:error('Quest unavailable.',404);
 if(kind==='page'){
  if(!['GET','HEAD'].includes(req.method))return error('Method not allowed.',405);
  const page=await env.ASSETS.fetch(new Request(new URL('/quest',url)));
  const headers=new Headers(page.headers);headers.set('cache-control','private, no-store');headers.set('x-robots-tag','noindex, nofollow');
  headers.set('content-security-policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  return new Response(req.method==='HEAD'?null:page.body,{status:page.status,headers});
 }
 if(kind==='image'){
  const session=await getSession(req,env,reveal,false);
  if(!session?.session.completed_at)return error('Image locked until Quest completion.',404);
  return originalWorker.fetch(req,env);
 }
 if(kind==='state'&&req.method==='GET'){
  const {session,cookie}=await getSession(req,env,reveal,true);
  return json(state(cfg,session,reveal),200,cookie?{'set-cookie':cookie}:{});
 }
 if(!originOK(req))return error('Cross-origin changes are not allowed.',403);
 const cookie=await getSession(req,env,reveal,false);
 if(!cookie)return error('Your session has expired. Refresh to resume.',401);
 const session=cookie.session,step=Number(session.step),total=cfg.clues.length;
 if(kind==='hint'&&req.method==='GET'){
  const level=Number(url.searchParams.get('level'));
  if(![1,2].includes(level)||step>=total)return error('Hint unavailable.',400);
  return json({success:true,hint:cfg.clues[step].hints[level-1]});
 }
 if(req.method!=='POST'||!['answer','assist'].includes(kind))return error('Method not allowed.',405);
 if(step>=total)return json(state(cfg,session,reveal));
 let body;try{body=await req.json();}catch{return error('Invalid answer.',400);}
 if(Number(body.step)!==step)return error('Chapter has already advanced. Refresh to continue.',409);
 const time=new Date().toISOString(),attempts=Number(session.attempts)||0;
 if(kind==='answer'){
  if(typeof body.answer!=='string'||body.answer.length>250)return error('Invalid answer.',400);
  const cooldown=session.last_attempt_at&&Date.now()-Date.parse(session.last_attempt_at)<60000;
  if(cooldown&&attempts>=12)return error('Too many attempts. Try a hint or return shortly.',429);
  if(norm(body.answer)!==norm(cfg.clues[step].answer)){
   await env.DB.prepare('UPDATE quest_sessions SET attempts=?,last_attempt_at=?,updated_at=? WHERE session_hash=?')
    .bind(cooldown?attempts+1:1,time,time,session.session_hash).run();
   return json({success:false,correct:false,message:'Not quite. Try again or request a hint.'});
  }
 }else if(body.confirm!==true)return error('Confirm the assisted solution.',400);
 const next=step+1;
 const result=await env.DB.prepare('UPDATE quest_sessions SET step=?,completed_at=?,attempts=0,last_attempt_at=NULL,updated_at=? WHERE session_hash=? AND step=?')
  .bind(next,next===total?time:null,time,session.session_hash,step).run();
 if(result.meta.changes!==1)return error('This chapter has already advanced. Refresh to continue.',409);
 return json({success:true,correct:true,...state(cfg,{...session,step:next,completed_at:next===total?time:null},reveal)});
}

/**
 * Return a response only for Quest requests; return null for all other products.
 * Called AFTER the Stage 4B group/quiz/scratch recipient handlers.
 */
export async function questResponse(req,env,ctx,originalWorker){
 const url=new URL(req.url),path=url.pathname;
 try{
  if(path==='/api/quest/staging-health' && req.method==='GET')return health(env);
  if(path==='/api/quest/create')return creator(req,env,originalWorker,null);
  const owner=path.match(/^\/api\/quest\/owner\/([A-Za-z0-9_-]+)\/?$/);
  if(owner)return creator(req,env,originalWorker,owner[1]);
  const action=path.match(/^\/api\/quest\/([A-Za-z0-9_-]+)\/(state|answer|hint|assist)\/?$/);
  if(action)return recipient(req,env,url,action[1],action[2],originalWorker);
  const link=path.match(/^\/r\/([A-Za-z0-9_-]+)(\/image)?\/?$/);
  if(link && ['GET','HEAD'].includes(req.method))return recipient(req,env,url,link[1],link[2]?'image':'page',originalWorker);
  return null;
 }catch(e){
  console.error('Quest staging request failed:',e?.message);
  return error('The Quest service is temporarily unavailable.',503);
 }
}