# Reveal Stage 4B - isolated Cloudflare staging

This file documents the staging-only deployment and is not an instruction to
promote it to the live Reveal Worker.

## Deployment source

- GitHub branch: `feature/stage4b-cloudflare-staging`
- Expected Worker: `reveal-stage4b-test`
- Cloudflare Workers Builds production branch for this test Worker:
  `feature/stage4b-cloudflare-staging`
- Build command: none needed
- Deploy command: `npx wrangler deploy`
- Do not deploy from `main`.

## Isolated resources

- D1 binding `DB` -> `revealstage4b`
- D1 database ID -> `fbc9687a-642b-42e6-ba8d-56430867e857`
- R2 binding `IMAGES` -> `reveal-images-stage4b`
- Worker name -> `reveal-stage4b-test`

## Payment isolation

- `STRIPE_LIVE_MODE=false`
- `STAGING_DISABLE_CHECKOUT=true`
- No `STRIPE_PRICE_ID`, production Stripe secrets, or real payment webhooks
- `src/index.js` blocks all legacy checkout initiation and Stripe webhook
  routes while `STAGING_DISABLE_CHECKOUT=true`.

## Required verification before enabling public access

1. In the **test Worker** (not `reveal-mvp`), confirm the active
   deployment source is a Build for `feature/stage4b-cloudflare-staging`.
   Dashboard-only variable edits do not prove the staging code is running.
2. Verify both bound resources are staging resources and payments are disabled.
3. Keep the workers.dev domain disabled while establishing the staging data.
4. Initialise the staging database only; do not run any migration in `reveal-db`.
5. Review the site and run non-payment smoke tests.
6. Enable a staging public domain only once the previous checks pass.

Do not use a real production database export containing customer data
without a deliberate sanitisation and access-control plan.
