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
4. Run `npm test`. The tests are designed for Node 22.
5. Apply the D1 migration to the actual `reveal-db` database in Cloudflare D1's SQL Console or with:
   `npx wrangler d1 execute reveal-db --remote --file=sql/01-reveal-quest.sql`
   This changes only the new Quest tables and index.
6. Test on a staging Worker with Stripe TEST credentials and a real test payment followed by the paid recipient URL and all five puzzle stages.
7. After successful staging and mobile visual acceptance, deploy intentionally using your established Cloudflare workflow. Do **not** simply merge into main without confirming how the Worker is deployed.

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
