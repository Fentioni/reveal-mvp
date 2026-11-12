# Stage 4D scratch-surface system (staging)

## Status, 12 November 2026
Implemented: original Canvas scratch engine with Classic, Theatre Velvet and Concert Lights surface artwork; Gold, Silver, Midnight and Rose foil finishes; a public fictional demonstration; local custom-photo cover preview with crop-to-cover; restarts and optional sound; file validation; manual-only foil removal; page-load spoiler prevention.

Not yet implemented: saving a purchaser's choices, private R2 storage of purchaser covers, D1 persistence, static owner review of the selected cover, paid recipient integration. These are required before the scratch-card product can be sold.

## Locked requirements
1. All remaining foil persists until manually erased by the recipient. No auto-hide threshold.
2. Customers can choose a premium standard cover, themed presets or their own image as the erasable top layer.
3. Cover art and actual hidden event or ticket content are separate assets.
4. The public demonstration uses fictional content, is replayable and does not save uploads.
5. The owner's actual review stays static, without allowing the paid reveal to be played or captured.
6. The recipient's interactive animation and private ticket details are delivered only after server-verified payment.
7. Mobile first, optional audio, original artwork, no subscription and no hardcoded checkout tax.

## Configuration
Surface style: classic, theatre, concert or custom.
Foil: gold, silver, midnight or rose.
For a custom image, use centre-crop-to-cover with adjustable offsets in a later phase.
The static review must show the selected surface (without scratch interaction).
The recipient scratch canvas must show the full selected surface until manually erased.

## D1 and R2 mapping (existing Stage 4A schema)
The staging database already includes reveal_configurations (reveal_id, product_id, fields_json, schema_version) and reveal_assets (reveal_id, r2_key, kind, created_at).
Store scratchSurface inside reveal_configurations.fields_json, preserving other product fields. Suggested fields: style, foil, coverAssetId, crop.x, crop.y, crop.zoom.
For customer-uploaded images, store the validated original image in private R2 bucket reveal-images-stage4b and use reveal_assets.kind = scratch-cover. Store only the asset record ID in the configuration, never a blob URL, public image URL or base64 file. The existing event-poster image is distinct and must not be overwritten.
No additional table is needed for this planned model.

## Backend and creator integration still required
- Authorised, draft-only save/load endpoints under /api/reveals/:id/scratch-surface using the existing owner edit token.
- Secure image signature and format checks, file size <= 10MB, dimension checks, replacement and cleanup.
- Authenticated owner image access before payment; recipient image access only when the reveal is paid.
- A non-scratchable live cover preview and upload selector in the ticket creator; save after drafting and before redirecting to review.
- Restore the cover configuration and private image when editing an existing draft. Preserve it on refresh.
- Separate static review that never ships playable personalised reveal assets.
- Paid delivery, replay and keepsake download as separate later gates.

## Tests
Verify: stale async image loads cannot override a new choice; upload never leaves the public demo; unsupported or low-resolution files are rejected; switching styles resets scratch marks; all untouched foil persists; invalid owner tokens cannot access any saved cover; unpaid recipients receive no custom cover or personalised animation; no Stripe checkout or webhook is enabled in staging.
