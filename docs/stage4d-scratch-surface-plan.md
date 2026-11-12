# Stage 4D scratch-surface system (staging)

## Implemented (12 November 2026)
- Original dependency-free Canvas scratch engine.
- Premium foil artwork: Classic, Theatre Velvet and Concert Lights.
- Gold, Silver, Midnight and Rose finishes.
- Public /scratch-demo is now recipient-only: a fixed fictional, preconfigured card that can be scratched, with no surface/foil selector or custom-image uploader. It is not the purchaser creator.
- No percentage-triggered clearing; remaining foil is removed only by the user's gesture. No Reveal Without Scratching button.
- Concealed contents cannot flash on the initial load before the foil paints.
- Staging Ticket & Concert Reveal creator offers scratch style, foil and optional custom cover upload.
- Creator shows only a non-interactive/static design preview and restores selected styling on Amend.
- Staging owner-authorised scratch-surface GET/PUT endpoints, plus private owner image GET route.
- Existing D1 reveal_configurations.fields_json records the style, foil and coverAssetId.
- Existing reveal_assets stores one scratch-cover record per reveal; corresponding JPG/PNG/WebP is stored privately in reveal-images-stage4b R2.
- Saved scratch surface is shown in static owner review without enabling scratch interactions.
- Automated security, image validation, persistence and route tests.

## Stage 4D cinematic audio and ticket UI (12 November 2026)
- Ticket creator now displays four visual, independently selectable artwork cards: Classic foil (Premium scratch ticket), Theatre Velvet (Curtains and gold print), Concert Lights (VIP-style neon artwork), Your own image (Scratch off your photo).
- A separate row of Gold, Silver, Midnight, Rose foil swatches remains available independently of artwork selection.
- A checked-by-default optional audio setting is visible in the creator. Audio is not played in the creator or static review.
- The scratch-surface API accepts audioEnabled=true/false and saves an "audio" object inside the existing reveal_configurations.fields_json: enabled, cue="cinematic-drum-roll", trigger="first-scratch", delayMs=3000.
- The static owner review shows the saved audio setting but never plays it.
- The public fictional demonstration is currently silent: audio UI, scratch sounds and cinematic playback have been removed. It provides a fictional scratch interaction and demo-only restart.
- The cue is a synthesised orchestral-percussion prototype, not a licensed/recorded orchestral soundtrack. Customer-authored music/audio will replace or supplement it later without changing timing rules.
- The staged /r/:slug recipient page and its /scratch-data and /scratch-cover endpoints require existing legacy payment evidence: reveal status paid AND non-null paid_at. Unpaid states return 404 with no artwork or personalised content.
- Paid scratch page uses the same Canvas engine and cue rules, with the saved enabled toggle, and no automatic foil clearing.
- Staging checkout and Stripe webhooks remain disabled. Paid recipient route has automated tests but cannot yet be exercised through the complete real Stripe checkout journey.

## Restrictions still in place
- All 30 catalogue products remain in draft mode; no payment or public recipient scratch unlock is enabled in staging.
- No shareable paid recipient scratch card or keepsake is provided until its own tested stage.
- Staging-only scratch-surface API is inaccessible unless STAGING_DISABLE_CHECKOUT=true; no production Worker or D1 changed.

## Design and storage contract
- Surface style values: classic, theatre, concert, custom.
- Foil values: gold, silver, midnight, rose.
- The custom cover image is the scratchable **top** layer, distinct from the event poster or ticket underlay.
- The original image is privately stored in R2, not in public assets or a D1 JSON data URL.
- The configuration is embedded as scratchSurface inside reveal_configurations.fields_json, preserving other product data.
- For custom images, coverAssetId is an existing reveal_assets.id with kind scratch-cover.
- Only the owner who knows X-Edit-Token can fetch or amend scratch preferences and cover images; edits require status=draft.
- Custom images are selected and stored through the purchaser creator, not the recipient demonstration. The public demo uses only fixed fictional artwork and never sends images to R2.
- No purchaser preview or owner static review may scratch/replay an actual personalised recipient experience.

## Journey separation (12 November 2026)
- Purchaser /legacy-create: personalise ticket, choose Classic / Theatre / Concert / custom art, select foil, upload custom cover, static preview only; then save, static review, amend, confirm, checkout.
- Purchaser /reveal: static review only. Never allow interactive personalised scratching before payment.
- Recipient /scratch-demo: fictional prototype of the final interaction. No design selectors, no upload, no audio, no user-paid content.
- Paid /r/:slug: final recipient-only scratch experience is served only when server-verified payment permits access; no customer design controls. Full staging payment journey is still not enabled.

## Later work
- Fully paid recipient scratch experience, served only after verified payment, with locked private images and shareable revisitable link.
- Responsive user-defined crop offsets and richer artwork files from the purchaser.
- User-provided sound tracks and reveal timing.
- Original PDF and image keepsakes.
- Production migration and payment integration only after independent testing and user authorisation.
