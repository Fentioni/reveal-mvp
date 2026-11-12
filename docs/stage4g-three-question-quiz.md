# Stage 4G — Three-Question Quiz (staging)

## Scope and current state
- Independent catalogue product ID `three-question-quiz` (already present as draft in the Stage 4B catalogue; do not activate).
- Purchaser creator: `/quiz-create` (static HTML `public/quiz-create.html`).
- Fictional recipient demo: `/quiz-demo` (same quiz recipient shell, only local fictional questions and fictional final reveal).
- Static purchaser review: existing `/reveal?id=...` page, quiz-aware owner-only section.
- Paid recipient link: existing permanent `/r/:slug` scheme, intercepted only for an authenticated paid quiz.
- All new behaviour is confined to `feature/stage4b-cloudflare-staging`. Production untouched, Stripe checkout remains explicitly disabled.

## Locked product rules
1. Exactly three questions, four distinct text options per question, one correct answer marked by purchaser.
2. Optional purchaser-authored hint per question, four preset themes (Classic Mystery, Travel Adventure, Romantic Reveal, Birthday Challenge). The hint is never exposed before two distinct wrong choices.
3. No typed recipient answers: four-button multiple choice only.
4. Every question offers four single-select answers. Each distinct wrong choice is recorded and permanently greyed out / disabled for that question. After two wrong choices the purchaser's hint is displayed automatically (or a neutral fallback if none was supplied); after three wrong choices only the correct answer remains clickable. The recipient must tap that correct answer to advance. There is no question reset or timer.
5. Correct answer moves to next question; three successes unlock the final surprise.
6. Single-use unlocking across visits: server records steps in `reveal_events` using stable unique event IDs. Revisiting after completion directly displays the final reveal.
7. All entered surprise details display on the final card. Empty optional details do not appear. Existing secure single-image upload can be used; no extra upload fields.
8. Purchaser flow remains Create → Live static preview → Static review → Amend → Confirm → Pay → Share → Send. Playable recipient experience cannot be accessed before verified payment.
9. No tax-inclusive amount is hardcoded on the page. The existing checkout guard is unchanged; a later Stripe *test-mode* integration will be required before any real end-to-end test, with the final payable total/tax handled by checkout.
10. No questions, right answers, final message, private image, booking URL or completion record is exposed to an unpaid recipient.

## Data and security
- Reuses existing `reveals` row, owner edit-token checks, image storage, and `reveal_configurations`; new quiz configuration is stored with `product_id='three-question-quiz'` and `fields_json.quiz`.
- No new SQL migration or separate checkout controller needed. The Stage 4A `reveal_events` table stores completed steps with deterministic per-reveal event IDs.
- Owner-only `GET/PUT /api/reveals/:id/quiz` validates the original owner token through the existing Worker. PUT allows only `draft` reveals and rejects cross-origin requests. Quiz payload is validated on the server for exactly three questions, four distinct options per question, correct choice, hint length and allowed theme.
- Paid route `GET /r/:slug/quiz-state` returns only the active prompt, four options, and indexes of previously eliminated choices, without the correct answer. The hint is returned only after at least two distinct wrong options have been recorded. `POST /r/:slug/quiz-answer` verifies the active answer server-side, persistently records each unique wrong choice in existing `reveal_events`, rejects selecting a previously eliminated answer, and advances only after the remaining correct answer is selected.
- After the third recorded step, `quiz-state` also returns the final reveal fields. The recipient can revisit `/r/:slug` later without replaying.
- `GET /r/:slug/quiz-image` returns the private uploaded image only after payment AND unlock. The existing `/r/:slug/image` is intercepted for quiz products to prevent bypassing the quiz via a known image URL.
- `status === 'paid'` AND a non-null `paid_at` are mandatory for every public quiz endpoint. Missing or unconfigured products are denied; non-quiz paid reveals continue their existing routes.
- Client HTML remains a static shell with no answer keys or final surprise embedded. Only the fictional demo includes hardcoded sample answers.

## Stage 4G.1 — Optional image per quiz question (12 November 2026)
- The purchaser may attach **one optional image to each of the three questions**, independently of the existing final surprise image. All questions remain exactly four-option single-select.
- In the creator, each question panel has an upload picker (JPEG, PNG or WebP, up to 10 MB), an inline image preview, and a remove/replace action. Live static preview can switch between all three questions using labelled question tabs or when a question is focused. No purchaser-side playable quiz is exposed.
- Question images use the existing `reveal_assets` table with separate `kind` values `quiz-question-1`, `quiz-question-2`, and `quiz-question-3`, and the existing private R2 bucket. This requires no new D1 tables, migration, product, pricing or checkout.
- The owner-only `GET/HEAD/PUT/DELETE /api/reveals/:id/quiz/question-image/:number` endpoints require the original private edit token. PUT/DELETE require draft status. Both upload and replacement validate size, supported MIME and binary signature. R2 replacements are committed to D1 before old objects are removed; storage errors fail closed.
- Creator save persists the quiz record first, then uploads/removes question images individually; partial failures leave the same amendable draft and preserve unsaved local image choices for retry. Editing restores each saved question image. Static owner review shows each image alongside the corresponding question and answer key.
- For paid recipient access, `GET/HEAD /r/:slug/quiz-question-image/:number` returns only the active question's image after the pre-existing `paid` + `paid_at` gate. The image URL is unavailable for later questions and stops being available once the question is completed; questions advertise `hasImage` without exposing R2 keys. Other original reveal images and the final surprise remain inaccessible until the separate quiz unlock conditions.
- A recipient's answer choices are still checked by the server. The final-surprise picture is still a separate, single image upload and is only accessible after all three correct answers.
- Staging-only implementation. Automated tests cover storage operations, owner authorization, invalid image submissions, draft-only changes and paid recipient image-step isolation. Browser/device rendering and staging deployment remain to be verified.

## Stage 4G.2 — Exact incorrect-answer rules (12 November 2026)
- Four options per question, only one correct answer. Each distinct incorrect answer becomes grey, crossed out and disabled rather than disappearing.
- The first wrong attempt removes one option. The second wrong attempt removes another and automatically displays the purchaser's hint. If no personalised hint was supplied, a non-answer-revealing generic hint appears.
- The third wrong attempt greys out the final distractor, leaving exactly the correct choice active. The recipient must select it to advance to the next question; answering incorrectly never advances automatically.
- Attempts and previously ruled-out option indexes are stored under deterministic IDs in the existing `reveal_events` table, tied to the reveal/question/choice. Repeated submissions of already eliminated choices are rejected. Refreshing or reopening retains the rules and the current question.
- The wrong-answer counter resets for each new question. Successful completion still requires selecting one correct answer for all three questions; paid protection and post-unlock revisiting stay unchanged.
- The recipient demo applies the same rules without writing fictional demo progress to the paid database.
- Separately recorded product requirement: After correct completion of question three, the final reveal must launch a full themed animation (Classic Mystery, Travel Adventure, Romantic Reveal or Birthday Challenge) before showing the personalised surprise. **That animation is a planned subsequent build, not delivered as part of this rules change.** It must remain payment gated and optionally replayable after unlock without repeating the quiz.

## Acceptance and deferred work
- Automated tests cover required question/option validation, private editing tokens, persistence, wrong-answer retry, no skip, single-use unlock, revisits, final-data/image gate, unpaid access refusal, and preservation of ticket routes.
- The GitHub test workflow checks code compatibility and SQL upgrades only. It is **not a Cloudflare deployment workflow**; the live staging URL must be separately deployed/visually verified before claiming the page is active.
- Checkout remains disabled in staging; a complete paid-recipient end-to-end payment flow has not been exercised.
- Future product-wide work includes final recipient PDF/image keepsakes, accessibility checks on real phones, share sheet/QR variants, and live deployment only after explicit approval.
