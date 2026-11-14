# Reveal Quest — deploy into the EXISTING Cloudflare account
Staging branch: `feature/quest-cloudflare-staging`
Repository: `Fentioni/reveal-mvp`
Staging Worker: `reveal-quest-staging`

## Why this branch exists
The main Reveal repository points to the live Worker `reveal-mvp` and production
D1/R2. Connecting the generic Quest development branch directly would be unsafe.

This dedicated Cloudflare staging branch instead contains:
- Worker name: `reveal-quest-staging`
- Worker entry: `src/quest-staging.js` (hard-blocks checkout and webhooks)
- D1 binding: `DB` -> existing staging database `revealstage4b`
- D1 database ID: `fbc9687a-642b-42e6-ba8d-56430867e857`
- R2 binding: `IMAGES` -> existing staging bucket `reveal-images-stage4b`
- `STRIPE_LIVE_MODE=false` and `STAGING_DISABLE_CHECKOUT=true`
- No Stripe secret keys, live Stripe price ID, production database, or production image bucket.

This shares *staging-only* D1 and R2 with Stage 4B without changing its existing
Worker or its GitHub branch. Do not replace the existing Stage 4B Worker.

## Safest Cloudflare Dashboard route
Use the EXISTING Cloudflare account and GitHub authorisation.

1. Cloudflare Dashboard -> Workers & Pages -> Create application.
2. **Create a new Worker** (for example via Start with Hello World), named
   `reveal-quest-staging`. Do NOT edit or replace `reveal-mvp` or `reveal-stage4b-test`.
3. Open the new Worker -> Settings -> Build / Builds -> Connect repository.
4. Select GitHub repository `Fentioni/reveal-mvp`.
5. Before any repository-driven build, set production/deployment branch to
   `feature/quest-cloudflare-staging`. This is essential: `main` targets live production.
6. Root directory: repository root (leave blank or `/` depending on UI).
7. Build command: leave blank.
8. Deploy command: `npx wrangler deploy`.
9. Review the Worker NAME and GIT BRANCH before saving/building. The name and
   `wrangler.jsonc` name must both be `reveal-quest-staging`.
10. Confirm that the new Worker's D1/R2 bindings point to the STAGING resources
    listed above, and variables show checkout disabled.
11. Open `/quest` (or `/quest.html`) on the new Worker to play the **sample**
    adventure. The sample is not payment-gated, contains no paid surprise, and
    does not require tables to be initialised.
12. Check `/api/quest/staging-health` for database readiness *without* retrieving
    any private customer information.

If GitHub setup defaults to `main`, **STOP before saving/deploying**. Selecting
`main` would load `wrangler.jsonc` for the production `reveal-mvp` Worker.
This was a previous Stage 4B issue. Never fix this by deploying main and changing
environment variables after the fact.

## Optional next stage: DB-backed creator testing
After the Worker is deployed, run this READ-ONLY query in Cloudflare D1:
```sql
SELECT name FROM sqlite_master
WHERE type='table' AND name IN ('reveals','payments','quest_configs','quest_sessions');
```
Only if `reveals` and `payments` exist in `revealstage4b`, run the additive
`sql/01-reveal-quest.sql` in that STAGING database. Otherwise, first initialise
the *original* Reveal legacy schema into a dedicated Quest test database; do not
run this migration against `reveal-db`. Recheck staging health afterward.

**Payment is deliberately disabled in this staging branch**. To test checkout
later, use a separate test-mode-only configuration and dedicated Stripe test
webhook. Never add production secrets or enable payments in this branch.

## Acceptance
- `/quest` displays the cinematic creator and playable sample.
- All five scenes use WebP artwork from `quest-assets/`.
- `/api/reveals/<id>/checkout` POST returns HTTP 403.
- `/api/webhooks/stripe` POST returns HTTP 403.
- `/api/quest/staging-health` reports `checkoutEnabled:false`.
- `reveal-mvp` and `reveal-stage4b-test` remain unchanged.

## Automated verification
GitHub Actions > Reveal Quest Cloudflare staging safety checks (this branch).
