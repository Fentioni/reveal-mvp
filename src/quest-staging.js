// Reveal Quest isolated staging entry point.
// This wrapper intentionally disables all real checkout and webhook operations.
// Existing D1 and R2 bindings must point ONLY to designated staging resources.
import quest from './quest-router.js';

const blocked = (request, path) =>
  request.method === 'POST' && (
    path === '/api/webhooks/stripe' ||
    /^\/api\/reveals\/[A-Za-z0-9_-]+\/checkout$/.test(path)
  );

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (env.STAGING_DISABLE_CHECKOUT !== 'true' ||
        env.STRIPE_LIVE_MODE !== 'false' ||
        env.DB?.databaseId === '94356ca3-17f9-4b9a-9f5c-f103c13b9173') {
      return new Response('Staging safety configuration missing.', {
        status: 503,
        headers: {'cache-control': 'no-store', 'content-type':'text/plain; charset=utf-8'}
      });
    }
    if (blocked(request, path)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Stripe payment processing is deliberately disabled on Reveal Quest staging.'
      }), {
        status: 403,
        headers: {
          'content-type':'application/json; charset=utf-8',
          'cache-control':'no-store',
          'x-robots-tag':'noindex, nofollow'
        }
      });
    }
    if (path === '/api/quest/staging-health' && request.method === 'GET') {
      try {
        const rows = await env.DB.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('reveals','payments','quest_configs','quest_sessions')"
        ).all();
        const names = new Set((rows.results || []).map(row => row.name));
        return new Response(JSON.stringify({
          environment: 'staging',
          checkoutEnabled: false,
          legacySchemaReady: names.has('reveals') && names.has('payments'),
          questSchemaReady: names.has('quest_configs') && names.has('quest_sessions')
        }), {
          status:200,
          headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow'}
        });
      } catch {
        return new Response(JSON.stringify({environment:'staging',checkoutEnabled:false,databaseReady:false}), {
          status:503,
          headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
        });
      }
    }
    return quest.fetch(request, env, ctx);
  }
};
