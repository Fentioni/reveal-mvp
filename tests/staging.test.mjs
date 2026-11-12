import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import worker from '../src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'));

const req = (route, method = 'GET') =>
  new Request('https://reveal-stage4b-test.example' + route, {method});

test('staging Wrangler configuration uses isolated Worker and resources', () => {
  assert.equal(config.name, 'reveal-stage4b-test');
  assert.equal(config.d1_databases[0].database_name, 'revealstage4b');
  assert.equal(config.d1_databases[0].database_id, 'fbc9687a-642b-42e6-ba8d-56430867e857');
  assert.equal(config.r2_buckets[0].bucket_name, 'reveal-images-stage4b');
  assert.equal(config.vars.STRIPE_LIVE_MODE, 'false');
  assert.equal(config.vars.STAGING_DISABLE_CHECKOUT, 'true');
  assert.equal(config.vars.STRIPE_PRICE_ID, undefined);
});

test('staging blocks payment initiation at legacy checkout path', async () => {
  const response = await worker.fetch(
    req('/api/reveals/a-test-reveal/checkout', 'POST'),
    {STAGING_DISABLE_CHECKOUT: 'true'},
  );
  assert.equal(response.status, 503);
  assert.match(await response.text(), /disabled/);
});

test('staging blocks payment webhook handling', async () => {
  const response = await worker.fetch(
    req('/api/webhooks/stripe', 'POST'),
    {STAGING_DISABLE_CHECKOUT: 'true'},
  );
  assert.equal(response.status, 503);
  assert.match(await response.text(), /disabled/);
});

test('product, category and interactive preview pages preserve their browser paths', async () => {
  const internalPaths = [];
  const env = {
    STAGING_DISABLE_CHECKOUT: 'true',
    ASSETS: {
      async fetch(request) {
        const internalUrl = new URL(request.url);
        internalPaths.push(internalUrl.pathname);
        if (internalUrl.pathname === '/storefront.html') {
          return Response.redirect('https://reveal-stage4b-test.example/storefront', 307);
        }
        assert.equal(internalUrl.pathname, '/storefront');
        return new Response('<!doctype html><title>Reveal</title>', {
          status: 200,
          headers: {'content-type': 'text/html; charset=utf-8'},
        });
      },
    },
  };

  for (const route of [
    '/products/ticket-reveal/',
    '/products/reveal-quest/',
    '/categories/gifts-surprises/',
    '/three-question-quiz/',
    '/reveal-quest/',
  ]) {
    const response = await worker.fetch(req(route), env);
    assert.equal(response.status, 200, 'Route must not redirect: ' + route);
    assert.equal(response.headers.get('location'), null);
    assert.ok((await response.text()).includes('<title>Reveal</title>'));
  }
  assert.deepEqual(internalPaths, Array(5).fill('/storefront'));
});

test('staging Ticket test entry is kept separate from catalogue activation', () => {
  const storefront = fs.readFileSync(path.join(root, 'public/storefront.js'), 'utf8');
  assert.ok(storefront.includes("location.hostname === 'reveal-stage4b-test.michael-fenton9.workers.dev'"));
  assert.ok(storefront.includes("p.slug === 'ticket-reveal' && !ready"));
  assert.ok(storefront.includes("href:'/legacy-create'"));
  assert.ok(storefront.includes('checkout is disabled'));
});

test('Ticket creator saves to the canonical review route', () => {
  const creator = fs.readFileSync(path.join(root, 'public/legacy-create.html'), 'utf8');
  assert.ok(creator.includes('Create your ticket reveal'));
  assert.ok(creator.includes('"/reveal?id=" + encodeURIComponent(id)'));
  assert.ok(!creator.includes('"reveal.html?id="'));
});

test('review Amend action returns to the staging creator, not storefront', () => {
  const review = fs.readFileSync(path.join(root, 'public/reveal.html'), 'utf8');
  assert.ok(review.includes("window.location.href = '/legacy-create?edit=' + encodeURIComponent(revealId)"));
  assert.ok(!review.includes("'/index.html?edit='"));
  assert.ok(!review.includes('At checkout payment'));
});
