/**
 * Stage 4G Three-Question Quiz.
 * Extends the existing Reveal draft/owner-token infrastructure and paid links.
 * The purchaser's answer keys are NEVER sent to an unsolved recipient.
 * Uses the Stage 4A reveal_events table for atomic, one-time progression.
 */
const PRODUCT = 'three-question-quiz';
const THEMES = new Set(['classic-gold','travel-adventure','romantic','birthday-celebration']);
const HEADER = {'content-type':'application/json; charset=utf-8','cache-control':'private, no-store',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:HEADER});
const hide = () => json({success:false,error:'This reveal is not available.'},404);
const fail = (error,status=400) => json({success:false,error},status);
const clean = v => typeof v==='string' ? v.trim() : '';
const qKey = (id,step) => 'quiz-' + id + '-step-' + step;

export function validateQuizConfig(input) {
  if (!input || typeof input!=='object' || Array.isArray(input)) return {error:'Invalid quiz details.'};
  if (!THEMES.has(input.theme)) return {error:'Select a quiz theme.'};
  if (!Array.isArray(input.questions) || input.questions.length!==3) {
    return {error:'Create exactly three questions.'};
  }
  const questions=[];
  for (let i=0;i<3;i++) {
    const q=input.questions[i];
    if (!q || typeof q!=='object' || Array.isArray(q) ||
        typeof q.prompt!=='string' || !Array.isArray(q.options) ||
        q.options.length!==4 || q.options.some(v=>typeof v!=='string') ||
        !Number.isInteger(q.correctIndex) || q.correctIndex<0 || q.correctIndex>3) {
      return {error:'Question '+(i+1)+' needs four answers and one correct choice.'};
    }
    if (q.hint!==undefined && typeof q.hint!=='string') {
      return {error:'Question '+(i+1)+' has an invalid hint.'};
    }
    const prompt=q.prompt.trim();
    const options=q.options.map(clean);
    const hint=clean(q.hint);
    if (!prompt || prompt.length>180 || hint.length>240 ||
        options.some(v=>!v || v.length>100) ||
        new Set(options.map(v=>v.toLocaleLowerCase('en-GB'))).size!==4) {
      return {error:'Question '+(i+1)+' must have a short prompt and four distinct non-empty answers.'};
    }
    questions.push({prompt,options,correctIndex:q.correctIndex,hint});
  }
  return {quiz:{version:1,theme:input.theme,questions}};
}

export async function quizOwnerResponse(request,env,ctx,originalWorker) {
  const match=new URL(request.url).pathname.match(/^\/api\/reveals\/([A-Za-z0-9_-]+)\/quiz\/?$/);
  if (!match) return null;
  if (env.STAGING_DISABLE_CHECKOUT!=='true') return hide();
  if (!['GET','PUT'].includes(request.method)) return fail('Method not allowed.',405);
  const url=new URL(request.url);
  if (request.method==='PUT' && request.headers.get('Origin') &&
      request.headers.get('Origin')!==url.origin) return fail('Cross-origin edits are not allowed.',403);
  if (!env.DB) return fail('Quiz database unavailable.',503);

  // The established hashed editing token is always checked before reading keys.
  const token=request.headers.get('X-Edit-Token');
  const headers=new Headers();
  if (token) headers.set('X-Edit-Token',token);
  const owner=await originalWorker.fetch(
    new Request(new URL('/api/reveals/'+match[1],url),{headers}),env,ctx);
  if (!owner.ok) return owner;
  const result=await owner.json();
  if (!result.success || !result.reveal) return hide();

  try {
    const existing=await env.DB.prepare(
      'SELECT product_id,fields_json FROM reveal_configurations WHERE reveal_id=?'
    ).bind(match[1]).first();
    if (existing && existing.product_id!==PRODUCT) {
      return fail('This reveal belongs to another product.',409);
    }
    if (request.method==='GET') {
      if (!existing) return hide();
      const fields=JSON.parse(existing.fields_json||'{}');
      const parsed=validateQuizConfig(fields.quiz);
      if (parsed.error) return hide();
      return json({success:true,quiz:parsed.quiz});
    }
    if (result.reveal.status!=='draft') return fail('Amend the draft before changing its quiz.',409);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return fail('Submit quiz details as JSON.',415);
    }
    if (Number(request.headers.get('content-length'))>22000) return fail('Quiz is too large.',413);
    const raw=await request.text();
    if (raw.length>22000) return fail('Quiz is too large.',413);
    let payload;
    try {payload=JSON.parse(raw);} catch {return fail('Invalid quiz JSON.');}
    const parsed=validateQuizConfig(payload);
    if (parsed.error) return fail(parsed.error);
    const stamp=new Date().toISOString();
    const save=await env.DB.prepare(
      'INSERT INTO reveal_configurations(reveal_id,product_id,fields_json,created_at,updated_at) '+
      'VALUES (?,?,?,?,?) ON CONFLICT(reveal_id) DO UPDATE SET fields_json=excluded.fields_json, '+
      'updated_at=excluded.updated_at WHERE reveal_configurations.product_id=excluded.product_id'
    ).bind(match[1],PRODUCT,JSON.stringify({quiz:parsed.quiz}),stamp,stamp).run();
    if (save.meta?.changes!==1) return fail('The draft belongs to another product.',409);
    return json({success:true,quiz:parsed.quiz});
  } catch {
    return fail('Quiz details could not be saved or retrieved.',503);
  }
}

async function progress(env,id) {
  const keys=[1,2,3].map(step=>qKey(id,step));
  const result=await env.DB.prepare(
    'SELECT id FROM reveal_events WHERE reveal_id=? AND id IN (?,?,?)'
  ).bind(id,...keys).all();
  const reached=new Set((result.results||[]).map(x=>x.id));
  let step=0;
  while(step<3 && reached.has(keys[step])) step++;
  return step;
}

function unlockedReveal(row) {
  return {
    recipient:row.recipient,
    sender:row.sender,
    eventName:row.event_name,
    eventDate:row.event_date,
    eventTime:row.event_time,
    venue:row.venue,
    admit:row.admit,
    personalMessage:row.personal_message,
    ticketUrl:row.ticket_url,
    hasEventImage:Boolean(row.image_key)
  };
}

async function publicQuizState(env,row,quiz,step) {
  // Do not expose media keys or later questions. Only the active question
  // advertises an image, and only after the payment gate has passed.
  let hasQuestionImage=false;
  if(step<3){
    const asset=await env.DB.prepare(
      'SELECT id FROM reveal_assets WHERE reveal_id=? AND kind=? LIMIT 1'
    ).bind(row.id,'quiz-question-'+(step+1)).first();
    hasQuestionImage=Boolean(asset);
  }
  return visibleState(row,quiz,step,hasQuestionImage);
}

function visibleState(row,quiz,step,hasQuestionImage=false) {
  const unlocked=step===3;
  return {success:true,recipient:row.recipient,theme:quiz.theme,
    completed:step,questionCount:3,unlocked,
    ...(unlocked ? {reveal:unlockedReveal(row)} : {
      question:{number:step+1,prompt:quiz.questions[step].prompt,
        options:quiz.questions[step].options,hint:quiz.questions[step].hint,
        ...(hasQuestionImage?{hasImage:true}:{})}
    })
  };
}

export async function quizRecipientResponse(request,env,ctx) {
  const url=new URL(request.url);
  const match=url.pathname.match(/^\/r\/([A-Za-z0-9_-]+)(?:\/(quiz-state|quiz-answer|quiz-image|image|quiz-question-image\/[1-3]))?\/?$/);
  if (!match) return null;
  if (env.STAGING_DISABLE_CHECKOUT!=='true') return null;
  const [,slug,action] = match;
  if (!env.DB) return hide();
  try {
    const row=await env.DB.prepare('SELECT * FROM reveals WHERE public_slug=?').bind(slug).first();
    if (!row || row.status!=='paid' || !row.paid_at) {
      // Fall back to the original route only for non-quiz data in non-staging.
      return hide();
    }
    const config=await env.DB.prepare(
      'SELECT fields_json FROM reveal_configurations WHERE reveal_id=? AND product_id=?'
    ).bind(row.id,PRODUCT).first();
    if (!config) return action && action!=='image' ? hide() : null;
    let fields;
    try {fields=JSON.parse(config.fields_json||'{}');} catch{return hide();}
    const parsed=validateQuizConfig(fields.quiz);
    if (parsed.error) return hide();
    const quiz=parsed.quiz;
    const step=await progress(env,row.id);

    if (action==='quiz-answer') {
      if (request.method!=='POST') return fail('Method not allowed.',405);
      if (request.headers.get('Origin') && request.headers.get('Origin')!==url.origin) {
        return fail('Cross-origin answers are not allowed.',403);
      }
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return fail('Answer must be JSON.',415);
      }
      if (step===3) return json({correct:true,...await publicQuizState(env,row,quiz,step)});
      if (Number(request.headers.get('content-length'))>600) return fail('Answer too large.',413);
      const raw=await request.text();
      if (raw.length>600) return fail('Answer too large.',413);
      let answer;
      try {answer=JSON.parse(raw);} catch{return fail('Invalid answer.');}
      if (!Number.isInteger(answer?.questionIndex) || answer.questionIndex!==step ||
          !Number.isInteger(answer?.optionIndex) || answer.optionIndex<0 ||
          answer.optionIndex>3) return fail('Answer the current question using one of four options.');
      const correct=answer.optionIndex===quiz.questions[step].correctIndex;
      if (correct) {
        // Stable primary key: only one completion event can ever be inserted per
        // step. Returning visitors retrieve their completed progress.
        await env.DB.prepare(
          'INSERT OR IGNORE INTO reveal_events(id,reveal_id,event_type,metadata_json,created_at) '+
          'VALUES(?,?,?, ?,?)'
        ).bind(qKey(row.id,step+1),row.id,'quiz-step-'+(step+1),'{}',new Date().toISOString()).run();
      }
      const updated=correct?await progress(env,row.id):step;
      return json({correct,...await publicQuizState(env,row,quiz,updated)});
    }

    if (request.method!=='GET' && request.method!=='HEAD') return fail('Method not allowed.',405);
    if (action==='quiz-state') {
      const response=json(await publicQuizState(env,row,quiz,step));
      return request.method==='HEAD'
        ? new Response(null,{status:response.status,headers:response.headers}):response;
    }
    if (action?.startsWith('quiz-question-image/')) {
      // A paid recipient can access only the CURRENT question image, never
      // a later question or an image from a different reveal.
      const number=Number(action.slice('quiz-question-image/'.length));
      if(step!==number-1 || !env.IMAGES)return hide();
      const asset=await env.DB.prepare(
        'SELECT r2_key FROM reveal_assets WHERE reveal_id=? AND kind=? LIMIT 1'
      ).bind(row.id,'quiz-question-'+number).first();
      if(!asset)return hide();
      const object=await env.IMAGES.get(asset.r2_key);
      if(!object)return hide();
      const meta=new Headers();
      object.writeHttpMetadata(meta);
      const mime=meta.get('Content-Type');
      if(!['image/jpeg','image/png','image/webp'].includes(mime))return hide();
      return new Response(request.method==='HEAD'?null:object.body,{
        headers:{'content-type':mime,'cache-control':'private, no-store',
          'x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
      });
    }
    if (action==='quiz-image'||action==='image') {
      if (step!==3 || !row.image_key || !env.IMAGES) return hide();
      const obj=await env.IMAGES.get(row.image_key);
      if (!obj) return hide();
      const headers=new Headers();
      obj.writeHttpMetadata(headers);
      const mime=headers.get('Content-Type');
      if (!['image/jpeg','image/png','image/webp'].includes(mime)) return hide();
      return new Response(request.method==='HEAD'?null:obj.body,{
        headers:{'content-type':mime,'cache-control':'private, no-store',
          'x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
      });
    }
    if (action) return hide();
    if (!env.ASSETS) return hide();
    const asset=await env.ASSETS.fetch(new Request(new URL('/quiz-recipient',url),request));
    const headers=new Headers(asset.headers);
    headers.set('cache-control','private, no-store');
    headers.set('referrer-policy','no-referrer');
    return new Response(request.method==='HEAD'?null:asset.body,{status:asset.status,headers});
  } catch {
    return hide();
  }
}
