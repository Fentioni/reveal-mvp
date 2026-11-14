# Reveal Quest — integrated Stage 4B feature

This feature is based on `feature/stage4b-cloudflare-staging`, not on the older Stage 3 mainline. Existing catalogue, ticket, quiz, scratch-card, gender-reveal, D1/R2 and Stripe plumbing is retained.

## Implemented
- A real five-chapter Mystery & Clues / Travel Adventure Quest creator at `/create/reveal-quest` (alias `/quest`).
- Ready-made, adaptable and fully custom clue text, answers and two hints per chapter.
- Safe interactive template preview using fictional sample data, with no actual purchaser surprise or paid finale.
- Purchaser review, confirm, Amend, Stripe Checkout and sharing through the existing reveal lifecycle.
- Server-side payment checking on `/r/:slug`, individual quest sessions and sequential puzzle validation in D1.
- Two optional recipient-triggered hints per chapter and explicit assisted progression.
- Protected final surprise and uploaded image until all five chapters have been completed.
- Replayable paid finale, image keepsake and print/save PDF.
- Stage 4B catalogue integration and staging-only creator/test links.
- Unit/integration tests added to the existing Stage 4B `npm test` suite.

## Required cinematic assets
Download the separate `reveal-quest-cinematic-assets.zip` supplied in ChatGPT, extract it and add **all six files** to **`public/quest-assets/`** on this branch:
`letter.webp`, `suitcase.webp`, `passport.webp`, `map.webp`, `ticket.webp`, `finale.webp`.

The public web scenes look weaker without those actual rendered photos. They must be committed before staging visual acceptance. They are not yet included in the branch because image bytes cannot be pushed through the available GitHub text-file connector.

## Safe staging steps
1. Back up the staging D1 database `revealstage4b`.
2. Run additive migration `sql/02-reveal-quest.sql` on staging:
   `npx wrangler d1 execute revealstage4b --remote --file=sql/02-reveal-quest.sql`.
3. Upload the six images to `public/quest-assets/` and verify the asset paths return images.
4. Run `npm test` (Node 22 and Python 3); the existing GitHub Actions workflow also runs the suite.
5. Check that `wrangler.jsonc` still targets **`reveal-stage4b-test`**, D1 `revealstage4b`, and R2 `reveal-images-stage4b`. It currently retains `STAGING_DISABLE_CHECKOUT=true`.
6. Deploy staging intentionally using your established Cloudflare process, then open `https://reveal-stage4b-test.michael-fenton9.workers.dev/create/reveal-quest`.
7. Verify the creator, template preview, review, Amend, mock chapter behaviour, mobile layout, legacy product smoke tests and asset performance. No Stripe payment can be taken in this staging branch while checkout is deliberately disabled.
8. Before any live production deployment, require separate approval, migrate the correct live database, configure real/test Stripe appropriately and complete a verified end-to-end payment, recipient link, five-stage unlock and browser-resume test.

## Architecture
`src/quest-router.js` wraps the existing Stage 4B `src/index.js`. It intercepts Quest APIs and paid Quest recipient paths, and delegates all other requests to the existing catalogue/quiz/scratch/gender/legacy Worker. Quest data is attached to an existing reveal ID and uses its paid state from the original Stripe-verified webhook.

## Important first-build limits
- The flagship five-stage story is implemented; three- and seven-stage variants are next.
- Actual object animation and cinematic transitions need real-device visual approval and further polishing; functional stages must not be mistaken for a fully finished cinematic production.
- The final PDF uses the browser print/save-to-PDF capability.
- The image pack must be committed separately.
