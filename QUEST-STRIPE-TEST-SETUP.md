# Reveal Quest — Stripe TEST rollout (14 November 2026)

Status: Stripe sandbox product and dedicated staging webhook VERIFIED. The
staging Worker is deployed, but Quest checkout remains DISABLED. All production
infrastructure and the existing production-bound webhook are untouched.

## Verified directly in Stripe — Reveal Development sandbox

- Sandbox account: Reveal Development (acct_1USbEJKEVPKWz2E9), TEST mode only
- Product: prod_VTYUf4muHEcajR ("Reveal - Digital Gift Reveal"), active
- One-time Price: price_1USbNbKEVPKWz2E9zmH0mabR, GBP 199p, tax-exclusive, active
- Product tax code: txcd_10506001
- Stripe Tax settings: active; tax behaviour exclusive
- Historical successful completed test checkouts: £1.99 subtotal, £0.40 UK
  automatic tax, £2.39 total; automatic_tax.enabled true and liability Stripe
- Production-bound TEST webhook (must retain):
  we_1UScAPKEVPKWz2E9ArtykWGm
  https://reveal-mvp.michael-fenton9.workers.dev/api/webhooks/stripe
- NEW dedicated staging TEST webhook created and verified enabled:
  we_1UbjiyKEVPKWz2E9vS5yWo8y
  https://reveal-stage4b-test.michael-fenton9.workers.dev/api/webhooks/stripe
- Staging webhook listens for:
  checkout.session.completed, checkout.session.async_payment_succeeded,
  checkout.session.async_payment_failed, checkout.session.expired

No further Stripe product, price, tax-rate or webhook creation is needed.
Stripe's webhook signing secret is not returned when reading the endpoint; it
must be viewed in Stripe's secure Dashboard. Do not paste it into chat or GitHub.

## 15 November 2026 test activation and Cloudflare binding audit

Quest-only TEST checkout was temporarily enabled in the staging branch.
Cloudflare's staging build and compatibility tests succeeded, but the deployed
Worker returned enabled:false. A temporary read-only authenticated audit
confirmed the flag, verified £1.99 price, staging D1/R2 and TEST mode
were correctly configured, but both STRIPE_SECRET_KEY and
STRIPE_WEBHOOK_SECRET were absent from the running staging Worker.

The cause has not been determined: the secret bindings may have been saved to
another Worker/environment, failed to deploy, or been lost on a subsequent
GitHub-driven deployment. We have restored the checkout flag to false,
removed the protected audit endpoint and deleted its temporary workflow.
No genuine Quest checkout was attempted.

Check the exact two encrypted secret names under Cloudflare Dashboard >
Workers & Pages > reveal-stage4b-test > Settings > Variables and Secrets.
Use credentials from the Reveal Development sandbox and the dedicated
Quest staging webhook. Do not send any secret values in chat, source, CI logs,
or screenshots.

## 15 November 2026 — verification after encrypted secrets added

After the user added both encrypted Stripe secrets to the **correct**
Cloudflare staging Worker, the Quest-only feature flag was enabled in
`feature/stage4b-cloudflare-staging`.

Latest staging Cloudflare Worker build passed. Live GitHub smoke verified
`GET /api/quest/test-payment-status` returned
`environment:staging, mode:test, enabled:true,
automaticTax:true, baseAmountMinor:199, currency:gbp`.
The first eight polls observed `enabled:false` while Cloudflare was
deploying; readiness became true on a subsequent poll. The non-Quest
checkout endpoint returned HTTP 403, confirming isolation.

The code compatibility suite passed. A genuine Stripe-hosted card checkout
and signed webhook still require an end-to-end purchase through the
published staging Quest creator; readiness is not proof of a completed
payment. The production Worker has a separate unrelated failed Build
check because it follows staging pushes, as previously documented.

## 15 November 2026 — first genuine Quest Stripe TEST checkout succeeded

Verified directly against Reveal Development sandbox, not a simulated charge:
- Checkout TEST session status complete; payment_status paid
- Actual GBP subtotal 199p, auto tax 40p, total 239p
- automatic_tax.enabled=true and liability.type=stripe
- Checkout URL returned to the existing Stage 4B staging Worker
- The actual checkout.session.completed event was created in Stripe
- A temporary protected read-only Cloudflare staging D1 audit confirmed:
  revealPaid=true, paymentPaid=true, webhookEventRecorded=true,
  questConfigured=true, staging=true
- The audit returned booleans only and did not reveal customer data or secrets
- The one-time receipt audit endpoint and CI workflow were removed following
  verification; they must not remain accessible
- Recipient UX on real devices (puzzle completion, final private details,
  keepsake download and revisits) is the next acceptance step; database payment
  validation alone is not a complete visual test

## Staging Cloudflare Worker

- Worker: reveal-stage4b-test
- Branch: feature/stage4b-cloudflare-staging
- Staging D1: revealstage4b
- Staging R2: reveal-images-stage4b
- Existing vars are preserved: STRIPE_LIVE_MODE=false,
  STAGING_DISABLE_CHECKOUT=true and QUEST_TEST_CHECKOUT_ENABLED=false
- As of this commit, wrangler.jsonc now contains the verified
  NONSECRET STRIPE_PRICE_ID=price_1USbNbKEVPKWz2E9zmH0mabR
- A previous read-only presence audit confirmed STRIPE_SECRET_KEY and
  STRIPE_WEBHOOK_SECRET absent from staging. Its temporary diagnostic endpoint
  and audit workflow have been removed.

## The only two remaining credentials (secure Cloudflare setup)

Open Cloudflare Dashboard > Workers & Pages > reveal-stage4b-test >
Settings > Variables and Secrets. Add these as ENCRYPTED Secrets:

1. STRIPE_SECRET_KEY: an API key from **Reveal Development** sandbox, not the
   ordinary Macalla Digital test-mode account. Use the existing appropriately
   scoped rk_test_ restricted key, if it supports Stripe Checkout Session
   creation and retrieval; otherwise a TEST sk_test_ key for this sandbox.
2. STRIPE_WEBHOOK_SECRET: the whsec_ signing secret from **the new staging**
   endpoint we_1UbjiyKEVPKWz2E9vS5yWo8y. Do not use the older reveal-mvp
   endpoint's signing secret.

Do not add STRIPE_PRICE_ID as a secret: the verified public price ID is already
bound through wrangler.jsonc. Do not share any secret values in chat, GitHub,
files, issues, logs, screenshots, or source control.

The available ChatGPT integrations cannot currently create encrypted Cloudflare
Worker bindings or retrieve a Stripe API secret key. Only account-authorised
Cloudflare access can complete these steps.

## Once both secrets exist

After validating the two secret bindings, update only
QUEST_TEST_CHECKOUT_ENABLED in the STAGING branch's wrangler.jsonc to "true".
Keep STRIPE_LIVE_MODE=false and STAGING_DISABLE_CHECKOUT=true; these allow
Quest-only guarded test requests without enabling any other product checkout.

Run all automated tests and GET /api/quest/test-payment-status, which must report
enabled:true, mode:test, automaticTax:true. If anything differs, disable the
flag immediately.

Use a fictional Quest created on the staging Worker. Confirm its review, pay
with a Stripe TEST card, verify the subtotal/tax calculated by Stripe from the
test billing address, and verify the return does NOT unlock the surprise until
the signed Stripe webhook marks D1 paid. Open the /r/... link in a separate
browser. Solve all clues, confirm details/images unlock only after the final
correct puzzle, revisit the paid link, and download the PNG/PDF keepsakes.

Test unsigned/duplicate/mismatched webhooks, cancelled/expired/declined
checkouts, cross-origin requests and attempts to pay for non-Quest products.
Never send production checkout data or reveal details through the staging
webhook. Never mark a reveal paid manually.

## Historical tax/UI issue

Stripe's original UK tax calculation was correct; Stage 3.1 changed the Worker
to validate the 199-pence SUBTOTAL rather than equating the tax-inclusive total
with 199p. Production main/reveal.html still contains five hard-coded £2.39
references and must be separately corrected before launching ANY products.
Staging public/reveal.html appropriately displays "At checkout".

## Cloudflare branch hygiene

The production reveal-mvp Worker has generated failed builds from staging
branch pushes. Correct its Cloudflare Build branch mapping in the Dashboard:
reveal-mvp -> main; reveal-stage4b-test ->
feature/stage4b-cloudflare-staging. Do not copy staging wrangler.jsonc into
the production Worker or merge the staging config into main.
