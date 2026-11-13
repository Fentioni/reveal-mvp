# Stage 4H — Group Gender Reveal (staging-only)

## Product scope
An independent draft catalogue product `gender-reveal`, retaining the existing Reveal core records, owner edit tokens, purchaser review, Stripe checkout protection, and permanent recipient link. Code is restricted to `feature/stage4b-cloudflare-staging`; production unchanged.

The important distinction is that guests **can open the same audience link before the reveal to make their guesses**. The result/animation, not the voting lobby, stays locked until the purchaser starts it.

## Customer journey
1. Purchaser creates a Group Gender Reveal using `/gender-create`. They secretly choose Boy or Girl, choose an animation style (Pastel Magic or Confetti Celebration), enter a neutral public headline and host name, and optionally add a message only shown after the result.
2. Live creator preview is static and does not expose the chosen result, run the countdown or allow voting.
3. Existing purchaser `/reveal?id=:id` uses an owner-only Gender Reveal review section to display and confirm the secret outcome and visual style; amendment returns to the gender editor.
4. The existing payment pipeline remains separate and unchanged; no checkout is allowed in the current staging environment.
5. Only after verified payment, the purchaser receives a permanent **audience link** `/r/:slug` and a separate **private host control** `/gender-host?edit=:id`, which requires the existing browser's private edit token. Only the audience link is shared with guests.
6. Anyone with the audience link can see Boy/Girl buttons and aggregate counts, which update by polling the shared D1 database. Each guest enters a display name (required for voting) and makes one Boy or Girl guess per browser/device (the browser remembers a random UUID). The selected name appears beneath that choice’s total for all link holders, including after the reveal. The creator's result is not sent in the public voting or countdown responses.
7. The host explicitly presses “Open the reveal · start 5-second countdown”. The underlying D1 start event is inserted once, and new votes are blocked atomically after that event exists. A single shared reveal deadline is sent to all screens.
8. Everyone sees 5 → 4 → 3 → 2 → 1 based on the recorded server time, then the chosen Boy/Girl result with a distinct themed ending (Pastel Magic's soft glowing shimmer or Confetti Celebration's falling pieces). It remains revisitable.
9. A fictional demo route `/gender-demo` simulates the process (including sample totals 6 Boy / 2 Girl), but does not persist or synchronise votes between people. It is only a UI demonstration, not evidence of live cross-client testing.

## Database/API
- Gender settings are stored in existing `reveal_configurations.fields_json.gender` with `product_id='gender-reveal'` and `gender:{version:1,result:'boy'|'girl',theme:'pastel'|'confetti'}`. No schema changes.
- Owner-only `GET/PUT /api/reveals/:id/gender` validates the same hashed private edit token as the existing creator. Only draft owner can alter the secret.
- Owner-only `POST /api/reveals/:id/gender/start` requires the original edit token, `status='paid'` and non-null `paidAt`. A deterministic D1 `reveal_events` ID means only one start can be recorded. The event metadata stores a deadline 5,000 ms after the start.
- Public `GET /r/:slug/gender-state` requires paid status plus `paid_at` and returns counts, named guest lists grouped by Boy/Girl, the current browser’s saved vote and name (if a stored browser UUID is supplied), phase, server time and deadline. The result and optional message are omitted unless the server-side deadline has elapsed. To keep polling manageable, each response shows up to the first 500 stored names plus a precise count of further votes.
- Public `POST /r/:slug/gender-vote` requires paid status and an origin-checked JSON payload `{voterId,choice,name}`. Display name is required, trimmed, whitespace-normalised, limited to 40 characters and rejected if it contains markup delimiters or control characters. A SHA-256 digest of the browser UUID forms a deterministic vote key; the Boy/Girl choice is stored as `reveal_events.event_type` and the display name as `metadata_json.name`. Neither raw browser UUID nor owner token is published. `INSERT ... SELECT WHERE NOT EXISTS start-event` prevents late votes at the database statement level, and the primary key prevents repeat votes or name-changing with that UUID.
- Public `/r/:slug` renders only the HTML shell for a paid gender product. Non-gender paid reveals continue their original routes without changes.
- The single shared audience link works across browsers and devices with polling. Display names and chosen sides are intentionally visible to anyone with the paid audience link; no emails or verified identities are collected. Guest names are rendered as plain text rather than injected HTML. The private host dashboard shows the same lists beneath its counts.

## Limitations and acceptance
- One-vote-per-browser/device is not verified one-person-one-vote. Guest display names are self-entered and may repeat or be impersonated; clearing local storage, changing browsers or using multiple devices can create another participant ID. The UI explicitly tells guests their names will be visible to anyone with the shared link. No individual vote-edit/delete control has yet been developed. Abuse prevention, invite access limits and moderation can be explored for larger events.
- The private host controls currently use the original purchaser's browser-local edit token, so a different browser with no token cannot start it. If portable host access is required, implement a separate narrowly scoped host token rather than exposing the existing edit token in an audience URL.
- Staging checkout is explicitly disabled. A real paid multi-device event has not been tested; Cloudflare staging deployment and live iPhone/desktop timing still require verification. Do not claim production deployment or real-time live tests from the GitHub CI alone.
- Automated tests cover owner token protection, config isolation, paid-only lobby/voting, name validation and public grouping, duplicate-vote/name immutability, accurate counts with a 500-name display cap, shared counts before/after unlock, host-only idempotent start, frozen counts after start, shared deadline, non-disclosure before reveal and correct result after deadline.
- The current purchaser/static reviewer and existing checkout remain in use; the standard ticket and quiz products are not repurposed.
