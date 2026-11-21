/**
 * Stripe TEST checkout for explicitly enabled Quest and Scratch Ticket products.
 *
 * Safe default: a disabled Stage 4B staging Worker remains non-paying. This
 * never permits live Stripe credentials, production bindings, unapproved
 * products or a browser-provided price. Signed webhooks are verified by the
 * preserved legacy implementation before database records are marked paid.
 */
const JSON_HEADERS={
 'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store',
 'x-robots-tag':'noindex, nofollow'
};
const reply=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:JSON_HEADERS});
const STAGING_DB='fbc9687a-642b-42e6-ba8d-56430867e857';
const STAGING_R2='reveal-images-stage4b';

function isolatedStaging(env){
 return env?.STAGING_DISABLE_CHECKOUT==='true' &&
        env?.STRIPE_LIVE_MODE==='false' &&
        env?.DB &&
        (!env.DB.databaseId || env.DB.databaseId===STAGING_DB) &&
        (!env.IMAGES?.bucketName || env.IMAGES.bucketName===STAGING_R2);
}
/**
 * Credentials are stored in Cloudflare encrypted Secrets (never GitHub).
 * Configuration is deliberately not enabled by shipping a branch change.
 */
function stripeTestCredentialsReady(env){
 return Boolean(
  isolatedStaging(env) &&
  /^(?:sk|rk)_test_[A-Za-z0-9]+$/.test(String(env.STRIPE_SECRET_KEY||'')) &&
  /^whsec_[A-Za-z0-9]+$/.test(String(env.STRIPE_WEBHOOK_SECRET||'')) &&
  /^price_[A-Za-z0-9]+$/.test(String(env.STRIPE_PRICE_ID||''))
 );
}
export function questStripeTestReady(env){
 return stripeTestCredentialsReady(env)&&env.QUEST_TEST_CHECKOUT_ENABLED==='true';
}
export function scratchStripeTestReady(env){
 return stripeTestCredentialsReady(env)&&env.SCRATCH_TEST_CHECKOUT_ENABLED==='true';
}
function isCheckout(path){
 return /^\/api\/reveals\/([A-Za-z0-9_-]+)\/checkout\/?$/.exec(path);
}
/** Return a Response for Stripe staging-specific paths; null otherwise. */
export async function questStripeTestResponse(request,env,ctx,originalWorker){
 const url=new URL(request.url);
 const path=url.pathname;
 if(['/api/quest/test-payment-status','/api/scratch/test-payment-status'].includes(path) && request.method==='GET'){
  if(!isolatedStaging(env))return reply({success:false,error:'Not available.'},404);
  return reply({success:true,environment:'staging',mode:'test',
    enabled:path.startsWith('/api/scratch/')?scratchStripeTestReady(env):questStripeTestReady(env),automaticTax:false,
    baseAmountMinor:99,currency:'gbp',fixedGbp:true,checkoutRevision:'no-vat-99p-1'});
 }
 const checkout=isCheckout(path);
 if(path!=='/api/webhooks/stripe' && !checkout)return null;

 // Other products remain payment-disabled even when test mode is enabled.
 // All webhook handling remains isolated to the Stage 4B TEST environment.
 if(!questStripeTestReady(env)&&!scratchStripeTestReady(env)){
  return reply({success:false,error:'Checkout is disabled in this staging environment.'},503);
 }
 if(request.method!=='POST'){
  return reply({success:false,error:'Method not allowed.'},405);
 }
 if(checkout){
  const origin=request.headers.get('origin');
  if(origin && origin!==url.origin)return reply({success:false,error:'Invalid request origin.'},403);
  let allowed=false;
  try {
   const quest=await env.DB.prepare('SELECT reveal_id FROM quest_configs WHERE reveal_id=?')
     .bind(checkout[1]).first();
   if(quest)allowed=questStripeTestReady(env);
   else if(scratchStripeTestReady(env)){
    const row=await env.DB.prepare('SELECT fields_json FROM reveal_configurations WHERE reveal_id=? AND product_id=?')
      .bind(checkout[1],'ticket-reveal').first();
    let fields;try{fields=JSON.parse(row?.fields_json||'null');}catch{}
    const surface=fields?.scratchSurface;
    // Permit only saved portrait Scratch Tickets, never concert, quiz,
    // gender, legacy or browser-supplied product IDs. A customer's uploaded
    // cover must be backed by an actual private R2 asset and Sapphire Wrap.
    if(surface?.variant==='ticket'){
      if(surface.style==='classic'){
        allowed=typeof surface.artworkId==='string' && !!surface.artworkId;
      }else if(surface.style==='custom' &&
               surface.postScratch?.templateId==='bg-wrap-sapphire' &&
               typeof surface.coverAssetId==='string' && !!surface.coverAssetId){
        const asset=await env.DB.prepare(
          'SELECT id FROM reveal_assets WHERE id=? AND reveal_id=? AND kind=?'
        ).bind(surface.coverAssetId,checkout[1],'scratch-cover').first();
        allowed=Boolean(asset);
      }
    }
   }
  }catch{
   return reply({success:false,error:'Staging payment database is unavailable.'},503);
  }
  if(!allowed)return reply({success:false,error:scratchStripeTestReady(env)?'Only enabled Quest and Scratch Ticket test checkout is available.':'Only Reveal Quest test checkout is enabled.'},403);
 }
 // The original Worker:
 //  - authorises checkout by hashed purchaser token
 //  - enforces the 99p fixed amount/currency and Stripe hosted-checkout URL
 //  - verifies the webhook HMAC, timestamp, test livemode and idempotency
 //  - reconciles amount, payment ID and Stripe session against D1
 //  - marks paid ONLY following Stripe's verified completion notification
 // Reveal does not charge UK VAT until the seller registers with HMRC.
 return originalWorker.fetch(request,{...env,STRIPE_AUTOMATIC_TAX:'false'},ctx);
}
