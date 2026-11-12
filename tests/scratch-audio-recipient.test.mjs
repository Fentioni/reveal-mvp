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
  personal_message:'A lovely surprise',ticket_url:'https://example.invalid/private-ticket'};
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
    for(const route of ['', '/scratch-data', '/scratch-cover']) {
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
  assert.equal('ticketUrl' in body.reveal,false,'do not leak booking secrets into recipient JSON');
  assert.ok(!JSON.stringify(body).includes('private-ticket'));
  const image=await scratchRecipientResponse(publicReq('/scratch-cover'),env,{});
  assert.equal(image.status,200);
  assert.equal(image.headers.get('cache-control'),'private, no-store');
  assert.equal(counters.images,1);
  const page=await scratchRecipientResponse(publicReq(),env,{});
  assert.equal(page.status,200);
  assert.ok((await page.text()).includes('STATIC SCRATCH RECIPIENT SHELL'));
  assert.equal(counters.assets,1);
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
