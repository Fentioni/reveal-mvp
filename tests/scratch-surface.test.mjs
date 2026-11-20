import {DEFAULT_POST_SETTINGS} from '../public/post-scratch-settings.js';
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
  assert.deepEqual((await before.json()).surface,{style:'classic',foil:'gold',theme:'luxury-elegant',hasImage:false,variant:'ticket',postScratch:{...DEFAULT_POST_SETTINGS}});
  const body = new FormData();
  body.append('style','theatre');body.append('foil','rose');
  const saved = await scratchSurfaceResponse(request('PUT',body),env,{},legacy);
  assert.equal(saved.status,200);
  assert.deepEqual((await saved.json()).surface,{style:'theatre',foil:'rose',theme:'luxury-elegant',hasImage:false,variant:'ticket',postScratch:{...DEFAULT_POST_SETTINGS}});
  const fields = JSON.parse(state.config.fields_json);
  assert.equal(fields.scratchSurface.style,'theatre');
  assert.equal(fields.scratchSurface.coverAssetId,null);
  const fetched = await scratchSurfaceResponse(request(),env,{},legacy);
  assert.deepEqual((await fetched.json()).surface,{style:'theatre',foil:'rose',theme:'luxury-elegant',hasImage:false,variant:'ticket',postScratch:{...DEFAULT_POST_SETTINGS}});
});

test('Paired cover selection is validated and persisted without exposing uploads', async () => {
 const {env,legacy,state}=makeMocks();
 const body=new FormData();
 body.append('style','classic');body.append('foil','silver');body.append('artworkId','luxury-champagne-gold-primary');
 const saved=await scratchSurfaceResponse(request('PUT',body),env,{},legacy);
 assert.equal(saved.status,200);
 const surface=(await saved.json()).surface;
 assert.equal(surface.artworkId,'luxury-champagne-gold-primary');
 assert.equal(surface.foil,'silver');
 assert.equal(surface.hasImage,false);
 assert.equal(JSON.parse(state.config.fields_json).scratchSurface.artworkId,'luxury-champagne-gold-primary');
 const restored=await scratchSurfaceResponse(request(),env,{},legacy);
 assert.equal((await restored.json()).surface.artworkId,'luxury-champagne-gold-primary');
 const invalid=new FormData();
 invalid.append('style','classic');invalid.append('foil','gold');
 invalid.append('artworkId','../../private-file');
 const rejected=await scratchSurfaceResponse(request('PUT',invalid),env,{},legacy);
 assert.equal(rejected.status,400);
 assert.equal(JSON.parse(state.config.fields_json).scratchSurface.artworkId,'luxury-champagne-gold-primary');
});

test('owner can store a custom scratch image privately and retrieve it with a token', async () => {
  const {env,legacy,state}=makeMocks();
  const body=new FormData();body.append('style','custom');body.append('foil','silver');
  body.append('coverImage',pngFile(), 'cover.png');
  const response = await scratchSurfaceResponse(request('PUT',body),env,{},legacy);
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).surface,{style:'custom',foil:'silver',theme:'luxury-elegant',hasImage:true,variant:'ticket',postScratch:{...DEFAULT_POST_SETTINGS}});
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

test('ticket creator contains actual previews and separates the selected cover from the event image', () => {
  const creator=fs.readFileSync(path.join(root,'public/legacy-create.html'),'utf8');
  assert.ok(creator.includes('id="scratchStyle"'));
  assert.ok(creator.includes('id="scratchFoil"'));
  assert.ok(creator.includes('id="image"'));
  assert.ok(!creator.includes('id="scratchCoverImage"'));
  assert.ok(!creator.includes('id="scratchUploadField"'));
  const form = creator.slice(creator.indexOf('<form id="revealForm">'),creator.indexOf('</form>'));
  assert.equal((form.match(/type="file"/g) || []).length,1,
    'ticket creator must have one image selector');
  assert.ok(creator.includes('id="scratchSurfacePreview"'));
  assert.ok(creator.includes('scratchPreview.canvas.style.pointerEvents = "none"'));
  assert.ok(!creator.includes('selectedScratchImage'));
  assert.ok(creator.includes('selectedImage = file;'));
  assert.ok(!creator.includes('$("scratchStyle").value = "custom";'));
  assert.ok(creator.includes('await selectedImage.arrayBuffer()'));
  assert.ok(creator.includes('body.append("image", new Blob([bytes], {type:selectedImage.type}), selectedImage.name)'));
  assert.ok(!creator.includes('surfaceBody.append("coverImage"'));
  assert.ok(creator.includes('renderScratchOwnerPreview'));
  assert.ok(creator.includes('setScratchPreview().catch(error => show(error.message));'));
  assert.ok(creator.includes('scratchArtworkId'));
  assert.ok(creator.includes('replacedLegacyCover'));
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
  assert.ok(html.includes("if (isStagingTest && !isQuestReview && !await loadQuizReview() && !await loadGenderReview()) await loadSurface()"));
  assert.ok(html.includes("'/scratch-surface/image'"));
  assert.ok(html.includes("staticScratchCard.canvas.style.pointerEvents = 'none'"));
  assert.ok(!html.includes("staticScratchCard.reveal("));
});


test('legacy foil controls remain available only for the concert ticket variant, not the 20-image Scratch Ticket', () => {
  const creator=fs.readFileSync(path.join(root,'public/legacy-create.html'),'utf8');
  assert.ok(!creator.includes('id="scratchArtGrid"'),'No theme tiles in either creator');
  assert.ok(!creator.includes('data-scratch-style='));
  assert.ok(creator.includes('id="scratchArtwork"'),'Portrait Scratch Ticket must retain the 20-image dropdown');
  assert.ok(creator.includes('if (isConcert) $("scratchStyle").value = "concert";'));
  for (const foil of ['gold','silver','midnight','rose']) {
    assert.ok(creator.includes('data-scratch-foil="'+foil+'"'), 'missing foil '+foil);
  }
  assert.ok(creator.includes('id="scratchAudioEnabled" hidden'));
  assert.ok(!creator.includes('id="surfaceHeading"'));
  assert.ok(!creator.includes('id="surfaceDescription"'));
  for (const id of ['scratchFoilLabel','scratchFoilGrid']) {
    assert.ok(creator.includes('id="'+id+'"'),id+' needed for concert variant');
    assert.ok(creator.includes('$("'+id+'").hidden = !isConcert;'),
      'Foil controls must be visible only for Concert Ticket');
  }
  assert.ok(creator.includes('id="scratchMobileDock"'));
  assert.ok(creator.includes('id="scratchDesktopDock"'));
  assert.ok(creator.includes('positionScratchSurface()'));
  assert.ok(creator.includes('scratchPreview.canvas.style.pointerEvents = "none"'));
  assert.ok(creator.includes('class="preview-details-toggle"'));
  assert.ok(creator.indexOf('class="scratch-choice"') < creator.indexOf('id="recipient"'),
    'selected foil finish must appear before ticket details');
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


test('event upload must never switch the selected scratch artwork to a custom cover', () => {
  const creator=fs.readFileSync(path.join(root,'public/legacy-create.html'),'utf8');
  const form=creator.slice(creator.indexOf('<form id="revealForm">'),creator.indexOf('</form>'));
  assert.equal((form.match(/type="file"/g)||[]).length,1);
  assert.ok(form.includes('id="image"'));
  assert.ok(creator.includes('This photo appears ONLY after scratching.'));
  assert.ok(creator.includes('selectedImage = file;'));
  assert.ok(creator.includes('showImage(file, file.name);'));
  assert.ok(creator.includes('await selectedImage.arrayBuffer()'));
  assert.ok(creator.includes('body.append("image", new Blob([bytes], {type:selectedImage.type}), selectedImage.name)'));
  assert.ok(creator.includes('surfaceBody.append("artworkId", currentVariant === "ticket" ? scratchArtworkId : "");'));
  assert.ok(!creator.includes('surfaceBody.append("coverImage"'));
  assert.ok(!creator.includes('selectedScratchImage'));
  assert.ok(creator.includes('await refreshPortraitPreview()'));
});


test('concert creator stores template, independent reveal art and URL/QR mode with strict allowlists',async()=>{
  const {env,legacy,state}=makeMocks();
  const body=new FormData();
  body.append('variant','concert');
  body.append('style','concert');
  body.append('foil','rose');
  body.append('ticketTemplate','stamp-edge');
  body.append('revealTheme','festival');
  body.append('linkMode','qr');
  const saved=await scratchSurfaceResponse(request('PUT',body),env,{},legacy);
  assert.equal(saved.status,200);
  const result=(await saved.json()).surface;
  assert.equal(result.ticketTemplate,'stamp-edge');
  assert.equal(result.revealTheme,'festival');
  assert.equal(result.linkMode,'qr');
  assert.equal(result.foil,'rose');
  const fields=JSON.parse(state.config.fields_json).scratchSurface;
  assert.equal(fields.ticketTemplate,'stamp-edge');
  assert.equal(fields.revealTheme,'festival');
  assert.equal(fields.linkMode,'qr');
  const restored=await scratchSurfaceResponse(request(),env,{},legacy);
  assert.equal((await restored.json()).surface.ticketTemplate,'stamp-edge');
  for(const [field,value] of [['ticketTemplate','../../secret'],['revealTheme','music'],['linkMode','script']]){
    const invalid=new FormData();
    invalid.append('variant','concert');invalid.append('style','concert');invalid.append('foil','gold');
    invalid.append(field,value);
    const rejected=await scratchSurfaceResponse(request('PUT',invalid),env,{},legacy);
    assert.equal(rejected.status,400,field+' must reject unknown choices');
  }
  assert.equal(JSON.parse(state.config.fields_json).scratchSurface.ticketTemplate,'stamp-edge',
    'Invalid settings must not overwrite a valid saved template');
});
test('concert ticket fields are saved and restored, validated, and unrelated checkout data remains untouched',async()=>{
 const {env,legacy,state}=makeMocks();
 const values={eventSubtitle:'A special evening',venueAddress:'1 Music Lane, London',
  section:'Standing',level:'Ground',row:'F',seat:'18',gate:'A2'};
 const form=new FormData();
 form.append('variant','concert');form.append('style','concert');form.append('foil','silver');
 // Historical draft fields should be safely ignored, not displayed or re-saved.
 form.append('ticketDetails',JSON.stringify({...values,supportAct:'Legacy guest',ticketNumber:'Legacy reference'}));
 const resp=await scratchSurfaceResponse(request('PUT',form),env,{},legacy);
 assert.equal(resp.status,200);
 const saved=(await resp.json()).surface;
 assert.deepEqual(saved.ticketDetails,values);
 const stored=JSON.parse(state.config.fields_json);
 assert.deepEqual(stored.scratchSurface.ticketDetails,values);
 const read=await scratchSurfaceResponse(request(),env,{},legacy);
 assert.deepEqual((await read.json()).surface.ticketDetails,values);
 for(const invalid of [{seat:'x'.repeat(41)},{gate:200},{row:'R',eventSubtitle:'y'.repeat(121)}]){
  const bad=new FormData();bad.append('variant','concert');bad.append('style','concert');
  bad.append('foil','silver');bad.append('ticketDetails',JSON.stringify(invalid));
  const res=await scratchSurfaceResponse(request('PUT',bad),env,{},legacy);
  assert.equal(res.status,400);
  assert.deepEqual(JSON.parse(state.config.fields_json).scratchSurface.ticketDetails,values,
   'An invalid field must not overwrite the saved ticket');
 }
 const creator=await fs.promises.readFile(path.join(root,'public/legacy-create.html'),'utf8');
 assert.ok(!creator.includes('id="concertLiveTicketNumber"'));
 assert.ok(!creator.includes('id="supportAct"'));
 assert.ok(!creator.includes('id="ticketNumber"'));
 assert.ok(creator.includes('concertLiveFields'));
 assert.ok(creator.includes('concertPreviewTabsDesktop'));
 assert.ok(creator.includes('concertPreviewTabsMobile'));
 assert.ok(creator.includes("surfaceBody.append('ticketDetails'"));
 const review=await fs.promises.readFile(path.join(root,'public/reveal.html'),'utf8');
 assert.ok(review.includes('reviewConcertExtra'));
 const paid=await fs.promises.readFile(path.join(root,'public/recipient-scratch.html'),'utf8');
 assert.ok(paid.includes('applyConcertTicketFields(data.scratchSurface.ticketDetails)'));
 assert.ok(!paid.includes('id="recipientConcertNumber"'));
 const empty=new FormData();
 empty.append('variant','concert');empty.append('style','concert');empty.append('foil','silver');
 empty.append('ticketDetails',JSON.stringify({}));
 assert.equal((await scratchSurfaceResponse(request('PUT',empty),env,{},legacy)).status,200,
   'All concert ticket-information fields are optional');
});

test('concert scratch variant reuses ticket surface persistence without adding a new product or changing payment', async () => {
  const {env,legacy,state}=makeMocks();
  const body=new FormData();
  body.append('variant','concert');
  body.append('style','festival');
  body.append('foil','midnight');
  body.append('audioEnabled','false');
  const saved=await scratchSurfaceResponse(request('PUT',body),env,{},legacy);
  assert.equal(saved.status,200);
  const result=await saved.json();
  assert.deepEqual(result.surface,{style:'festival',foil:'midnight',theme:'luxury-elegant',hasImage:false,variant:'concert',
    ticketTemplate:'premium-headliner',revealTheme:'classic',linkMode:'link',ticketDetails:{}});
  const fields=JSON.parse(state.config.fields_json);
  assert.deepEqual(fields.scratchSurface,{
    style:'festival',foil:'midnight',theme:'luxury-elegant',variant:'concert',coverAssetId:null,
    ticketTemplate:'premium-headliner',revealTheme:'classic',linkMode:'link',ticketDetails:{}
  });
  const restored=await scratchSurfaceResponse(request(),env,{},legacy);
  assert.deepEqual((await restored.json()).surface,result.surface);

  const switchArtwork=new FormData();
  switchArtwork.append('variant','concert');
  switchArtwork.append('style','backstage');
  switchArtwork.append('foil','silver');
  const second=await scratchSurfaceResponse(request('PUT',switchArtwork),env,{},legacy);
  assert.equal(second.status,200);
  assert.equal((await second.json()).surface.style,'backstage');
  assert.equal(JSON.parse(state.config.fields_json).scratchSurface.variant,'concert');
  assert.equal(state.stored.size,0,'concert presets must not create image uploads');

  const invalid=new FormData();
  invalid.append('variant','concert');invalid.append('style','theatre');invalid.append('foil','gold');
  const rejected=await scratchSurfaceResponse(request('PUT',invalid),env,{},legacy);
  assert.equal(rejected.status,400,'concert options must not include theatre styling');
});

test('concert creator has concert-only art options while reusing original ticket form and payment flow',()=>{
  const creator=fs.readFileSync(path.join(root,'public/legacy-create.html'),'utf8');
  const review=fs.readFileSync(path.join(root,'public/reveal.html'),'utf8');
  const storefront=fs.readFileSync(path.join(root,'public/storefront.js'),'utf8');
  assert.ok(creator.includes('urlParams.get("variant") === "concert"'));
  assert.ok(creator.includes('setCreatorVariant(savedSurface.surface.variant || "ticket")'));
  assert.ok(creator.includes('surfaceBody.append("variant", currentVariant)'));
  assert.ok(!creator.includes('data-show-for="concert"'),'Concert theme buttons must be removed');
  assert.ok(creator.includes('$("scratchArtGrid")') === false);
  assert.ok(creator.includes('$("scratchFoilGrid").hidden = !isConcert;'));
  assert.ok(creator.includes('surfaceBody.append("style", currentVariant === "concert" ? "concert" : "classic")'));
  assert.ok(creator.includes('currentVariant === "concert" ? "concert" : "classic"'));
  assert.ok(creator.includes('id="image"'));
  assert.equal((creator.slice(creator.indexOf('<form id="revealForm">'),creator.indexOf('</form>')).match(/type="file"/g)||[]).length,1);
  assert.ok(creator.includes('"/reveal?id=" + encodeURIComponent(id)'));
  assert.ok(review.includes("isConcert ? 'concert'"),'Concert review must render the colour-only cover');
  assert.ok(storefront.includes("href:'/legacy-create?variant=concert'"));
});


test('all 13 scratch themes persist on the same draft without changing artwork or foil',async()=>{
 const {env,legacy,state}=makeMocks();
 const themes=['adventure','travel','magical','sports','music','theatre','festive',
 'romance','birthday','baby','celebration','mystery','luxury-elegant'];
 const unique=new Set();
 for(const theme of themes){
  unique.add(theme);
  const form=new FormData();
  form.append('style','classic');
  form.append('foil','rose');
  form.append('variant','ticket');
  form.append('theme',theme);
  const saved=await scratchSurfaceResponse(request('PUT',form),env,{},legacy);
  assert.equal(saved.status,200,theme);
  const response=await saved.json();
  assert.deepEqual(response.surface,{style:'classic',foil:'rose',theme,hasImage:false,variant:'ticket',postScratch:{...DEFAULT_POST_SETTINGS}});
  const fetched=await scratchSurfaceResponse(request('GET'),env,{},legacy);
  assert.deepEqual((await fetched.json()).surface,response.surface);
  const fields=JSON.parse(state.config.fields_json);
  assert.equal(fields.scratchSurface.theme,theme);
  assert.equal(fields.scratchSurface.foil,'rose');
  assert.equal(fields.scratchSurface.style,'classic');
 }
 assert.equal(unique.size,13);
});

test('invalid scratch themes are rejected, and absent theme preserves the previous selection',async()=>{
 const {env,legacy,state}=makeMocks();
 const initial=new FormData();
 initial.append('style','theatre');initial.append('foil','silver');initial.append('theme','magical');
 const first=await scratchSurfaceResponse(request('PUT',initial),env,{},legacy);
 assert.equal(first.status,200);
 const previous=state.config.fields_json;
 for(const invalid of ['something-new','Magical','<img>','', '__proto__']){
  const bad=new FormData();
  bad.append('style','theatre');bad.append('foil','silver');bad.append('theme',invalid);
  const response=await scratchSurfaceResponse(request('PUT',bad),env,{},legacy);
  assert.equal(response.status,400,invalid);
  assert.equal(state.config.fields_json,previous);
 }
 const followUp=new FormData();
 followUp.append('style','classic');followUp.append('foil','midnight');
 const response=await scratchSurfaceResponse(request('PUT',followUp),env,{},legacy);
 assert.equal(response.status,200);
 const surface=(await response.json()).surface;
 assert.equal(surface.theme,'magical');
 assert.equal(surface.foil,'midnight');
 assert.equal(surface.style,'classic');
});

test('all valid cover/template pairs persist and restore with image appearance, without overwriting other config',async()=>{
 const {POST_TEMPLATES}=await import('../public/post-scratch-catalogue.js');
 const {SCRATCH_ARTWORKS}=await import('../public/scratch-artwork-catalogue.js');
 const {state,env,legacy}=makeMocks();
 state.config={fields_json:JSON.stringify({unrelated:{keep:true}})};
 const withImage={fetch:async req=>{const res=await legacy.fetch(req);if(!res.ok)return res;const data=await res.json();data.reveal.hasImage=true;return Response.json(data);}};
 let count=0;
 const {isMatchingPair}=await import('../public/paired-products.js');
 for(const template of POST_TEMPLATES)for(const cover of SCRATCH_ARTWORKS){
  if(!isMatchingPair(template.id,cover.id))continue;
  const postScratch={templateId:template.id,subtitle:'Saved subtitle',venueAddress:'London',imagePosition:'xMaxYMin',imageFit:'cover',imageOrientation:'portrait',imageZoom:175,imagePanX:20,imagePanY:-15,textContrast:'dark',shade:45};
  const body=new FormData();for(const [k,v] of Object.entries({style:'classic',foil:'gold',variant:'ticket',artworkId:cover.id,postScratch:JSON.stringify(postScratch)}))body.set(k,v);
  const saved=await scratchSurfaceResponse(request('PUT',body),env,{},withImage);assert.equal(saved.status,200);
  const got=await scratchSurfaceResponse(request(),env,{},withImage);const {surface}=await got.json();
  assert.deepEqual(surface.postScratch,postScratch);assert.equal(surface.artworkId,cover.id);
  assert.deepEqual(JSON.parse(state.config.fields_json).unrelated,{keep:true});count++;
 }
 assert.equal(count,31);
 const invalid=new FormData();for(const [k,v] of Object.entries({style:'classic',foil:'gold',variant:'ticket',artworkId:'luxury-sapphire-gold-primary',postScratch:JSON.stringify({templateId:'bg-luxury-champagne-gold'})}))invalid.set(k,v);
 assert.equal((await scratchSurfaceResponse(request('PUT',invalid),env,{},withImage)).status,400,'Cross-product cover rejected server-side');
});

test('template settings reject malformed input and custom image without upload, preserving saved config',async()=>{
 const {state,env,legacy}=makeMocks();
 for(const post of ['{bad',JSON.stringify({templateId:'missing'}),JSON.stringify({templateId:'custom-image'}),JSON.stringify({shade:91}),JSON.stringify({imageZoom:301}),JSON.stringify({imagePanX:-101}),JSON.stringify({imagePanY:'0'}),JSON.stringify({imageFit:'stretch'}),JSON.stringify({imageOrientation:'diagonal'}),JSON.stringify({imagePosition:'javascript:bad'}),JSON.stringify({subtitle:'x'.repeat(101)})]){
  const body=new FormData();body.set('style','classic');body.set('foil','gold');body.set('postScratch',post);
  assert.equal((await scratchSurfaceResponse(request('PUT',body),env,{},legacy)).status,400);assert.equal(state.config,null);
 }
 const body=new FormData();body.set('style','classic');body.set('foil','gold');body.set('postScratch','{}');
 assert.equal((await scratchSurfaceResponse(request('PUT',body,'wrong'),env,{},legacy)).status,403);assert.equal(state.config,null);
});

test('customer layout is validated, persisted and restored without mutating the shared template',async()=>{
 const {env,legacy,state}=makeMocks();
 const {getPostTemplate}=await import('../public/post-scratch-catalogue.js');
 const master=getPostTemplate('bg-luxury-champagne-gold'),z=master.zones.find(z=>z.key==='eventName');
 const layout={eventName:{size:32,ink:'#abc123',family:'Arial, sans-serif',weight:700,italic:true,align:'left',x:z.x,y:z.y,w:z.w,h:z.h}};
 const body=new FormData();body.set('style','classic');body.set('foil','gold');body.set('postScratch',JSON.stringify({templateId:'bg-luxury-champagne-gold',layout}));
 const result=await scratchSurfaceResponse(request('PUT',body),env,{},legacy);
 assert.equal(result.status,200);assert.deepEqual((await result.json()).surface.postScratch.layout,layout);
 assert.deepEqual(JSON.parse(state.config.fields_json).scratchSurface.postScratch.layout,layout);
 const read=await scratchSurfaceResponse(request(),env,{},legacy);assert.deepEqual((await read.json()).surface.postScratch.layout,layout);
 assert.equal(master.zones.find(z=>z.key==='eventName').ink,z.ink);
 for(const invalid of [{eventName:{x:899,w:100}},{eventName:{family:'url(javascript:bad)'}},{eventName:{hidden:true}},{image:{x:0,y:0,w:900,h:1200}}]){
  const bad=new FormData();bad.set('style','classic');bad.set('foil','gold');bad.set('postScratch',JSON.stringify({templateId:'bg-luxury-champagne-gold',layout:invalid}));
  const response=await scratchSurfaceResponse(request('PUT',bad),env,{},legacy);assert.equal(response.status,400);
 }
});
