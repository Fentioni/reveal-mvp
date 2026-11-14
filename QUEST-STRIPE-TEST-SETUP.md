# Reveal Quest — Stripe TEST-mode activation

Status: CODE COMPLETE, NOT ACTIVATED. The active staging Worker is
reveal-stage4b-test.michael-fenton9.workers.dev. The production Worker is NOT
included in this rollout.

## What is already deployed
- Dedicated /api/quest/test-payment-status, GET-only, cache disabled.
- Checkout and Stripe webhook guarded in src/quest-stripe-test.js.
- Quest-only checkout; all other products remain payment-disabled.
- Original, established Stripe Worker processes payment status after validating
  the Stripe signature, event type, Stripe mode, payment/session IDs and amount.
- Stripe Checkout request sets automatic_tax[enabled]=true only for Quest tests,
  with required billing address; currency GBP, base subtotal 199 pence.
- Payment return alone never unlocks a recipient link. Paid status only changes
  after the valid signed Stripe webhook.
- Recipient must still complete every Quest clue before final details/images.

## Step 1 — Stripe TEST dashboard (never live)
In the existing Macalla Digital Stripe account, switch to test mode.

1. Use an existing test-mode product for Reveal Quest or create one.
2. Set a ONE-TIME GBP £1.99 price. Use EXCLUSIVE tax behaviour (rather than
   inclusive) so Stripe can calculate applicable tax above the base price.
3. Enable Stripe Tax/automatic tax where supported for the account and assign
   the appropriate product tax category/code. The tax actually due varies by
   billing location and registered tax obligations.
4. Copy the TEST-mode Price ID (price_...). Do not use a live price.
5. Create a TEST-mode webhook/event destination for:
   https://reveal-stage4b-test.michael-fenton9.workers.dev/api/webhooks/stripe
6. Subscribe to checkout.session.completed,
   checkout.session.async_payment_succeeded,
   checkout.session.async_payment_failed and checkout.session.expired.
7. Keep the TEST API secret key (sk_test_...) and TEST webhook signing secret
   (whsec_...) private. No screenshots or keys should be sent in chat.

## Step 2 — Cloudflare's existing staging Worker (not production)
Open the existing Worker reveal-stage4b-test under Workers & Pages.
Use Settings > Variables and Secrets, adding these 3 as encrypted secrets:
- STRIPE_SECRET_KEY — Stripe sk_test_...
- STRIPE_WEBHOOK_SECRET — Stripe whsec_... from the staging event destination
- STRIPE_PRICE_ID — the £1.99 exclusive-tax Stripe TEST price ID

The Worker already has STRIPE_LIVE_MODE=false and STAGING_DISABLE_CHECKOUT=true.
Retain both values and the existing staging D1/R2 resources.

Do not configure a live Stripe key or add any of these to the GitHub repository,
CI logs, source files or the ChatGPT conversation.

## Step 3 — Explicit controlled activation (after Step 2)
Change ONLY QUEST_TEST_CHECKOUT_ENABLED in the STAGING branch's wrangler.jsonc
from "false" to "true", commit through the existing GitHub/Cloudflare pipeline,
and re-run the automated CI and live smoke check. Never alter production
wrangler.jsonc or switch off STAGING_DISABLE_CHECKOUT.

The activation flag is currently "false". Adding secrets alone does not enable
purchases. The server additionally rejects keys not starting with sk_test_.

GET /api/quest/test-payment-status must return enabled:true before testing.

## Step 4 — End-to-end TEST payment
1. Create a fictional Reveal Quest draft (e.g. recipient Chloe) in staging.
2. Review, amend if needed, then confirm the draft.
3. Select 'Continue to Stripe test checkout', enter a TEST card such as
   4242 4242 4242 4242 (future expiration, any valid CVC).
4. Confirm Stripe calculates the one-off payment and applicable tax using the
   test billing address. Do NOT hard-code a £2.39 total on Reveal.
5. Return to Reveal; remain locked until the signed event changes the database
   payment/reveal state to paid. Payment return is not proof of payment.
6. Copy the new /r/... link into another browser and complete every clue.
7. Verify the final private details/image stay hidden before the last puzzle,
   then become available and revisitable. Test PNG keepsake and printable PDF.
8. Test cancelled checkout, expired sessions, a declined test card, duplicate
   webhooks, unexpected tax/mode/currency and non-Quest checkout access.
9. Confirm the real live Stripe account and reveal-mvp production Worker have
   NOT recorded transactions or changed.

## Automatic tests already passed
- src/quest-stripe-test.js activation and test-key restrictions.
- tests/quest-stripe-test.test.mjs: staging, other products, checkout, secrets,
  webhook routing, source-only automatic tax and purchaser review behaviour.
- tests/quest-stripe-workflow.test.mjs: uses a fake Stripe API with actual
  HMAC-signed webhooks and SQLite/D1-style payment state; verifies valid
  signatures only, amounts/mode/tax checks and puzzle completion after payment.
- Existing legacy compatibility suite and mobile Chromium/WebKit tests.

These mock tests are NOT a substitute for a genuine Stripe TEST checkout. Real
Stripe test credentials and the test webhook destination must be configured
inside the user's Cloudflare and Stripe accounts before that can be run.

## Separate Cloudflare build issue
Production Worker reveal-mvp is still listening to staging-branch pushes and
producing failed Cloudflare build checks. This does NOT confirm a production
deployment or change of running production code, but should be corrected in the
Cloudflare Dashboard:
- reveal-mvp > Settings > Builds: production branch should be main, not
  feature/stage4b-cloudflare-staging.
- reveal-stage4b-test > Settings > Builds: keep production branch
  feature/stage4b-cloudflare-staging.
- Do not try to fix this by renaming the staging wrangler.jsonc to reveal-mvp.
