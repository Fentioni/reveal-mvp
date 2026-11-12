import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ScratchCard, FOILS} from '../public/scratchcard.js';
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
        beginPath() {}, moveTo() {}, lineTo() {}, arc() {},
        stroke() {}, fill() {}, save() {}, restore() {}, fillText() {}
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
  const code = fs.readFileSync(path.join(root, 'public/scratchcard.js'), 'utf8');
  assert.ok(!code.includes('https://cdn.'));
  assert.ok(code.includes('destination-out'));
  assert.ok(code.includes('prefers-reduced-motion'));
  assert.ok(code.includes('onComplete'));
  assert.ok(code.includes('setCoverImage'));
});

test('touch drag removes foil, tracks progress and completes once', () => {
  const canvas = fakeCanvas();
  let completed = 0;
  const progress = [];
  const scratch = new ScratchCard({
    canvas, brushSize:72, threshold:0.35,
    onProgress: value => progress.push(value),
    onComplete: () => completed++
  });
  assert.equal(scratch.progress, 0);
  assert.equal(canvas.width, 600);
  assert.equal(canvas.height, 800);

  for (const y of [55,145,235,325]) {
    scratch.pointerDown(eventAt(10,y));
    scratch.pointerMove(eventAt(290,y));
    scratch.pointerEnd(eventAt(290,y));
    if (scratch.completed) break;
  }

  assert.ok(progress.some(v => v > 0));
  assert.equal(scratch.completed, true);
  assert.equal(completed, 1);
  assert.equal(canvas.style.pointerEvents, 'none');
  scratch.reveal();
  assert.equal(completed, 1);
  scratch.reset();
  assert.equal(scratch.completed, false);
  assert.equal(scratch.progress, 0);
  assert.equal(canvas.style.pointerEvents, 'auto');
  scratch.setFoil('silver');
  assert.equal(scratch.foil, 'silver');
  scratch.destroy();
  assert.equal(canvas.listeners.size, 0);
});

test('accessibility button can complete reveal without a scratch gesture', () => {
  const canvas = fakeCanvas();
  let calls = 0;
  const scratch = new ScratchCard({canvas,onComplete: () => {calls++;}});
  scratch.reveal();
  assert.equal(scratch.completed, true);
  assert.equal(calls, 1);
  scratch.destroy();
});

test('public demo uses invented ticket details, keeps commercial drafts protected', async () => {
  const demo = fs.readFileSync(path.join(root, 'public/scratch-demo.html'), 'utf8');
  const storefront = fs.readFileSync(path.join(root, 'public/storefront.js'), 'utf8');
  assert.ok(demo.includes("import { ScratchCard } from '/scratchcard.js'"));
  assert.ok(demo.includes('Fictional demo only'));
  assert.ok(demo.includes('Chloe'));
  assert.ok(demo.includes('The Midnight Show'));
  assert.ok(demo.includes('Reveal without scratching'));
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
