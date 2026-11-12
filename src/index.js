/** Stage 4B storefront and catalogue router; legacy payment/reveal logic is unchanged. */
import originalWorker from './legacy.js';
import { catalogueResponse } from './catalogue.js';
import { scratchSurfaceResponse } from './scratch-surface.js';
import { scratchRecipientResponse } from './scratch-recipient.js';

const textError = (message, status) => new Response(message, {
  status,
  headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
});

const jsonError = (message, status) => new Response(JSON.stringify({success: false, error: message}), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // This branch is configured to be a non-paying staging environment.
    // Prevent any checkout or webhook processing until test-mode Stripe
    // is separately configured and this guard is explicitly removed.
    if (env.STAGING_DISABLE_CHECKOUT === 'true' &&
        (path === '/api/webhooks/stripe' ||
         /^\/api\/reveals\/[A-Za-z0-9_-]+\/checkout\/?$/.test(path))) {
      return jsonError('Checkout is disabled in this staging environment.', 503);
    }

    if (/^\/api\/reveals\/[A-Za-z0-9_-]+\/scratch-surface(?:\/image)?\/?$/.test(path)) {
      if (env.STAGING_DISABLE_CHECKOUT !== 'true') return textError('Not available.', 404);
      return scratchSurfaceResponse(request, env, ctx, originalWorker);
    }

    if (/^\/r\/[A-Za-z0-9_-]+(?:\/(?:scratch-data|scratch-cover|scratch-image))?\/?$/.test(path)) {
      const paidScratch = await scratchRecipientResponse(request, env, ctx);
      if (paidScratch) return paidScratch;
    }

    if (path === '/api/catalogue' || path.startsWith('/api/catalogue/')) {
      return catalogueResponse(request, env);
    }

    if (/^\/(?:categories|products)\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(path) ||
        path === '/reveal-quest' || path === '/reveal-quest/' ||
        path === '/three-question-quiz' || path === '/three-question-quiz/') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return textError('Method not allowed.', 405);
      }
      // Fetch the canonical extensionless asset URL. Cloudflare's default HTML
      // handling redirects /storefront.html to /storefront, which otherwise
      // loses the original category or product pathname in the browser.
      return env.ASSETS.fetch(new Request(new URL('/storefront', url), request));
    }

    // The previously established ticket creator is the only Stage 4B product
    // eligible for the legacy workflow, and only after explicit activation.
    if (path === '/create/ticket-reveal') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return textError('Method not allowed.', 405);
      }
      if (!env.DB) return textError('Catalogue unavailable.', 503);
      try {
        const product = await env.DB
          .prepare('SELECT status FROM products WHERE id = ? AND slug = ?')
          .bind('ticket-reveal', 'ticket-reveal')
          .first();
        if (!product || product.status !== 'active') {
          return textError('This product is coming soon.', 404);
        }
      } catch {
        return textError('Catalogue unavailable.', 503);
      }
      return Response.redirect(url.origin + '/legacy-create.html', 302);
    }

    if (path.startsWith('/create/')) {
      return textError('This product is coming soon.', 404);
    }

    return originalWorker.fetch(request, env, ctx);
  }
};
