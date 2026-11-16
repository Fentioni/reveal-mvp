# Stage 4K — Concert Ticket creator, five independently selected parts (16 November 2026)

## User-approved workflow

1. **Ticket template:** Choose from four ticket silhouettes taken from the supplied concert-ticket reference sheet: Side perforations, Stamp edge, Classic notches, Rounded stub. These are blank structural shapes, not pre-printed decorative themes.
2. **Scratch colour:** Gold, Silver, Midnight Blue, Rose. Colour spans the entire scratchable Canvas. No diagonal rays, watermarks, slogans or theme art on the scratch layer.
3. **Revealed ticket artwork:** Classic, Concert Lights, Festival, Backstage. These are original static SVG artworks and themes for the **ticket beneath** the scratchable layer, never the foil. Changing a theme does not alter the scratch colour or ticket template.
4. **Optional link or QR:** Existing booking URL is retained. Creator chooses whether the paid recipient gets a clickable URL or a real locally generated QR code for that URL. If no URL, omit both. QR generation uses the existing local `/qr.js` library. QR remains visually hidden until the recipient scratches sufficiently; link action also appears only after scratching. Both are protected by existing paid status and paid_at checks.
5. **Optional event artwork:** Reuse the existing single image upload and R2 event attachment. Image is displayed after payment beneath the scratch surface; it must not replace the chosen colour or theme artwork. One upload only.

## Storage and rendering

- The same `ticket-reveal` product and existing owner/private API persist to `reveal_configurations.fields_json.scratchSurface` using `ticketTemplate`, `revealTheme`, `linkMode` alongside existing `style`, `foil`, `variant`. Strict allowlists; no new SQL migration, price, checkout method or subscriptions.
- The shared `public/concert-ticket-options.js` supplies the four normalized ticket silhouettes for creator Canvas, owner review and paid recipient, including responsive CSS `clip-path`. No rasterized low-resolution templates.
- The actual post-scratch art is in `public/concert-reveal-art/*.svg`; one genuine unique scene per revealed-ticket choice.
- The paid recipient gets the chosen fields only through `/r/:slug/scratch-data` after verified `paid` status and a non-null `paid_at`. The accompanying event artwork comes from the preexisting protected `/scratch-image` route. Only the owner with edit token can inspect full prepayment review.
- Older concert drafts with no new settings default to Classic notches, Classic post-scratch artwork and clickable-link mode. Old `festival`/`backstage` scratch style values remain parseable for compatibility but no longer appear in the creator or paint old theme graphics over the concert foil.
- The 20 exact approved portrait Scratch Ticket images and its separate creator dropdown are unchanged.
- This work is staged in `feature/stage4b-cloudflare-staging` / `reveal-stage4b-test`, with staging payments disabled. Do not deploy to production `main` or copy over production payment secrets.

## Acceptance

Run `npm test` for static, backend and payment-gate assertions; the scratch browser workflow runs Chromium and WebKit mobile and desktop tests. Check the four visibly distinct shapes and four full-surface scratch colours, independent post-scratch theme selection, optional QR and existing photo upload; verify full purchaser save → protected owner review → recipient interaction with payment test-only configuration before release.
