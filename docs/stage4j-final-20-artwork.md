# Scratch Ticket Reveal — final 20 approved artworks (decision: 16 November 2026)

## Approved direction
The user has **rejected the 13 theme-selection model** for Scratch Ticket Reveal. Do not reintroduce theme selection or generate replacement themed designs.

The only approved preset artwork is the set of **20 exact JPEG files** supplied as `Reveal_Scratch_Card_Artwork_Renamed(1).zip`, with original filenames and bytes retained. They are 3:4 portrait images: 19 at 1086 × 1448 pixels and Silver_Apex at 1536 × 2048 pixels.

## Creator
- The Scratch Ticket creator has one native dropdown, `#scratchArtwork`, with the 20 human-readable filenames as options. No theme grid, theme titles, theme backgrounds, or occasion-specific generated vector illustrations for new selected-artwork reveals.
- Selecting a different option updates the actual unscratchable live preview Canvas, not just the body background.
- The four foil finish swatches (Gold, Silver, Midnight and Rose) are **Concert Ticket only**, not offered on the 20-image portrait Scratch Ticket.
- Optional private photo upload remains available; no additional artwork upload control is added.
- The **separate Concert Ticket creator uses only four full-surface foil colours: Gold, Silver, Midnight and Rose.** It has no Concert Lights, Festival Access, Backstage Pass, or other theme/artwork tiles. Each colour must repaint the entire ticket, not only its border. The surface has no decorative diagonal rays, slogans or watermark-like text.
- The colour-only concert ticket keeps its landscape ticket shape, neutral inner outline and perforated stub. The preview and the paid recipient Canvas must both use the same selected colour, including on narrow/mobile screens where the ticket content can grow vertically.
- The optional concert event/ticket image remains a **reveal attachment** shown after payment and must never override the scratch-surface colour.
- Neither selected final JPEGs nor landscape concert scratch-face artwork should receive automatic text labels, stamps or watermarks. Scratch instructions belong outside the Canvas.
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
