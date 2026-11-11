# Reveal Online Business | Stage 4B GitHub development branch

This kit extends the existing Cloudflare Workers/D1/R2/Stripe Reveal MVP into a multi-category storefront without replacing the existing paid-recipient and creator APIs. The changes are additive, with complete replacement files generated automatically.

## What is included

- `src/catalogue.js`: new D1-backed, read-only catalogue endpoints.
- `src/index.js`: a complete Worker entry point that routes catalogue requests and delegates existing payment/reveal routes to the unmodified `src/legacy.js`.
- `assets/storefront.html`, `storefront.css`, `storefront.js`: a responsive storefront, 11 category pages, product detail views, navigation and visible Coming soon states.
- `sql/00-stage4a-catalogue.sql`: additive catalogue schema plus 11 categories, 6 mechanisms and 10 themes. This is equivalent in structure to the earlier Stage 4A SQL. Do not rerun if your live version has since diverged without checking it.
- `sql/01-stage4b-products.sql`: 30 initial products across the 11 categories. All 30 products are draft/Coming soon until the ticket product has passed staging and is separately approved for activation. A draft catalogue price record for the existing ticket-reveal product is 199 minor GBP units before tax. The original Stripe Price ID still controls checkout and must be reconciled before launch.
- `tools/apply-stage4b.mjs`: generates a full upgraded project from your original extracted `reveal-mvp-main.zip`, preserving `src/index.js` as `src/legacy.js`. No hand-editing is needed.
- `tests`: SQL, Worker API, upgrade and optional Chromium visual checks.

## Upgrade without overwriting the original

The original `reveal-mvp-main.zip` is needed locally to build the complete merged project. This kit does not include those original private source bytes.

1. Extract the original ZIP into a folder called `reveal-mvp-main`.
2. Extract this upgrade kit next to that folder.
3. In Terminal in the containing folder, run:

   ```bash
   node reveal_stage4b/tools/apply-stage4b.mjs ./reveal-mvp-main ./reveal-mvp-stage4b
   ```

4. The generated folder `reveal-mvp-stage4b` is a complete replacement project with the original Worker retained as `src/legacy.js`.
5. Open `STAGE4B-UPGRADE-REPORT.json` in that folder. It confirms preservation, page counts, and the removal of the static £2.39 wording from the original checkout/review page.

If the original static assets were configured from the project root, the upgrade safely relocates them into `/public` and rewrites the Wrangler asset directory to avoid exposing source code or SQL via the public website.

## Database setup

Back up the production D1 database before any migration. In Cloudflare Dashboard > Storage & databases > D1 > your existing Reveal database > Console:

- Apply `sql/00-stage4a-catalogue.sql` if and only if the Stage 4A schema has not already been applied. The migration is additive.
- Apply `sql/01-stage4b-products.sql`. The product seed is idempotent and preserves existing reveals and payments.

Verify with this read-only query:

```sql
SELECT 'Categories' AS item, COUNT(*) AS total FROM categories
UNION ALL SELECT 'Products', COUNT(*) FROM products
UNION ALL SELECT 'Mechanisms', COUNT(*) FROM mechanics
UNION ALL SELECT 'Themes', COUNT(*) FROM themes;
```

Expected after a clean install: 11 categories, 30 products, 32 category-product relationships, 6 mechanisms, 10 themes and no active products. With the audited existing 12-product baseline, expect 30 products, 43 category-product relationships, 61 product-mechanism mappings and 79 product-theme mappings.

## Test and deploy

Run `npm test` inside the upgrade kit (Node 20+ and Python 3 required). The Chromium visual test is optional: `python3 tests/visual_smoke.py` when Python Playwright and Chromium are available.

Do not deploy directly over the live Worker without validating an end-to-end **test-mode** Stripe checkout and paid recipient link in your own environment. The upgrade reuses the existing D1/R2 bindings and Stripe secrets; it does not add, copy or expose credentials.

When you have validated staging, run `npx wrangler deploy` inside the generated `reveal-mvp-stage4b` folder (assuming Wrangler is installed and the Cloudflare target is intentional). Check the `name`, D1 binding and R2 binding in your original `wrangler.jsonc` before deployment.

## Routes

- `/`: storefront
- `/categories/:slug/`: category (D1-driven)
- `/products/:slug/`: product (D1-driven)
- `/products/reveal-quest/`: themed, personalisable clue product description
- `/products/three-question-quiz/`: three-question test product description
- `/api/catalogue`: category and product listing
- `/api/catalogue/categories/:slug`: category and products
- `/api/catalogue/products/:slug`: product with compatible mechanisms/themes and configured base price
- `/create/ticket-reveal`: existing ticket creator, reached through `/legacy-create.html`
- `/api/reveals/*`, `/api/webhooks/stripe`, `/r/*`: delegated untouched to the original Worker

New product records can be added in D1 without creating more static files. D1 determines visibility. `status='draft'` renders Coming soon; `status='archived'` is hidden.

## Pricing and payments

There is no hard-coded UK tax-inclusive £2.39 display in the new storefront. The hard-coded total in the old review and checkout page (`reveal.html`) is replaced with checkout-confirmation wording. The original payment verification stays unchanged.

The catalogue API reads configured base prices from D1. **Existing legacy ticket checkout still uses your original Stripe Price ID and Worker payment validation.** The new catalogue price is not yet the Stripe charge source of truth. Do not change the D1 price without making a corresponding safe update to the legacy checkout mechanism; validate that your existing Stripe Price matches the configured base price.

Stripe Checkout is responsible for determining applicable tax and any local currency display, according to your Stripe Tax, Adaptive Pricing, and account configuration. A purchaser's final tax-inclusive total is not known in advance and must not be asserted in pre-checkout text.

## Stage boundaries and limitations

This is a genuine Stage 4B catalogue and storefront extension, not the generalised Stage 5 creator or Stage 6 payment engine. All 30 products remain draft, so no product is purchasable from the Stage 4B catalogue until it is explicitly activated. The original legacy endpoints remain preserved. The full Reveal Quest puzzle engine, share methods and keepsake downloads remain subsequent implementation milestones.

This reconstruction is based on the source details available in the previous conversations and the original Worker excerpt. The earlier Work environment's unpublished code and its reported 17 tests are **not contained in this kit**. Tests in this kit are separate. The original source ZIP could not be directly merged in this chat, so the upgrade script generates the final full replacement locally.

No third-party frontend libraries, fonts or external image dependencies are used in this kit, so it adds no licensing or attribution requirements.


## Direct GitHub integration

This branch contains the complete replacement Worker, the legacy Worker preserved as `src/legacy.js`, static assets under `public/`, and all Stage 4B database migrations. The branch is not deployed. Before merging or deploying, back up D1, apply and verify migrations, test Stripe in test mode, and confirm recipient link protection on a staging Worker. The existing Stripe Price ID still determines the charge; database pricing is informational pending the next integration stage.


## Audited Stage 4A compatibility (11 November 2026)

The existing Cloudflare D1 database was inspected **read-only** by the project owner. It has 11 categories, 6 mechanisms, 10 themes, 12 draft products, 23 category links, 43 mechanism mappings, 61 theme mappings, zero product price rows and no foreign-key violations. All 27 category/mechanism/theme identifiers match this branch's schema. The table and index definitions were also reviewed.

This compatibility branch deliberately preserves the existing product IDs `ticket-reveal`, `romantic-proposal` and `newlywed-gift`. It does not overwrite existing products, cross-category mappings or defaults (including Quiz = Celebration and Reveal Quest = Travel Adventure). The revised Stage 4B insert-only seed supplies 18 additional products and 20 missing category links. No products are automatically activated.

The SQL test suite covers both a clean installation and a **synthetic** fixture matching the audited counts and known identifiers/defaults. It cannot substitute for testing an export of the actual D1 database, which has not been provided. A complete backup, a separate staging database and an end-to-end Stripe test-mode checkout are required before production migration or deployment.

The development branch is not merged or deployed. The linked legacy creator remains available only through the Stage 4B `/create/ticket-reveal` route when D1 marks the product active, although original direct legacy URLs and APIs remain unchanged for compatibility. Do not treat the draft state as a production-wide payment disable switch.
