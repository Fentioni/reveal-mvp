import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ScratchCard, FOILS, SURFACE_STYLES} from '../public/scratchcard.js';
import worker from '../src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fakeCanvas() {
  class Canvas {
    constructor() {
      this.width = 0; this.height = 0; this.style = {};
      this.listeners = new Map(); this.captured = null;
      const gradient = {addColorStop() {}};
      this.context = {
        createLinearGradient: () => gradient,
        setTransform() {}, clearRect() {}, fillRect() {},
        beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, strokeRect() {},
        stroke() {}, fill() {}, save() {}, restore() {}, fillText() {}, drawImage() {}
      };
    }
    getContext(type) { return type === '2d' ? this.context : null; }
    getBoundingClientRect() { return {left:0,top:0,width:300,height:400}; }
    setAttribute() {}
    addEventListener(name, cb) { this.listeners.set(name, cb); }
    removeEventListener(name) { this.listeners.delete(name); }
    setPointerCapture(id) { this.captured = id; }
    hasPointerCapture(id) { return id === this.captured; }
    releasePointerCapture() { this.captured = null; }
  }
  globalThis.HTMLCanvasElement = Canvas;
  globalThis.window = {
    devicePixelRatio: 2,
    addEventListener() {},removeEventListener() {},
    matchMedia() {return {matches:false};}
  };
  return new Canvas();
}

const eventAt = (x,y) => ({
  clientX:x, clientY:y, pointerId:1, pointerType:'touch', preventDefault() {}
});

test('original scratch engine exposes reusable commercial-product configuration', () => {
  assert.deepEqual(Object.keys(FOILS), ['gold','silver','midnight','rose']);
  assert.deepEqual(SURFACE_STYLES, ['classic','theatre','concert']);
  const code = fs.readFileSync(path.join(root, 'public/scratchcard.js'), 'utf8');
  assert.ok(!code.includes('https://cdn.'));
  assert.ok(code.includes('destination-out'));
  assert.ok(code.includes('onComplete'));
  assert.ok(code.includes('setCoverImage'));
  assert.ok(!code.includes('this.threshold'));
  assert.ok(!code.includes('this.canvas.style.opacity'));
  assert.ok(!code.includes('this.canvas.style.pointerEvents'));
  assert.ok(!code.includes('  reveal() {'));

});

test('only user strokes remove foil, even after previous reveal thresholds', () => {
  const canvas = fakeCanvas();
  let completed = 0;
  const progress = [];
  const scratch = new ScratchCard({
    canvas, brushSize:50,
    onProgress: value => progress.push(value),
    onComplete: () => completed++
  });
  assert.equal(scratch.progress, 0);
  assert.equal(canvas.width, 600);
  assert.equal(canvas.height, 800);

  // Manually scratch roughly half the surface; previously this
  // would hide the entire canvas automatically at a fixed threshold.
  for (let y = 0; y <= 200; y += 20) {
    scratch.pointerDown(eventAt(0,y));
    scratch.pointerMove(eventAt(300,y));
    scratch.pointerEnd(eventAt(300,y));
  }
  assert.ok(scratch.progress > 0.35 && scratch.progress < 0.8);
  assert.equal(scratch.completed, false);
  assert.equal(completed, 0);
  assert.notEqual(canvas.style.opacity, '0');
  assert.notEqual(canvas.style.pointerEvents, 'none');

  scratch.resize();
  assert.notEqual(canvas.style.opacity, '0', 'Repainting must not fade remaining foil');

  // Remaining foil is removable only with more genuine user strokes.
  for (let y = 200; y <= 400; y += 20) {
    scratch.pointerDown(eventAt(0,y));
    scratch.pointerMove(eventAt(300,y));
    scratch.pointerEnd(eventAt(300,y));
  }
  assert.equal(scratch.completed, true);
  assert.equal(completed, 1);
  assert.equal(scratch.progress, 1);
  assert.notEqual(canvas.style.opacity, '0', 'The canvas must stay visible at 100%');
  assert.notEqual(canvas.style.pointerEvents, 'none', 'User must be able to scratch residual foil');
  // Completion is a one-time notification, not a full-card reveal method.
  scratch.pointerDown(eventAt(10,10));
  scratch.pointerEnd(eventAt(10,10));
  assert.equal(completed, 1);

  scratch.reset();
  assert.equal(scratch.completed, false);
  assert.equal(scratch.progress, 0);
  scratch.setFoil('silver');
  assert.equal(scratch.foil, 'silver');
  scratch.destroy();
  assert.equal(canvas.listeners.size, 0);
});

test('there is no reveal-without-scratching shortcut in the scratch engine', () => {
  const canvas = fakeCanvas();
  const scratch = new ScratchCard({canvas});
  assert.equal(typeof scratch.reveal, 'undefined');
  assert.equal(scratch.completed, false);
  scratch.destroy();
});

test('public demo uses invented ticket details, keeps commercial drafts protected', async () => {
  const demo = fs.readFileSync(path.join(root, 'public/scratch-demo.html'), 'utf8');
  const storefront = fs.readFileSync(path.join(root, 'public/storefront.js'), 'utf8');
  assert.ok(demo.includes("import { ScratchCard } from '/scratchcard.js?v=manual-scratch-v1'"));
  assert.ok(demo.includes('Fictional demo only'));
  assert.ok(demo.includes('data-surface="theatre"'));
  assert.ok(demo.includes('data-surface="concert"'));
  assert.ok(demo.includes('data-surface="custom"'));
  assert.ok(demo.includes('type="file" accept="image/jpeg,image/png,image/webp"'));
  assert.ok(demo.includes('The image is cropped to fill the card'));
  assert.ok(demo.includes('it is not uploaded or saved'));
  assert.ok(!demo.includes('fetch('));
  assert.ok(demo.includes('Chloe'));
  assert.ok(demo.includes('The Midnight Show'));
  assert.ok(!demo.includes('Reveal without scratching'));
  assert.ok(!demo.includes('accessibleReveal'));
  assert.ok(!demo.includes('threshold:'));
  assert.ok(!demo.includes('scratch.reveal()'));
  assert.ok(demo.includes('Sound off'));
  assert.ok(!demo.includes('/api/reveals/'));
  assert.ok(storefront.includes("href:'/scratch-demo'"));
  const paths = [];
  const env = {STAGING_DISABLE_CHECKOUT:'true',
    ASSETS:{async fetch(request) {
      paths.push(new URL(request.url).pathname);
      return new Response('<title>Scratch Reveal</title>',{status:200,headers:{'content-type':'text/html'}});
    }}};
  const response = await worker.fetch(new Request('https://reveal-stage4b-test.example/scratch-demo'), env);
  assert.equal(response.status,200);
  assert.deepEqual(paths,['/scratch-demo']);
});


test('scratch demo hides its underlying ticket until the foil is painted', () => {
  const demo = fs.readFileSync(path.join(root, 'public/scratch-demo.html'), 'utf8');
  assert.match(demo, /#underlay\s*\{\s*visibility:\s*hidden\s*\}/);
  assert.match(demo, /\.scratch-window\.foil-ready #underlay\s*\{\s*visibility:\s*visible\s*\}/);
  const init = demo.indexOf('const scratch = new ScratchCard(');
  const ready = demo.indexOf("byId('scratchWindow').classList.add('foil-ready')");
  assert.ok(init > -1 && ready > init, 'The foil-ready flag must not be added until ScratchCard has initialised.');
  const canvas = demo.indexOf('<canvas id="foilCanvas"');
  assert.ok(canvas > -1, 'The scratch foil must be a separate canvas overlay.');
});


test('the scratch card can switch between original theatre and concert artwork', () => {
  const canvas = fakeCanvas();
  const card = new ScratchCard({canvas});
  for (const style of ['theatre','concert','classic']) {
    card.setCoverStyle(style);
    assert.equal(card.coverStyle, style);
    assert.equal(card.progress, 0);
  }
  card.pointerDown(eventAt(40,40));
  card.pointerMove(eventAt(180,180));
  card.pointerEnd(eventAt(180,180));
  assert.ok(card.progress > 0);
  card.setCoverStyle('theatre');
  assert.equal(card.progress, 0, 'Switching presets resets all previous scratches');
  assert.throws(() => card.setCoverStyle('does-not-exist'), RangeError);
  card.destroy();
});

test('uploaded cover images are applied only after decoding and reset the scratch surface', async () => {
  const canvas = fakeCanvas();
  let requested = [];
  globalThis.Image = class {
    constructor() {this.complete = true;this.naturalWidth = 1000;this.naturalHeight = 1200;}
    set src(value) {requested.push(value);queueMicrotask(() => this.onload?.());}
  };
  const card = new ScratchCard({canvas});
  card.pointerDown(eventAt(20,20));
  card.pointerMove(eventAt(180,180));
  card.pointerEnd(eventAt(180,180));
  assert.ok(card.progress > 0);
  assert.equal(await card.setCoverImage('blob:photo-1'), true);
  assert.deepEqual(requested,['blob:photo-1']);
  assert.equal(card.progress, 0);
  assert.ok(card.coverImage);
  assert.equal(await card.setCoverImage(null), true);
  assert.equal(card.coverImage, null);
  card.destroy();
});

test('out-of-date asynchronous image loads cannot replace the current scratch surface', async () => {
  const canvas = fakeCanvas();
  let oldImage;
  globalThis.Image = class {
    constructor() {this.complete = true;this.naturalWidth = 1000;this.naturalHeight = 1200;}
    set src(value) {if(value === 'blob:old') oldImage = this; else queueMicrotask(() => this.onload?.());}
  };
  const card = new ScratchCard({canvas});
  const old = card.setCoverImage('blob:old');
  const current = card.setCoverImage('blob:new');
  assert.equal(await current, true);
  oldImage.onload();
  assert.equal(await old, false);
  assert.equal(card.coverImage !== oldImage, true);
  card.destroy();
});
