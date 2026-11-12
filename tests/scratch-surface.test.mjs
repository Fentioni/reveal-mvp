import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {scratchSurfaceResponse} from '../src/scratch-surface.js';
import worker from '../src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeMocks() {
  const state = {config:null,asset:null,stored:new Map(),authorised:0};
  const db = {
    prepare(sql) {
      const statement = {
        sql, args:[],
        bind(...args) {this.args = args; return this;},
        async first() {
          if (sql.startsWith('SELECT fields_json')) return state.config;
          if (sql.startsWith('SELECT id,r2_key')) return state.asset;
          return null;
        }
      };
      return statement;
    },
    async batch(statements) {
      for(const stmt of statements) {
        const {sql,args} = stmt;
        if (sql.startsWith('INSERT INTO reveal_assets')) {
          state.asset = {id:args[0],r2_key:args[2]};
        } else if (sql.startsWith('UPDATE reveal_assets')) {
          state.asset = {id:args[1],r2_key:args[0]};
        } else if (sql.startsWith('DELETE FROM reveal_assets')) {
          state.asset = null;
        } else if (sql.startsWith('INSERT INTO reveal_configurations')) {
          state.config = {fields_json:args[2]};
        } else {
          throw new Error('Unexpected SQL: '+sql);
        }
      }
      return statements.map(() => ({success:true}));
    }
  };
  const r2 = {
    async put(key,data,opts) {
      state.stored.set(key,{data,contentType:opts.httpMetadata.contentType});
    },
    async get(key) {
      const item = state.stored.get(key);
      if(!item) return null;
      return {
        body:new Blob([item.data],{type:item.contentType}),
        writeHttpMetadata(headers) {headers.set('Content-Type',item.contentType);}
      };
    },
    async delete(key) {state.stored.delete(key);}
  };
  const legacy = {
    async fetch(request) {
      if(request.headers.get('X-Edit-Token') !== 'valid-private-token') {
        return new Response(JSON.stringify({success:false,error:'Unauthorised'}),{status:403});
      }
      state.authorised++;
      return new Response(JSON.stringify({success:true,reveal:{id:'test-reveal',status:'draft'}}),{status:200});
    }
  };
  return {state,env:{DB:db,IMAGES:r2},legacy};
}
const url = 'https://test.example/api/reveals/test-reveal/scratch-surface';
function request(method='GET',body,token='valid-private-token',suffix='') {
  const headers = {};
  if(token) headers['X-Edit-Token']=token;
  return new Request(url+suffix,{method,headers,body});
}
function pngFile(width=900,height=1200) {
  const arr = new Uint8Array(30);
  arr.set([137,80,78,71,13,10,26,10],0);
  const write = (offset,value) => {
    arr[offset]=value>>>24;arr[offset+1]=value>>>16;arr[offset+2]=value>>>8;arr[offset+3]=value;
  };
  write(16,width);write(20,height);
  return new File([arr],'cover.png',{type:'image/png'});
}

test('surface controller requires an existing private edit token', async () => {
  const {env,legacy,state} = makeMocks();
  const forbidden = await scratchSurfaceResponse(request('GET',undefined,'not-valid'),env,{},legacy);
  assert.equal(forbidden.status,403);
  assert.equal(state.authorised,0);
  const anonymous = await scratchSurfaceResponse(request('GET',undefined,null),env,{},legacy);
  assert.equal(anonymous.status,403);
});

test('owner can save classic/occasion scratch style without an uploaded image', async () => {
  const {env,legacy,state} = makeMocks();
  const before = await scratchSurfaceResponse(request(),env,{},legacy);
  assert.equal(before.status,200);
  assert.deepEqual((await before.json()).surface,{style:'classic',foil:'gold',hasImage:false});
  const body = new FormData();
  body.append('style','theatre');body.append('foil','rose');
  const saved = await scratchSurfaceResponse(request('PUT',body),env,{},legacy);
  assert.equal(saved.status,200);
  assert.deepEqual((await saved.json()).surface,{style:'theatre',foil:'rose',hasImage:false});
  const fields = JSON.parse(state.config.fields_json);
  assert.equal(fields.scratchSurface.style,'theatre');
  assert.equal(fields.scratchSurface.coverAssetId,null);
  const fetched = await scratchSurfaceResponse(request(),env,{},legacy);
  assert.deepEqual((await fetched.json()).surface,{style:'theatre',foil:'rose',hasImage:false});
});

test('owner can store a custom scratch image privately and retrieve it with a token', async () => {
  const {env,legacy,state}=makeMocks();
  const body=new FormData();body.append('style','custom');body.append('foil','silver');
  body.append('coverImage',pngFile(), 'cover.png');
  const response = await scratchSurfaceResponse(request('PUT',body),env,{},legacy);
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).surface,{style:'custom',foil:'silver',hasImage:true});
  assert.equal(state.stored.size,1);
  assert.equal(state.asset.r2_key.startsWith('scratch-covers/test-reveal/'),true);
  assert.equal(JSON.parse(state.config.fields_json).scratchSurface.coverAssetId,state.asset.id);
  const image = await scratchSurfaceResponse(request('GET',undefined,'valid-private-token','/image'),env,{},legacy);
  assert.equal(image.status,200);
  assert.equal(image.headers.get('cache-control'),'private, no-store');
  assert.equal(image.headers.get('content-type'),'image/png');
  const unauthorized = await scratchSurfaceResponse(request('GET',undefined,'wrong','/image'),env,{},legacy);
  assert.equal(unauthorized.status,403);
  // A change from custom to concert must clean up the saved private cover.
  const replace = new FormData();replace.append('style','concert');replace.append('foil','midnight');
  const back = await scratchSurfaceResponse(request('PUT',replace),env,{},legacy);
  assert.equal(back.status,200);
  assert.equal(state.stored.size,0);
  assert.equal(state.asset,null);
  assert.equal(JSON.parse(state.config.fields_json).scratchSurface.coverAssetId,null);
});

test('custom cover upload rejects undersized and spoofed images', async () => {
  const {env,legacy,state}=makeMocks();
  const small = new FormData();
  small.append('style','custom');small.append('foil','gold');small.append('coverImage',pngFile(200,200),'small.png');
  const r1=await scratchSurfaceResponse(request('PUT',small),env,{},legacy);
  assert.equal(r1.status,400);
  const fake = new FormData();
  fake.append('style','custom');fake.append('foil','gold');
  fake.append('coverImage',new File([new Uint8Array(50)],'fake.png',{type:'image/png'}),'fake.png');
  const r2=await scratchSurfaceResponse(request('PUT',fake),env,{},legacy);
  assert.equal(r2.status,400);
  assert.equal(state.stored.size,0);
});

test('scratch API is staging-only and excludes paid recipient routes', async () => {
  const publicEnv={STAGING_DISABLE_CHECKOUT:'false'};
  const publicResponse=await worker.fetch(new Request(url), publicEnv, {});
  assert.equal(publicResponse.status,404);
  assert.match(await publicResponse.text(),/Not available/);
  const controller=fs.readFileSync(path.join(root,'src/scratch-surface.js'),'utf8');
  assert.ok(controller.includes('originalWorker.fetch('));
  assert.ok(controller.includes('reveal.status !== \'draft\''));
  assert.ok(controller.includes('cache-control\':\'private, no-store'));
});

test('ticket creator contains static surface preview and saves/restores owner cover', () => {
  const creator=fs.readFileSync(path.join(root,'public/legacy-create.html'),'utf8');
  assert.ok(creator.includes('id="scratchStyle"'));
  assert.ok(creator.includes('id="scratchFoil"'));
  assert.ok(creator.includes('id="image"'));
  assert.ok(!creator.includes('id="scratchCoverImage"'));
  assert.ok(!creator.includes('id="scratchUploadField"'));
  assert.equal((creator.match(/type="file"/g) || []).length,1,
    'ticket creator must have one image selector');
  assert.ok(creator.includes('id="scratchSurfacePreview"'));
  assert.ok(creator.includes('scratchPreview.canvas.style.pointerEvents = "none"'));
  assert.ok(creator.includes('selectedScratchImage = file;'));
  assert.ok(creator.includes('selectedImage = file;'));
  assert.ok(creator.includes('$("scratchStyle").value = "custom";'));
  assert.ok(creator.includes('body.append("image", selectedImage)'));
  assert.ok(creator.includes('surfaceBody.append("coverImage", selectedScratchImage)'));
  assert.ok(creator.includes('if ($("scratchStyle").value === "custom" && !selectedScratchImage && !existingScratchImage)'));
  assert.ok(creator.includes('setScratchPreview().catch(error => show(error.message));'));
  assert.ok(creator.includes('selectedScratchImage = null;'));
  assert.ok(creator.includes('"/scratch-surface/image"'));
  assert.ok(creator.includes('await setScratchPreview()'));
});


test('creator, review and demo inline module scripts parse as valid JavaScript', () => {
  for(const name of ['legacy-create.html','reveal.html','scratch-demo.html']) {
    const html=fs.readFileSync(path.join(root,'public',name),'utf8');
    const scripts=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length,1,name+' should have one module script');
    const code=scripts[0][1].replace(/^[ \t]*import[ \t]+\{[^}]*\}[ \t]+from[ \t]+['"][^'"]+['"];[ \t]*$/gm,'');
    assert.doesNotThrow(() => new Function(code),name+' script contains invalid syntax');
  }
});

test('customer static review displays the chosen scratch cover but disables scratching', () => {
  const html=fs.readFileSync(path.join(root,'public/reveal.html'),'utf8');
  assert.ok(html.includes('id="surfaceReviewCanvas"'));
  assert.ok(html.includes("if (isStagingTest) await loadSurface()"));
  assert.ok(html.includes("'/scratch-surface/image'"));
  assert.ok(html.includes("staticScratchCard.canvas.style.pointerEvents = 'none'"));
  assert.ok(!html.includes("staticScratchCard.reveal("));
});


test('ticket creator shows all four visual artwork choices and four foil swatches', () => {
  const creator=fs.readFileSync(path.join(root,'public/legacy-create.html'),'utf8');
  for (const id of ['classic','theatre','concert','custom']) {
    assert.ok(creator.includes('data-scratch-style="'+id+'"'), 'missing artwork '+id);
  }
  for (const foil of ['gold','silver','midnight','rose']) {
    assert.ok(creator.includes('data-scratch-foil="'+foil+'"'), 'missing foil '+foil);
  }
  assert.ok(creator.includes('id="scratchAudioEnabled" hidden'));
  assert.ok(creator.includes('id="scratchMobileDock"'));
  assert.ok(creator.includes('id="scratchDesktopDock"'));
  assert.ok(creator.includes('positionScratchSurface()'));
  assert.ok(creator.includes('scratchPreview.canvas.style.pointerEvents = "none"'));
  assert.ok(creator.includes('class="preview-details-toggle"'));
  assert.ok(creator.indexOf('class="scratch-choice"') < creator.indexOf('id="recipient"'),
    'artwork and foil choices must appear before ticket details');
  assert.ok(creator.includes('surfaceBody.append("audioEnabled", String($("scratchAudioEnabled").checked))'));
  assert.ok(creator.includes('$("scratchAudioEnabled").checked = savedSurface.audio?.enabled !== false'));
});

test('audio configuration is stored in D1 and returned to the owner review', async () => {
  const {env,legacy,state}=makeMocks();
  const body=new FormData();
  body.append('style','concert');body.append('foil','midnight');body.append('audioEnabled','false');
  const saved = await scratchSurfaceResponse(request('PUT',body),env,{},legacy);
  assert.equal(saved.status,200);
  const answer=await saved.json();
  assert.deepEqual(answer.audio,{
    enabled:false,cue:'cinematic-drum-roll',trigger:'first-scratch',delayMs:3000
  });
  const fields=JSON.parse(state.config.fields_json);
  assert.deepEqual(fields.audio,answer.audio);
  const owner=await scratchSurfaceResponse(request(),env,{},legacy);
  assert.deepEqual((await owner.json()).audio,answer.audio);
  const review=fs.readFileSync(path.join(root,'public/reveal.html'),'utf8');
  assert.ok(review.includes('id="surfaceAudioDescription"'));
  assert.ok(review.includes('approximately 3 seconds after the first scratch'));
  assert.ok(!review.includes('cinematic.onFirstScratch'));
});

test('invalid audio setting rejected and no D1 writes occur', async () => {
  const {env,legacy,state}=makeMocks();
  const body=new FormData();
  body.append('style','classic');body.append('foil','gold');body.append('audioEnabled','banana');
  const reply=await scratchSurfaceResponse(request('PUT',body),env,{},legacy);
  assert.equal(reply.status,400);
  assert.equal(state.config,null);
});


test('the single image picker supports custom scratch cover without a second file selection', () => {
  const creator=fs.readFileSync(path.join(root,'public/legacy-create.html'),'utf8');
  const form=creator.slice(creator.indexOf('<form id="revealForm">'),creator.indexOf('</form>'));
  assert.equal((form.match(/type="file"/g)||[]).length,1);
  assert.ok(form.includes('id="image"'));
  assert.ok(!form.includes('scratchCoverImage'));
  assert.ok(form.indexOf('id="scratchArtLabel"') < form.indexOf('id="image"'));
  assert.ok(form.indexOf('id="image"') < form.indexOf('id="recipient"'));
  assert.ok(creator.includes('const next = await examineScratchFile(file);'));
  assert.ok(creator.includes('selectedScratchUrl = next;'));
  assert.ok(creator.includes('selectedScratchImage = file;'));
  assert.ok(creator.includes('selectedImage = file;'));
  assert.ok(creator.includes('showImage(file, file.name);'));
  assert.ok(creator.includes('surfaceBody.append("coverImage", selectedScratchImage);'));
  assert.ok(creator.includes('body.append("image", selectedImage);'));
  assert.ok(creator.includes('Choose an image using Add an image to create your custom scratch-card cover.'));
  assert.ok(creator.includes('selectedScratchImage = null;'));
  assert.ok(creator.includes('await setScratchPreview();'));
});
