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

## Stage 4E: Purchaser layout restored from preferred original scratch demo (12 November 2026)
- The user selected the original two-column `/scratch-demo?v=background-only-4` layout as the preferred purchaser creator design.
- Staging `/legacy-create` now adopts the original charcoal/gold visual styling: finish and artwork controls in the left column, a large gold-framed scratch-cover preview on the right.
- The creator retains all four artwork choices, all four foil finishes, custom top-layer upload, ticket data entry, image attachment, owner-token saving, static review and Amend navigation.
- The cover is strictly a static Canvas drawing in the creator, with pointer interactions disabled. No recipient scratching is unlocked by selecting a design.
- A single cover Canvas relocates under the artwork controls at <=900px so mobile users can inspect changes without scrolling past the rest of the lengthy form.
- Ticket content updates live as before, in a separate expandable static detail panel.
- Music/audio is deferred and its unfinished purchaser UI is not displayed. Newly created drafts select no audio.
- `/scratch-demo` stays recipient-only with a fixed fictional reveal and no design controls. Payment-gated live recipient route is unchanged.
- All changes remain confined to the stage4b branch, no production checkout changes.

## Stage 4E single image-upload decision (12 November 2026)
- Ticket & Concert Reveal has one visible `Add an image` uploader in the actual purchaser creator; the separate `scratchCoverImage` uploader has been removed.
- Choosing one photo automatically selects the custom scratch-cover artwork, updates the non-interactive cover preview, and sends the same file through the existing owner image save and private scratch-cover save paths.
- Artwork/foil selection and all ticket information remain editable. The recipient demonstration still has no design controls.
- JPEG/PNG/WebP uploads must be at least 640 by 640 pixels and 10 MB or smaller for use as a scratch surface.
- The single Remove control clears the selected image and reverts custom artwork to classic, avoiding an absent cover at review.
- For a saved draft, existing private scratch-cover imagery can still be restored; the first uploader also represents the saved image without prompting for a second file.
- No schema or API contract change was required. The existing `image` field and owner-authenticated `scratch-surface` API still receive the necessary data.
- Music remains deferred, and customer scratch interaction remains payment protected.

## Stage 4E: Full ticket detail display (12 November 2026)
- User requirement: every populated input on the Ticket & Concert Reveal creation form must appear on the recipient's final revealed card; optional fields with no value must not appear at all (including label, placeholder, divider, or empty space).
- Paid recipient scratch-data now includes recipient, sender, eventName, eventDate, eventTime, venue, admit, personalMessage, ticketUrl, and a hasEventImage flag. The sensitive ticket URL and original image are not in anonymous or public previews and are only served behind the existing status=paid AND paid_at verification.
- Date, time, venue, admit, personal message, booking link, and uploaded event image are independently conditional. Sender, recipient and event name remain required by the draft form.
- A separate paid-only /r/:slug/scratch-image endpoint serves the existing private event image with cache-control: private, no-store, image MIME validation, and no R2 object key in the page data.
- The official ticket/booking URL is displayed inside the revealed card only when set, using a safe http(s) link. A tappable action also becomes available beneath the card after significant scratching because the scratch canvas overlay prevents clicks through to underneath it.
- Recipient card height grows to accommodate lengthy submitted details rather than cutting off optional values; long messages and URLs wrap.
- The purchaser's live static details preview and static review now also hide blank optional fields, showing a populated booking URL without fabricated "To be confirmed" values.
- The actual recipient card is never available pre-payment. All changes staged only, no production update.

## Stage 4E: Scratch Concert Ticket Reveal variant (12 November 2026)
- User requires the **identical** purchaser and recipient production pipeline for Scratch Concert Ticket Reveal, changing only surface imagery, artwork choices and labels. Do not duplicate payment, validation, D1 schema, owner-token protection, preview, review, sharing or recipient rendering.
- Staging creator uses `/legacy-create?variant=concert`. Standard Ticket & Concert Reveal remains available at `/legacy-create`. Both share the original `ticket-reveal` configuration and API paths; no new catalogue product ID, price, database schema or Stripe checkout has been created yet.
- The creator automatically selects the existing Concert Lights cover, Midnight foil, and offers four relevant designs: Concert Lights; original new Festival Access; original new Backstage Pass; Your own image. Classic foil and Theatre Velvet remain ticket-only design choices.
- Foil choices reuse the same four finish IDs and underlying renderer, with concert-specific names: VIP Gold, Chrome Silver, Midnight Stage and Neon Rose. Artwork is rendered with original Canvas shapes and gradients rather than external copyrighted imagery.
- Same single upload supports the custom scratchable cover and protected event image. Same required and optional form fields, owner save/amend, one-off price model, tax handling, static review and payment-gated recipient scratch link.
- `variant:'concert'` persists under `reveal_configurations.fields_json.scratchSurface`. Owner GET/PUT and paid scratch-data transmit the variant; the paid recipient page changes only concert heading and ticket label while rendering all populated fields with the same optional-field omission rules.
- An existing stored concert variant is restored automatically when editing from the review page, even though its URL only includes `?edit=id`.
- The concert creator is linked from the staging ticket product details page. It is a variant, **not yet an independent catalogue SKU**, so a separate catalogue entry requires a later explicit catalogue/business step.
- Payment and production remain unchanged. The staging checkout guard must not be bypassed to demonstrate this variant.

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
