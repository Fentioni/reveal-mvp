import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ScratchCinematicAudio,SCRATCH_AUDIO_DEFAULT} from '../public/scratch-audio.js';
import {scratchRecipientResponse} from '../src/scratch-recipient.js';
import worker from '../src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function audioHarness(enabled=true) {
  const timers = new Map();
  let nextTimer=1;
  let cues=0,started=0,unlocked=0;
  const fakeContext={state:'suspended',resume() {unlocked++; this.state='running';return Promise.resolve();}};
  const player=new ScratchCinematicAudio({
    enabled,
    createContext:()=>fakeContext,
    play:()=>cues++,
    onStart:()=>started++,
    schedule:(fn,ms)=>{const key=nextTimer++;timers.set(key,{fn,ms});return key;},
    cancel:id=>timers.delete(id)
  });
  return {player,timers,counts:()=>({cues,started,unlocked})};
}

test('cinematic audio timer begins at first scratch, not page load, with exactly 3000ms delay',()=>{
  const {player,timers,counts}=audioHarness();
  assert.deepEqual(SCRATCH_AUDIO_DEFAULT,{enabled:true,cue:'cinematic-drum-roll',trigger:'first-scratch',delayMs:3000});
  assert.equal(timers.size,0,'no autoplay timer is scheduled by page setup');
  assert.equal(player.onFirstScratch(),true);
  assert.equal(timers.size,1);
  const cue=[...timers.values()][0];
  assert.equal(cue.ms,3000);
  assert.equal(player.onFirstScratch(),false,'more scratching must not restart the cue');
  assert.equal(counts().unlocked,1,'audio must unlock from the scratch gesture');
  cue.fn();
  assert.equal(counts().cues,1);
  player.reset();
  assert.equal(player.onFirstScratch(),true);
  assert.equal([...timers.values()][0].ms,3000);
});

test('muting and replay cancel delayed cue without playing twice',()=>{
  const {player,timers,counts}=audioHarness();
  player.onFirstScratch();
  player.setEnabled(false);
  assert.equal(timers.size,0,'mute cancels queued orchestral cue');
  assert.equal(counts().cues,0);
  player.reset();
  player.setEnabled(true);
  player.onFirstScratch();
  const cue=[...timers.values()][0];
  player.reset();
  cue.fn();
  assert.equal(counts().cues,0,'the old callback must not play after reset');
});

test('a disabled recipient audio setting does not start a cue',()=>{
  const {player,timers}=audioHarness(false);
  assert.equal(player.onFirstScratch(),false);
  assert.equal(timers.size,0);
});

const recipientUrl='https://stage.example/r/example-slug';
const publicReq = suffix => new Request(recipientUrl+(suffix||''));
const paid = {id:'abc-id',public_slug:'example-slug',status:'paid',paid_at:'2026-11-12',
  recipient:'Chloe',sender:'Alex',event_name:'Night at the Theatre',event_date:'2027-03-20',
  event_time:'19:30',venue:'Starlight Theatre',admit:'Chloe + 1',
  personal_message:'A lovely surprise',ticket_url:'https://example.invalid/private-ticket',image_key:'event-image-one'};
const settings = {
  scratchSurface:{style:'custom',foil:'rose',coverAssetId:'cover-one'},
  audio:{enabled:true,cue:'cinematic-drum-roll',trigger:'first-scratch',delayMs:3000}
};
function recipientEnv(row=paid,config=settings) {
  const counters={read:0,assets:0,images:0};
  const env = {
    STAGING_DISABLE_CHECKOUT:'true',
    DB:{
      prepare(sql) {
        const statement={
          bind(...args) {this.args=args;return this;},
          async first() {
            counters.read++;
            if(sql.includes('FROM reveals')) return row;
            if(sql.includes('FROM reveal_configurations')) return config ? {fields_json:JSON.stringify(config)} : null;
            if(sql.includes('FROM reveal_assets')) return {r2_key:'private-r2-key'};
            return null;
          }
        };
        return statement;
      }
    },
    IMAGES:{
      async get() {
        counters.images++;
        return {
          body:new Blob(['private custom image'],{type:'image/png'}),
          writeHttpMetadata(headers) {headers.set('Content-Type','image/png');}
        };
      }
    },
    ASSETS:{
      async fetch(request) {
        counters.assets++;
        assert.equal(new URL(request.url).pathname,'/recipient-scratch');
        return new Response('<!doctype html>STATIC SCRATCH RECIPIENT SHELL',{headers:{'content-type':'text/html'}});
      }
    }
  };
  return {env,counters};
}

test('all recipient scratch routes reject unpaid or unconfirmed status before loading private assets', async()=>{
  for(const status of ['draft','confirmed','checkout','failed']) {
    const {env,counters}=recipientEnv({...paid,status,paid_at:null});
    for(const route of ['', '/scratch-data', '/scratch-cover', '/scratch-image']) {
      const r=await scratchRecipientResponse(publicReq(route),env,{});
      assert.equal(r.status,404, status+route);
      assert.equal(r.headers.get('cache-control'),'no-store');
    }
    assert.equal(counters.assets,0);
    assert.equal(counters.images,0);
  }
  const {env}=recipientEnv({...paid,paid_at:null});
  assert.equal((await scratchRecipientResponse(publicReq('/scratch-data'),env,{})).status,404);
});

test('paid recipient can access only their own configured scratch artwork, audio and ticket fields',async()=>{
  const {env,counters}=recipientEnv();
  const data=await scratchRecipientResponse(publicReq('/scratch-data'),env,{});
  assert.equal(data.status,200);
  assert.equal(data.headers.get('cache-control'),'private, no-store');
  const body=await data.json();
  assert.equal(body.scratchSurface.style,'custom');
  assert.equal(body.scratchSurface.foil,'rose');
  assert.deepEqual(body.audio,settings.audio);
  assert.equal(body.reveal.recipient,'Chloe');
  assert.equal(body.reveal.ticketUrl,'https://example.invalid/private-ticket',
    'the paid recipient must see the purchaser-supplied booking link');
  assert.equal(body.reveal.hasEventImage,true);
  assert.equal(body.reveal.sender,'Alex');
  assert.equal(body.reveal.eventName,'Night at the Theatre');
  assert.equal(body.reveal.eventDate,'2027-03-20');
  assert.equal(body.reveal.eventTime,'19:30');
  assert.equal(body.reveal.venue,'Starlight Theatre');
  assert.equal(body.reveal.admit,'Chloe + 1');
  assert.equal(body.reveal.personalMessage,'A lovely surprise');
  assert.ok(!JSON.stringify(body).includes('private-r2-key'));
  const image=await scratchRecipientResponse(publicReq('/scratch-cover'),env,{});
  assert.equal(image.status,200);
  assert.equal(image.headers.get('cache-control'),'private, no-store');
  assert.equal(counters.images,1);
  const imageOfEvent=await scratchRecipientResponse(publicReq('/scratch-image'),env,{});
  assert.equal(imageOfEvent.status,200);
  assert.equal(imageOfEvent.headers.get('cache-control'),'private, no-store');
  assert.equal(imageOfEvent.headers.get('content-type'),'image/png');
  assert.equal(counters.images,2);
  const page=await scratchRecipientResponse(publicReq(),env,{});
  assert.equal(page.status,200);
  assert.ok((await page.text()).includes('STATIC SCRATCH RECIPIENT SHELL'));
  assert.equal(counters.assets,1);
});

test('missing optional data is passed as absent values; no fabricated recipient details',async()=>{
  const row={...paid,event_date:null,event_time:'',venue:null,admit:'',personal_message:null,
    ticket_url:null,image_key:null};
  const {env,counters}=recipientEnv(row);
  const response=await scratchRecipientResponse(publicReq('/scratch-data'),env,{});
  assert.equal(response.status,200);
  const {reveal}=await response.json();
  assert.equal(reveal.eventDate,null);
  assert.equal(reveal.eventTime,'');
  assert.equal(reveal.venue,null);
  assert.equal(reveal.admit,'');
  assert.equal(reveal.personalMessage,null);
  assert.equal(reveal.ticketUrl,null);
  assert.equal(reveal.hasEventImage,false);
  const image=await scratchRecipientResponse(publicReq('/scratch-image'),env,{});
  assert.equal(image.status,404);
  assert.equal(counters.images,0);
});

test('even a real image or booking link cannot be retrieved before paid_at is set',async()=>{
  const {env,counters}=recipientEnv({...paid,status:'paid',paid_at:null});
  for(const route of ['', '/scratch-image','/scratch-cover','/scratch-data']) {
    const response=await scratchRecipientResponse(publicReq(route),env,{});
    assert.equal(response.status,404);
  }
  assert.equal(counters.assets,0);
  assert.equal(counters.images,0);
});

test('paid concert variant reuses recipient route, ticket fields and payment gate',async()=>{
  const concertSettings={
    scratchSurface:{variant:'concert',style:'festival',foil:'midnight',coverAssetId:null},
    audio:{enabled:false,cue:'cinematic-drum-roll',trigger:'first-scratch',delayMs:3000}
  };
  const {env,counters}=recipientEnv(paid,concertSettings);
  const data=await scratchRecipientResponse(publicReq('/scratch-data'),env,{});
  assert.equal(data.status,200);
  const {scratchSurface,reveal}=await data.json();
  assert.deepEqual(scratchSurface,{
    variant:'concert',style:'festival',foil:'midnight',hasImage:false
  });
  assert.equal(reveal.eventName,'Night at the Theatre');
  assert.equal(reveal.recipient,'Chloe');
  assert.equal(reveal.ticketUrl,'https://example.invalid/private-ticket');
  assert.equal(reveal.hasEventImage,true);
  const page=await scratchRecipientResponse(publicReq(),env,{});
  assert.equal(page.status,200);
  assert.equal(counters.assets,1);

  const {env:unpaid,counters:denied}=recipientEnv({...paid,status:'confirmed',paid_at:null},concertSettings);
  for(const route of ['', '/scratch-data','/scratch-cover','/scratch-image']) {
    assert.equal((await scratchRecipientResponse(publicReq(route),unpaid,{})).status,404);
  }
  assert.equal(denied.assets,0);
  assert.equal(denied.images,0);

  const html=fs.readFileSync(path.join(root,'public/recipient-scratch.html'),'utf8');
  assert.ok(html.includes("data.scratchSurface.variant === 'concert'"));
  assert.ok(html.includes("'PERSONALISED CONCERT TICKET'"));
  assert.ok(html.includes('recipientCardModel(data.reveal)'));
});

test('missing scratch configuration preserves the existing paid recipient page',async()=>{
  const {env}=recipientEnv(paid,null);
  assert.equal(await scratchRecipientResponse(publicReq(),env,{}),null);
  assert.equal((await scratchRecipientResponse(publicReq('/scratch-data'),env,{})).status,404);
});

test('staging-only paid scratch recipient route is wired, and public static shell cannot play customer data by itself',async()=>{
  const src=fs.readFileSync(path.join(root,'src/index.js'),'utf8');
  assert.ok(src.includes('scratchRecipientResponse(request, env, ctx)'));
  assert.ok(src.includes('if (paidScratch) return paidScratch;'));
  const html=fs.readFileSync(path.join(root,'public/recipient-scratch.html'),'utf8');
  assert.ok(html.includes("new ScratchCinematicAudio("));
  assert.ok(html.includes('onScratch:() => cinematic.onFirstScratch()'));
  assert.ok(html.includes("'/scratch-data'"));
  assert.ok(html.includes("'/scratch-image'"));
  assert.ok(html.includes('recipientCardModel(data.reveal)'));
  assert.ok(html.includes('class="card" hidden'));
  assert.ok(html.includes('.card.foil-ready .ticket-underlay{visibility:visible}'));
  assert.ok(!html.includes('Chloe'));
  const scripts=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new Function(scripts[0][1].replace(/^[ \t]*import[ \t]+\{[^}]*\}[ \t]+from[ \t]+['"][^'"]+['"];[ \t]*$/gm,'')));
  const noStage=recipientEnv();
  noStage.env.STAGING_DISABLE_CHECKOUT='false';
  assert.equal(await scratchRecipientResponse(publicReq(),noStage.env,{}),null);
  assert.equal(noStage.counters.read,0);
});

test('unpaid staging /r links remain gated in the Worker', async()=>{
  const {env}=recipientEnv({...paid,status:'draft',paid_at:null});
  const response=await worker.fetch(publicReq(),env,{});
  assert.equal(response.status,404);
});
