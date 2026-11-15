/**
 * Stripe TEST checkout for Reveal Quest only.
 *
 * Safe default: a disabled Stage 4B staging Worker remains non-paying. This
 * never permits live Stripe credentials, production bindings, non-Quest
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
export function questStripeTestReady(env){
 return Boolean(
  isolatedStaging(env) &&
  env.QUEST_TEST_CHECKOUT_ENABLED==='true' &&
  /^(?:sk|rk)_test_[A-Za-z0-9]+$/.test(String(env.STRIPE_SECRET_KEY||'')) &&
  /^whsec_[A-Za-z0-9]+$/.test(String(env.STRIPE_WEBHOOK_SECRET||'')) &&
  /^price_[A-Za-z0-9]+$/.test(String(env.STRIPE_PRICE_ID||''))
 );
}
function isCheckout(path){
 return /^\/api\/reveals\/([A-Za-z0-9_-]+)\/checkout\/?$/.exec(path);
}
/** Return a Response for Stripe staging-specific paths; null otherwise. */
export async function questStripeTestResponse(request,env,ctx,originalWorker){
 const url=new URL(request.url);
 const path=url.pathname;
 // One-time read-only TEST receipt verification; no personal details, IDs, or secrets in response.
 if(path==='/api/quest/test-receipt-check-7e5c' && request.method==='GET'){
  if(request.headers.get('x-quest-receipt-audit')!=='K9qW28Nb5tD76GzM4cE3YpL11QXr0fV' || !questStripeTestReady(env))return reply({success:false},404);
  try{
   const id='5749dc62-e486-43ea-92f5-17221ddf3624';
   const pid='7fc02597-cb11-485e-b029-ddae601aa043';
   const sid='cs_test_a0uDjQkG4hEZuDzRZBbg8RYMkgfGbr2oNtmOvW4acpGFNNLqtrt3XeQSWH';
   const eventId='evt_1Uc1hAKEVPKWz2E9Pm4QJ7mG';
   const [reveal,payment,event,quest]=await Promise.all([
    env.DB.prepare('SELECT status, paid_at FROM reveals WHERE id=?').bind(id).first(),
    env.DB.prepare('SELECT status, paid_at, checkout_session_id FROM payments WHERE id=? AND reveal_id=?').bind(pid,id).first(),
    env.DB.prepare('SELECT id FROM stripe_events WHERE id=?').bind(eventId).first(),
    env.DB.prepare('SELECT reveal_id FROM quest_configs WHERE reveal_id=?').bind(id).first()
   ]);
   return reply({success:true,environment:'staging',
    revealPaid:reveal?.status==='paid'&&Boolean(reveal?.paid_at),
    paymentPaid:payment?.status==='paid'&&Boolean(payment?.paid_at)&&payment?.checkout_session_id===sid,
    webhookEventRecorded:Boolean(event),
    questConfigured:Boolean(quest)});
  }catch{
   return reply({success:false,error:'Read-only staging receipt check unavailable.'},503);
  }
 }
 if(path==='/api/quest/test-payment-status' && request.method==='GET'){
  if(!isolatedStaging(env))return reply({success:false,error:'Not available.'},404);
  return reply({success:true,environment:'staging',mode:'test',
    enabled:questStripeTestReady(env),automaticTax:true,
    baseAmountMinor:199,currency:'gbp'});
 }
 const checkout=isCheckout(path);
 if(path!=='/api/webhooks/stripe' && !checkout)return null;

 // Other products remain payment-disabled even when test mode is enabled.
 // All webhook handling remains isolated to the Stage 4B TEST environment.
 if(!questStripeTestReady(env)){
  return reply({success:false,error:'Checkout is disabled in this staging environment.'},503);
 }
 if(request.method!=='POST'){
  return reply({success:false,error:'Method not allowed.'},405);
 }
 if(checkout){
  const origin=request.headers.get('origin');
  if(origin && origin!==url.origin)return reply({success:false,error:'Invalid request origin.'},403);
  let found;
  try {
   found=await env.DB.prepare('SELECT reveal_id FROM quest_configs WHERE reveal_id=?')
     .bind(checkout[1]).first();
  }catch{
   return reply({success:false,error:'Quest staging database is unavailable.'},503);
  }
  if(!found)return reply({success:false,error:'Only Reveal Quest test checkout is enabled.'},403);
 }
 // The original Worker:
 //  - authorises checkout by hashed purchaser token
 //  - enforces £1.99 base amount/currency and Stripe hosted-checkout URL
 //  - verifies the webhook HMAC, timestamp, test livemode and idempotency
 //  - reconciles amount, payment ID and Stripe session against D1
 //  - marks paid ONLY following Stripe's verified completion notification
 // Set Stripe Automatic Tax for this forwarded request only.
 return originalWorker.fetch(request,{...env,STRIPE_AUTOMATIC_TAX:'true'},ctx);
}
