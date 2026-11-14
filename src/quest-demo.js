// Standalone temporary public SAMPLE preview. No customer data, Stripe,
// D1, R2, or production Reveal resources are bound to this Worker.
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/r/')) {
      return new Response('Sample-only Quest: private purchases and recipient reveals are disabled.',{
        status:404,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}
      });
    }
    if(url.pathname==='/'||url.pathname==='/quest'||url.pathname==='/quest/') {
      return env.ASSETS.fetch(new Request(new URL('/quest.html',url),request));
    }
    return env.ASSETS.fetch(request);
  }
};
