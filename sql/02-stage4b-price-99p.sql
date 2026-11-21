-- Optional staging D1 reconciliation: apply only after backup and verification.
-- Existing catalogue row was £1.99; checkout is now configured for 99p without UK VAT.
-- Does not modify historical payments, reveals, paid links, or Stripe event records.
UPDATE product_prices SET amount_minor=99,tax_behavior='unspecified'
WHERE id='ticket-reveal-gbp' AND product_id='ticket-reveal' AND currency='gbp'
  AND country_code IS NULL AND active=1;
