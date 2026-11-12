# Stage 4D scratch-surface system (staging)

## Implemented (12 November 2026)
- Original dependency-free Canvas scratch engine.
- Premium foil artwork: Classic, Theatre Velvet and Concert Lights.
- Gold, Silver, Midnight and Rose finishes.
- The public fictional demo offers presets plus a local user-supplied image, cropped to cover the scratch surface. Demo uploads stay in-browser only.
- No percentage-triggered clearing; remaining foil is removed only by the user's gesture. No Reveal Without Scratching button.
- Concealed contents cannot flash on the initial load before the foil paints.
- Staging Ticket & Concert Reveal creator offers scratch style, foil and optional custom cover upload.
- Creator shows only a non-interactive/static design preview and restores selected styling on Amend.
- Staging owner-authorised scratch-surface GET/PUT endpoints, plus private owner image GET route.
- Existing D1 reveal_configurations.fields_json records the style, foil and coverAssetId.
- Existing reveal_assets stores one scratch-cover record per reveal; corresponding JPG/PNG/WebP is stored privately in reveal-images-stage4b R2.
- Saved scratch surface is shown in static owner review without enabling scratch interactions.
- Automated security, image validation, persistence and route tests.

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
- Public demo images never go to R2.
- No purchaser preview or owner static review may scratch/replay an actual personalised recipient experience.

## Later work
- Fully paid recipient scratch experience, served only after verified payment, with locked private images and shareable revisitable link.
- Responsive user-defined crop offsets and richer artwork files from the purchaser.
- User-provided sound tracks and reveal timing.
- Original PDF and image keepsakes.
- Production migration and payment integration only after independent testing and user authorisation.
