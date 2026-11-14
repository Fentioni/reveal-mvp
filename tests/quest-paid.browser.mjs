import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {questResponse,QUEST_PRESETS,QUEST_CHAPTERS} from '../src/quest.js';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const engine=process.env.QUEST_BROWSER==='webkit'?'webkit':'chromium';
const browserType=engine==='webkit'?webkit:chromium;
const output=resolve(root,'test-output','quest-paid-'+engine);
const pixel=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg=='),x=>x.charCodeAt(0));
const resultTitle='A surprise trip to the coast';

function mockDatabase(){
 let session=null;
 const reveal={
  id:'paid-test-1',public_slug:'quest-simulated-paid',status:'paid',paid_at:'2026-11-14T10:00:00Z',
  recipient:'Chloe',sender:'Your favourite person',event_name:resultTitle,
  personal_message:'Pack your bags for an adventure.',event_date:'2027-06-04',
  event_time:'13:00',venue:'A secret coastal destination',admit:'Two',ticket_url:'https://example.com/private',
  image_key:'synthetic.png'
 };
 const config={story:'missing-itinerary',theme:'travel-adventure',preset:'quick',mode:'ready',
  clues:QUEST_PRESETS.quick.map(key=>{
   const v=QUEST_CHAPTERS[key];return {...v,key,hints:[...v.hints],options:[...v.options]};
  })
 };
 return{
  DB:{
   prepare(sql){let args=[];return{
    bind(...x){args=x;return this;},
    async first(){
     if(sql.includes('SELECT * FROM reveals WHERE public_slug'))return reveal;
     if(sql.includes('SELECT config_json FROM quest_configs'))return {config_json:JSON.stringify(config)};
     if(sql.includes('SELECT * FROM quest_sessions'))return session;
     return null;
    },
    async run(){
     if(sql.includes('INSERT INTO quest_sessions'))session={
      session_hash:args[0],reveal_id:args[1],step:0,attempts:0,completed_at:null,last_attempt_at:null
     };
     if(sql.includes('UPDATE quest_sessions SET attempts=')){
      session.attempts=args[0];session.last_attempt_at=args[1];
     }
     if(sql.includes('UPDATE quest_sessions SET step=')){
      if(session.step!==args.at(-1))return {meta:{changes:0}};
      session.step=args[0];session.completed_at=args[1];session.attempts=0;
     }
     return{meta:{changes:1}};
    }
   };}
  }
 };
}
async function startServer(){
 const data=mockDatabase();
 let base,server;
 const serveAsset=async path=>{
  if(path==='/quest')path='/quest.html';
  const content=await readFile(resolve(root,'public',path.slice(1)));
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp'};
  return new Response(content,{status:200,headers:{'content-type':mime[extname(path)]||'application/octet-stream'}});
 };
 const env={DB:data.DB,ASSETS:{async fetch(req){return serveAsset(new URL(req.url).pathname);}}};
 const legacy={async fetch(req){
  const path=new URL(req.url).pathname;
  if(path.endsWith('/image'))return new Response(pixel,{headers:{'content-type':'image/png','cache-control':'no-store'}});
  return new Response('Not found',{status:404});
 }};
 server=createServer(async(req,res)=>{
  const url=new URL(req.url,base||'http://localhost');
  const method=req.method||'GET';
  try{
   let body;
   if(method==='POST'){
    const parts=[];for await(const chunk of req)parts.push(chunk);
    body=Buffer.concat(parts);
   }
   const request=new Request(url,{method,headers:req.headers,body:body?.length?body:undefined});
   let out=null;
   if(url.pathname.startsWith('/api/quest/')||/^\/r\/[A-Za-z0-9_-]+(\/image)?\/?$/.test(url.pathname))
    out=await questResponse(request,env,{},legacy);
   if(!out&&/^\/(quest|quest\.js|quest-assets\/[a-z]+\.webp)$/.test(url.pathname))
    out=await serveAsset(url.pathname);
   if(!out)out=new Response('Not found',{status:404});
   res.statusCode=out.status;
   for(const [key,value] of out.headers){
    if(key==='set-cookie')res.setHeader(key,value.replace(/;\s*Secure\b/i,''));
    else res.setHeader(key,value);
   }
   res.end(Buffer.from(await out.arrayBuffer()));
  }catch(e){res.statusCode=500;res.end('Test harness failure: '+e.message);}
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 base='http://127.0.0.1:'+server.address().port;
 return {base,server};
}

test('simulated-paid recipient sees no prize until solving then can reopen and save personalised keepsake', {timeout:60000},async()=>{
 const {base,server}=await startServer();
 const browser=await browserType.launch({headless:true});
 await mkdir(output,{recursive:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',acceptDownloads:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/r/quest-simulated-paid',{waitUntil:'networkidle'});
  await page.getByText('The Missing Itinerary').first().waitFor();
  const source=await page.locator('body').innerText();
  assert.ok(!source.includes(resultTitle),'Prize leaked before challenge completion');
  await page.getByRole('button',{name:/Begin the adventure/}).click();
  await page.locator('.quest h2').filter({hasText:'The Mysterious Letter'}).waitFor();
  assert.ok(!(await page.locator('body').innerText()).includes(resultTitle));
  await page.getByRole('button',{name:'A map'}).click();
  await page.getByText('Not quite').waitFor();
  await page.getByRole('button',{name:'A compass'}).click();
  await page.locator('.quest h2').filter({hasText:'The Locked Suitcase'}).waitFor();
  const imageBefore=await page.evaluate(async()=>fetch('/r/quest-simulated-paid/image').then(r=>r.status));
  assert.equal(imageBefore,404);
  for(const [i,num] of [[1,4],[2,2],[3,7]])for(let n=0;n<num;n++)
   await page.getByRole('button',{name:'Increase digit '+i}).click();
  await page.getByRole('button',{name:'Unlock suitcase'}).click();
  await page.locator('.quest h2').filter({hasText:'The Missing Itinerary'}).waitFor();
  assert.ok(!(await page.locator('body').innerText()).includes(resultTitle));
  for(const word of ['Route line','Flight symbol','Gold seal'])await page.getByRole('button',{name:word}).click();
  await page.getByRole('button',{name:'Check sequence'}).click();
  await page.locator('.finale-content h2').filter({hasText:resultTitle}).waitFor();
  assert.ok((await page.locator('body').innerText()).includes('Pack your bags'));
  assert.ok((await page.locator('#quest-print-card').innerText()).includes(resultTitle));
  assert.equal(await page.evaluate(()=>fetch('/r/quest-simulated-paid/image').then(r=>r.status)),200);
  await page.screenshot({path:resolve(output,'paid-recipient-finale.png'),animations:'disabled',fullPage:true});
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.finale-content h2').filter({hasText:resultTitle}).waitFor({timeout:6000});
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:'Save keepsake image'}).click()
  ]);
  assert.equal(download.suggestedFilename(),'Reveal-Quest-Keepsake.png');
  const file=await download.path();
  assert.ok((await stat(file)).size>20000,'Keepsake did not include rendered artwork');
  assert.deepEqual(errors,[]);
  await context.close();
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
