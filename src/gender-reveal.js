/**
 * Stage 4H — synchronized, payment-gated group Gender Reveal.
 *
 * The public audience link opens a voting lobby after paid confirmation.
 * Only the owner (original private edit-token authorization) can start it.
 * D1 is the source of truth for guesses, five-second start and revealed state.
 * A guessed outcome is never transmitted to the audience until countdown ends.
 */
const PRODUCT='gender-reveal';
const START_DELAY_MS=5000;
const VOTES=['boy','girl'];
const THEMES=['pastel','confetti'];
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:HEADERS});
const deny=()=>json({success:false,error:'This reveal is not available.'},404);
const bad=(error,status=400)=>json({success:false,error},status);
const startId=id=>'gender-'+id+'-start';
const voteId=(id,digest)=>'gender-'+id+'-vote-'+digest;
const voterPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const safeVoter=value=>typeof value==='string'&&voterPattern.test(value);
const lower=value=>typeof value==='string'?value.trim().toLowerCase():'';

async function sha256(value){
  const bytes=new TextEncoder().encode(value);
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}

export function validateGenderConfig(input){
  if(!input || typeof input!=='object'||Array.isArray(input))return {error:'Invalid gender reveal.'};
  const result=lower(input.result),theme=lower(input.theme||'pastel');
  if(!VOTES.includes(result))return {error:'Choose the result: boy or girl.'};
  if(!THEMES.includes(theme))return {error:'Choose a reveal design.'};
  return {gender:{version:1,result,theme}};
}

async function ownerReveals(request,env,ctx,originalWorker,id){
  const token=request.headers.get('X-Edit-Token');
  const headers=new Headers();
  if(token)headers.set('X-Edit-Token',token);
  const url=new URL(request.url);
  const response=await originalWorker.fetch(new Request(
    new URL('/api/reveals/'+id,url),{headers}),env,ctx);
  if(!response.ok)return {response};
  const payload=await response.json();
  if(!payload.success || !payload.reveal)return {response:deny()};
  return {reveal:payload.reveal};
}

async function existingConfig(env,id){
  const row=await env.DB.prepare(
    'SELECT product_id,fields_json FROM reveal_configurations WHERE reveal_id=?'
  ).bind(id).first();
  if(!row)return null;
  if(row.product_id!==PRODUCT)return {invalidProduct:true};
  let data;
  try{data=JSON.parse(row.fields_json||'{}')}catch{return {invalid:true}}
  const validation=validateGenderConfig(data.gender);
  if(validation.error)return {invalid:true};
  return validation.gender;
}

export async function genderOwnerResponse(request,env,ctx,originalWorker){
  const pathname=new URL(request.url).pathname;
  const match=pathname.match(/^\/api\/reveals\/([A-Za-z0-9_-]+)\/gender(?:\/(start))?\/?$/);
  if(!match)return null;
  if(env.STAGING_DISABLE_CHECKOUT!=='true')return deny();
  const [,id,action]=match;
  if(!((!action&&['GET','PUT'].includes(request.method))||
        (action==='start'&&request.method==='POST')))return bad('Method not allowed.',405);
  const url=new URL(request.url);
  if(request.method!=='GET' && request.headers.get('Origin')&&
     request.headers.get('Origin')!==url.origin)return bad('Cross-origin changes are not allowed.',403);
  if(!env.DB)return bad('Database unavailable.',503);
  const owner=await ownerReveals(request,env,ctx,originalWorker,id);
  if(owner.response)return owner.response;
  try{
    const old=await existingConfig(env,id);
    if(old?.invalidProduct)return bad('This reveal belongs to another product.',409);
    if(action==='start'){
      if(owner.reveal.status!=='paid'||!owner.reveal.paidAt)return bad('Payment must be verified before the reveal can start.',409);
      if(!old || old.invalid)return deny();
      const timestamp=Date.now();
      const revealAtMs=timestamp+START_DELAY_MS;
      await env.DB.prepare(
        'INSERT OR IGNORE INTO reveal_events(id,reveal_id,event_type,metadata_json,created_at) '+
        'VALUES(?,?,?,?,?)'
      ).bind(startId(id),id,'gender-start',JSON.stringify({revealAtMs}),
        new Date(timestamp).toISOString()).run();
      const started=await env.DB.prepare(
        'SELECT metadata_json FROM reveal_events WHERE id=? AND reveal_id=?'
      ).bind(startId(id),id).first();
      const saved=JSON.parse(started.metadata_json);
      return json({success:true,revealAtMs:saved.revealAtMs,serverNowMs:Date.now(),
        alreadyStarted:saved.revealAtMs!==revealAtMs});
    }
    if(request.method==='GET'){
      if(!old || old.invalid)return deny();
      const started=await env.DB.prepare(
        'SELECT metadata_json FROM reveal_events WHERE id=? AND reveal_id=?'
      ).bind(startId(id),id).first();
      return json({success:true,gender:old,status:owner.reveal.status,
        started:Boolean(started),
        revealAtMs:started?JSON.parse(started.metadata_json).revealAtMs:null,
        ...(owner.reveal.status==='paid'&&owner.reveal.shareUrl
          ?{shareUrl:owner.reveal.shareUrl}: {})});
    }
    if(owner.reveal.status!=='draft')return bad('Amend this draft before changing the result.',409);
    if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')){
      return bad('Send gender reveal settings as JSON.',415);
    }
    if(Number(request.headers.get('Content-Length'))>2500)return bad('Settings are too large.',413);
    const raw=await request.text();
    if(raw.length>2500)return bad('Settings are too large.',413);
    let fields;
    try{fields=JSON.parse(raw)}catch{return bad('Invalid settings JSON.')}
    const validation=validateGenderConfig(fields);
    if(validation.error)return bad(validation.error);
    const now=new Date().toISOString();
    const updated=await env.DB.prepare(
      'INSERT INTO reveal_configurations(reveal_id,product_id,fields_json,created_at,updated_at) '+
      'VALUES(?,?,?,?,?) ON CONFLICT(reveal_id) DO UPDATE SET fields_json=excluded.fields_json, '+
      'updated_at=excluded.updated_at WHERE reveal_configurations.product_id=excluded.product_id'
    ).bind(id,PRODUCT,JSON.stringify({gender:validation.gender}),now,now).run();
    if(updated.meta?.changes!==1)return bad('The draft belongs to another product.',409);
    return json({success:true,gender:validation.gender});
  }catch(error){
    console.error('Gender reveal owner request:',error?.name||'Error');
    return bad('Gender reveal settings could not be processed.',503);
  }
}

async function aggregate(env,id){
  const [start,totals]=await Promise.all([
    env.DB.prepare('SELECT metadata_json FROM reveal_events WHERE reveal_id=? AND id=?')
      .bind(id,startId(id)).first(),
    env.DB.prepare(
      "SELECT event_type,COUNT(*) AS total FROM reveal_events WHERE reveal_id=? "+
      "AND event_type IN ('gender-vote-boy','gender-vote-girl') GROUP BY event_type"
    ).bind(id).all()
  ]);
  const counts={boy:0,girl:0};
  for(const line of totals.results||[]){
    if(line.event_type==='gender-vote-boy')counts.boy=Number(line.total)||0;
    if(line.event_type==='gender-vote-girl')counts.girl=Number(line.total)||0;
  }
  const revealAtMs=start?JSON.parse(start.metadata_json).revealAtMs:null;
  return {counts,revealAtMs};
}

async function ownVote(env,id,voter){
  if(!safeVoter(voter))return null;
  const digest=await sha256(voter.toLowerCase());
  const event=await env.DB.prepare(
    'SELECT event_type FROM reveal_events WHERE reveal_id=? AND id=?'
  ).bind(id,voteId(id,digest)).first();
  return event?.event_type==='gender-vote-boy'?'boy':
    event?.event_type==='gender-vote-girl'?'girl':null;
}

function audienceState(row,gender,aggregate,personal,clock=Date.now()){
  const {counts,revealAtMs}=aggregate;
  const phase=revealAtMs===null?'voting':
    clock>=revealAtMs?'revealed':'countdown';
  return {success:true,phase,serverNowMs:clock,
    revealAtMs,counts,myVote:personal,
    title:row.event_name||'Boy or Girl?',sender:row.sender||'',
    theme:gender.theme,
    ...(phase==='revealed'?{result:gender.result,
      message:row.personal_message||''}:{})
  };
}

export async function genderAudienceResponse(request,env,ctx){
  const url=new URL(request.url);
  const match=url.pathname.match(/^\/r\/([A-Za-z0-9_-]+)(?:\/(gender-state|gender-vote))?\/?$/);
  if(!match)return null;
  if(env.STAGING_DISABLE_CHECKOUT!=='true')return null;
  const [,slug,action]=match;
  if(!env.DB)return deny();
  if(action==='gender-vote'&&request.method!=='POST')return bad('Method not allowed.',405);
  if(action!=='gender-vote'&&!['GET','HEAD'].includes(request.method))return bad('Method not allowed.',405);
  try{
    const row=await env.DB.prepare('SELECT * FROM reveals WHERE public_slug=?').bind(slug).first();
    if(!row||row.status!=='paid'||!row.paid_at)return deny();
    const config=await existingConfig(env,row.id);
    if(!config)return action?deny():null;
    if(config.invalid||config.invalidProduct)return deny();
    if(action==='gender-vote'){
      if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin){
        return bad('Cross-origin voting is not allowed.',403);
      }
      if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')){
        return bad('Vote must be sent as JSON.',415);
      }
      if(Number(request.headers.get('Content-Length'))>400)return bad('Vote too large.',413);
      const raw=await request.text();
      if(raw.length>400)return bad('Vote too large.',413);
      let vote;
      try{vote=JSON.parse(raw)}catch{return bad('Invalid vote.')}
      if(!safeVoter(vote?.voterId)||!VOTES.includes(vote?.choice)){
        return bad('Select Boy or Girl.');
      }
      const token=vote.voterId.toLowerCase();
      const digest=await sha256(token);
      const id=voteId(row.id,digest);
      const currently=await aggregate(env,row.id);
      if(currently.revealAtMs!==null)return bad('Voting has closed: the reveal has started.',409);
      // D1 single-statement guard prevents a late vote being added once the
      // creator's start event is in the database. Deterministic vote key
      // allows one anonymous vote per browser, not one per verified person.
      const saved=await env.DB.prepare(
        'INSERT OR IGNORE INTO reveal_events(id,reveal_id,event_type,metadata_json,created_at) '+
        'SELECT ?,?,?,?,? WHERE NOT EXISTS '+
        '(SELECT 1 FROM reveal_events WHERE reveal_id=? AND id=?)'
      ).bind(id,row.id,'gender-vote-'+vote.choice,'{}',new Date().toISOString(),
        row.id,startId(row.id)).run();
      const theirs=await ownVote(env,row.id,token);
      const next=await aggregate(env,row.id);
      return json({...audienceState(row,config,next,theirs),accepted:Boolean(saved.meta?.changes)});
    }

    const voter=request.headers.get('X-Gender-Voter');
    const personal=await ownVote(env,row.id,voter);
    const summary=await aggregate(env,row.id);
    if(action==='gender-state'){
      const response=json(audienceState(row,config,summary,personal));
      return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
    }
    if(!env.ASSETS)return deny();
    const asset=await env.ASSETS.fetch(new Request(new URL('/gender-audience',url),request));
    const headers=new Headers(asset.headers);
    headers.set('cache-control','private, no-store');
    headers.set('referrer-policy','no-referrer');
    return new Response(request.method==='HEAD'?null:asset.body,{status:asset.status,headers});
  }catch(error){
    console.error('Gender reveal audience request:',error?.name||'Error');
    return deny();
  }
}
