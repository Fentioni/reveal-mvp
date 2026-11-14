# Reveal Quest – Travel Adventure (first integrated build)

## What this branch contains
- Existing ticket/reveal Stripe Worker is retained in `src/index.js`.
- `src/quest-router.js` intercepts Quest requests and delegates all unrelated routes to the original Worker.
- `quest.html` and `quest.js` provide the guided five-chapter creator and recipient journeys.
- `sql/01-reveal-quest.sql` adds private Quest configurations and recipient-progress sessions.
- `tests/quest.test.mjs` verifies the payment gate, private final data, sequential puzzles and session state.
- Existing `reveal.html` uses neutral Stripe price language instead of assuming UK taxes; its Amend action returns Quest buyers to the Quest creator.
- The existing home page includes a link to `/quest`.

## Before deployment
1. Back up the live D1 database in Cloudflare. The migration is additive, but must run **before** deploying this Worker.
2. The six cinematic WebP backgrounds have been committed to `quest-assets/` in this branch. Verify all six load on mobile: letter, suitcase, passport, map, ticket and finale. Keep the separate ZIP only as an optional local asset backup.
3. Validate the configured Cloudflare Worker name and D1/R2 bindings.
4. Review the GitHub Actions **Reveal Quest tests** workflow, which now covers backend rules, staging isolation, and the complete sample adventure in mobile Chromium and WebKit. Its screenshot artifacts allow a visual inspection of all five chapters and the finale.
5. Use the opt-in **Reveal Quest isolated staging deployment** GitHub Actions workflow. Before it can run, configure GitHub environment `quest-staging` with Cloudflare credentials and the independent staging resources listed below. This workflow checks that the staging D1 database contains the legacy tables, applies `sql/01-reveal-quest.sql` **to staging only**, then deploys `reveal-quest-staging`.
6. Set **test-mode Stripe secrets** and a dedicated staging webhook for this staging Worker. Test real Stripe test checkout, confirmed webhook, paid recipient link, all five chapters, image gating, resuming, hints, and keepsake.
7. Only after staging and real-device visual acceptance, plan a separately approved production migration and release. **Do not run D1 migrations against `reveal-db`, deploy to `reveal-mvp`, or merge this draft pull request yet.**

## Required staging setup (not yet provisioned)
- GitHub Environment secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- GitHub Environment variables: `REVEAL_STAGING_D1_ID`, `REVEAL_STAGING_D1_NAME`, `REVEAL_STAGING_R2_BUCKET`, `REVEAL_STAGING_STRIPE_PRICE_ID`.
- A separate staging D1 database already containing the original Reveal schema (schema only; do not copy personal/payment records).
- A separate staging R2 bucket; production database and bucket identifiers are rejected automatically.
- Stripe TEST secret key and distinct TEST webhook secret configured securely for the staging Worker.

This assistant has not connected a Cloudflare account or deployed the staging Worker. The workflow is intentionally manual, never triggered by a code push.

## Paths
- `/quest` / `/quest.html` – purchaser's creator.
- `/quest.html?edit=<reveal-id>` – authorised purchaser edit flow.
- `/reveal.html?id=<reveal-id>` – existing static review / confirm / Stripe Checkout / sharing.
- `/r/<paid-slug>` – five-stage Quest recipient experience (or original legacy experience for a non-Quest reveal).
- `/api/quest/<paid-slug>/state` – paid, session-specific state.
- `/api/quest/<paid-slug>/answer` – private server-side answer check.
- `/api/quest/<paid-slug>/hint?level=1|2` – on-demand hints only.
- `/api/quest/<paid-slug>/assist` – optional assisted completion.

## Security and product boundaries
- Quest configurations are keyed to the existing `reveals` table. The original Stripe webhook is the only component able to mark them paid.
- Only a paid Quest creates a recipient session. No purchaser surprise details are sent before all five challenges are completed.
- User answers are checked on the Worker, not exposed in personalised recipient responses.
- Uploaded ticket/event imagery is blocked from the Quest recipient link until completion.
- The public template preview uses generic sample content; it does not play the purchaser's final reveal.
- Session progress is held in D1. Recipients can come back using their cookie, or begin again from another browser. No subscription.
- A printed PDF and an image keepsake are available after completion.
- Full mobile acceptance testing, accessibility review, production Stripe tests, and artistic acceptance remain necessary before commercial launch.

## Known first-build limitations
- Fixed five-chapter classic adventure is implemented; 3- and 7-stage variants are not yet wired in.
- There is a cinematic camera drift, dust effect, transitions and object-themed controls, but individual objects still need bespoke frame-by-frame interaction polish.
- The six generated backgrounds are committed. Asset quality, object-specific animation and final mobile visual acceptance still require review.
- The wider multi-product catalogue rollout (Stage 4B) was not present in the repository's main branch and is not overwritten by this feature branch.
