import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {SCRATCH_THEMES,DEFAULT_SCRATCH_THEME,getScratchTheme,applyScratchTheme} from '../public/scratch-themes.js';
import {ScratchCard} from '../public/scratchcard.js';

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

test('13 themes are wired through the same creator, owner review, recipient and Canvas without extra products',async()=>{
 const paths=['public/legacy-create.html','public/reveal.html','public/recipient-scratch.html'];
 const files=await Promise.all(paths.map(p=>readFile(resolve(root,p),'utf8')));
 assert.match(files[0],/makeScratchThemePicker/);
 assert.match(files[0],/surfaceBody.append\("theme", scratchThemeId\)/);
 assert.match(files[0],/chooseScratchTheme\(savedSurface.surface.theme/);
 assert.match(files[1],/applyScratchTheme\(document,chosenTheme,'review'\)/);
 assert.match(files[1],/theme:chosenTheme/);
 assert.match(files[2],/applyScratchTheme\(document,chosenTheme,'recipient'\)/);
 assert.match(files[2],/theme:chosenTheme/);
 const canvasSource=await readFile(resolve(root,'public/scratchcard.js'),'utf8');
 assert.match(canvasSource,/drawThemeDecoration/);
 assert.match(canvasSource,/this\.setTheme|setTheme\(id\)/);
 assert.match(canvasSource,/if \(!this\.coverImage\) this\.drawArtwork\(\)/);
 assert.match(canvasSource,/if \(this\.coverImage\?\.complete/);
 assert.match(canvasSource,/this\.drawThemeDecoration\(\)/);
 assert.match(canvasSource,/destination-out/);
 const stylesheet=await readFile(resolve(root,'public/scratch-themes.css'),'utf8');
 assert.match(stylesheet,/data-scratch-theme-mode="recipient"/);
 assert.match(stylesheet,/data-scratch-theme-mode="creator"/);
 assert.match(stylesheet,/data-scratch-theme-mode="review"/);
 assert.match(stylesheet,/scratch-theme-grid/);
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
