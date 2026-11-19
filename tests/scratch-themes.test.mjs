import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {SCRATCH_THEMES,DEFAULT_SCRATCH_THEME,getScratchTheme,applyScratchTheme} from '../public/scratch-themes.js';
import {ScratchCard} from '../public/scratchcard.js';
import {SCRATCH_ARTWORKS,DEFAULT_SCRATCH_ARTWORK,getScratchArtwork} from '../public/scratch-artwork-catalogue.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('theme catalogue has the thirteen requested distinct designs with safe color definitions',()=>{
 const ids=['adventure','travel','magical','sports','music','theatre','festive',
 'romance','birthday','baby','celebration','mystery','luxury-elegant'];
 assert.deepEqual(SCRATCH_THEMES.map(t=>t.id),ids);
 assert.equal(new Set(SCRATCH_THEMES.map(t=>t.bg)).size,13);
 assert.equal(new Set(SCRATCH_THEMES.map(t=>t.motif)).size>=9,true);
 assert.equal(getScratchTheme('unknown').id,DEFAULT_SCRATCH_THEME);
 for(const theme of SCRATCH_THEMES){
  assert.ok(theme.label && theme.description && theme.icon);
  for(const key of ['bg','bg2','accent','highlight','paper'])
   assert.match(theme[key],/^#[0-9A-Fa-f]{6}$/);
 }
});

test('scratch theme applies the selected environment without changing card foil or style',()=>{
 const properties=new Map();
 const root={body:{style:{setProperty:(name,value)=>properties.set(name,value)},dataset:{},
  classList:{add(name){assert.equal(name,'scratch-themed');}}}};
 const romantic=applyScratchTheme(root,'romance','recipient');
 assert.equal(root.body.dataset.scratchTheme,'romance');
 assert.equal(root.body.dataset.scratchThemeMode,'recipient');
 assert.equal(properties.get('--scratch-bg'),romantic.bg);
 const elegant=applyScratchTheme(root,'luxury-elegant','creator');
 assert.equal(root.body.dataset.scratchTheme,'luxury-elegant');
 assert.equal(properties.get('--scratch-highlight'),elegant.highlight);
});

test('the creator uses product-bound covers without a thematic picker',async()=>{
 const paths=['public/legacy-create.html','public/reveal.html','public/recipient-scratch.html','src/scratch-surface.js','src/scratch-recipient.js'];
 const [creator,review,recipient,owner,paid]=await Promise.all(paths.map(p=>readFile(resolve(root,p),'utf8')));
 const {PAIRED_PRODUCTS,coversForTemplate}=await import('../public/paired-products.js');
 assert.equal(PAIRED_PRODUCTS.length,26);
 assert.equal(SCRATCH_ARTWORKS.length,31);
 assert.equal(new Set(SCRATCH_ARTWORKS.map(i=>i.id)).size,31);
 assert.equal(DEFAULT_SCRATCH_ARTWORK,'luxury-champagne-gold-primary');
 assert.equal(PAIRED_PRODUCTS.filter(p=>coversForTemplate(p.templateId).length===2).length,5);
 assert.equal(getScratchArtwork('azure-kaleidoscope'),null);
 assert.equal(getScratchArtwork('missing'),null);
 for(const art of SCRATCH_ARTWORKS) {
   assert.match(art.file,/^[a-z-]+\.webp$/);
   assert.equal(art.src,'/scratch-artwork/'+art.file);
 }
 assert.match(creator,/id="scratchArtwork"/);
 assert.match(creator,/SCRATCH_ARTWORKS/);
 assert.match(creator,/surfaceBody\.append\("artworkId"/);
 assert.doesNotMatch(creator,/makeScratchThemePicker|scratchThemeChoices/);
 assert.match(review,/getScratchArtwork\(result\.surface\.artworkId\)/);
 assert.match(review,/setCoverImage\(artwork\.src\)/);
 assert.match(recipient,/getScratchArtwork\(data\.scratchSurface\.artworkId\)/);
 assert.match(recipient,/setCoverImage\(artwork\.src\)/);
 assert.match(owner,/availableScratchArtwork\(env,artworkId\)/);
 assert.match(owner,/resolveStoredArtwork\(env,artworkId\)/);
 assert.match(creator,/fetch\('\/api\/scratch-artwork'/);
 assert.match(creator,/coverCatalogue\.filter\(a=>!a\.archived&&matching\.includes\(a\.id\)\)/);
 assert.match(paid,/resolveStoredArtwork\(env,settings\.artworkId\)/);
 const engine=await readFile(resolve(root,'public/scratchcard.js'),'utf8');
 assert.match(engine,/if \(!this\.artworkId && !this\.coverImage && w <= h\*1\.4\)/);
 assert.match(engine,/destination-out/);
});
test('ScratchCard constructor and theme setter preserve existing foil and uploaded-image choice',()=>{
 const data={};
 const canvas={
  style:{},width:0,height:0,
  getContext(){return ctx},
  getBoundingClientRect(){return {width:300,height:400}},
  addEventListener(){},removeEventListener(){},setAttribute(){}
 };
 const gradient={addColorStop(){}};
 const ctx={setTransform(){},clearRect(){},fillRect(){},strokeRect(){},beginPath(){},arc(){},
  moveTo(){},lineTo(){},stroke(){},fill(){},fillText(){},drawImage(){},save(){},restore(){},
  createLinearGradient(){return gradient}};
 const prev=globalThis.HTMLCanvasElement,oldWindow=globalThis.window;
 globalThis.HTMLCanvasElement=class {};
 Object.setPrototypeOf(canvas,globalThis.HTMLCanvasElement.prototype);
 globalThis.window={devicePixelRatio:1,addEventListener(){},removeEventListener(){}};
 try{
  const scratch=new ScratchCard({canvas,theme:'music',foil:'rose',coverStyle:'theatre'});
  const image={complete:true,naturalWidth:1000,naturalHeight:1000};
  scratch.coverImage=image;
  scratch.setTheme('travel');
  assert.equal(scratch.theme,'travel');
  assert.equal(scratch.foil,'rose');
  assert.equal(scratch.coverStyle,'theatre');
  assert.equal(scratch.coverImage,image);
  assert.equal(scratch.progress,0);
  assert.throws(()=>scratch.setTheme('invalid'),RangeError);
  scratch.destroy();
 }finally{
  globalThis.HTMLCanvasElement=prev;
  globalThis.window=oldWindow;
 }
});
