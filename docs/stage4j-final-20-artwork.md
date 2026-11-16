# Scratch Ticket Reveal — final 20 approved artworks (decision: 16 November 2026)

## Approved direction
The user has **rejected the 13 theme-selection model** for Scratch Ticket Reveal. Do not reintroduce theme selection or generate replacement themed designs.

The only approved preset artwork is the set of **20 exact JPEG files** supplied as `Reveal_Scratch_Card_Artwork_Renamed(1).zip`, with original filenames and bytes retained. They are 3:4 portrait images: 19 at 1086 × 1448 pixels and Silver_Apex at 1536 × 2048 pixels.

## Creator
- The Scratch Ticket creator has one native dropdown, `#scratchArtwork`, with the 20 human-readable filenames as options. No theme grid, theme titles, theme backgrounds, or occasion-specific generated vector illustrations for new selected-artwork reveals.
- Selecting a different option updates the actual unscratchable live preview Canvas, not just the body background.
- Existing four foil finishes and optional private photo upload remain available.
- Concert-ticket variant retains its separate landscape creator artwork; changes apply to the portrait Scratch Ticket.
- The default selection is Azure Kaleidoscope.

## Storage and recipient
- The allowlisted artwork ID is saved as `reveal_configurations.fields_json.scratchSurface.artworkId`.
- Owner-only review reads the same ID, displays the exact selected JPEG in a static Canvas. Drafts can be amended.
- Recipient API returns ID only for the pre-existing paid reveal authorization. Recipient ScratchCard paints the same approved JPEG as the interactive scratch foil, preserving the scratch gesture and replay.
- Public artwork JPEGs contain no recipient/purchaser information. Private event details, image upload, and booking information stay protected until paid.
- Existing reveals without an artworkId can still use legacy themed Canvas behavior; the creator does not expose themes as a new option.

## Deployment
The images must be committed as **20 separate image assets** under `public/scratch-artwork/` on `feature/stage4b-cloudflare-staging` exactly matching `public/scratch-artwork-catalogue.js`. A ZIP containing them is not an executable asset. Do not alter production `main`, real customer D1/R2, or payment settings.

`node tests/scratch-artwork-files.mjs` is a hard deployment acceptance gate; it must fail when any JPEG is missing. The browser acceptance suite uses synthetic images to verify interface behavior and must not be misrepresented as proof of JPEG availability.

When all JPEGs are present and staging is deployed, manually verify actual imagery on desktop and mobile at `/legacy-create`, owner static review, and paid recipient link (test-mode only).
