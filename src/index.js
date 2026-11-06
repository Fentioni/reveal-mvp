/** Stage 4B: full replacement Worker entry point. Existing Worker lives in legacy.js. */
import originalWorker from './legacy.js';
import { catalogueResponse } from './catalogue.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/api/catalogue' || path.startsWith('/api/catalogue/')) {
      return catalogueResponse(request, env);
    }
    // A new D1 product can be published without adding another static HTML page.
    if (/^\/(?:categories|products)\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(path) ||
        path === '/reveal-quest' || path === '/reveal-quest/' ||
        path === '/three-question-quiz' || path === '/three-question-quiz/') {
      if (request.method !== 'GET' && request.method !== 'HEAD')
        return new Response('Method not allowed', {status:405});
      return env.ASSETS.fetch(new Request(new URL('/storefront.html',url),request));
    }
    // Only the established ticket product is connected to the legacy creator.
    if (path === '/create/ticket-concert-reveal') {
      if (request.method !== 'GET' && request.method !== 'HEAD')
        return new Response('Method not allowed', {status:405});
      return Response.redirect(url.origin + '/legacy-create.html',302);
    }
    // Explicitly prevent unfinished products from entering legacy checkout.
    if (path.startsWith('/create/')) {
      return new Response('This product is coming soon.', {status:404,
        headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
    }
    return originalWorker.fetch(request, env, ctx);
  }
};
