// Reveal stage 3. Stripe Checkout is server-created and only a verified
// Stripe webhook can unlock a paid recipient reveal.
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_BODY = MAX_IMAGE + 128 * 1024;
const MAX_WEBHOOK_BODY = 1024 * 1024;
const STRIPE_AMOUNT_MINOR = 199;
const STRIPE_CURRENCY = 'gbp';
const STRIPE_API = 'https://api.stripe.com/v1';
const WEBHOOK_TOLERANCE_SECONDS = 300;

const IMAGE_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp']
]);

const FIELDS = [
  ['recipient', 'recipient', 80],
  ['sender', 'sender', 80],
  ['eventName', 'event_name', 160],
  ['eventDate', 'event_date', 40],
  ['eventTime', 'event_time', 20],
  ['venue', 'venue', 200],
  ['admit', 'admit', 120],
  ['personalMessage', 'personal_message', 1200],
  ['ticketUrl', 'ticket_url', 2048]
];

const HANDLED_STRIPE_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired'
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class StripeApiError extends Error {
  constructor(status, retryable) {
    super('Stripe API request failed.');
    this.status = status;
    this.retryable = retryable;
  }
}

const fail = (status, message) => {
  throw new HttpError(status, message);
};

const now = () => new Date().toISOString();

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
};

async function hashToken(token) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token)
  );

  return Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, '0')
  ).join('');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (path === '/api/health' && request.method === 'GET') {
        return await health(env);
      }

      // Stripe authenticates this route with its signature. It must be handled
      // before the browser-origin protection used for customer changes.
      if (path === '/api/webhooks/stripe' && request.method === 'POST') {
        return await stripeWebhook(request, env);
      }

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        const origin = request.headers.get('Origin');
        if (origin && origin !== url.origin) {
          fail(403, 'Cross-origin changes are not allowed.');
        }
      }

      if (path === '/api/reveals' && request.method === 'POST') {
        return await create(request, env);
      }

      const owner = path.match(
        /^\/api\/reveals\/([A-Za-z0-9_-]+)(?:\/(image|confirm|amend|checkout))?$/
      );

      if (owner) {
        const [, id, action = ''] = owner;
        const row = await env.DB
          .prepare('SELECT * FROM reveals WHERE id = ?')
          .bind(id)
          .first();

        if (!row) {
          fail(404, 'Reveal not found.');
        }

        await authorise(request, row);

        if (action === '' && request.method === 'GET') {
          return json({success: true, reveal: ownerData(row)});
        }

        if (action === '' && request.method === 'PUT') {
          return await update(request, env, row);
        }

        if (action === 'image' && request.method === 'GET') {
          return await imageResponse(env, row);
        }

        if (action === 'confirm' && request.method === 'POST') {
          return await confirm(env, row);
        }

        if (action === 'amend' && request.method === 'POST') {
          return await amend(env, row);
        }

        if (action === 'checkout' && request.method === 'POST') {
          return await startCheckout(request, env, row);
        }

        fail(405, 'Method not allowed.');
      }

      const publicRoute = path.match(
        /^\/r\/([A-Za-z0-9_-]+)(\/image)?\/?$/
      );

      if (publicRoute) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          fail(405, 'Method not allowed.');
        }

        const row = await env.DB
          .prepare('SELECT * FROM reveals WHERE public_slug = ?')
          .bind(publicRoute[1])
          .first();

        // Nonexistent and every unpaid state deliberately return the same
        // response so public URLs disclose nothing before verified payment.
        if (!isPaid(row)) {
          fail(404, 'This reveal is not available.');
        }

        const response = publicRoute[2]
          ? await imageResponse(env, row)
          : recipientPage(row);

        return request.method === 'HEAD'
          ? new Response(null, {
              status: response.status,
              headers: response.headers
            })
          : response;
      }

      if (
        path === '/r' ||
        path.startsWith('/r/') ||
        path.startsWith('/api/')
      ) {
        fail(404, 'Route not found.');
      }

      return await env.ASSETS.fetch(request);
    } catch (error) {
      // Never log customer content, edit tokens, booking links, Stripe
      // responses, secrets or SQL bindings.
      if (!(error instanceof HttpError)) {
        console.error('Reveal request failed.');
      }

      return json(
        {
          success: false,
          error:
            error instanceof HttpError
              ? error.message
              : 'Something went wrong on the server.'
        },
        error instanceof HttpError ? error.status : 500
      );
    }
  }
};

function isPaid(row) {
  return Boolean(row && row.status === 'paid' && row.paid_at);
}

function stripeLiveMode(env) {
  return String(env.STRIPE_LIVE_MODE || '').toLowerCase() === 'true';
}

function stripeSettingsPresent(env) {
  return Boolean(
    env.STRIPE_SECRET_KEY &&
      env.STRIPE_WEBHOOK_SECRET &&
      /^price_[A-Za-z0-9]+$/.test(String(env.STRIPE_PRICE_ID || '')) &&
      ['true', 'false'].includes(
        String(env.STRIPE_LIVE_MODE || '').toLowerCase()
      )
  );
}

function requireStripeSettings(env) {
  if (!stripeSettingsPresent(env)) {
    fail(503, 'Payments are temporarily unavailable. Please try again later.');
  }

  const key = String(env.STRIPE_SECRET_KEY);
  const live = stripeLiveMode(env);

  if (
    (live && key.includes('_test_')) ||
    (!live && key.includes('_live_')) ||
    !String(env.STRIPE_WEBHOOK_SECRET).startsWith('whsec_')
  ) {
    fail(503, 'Payments are temporarily unavailable. Please try again later.');
  }
}

async function health(env) {
  let database = false;
  let schema = false;

  if (env.DB) {
    try {
      await env.DB.prepare('SELECT 1 AS ok').first();
      database = true;
      await env.DB
        .prepare('SELECT public_slug, revision FROM reveals LIMIT 1')
        .first();
      await env.DB
        .prepare(
          'SELECT id, checkout_session_id, checkout_url, expires_at FROM payments LIMIT 1'
        )
        .first();
      await env.DB
        .prepare('SELECT id, r2_key FROM reveal_assets LIMIT 1')
        .first();
      await env.DB
        .prepare('SELECT id, event_type FROM stripe_events LIMIT 1')
        .first();
      schema = true;
    } catch {
      // Health intentionally returns no database error details.
    }
  }

  const payments = stripeSettingsPresent(env);
  const success =
    database &&
    schema &&
    Boolean(env.IMAGES) &&
    Boolean(env.ASSETS) &&
    payments;

  return json(
    {
      success,
      message: success
        ? 'Reveal Worker is running'
        : 'Reveal setup is incomplete',
      version: 'stage-3.1',
      d1: database,
      schema,
      r2: Boolean(env.IMAGES),
      assets: Boolean(env.ASSETS),
      payments
    },
    success ? 200 : 503
  );
}

async function authorise(request, row) {
  const token = request.headers.get('X-Edit-Token');

  if (!token || token.length > 256) {
    fail(403, 'You do not have permission to edit or review this reveal.');
  }

  const hash = await hashToken(token);
  let difference = hash.length ^ row.edit_token.length;

  for (let index = 0; index < hash.length; index += 1) {
    difference |=
      hash.charCodeAt(index) ^ (row.edit_token.charCodeAt(index) || 0);
  }

  if (difference !== 0) {
    fail(403, 'You do not have permission to edit or review this reveal.');
  }
}

function ownerData(row) {
  const data = Object.fromEntries(
    FIELDS.map(([api, database]) => [api, row[database]])
  );

  return {
    ...data,
    id: row.id,
    hasImage: Boolean(row.image_key),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at,
    paidAt: row.paid_at,
    revision: row.revision,
    ...(isPaid(row) ? {shareUrl: '/r/' + row.public_slug} : {})
  };
}

async function readForm(request) {
  if (
    !request.headers
      .get('Content-Type')
      ?.toLowerCase()
      .startsWith('multipart/form-data')
  ) {
    fail(415, 'Please submit the reveal as multipart form data.');
  }

  if (Number(request.headers.get('Content-Length')) > MAX_BODY) {
    fail(413, 'The upload is too large.');
  }

  if (!request.body) {
    fail(400, 'The form is empty.');
  }

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;

    if (size > MAX_BODY) {
      await reader.cancel();
      fail(413, 'The upload is too large.');
    }

    chunks.push(value);
  }

  let form;

  try {
    form = await new Response(new Blob(chunks), {
      headers: {'Content-Type': request.headers.get('Content-Type')}
    }).formData();
  } catch {
    fail(400, 'The form could not be read.');
  }

  const values = FIELDS.map(([key, , limit]) => {
    const value = form.get(key) ?? '';

    if (typeof value !== 'string') {
      fail(400, 'Invalid text field: ' + key);
    }

    const clean = value.trim();

    if (clean.length > limit) {
      fail(400, key + ' is too long.');
    }

    return clean;
  });

  const data = Object.fromEntries(
    FIELDS.map(([key], index) => [key, values[index]])
  );

  for (const [key, label] of [
    ['recipient', 'who the reveal is for'],
    ['sender', 'who the reveal is from'],
    ['eventName', 'the surprise or event']
  ]) {
    if (!data[key]) {
      fail(400, 'Please enter ' + label + '.');
    }
  }

  if (
    data.eventDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(data.eventDate) ||
      !Number.isFinite(Date.parse(data.eventDate)) ||
      new Date(data.eventDate).toISOString().slice(0, 10) !== data.eventDate)
  ) {
    fail(400, 'Please enter a valid event date.');
  }

  if (data.eventTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.eventTime)) {
    fail(400, 'Please enter a valid event time.');
  }

  if (data.ticketUrl) {
    let parsed;

    try {
      parsed = new URL(data.ticketUrl);
    } catch {
      fail(400, 'Please enter a valid ticket or booking link.');
    }

    if (
      !['https:', 'http:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    ) {
      fail(
        400,
        'Please use an http:// or https:// booking link without embedded login details.'
      );
    }
  }

  let image = form.get('image');

  if (image && typeof image === 'string') {
    fail(400, 'Please upload an image file.');
  }

  if (!image?.size) {
    image = null;
  }

  if (image) {
    if (image.size > MAX_IMAGE) {
      fail(413, 'The image must be no larger than 10 MB.');
    }

    if (!IMAGE_TYPES.has(image.type)) {
      fail(400, 'Only JPEG, PNG and WebP images are supported.');
    }

    const bytes = new Uint8Array(await image.slice(0, 12).arrayBuffer());
    const valid =
      image.type === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : image.type === 'image/png'
          ? [137, 80, 78, 71, 13, 10, 26, 10].every(
              (value, index) => bytes[index] === value
            )
          : new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
            new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';

    if (!valid) {
      fail(400, 'The image contents do not match its file type.');
    }
  }

  const revisionText = form.get('revision');

  if (
    revisionText !== null &&
    (typeof revisionText !== 'string' || !/^\d+$/.test(revisionText))
  ) {
    fail(400, 'Invalid revision.');
  }

  return {
    values,
    image,
    removeImage: form.get('removeImage') === '1',
    revision: revisionText === null ? null : Number(revisionText)
  };
}

async function upload(env, id, image) {
  const key =
    'reveals/' + id + '/' + crypto.randomUUID() + IMAGE_TYPES.get(image.type);

  await env.IMAGES.put(key, await image.arrayBuffer(), {
    httpMetadata: {contentType: image.type},
    customMetadata: {revealId: id, uploadedAt: now()}
  });

  return key;
}

async function cleanup(env, key) {
  if (!key) return;

  try {
    await env.IMAGES.delete(key);
  } catch {
    console.warn('An unused image needs cleanup.');
  }
}

async function create(request, env) {
  const {values, image} = await readForm(request);
  const id = crypto.randomUUID();
  const editToken = randomToken();
  const tokenHash = await hashToken(editToken);
  let imageKey = null;

  try {
    if (image) {
      imageKey = await upload(env, id, image);
    }

    const timestamp = now();

    await env.DB
      .prepare(
        `INSERT INTO reveals (
          id, edit_token, ${FIELDS.map(([, database]) => database).join(',')},
          image_key, status, created_at, updated_at
        ) VALUES (
          ?, ?, ${FIELDS.map(() => '?').join(',')}, ?, 'draft', ?, ?
        )`
      )
      .bind(id, tokenHash, ...values, imageKey, timestamp, timestamp)
      .run();
  } catch (error) {
    await cleanup(env, imageKey);
    throw error;
  }

  return json(
    {success: true, id, editToken, status: 'draft', revision: 0},
    201
  );
}

async function update(request, env, row) {
  if (row.status !== 'draft') {
    fail(409, 'Use Amend before editing a confirmed reveal.');
  }

  const {values, image, removeImage, revision} = await readForm(request);

  if (revision !== null && revision !== row.revision) {
    fail(409, 'This draft has changed. Reload before saving.');
  }

  let replacement = null;
  let committed = false;

  try {
    if (image) {
      replacement = await upload(env, row.id, image);
    }

    const key = replacement || (removeImage ? null : row.image_key);
    const result = await env.DB
      .prepare(
        `UPDATE reveals SET
          ${FIELDS.map(([, database]) => database + ' = ?').join(',')},
          image_key = ?, updated_at = ?, revision = revision + 1
        WHERE id = ? AND status = 'draft' AND revision = ?`
      )
      .bind(...values, key, now(), row.id, row.revision)
      .run();

    if (result.meta.changes !== 1) {
      fail(409, 'This draft changed while saving. Reload and try again.');
    }

    committed = true;

    if (row.image_key !== key) {
      await cleanup(env, row.image_key);
    }

    return json({
      success: true,
      id: row.id,
      status: 'draft',
      revision: row.revision + 1
    });
  } catch (error) {
    if (!committed) {
      await cleanup(env, replacement);
    }

    throw error;
  }
}

async function confirm(env, row) {
  if (row.status === 'confirmed' || isPaid(row)) {
    return json({success: true, id: row.id, status: row.status});
  }

  if (row.status !== 'draft') {
    fail(409, 'This reveal cannot be confirmed in its current state.');
  }

  const timestamp = now();
  const result = await env.DB
    .prepare(
      `UPDATE reveals
      SET status = 'confirmed', confirmed_at = ?, updated_at = ?,
          revision = revision + 1
      WHERE id = ? AND status = 'draft' AND revision = ?`
    )
    .bind(timestamp, timestamp, row.id, row.revision)
    .run();

  if (result.meta.changes !== 1) {
    fail(409, 'This draft changed. Reload and review it again.');
  }

  return json({
    success: true,
    id: row.id,
    status: 'confirmed',
    revision: row.revision + 1
  });
}

async function amend(env, row) {
  if (row.status === 'draft') {
    return json({
      success: true,
      id: row.id,
      status: 'draft',
      revision: row.revision
    });
  }

  if (row.status === 'confirmed') {
    const result = await env.DB
      .prepare(
        `UPDATE reveals
        SET status = 'draft', confirmed_at = NULL, updated_at = ?,
            revision = revision + 1
        WHERE id = ? AND status = 'confirmed' AND revision = ?
          AND NOT EXISTS (
            SELECT 1 FROM payments
            WHERE reveal_id = ? AND status IN ('pending', 'paid')
          )`
      )
      .bind(now(), row.id, row.revision, row.id)
      .run();

    if (result.meta.changes !== 1) {
      fail(409, 'Payment or another change is in progress. Reload this reveal.');
    }

    return json({
      success: true,
      id: row.id,
      status: 'draft',
      revision: row.revision + 1
    });
  }

  if (row.status !== 'checkout') {
    fail(409, 'This reveal cannot be amended in its current state.');
  }

  requireStripeSettings(env);

  const payment = await activePayment(env, row.id);

  if (!payment || payment.status !== 'pending') {
    fail(409, 'The payment state has changed. Reload this reveal.');
  }

  if (!payment.checkout_session_id) {
    fail(
      409,
      'Checkout is still being prepared. Try payment again before amending.'
    );
  }

  let session;

  try {
    session = await stripeRequest(
      env,
      '/checkout/sessions/' +
        encodeURIComponent(payment.checkout_session_id) +
        '/expire',
      'POST'
    );
  } catch (error) {
    if (!(error instanceof StripeApiError)) {
      throw error;
    }

    try {
      session = await stripeRequest(
        env,
        '/checkout/sessions/' +
          encodeURIComponent(payment.checkout_session_id),
        'GET'
      );
    } catch {
      fail(502, 'Stripe could not cancel checkout. Please try again.');
    }
  }

  if (session.payment_status === 'paid' || session.status === 'complete') {
    fail(
      409,
      'Payment is being confirmed. This reveal can no longer be amended.'
    );
  }

  if (session.status !== 'expired') {
    fail(502, 'Stripe could not cancel checkout. Please try again.');
  }

  const timestamp = now();
  const results = await env.DB.batch([
    env.DB
      .prepare(
        `UPDATE payments
        SET status = 'expired', updated_at = ?
        WHERE id = ? AND reveal_id = ? AND status = 'pending'`
      )
      .bind(timestamp, payment.id, row.id),
    env.DB
      .prepare(
        `UPDATE reveals
        SET status = 'draft', confirmed_at = NULL, updated_at = ?,
            revision = revision + 1
        WHERE id = ? AND status = 'checkout' AND revision = ?
          AND NOT EXISTS (
            SELECT 1 FROM payments
            WHERE reveal_id = ? AND status IN ('pending', 'paid')
          )`
      )
      .bind(timestamp, row.id, row.revision, row.id)
  ]);

  if (
    results[0].meta.changes !== 1 ||
    results[1].meta.changes !== 1
  ) {
    fail(409, 'The payment state changed. Reload this reveal.');
  }

  return json({
    success: true,
    id: row.id,
    status: 'draft',
    revision: row.revision + 1
  });
}

async function activePayment(env, revealId) {
  return await env.DB
    .prepare(
      `SELECT * FROM payments
      WHERE reveal_id = ? AND status IN ('pending', 'paid')
      ORDER BY created_at DESC LIMIT 1`
    )
    .bind(revealId)
    .first();
}

async function startCheckout(request, env, row, retry = false) {
  requireStripeSettings(env);

  if (isPaid(row)) {
    return json({
      success: true,
      status: 'paid',
      shareUrl: '/r/' + row.public_slug
    });
  }

  if (!['confirmed', 'checkout'].includes(row.status)) {
    fail(409, 'Confirm this reveal before starting payment.');
  }

  let payment = await activePayment(env, row.id);

  if (payment?.status === 'paid') {
    fail(409, 'This reveal has already been paid for. Reload the page.');
  }

  if (!payment && row.status === 'checkout') {
    await env.DB
      .prepare(
        `UPDATE reveals SET status = 'confirmed', updated_at = ?
        WHERE id = ? AND status = 'checkout'
          AND NOT EXISTS (
            SELECT 1 FROM payments
            WHERE reveal_id = ? AND status IN ('pending', 'paid')
          )`
      )
      .bind(now(), row.id, row.id)
      .run();

    row = await env.DB
      .prepare('SELECT * FROM reveals WHERE id = ?')
      .bind(row.id)
      .first();
  }

  if (!payment && row.status === 'confirmed') {
    const paymentId = crypto.randomUUID();
    const timestamp = now();
    const results = await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO payments (
            id, reveal_id, provider, amount_minor, currency, status,
            created_at, updated_at
          )
          SELECT ?, id, 'stripe', ?, ?, 'pending', ?, ?
          FROM reveals
          WHERE id = ? AND status = 'confirmed' AND revision = ?
            AND NOT EXISTS (
              SELECT 1 FROM payments
              WHERE reveal_id = ? AND status IN ('pending', 'paid')
            )`
        )
        .bind(
          paymentId,
          STRIPE_AMOUNT_MINOR,
          STRIPE_CURRENCY,
          timestamp,
          timestamp,
          row.id,
          row.revision,
          row.id
        ),
      env.DB
        .prepare(
          `UPDATE reveals
          SET status = 'checkout', updated_at = ?
          WHERE id = ? AND status = 'confirmed' AND revision = ?
            AND EXISTS (
              SELECT 1 FROM payments
              WHERE id = ? AND reveal_id = ? AND status = 'pending'
            )`
        )
        .bind(timestamp, row.id, row.revision, paymentId, row.id)
    ]);

    if (
      results[0].meta.changes === 1 &&
      results[1].meta.changes === 1
    ) {
      payment = await env.DB
        .prepare('SELECT * FROM payments WHERE id = ?')
        .bind(paymentId)
        .first();
    } else if (!retry) {
      const current = await env.DB
        .prepare('SELECT * FROM reveals WHERE id = ?')
        .bind(row.id)
        .first();

      return await startCheckout(request, env, current, true);
    }
  }

  if (!payment || payment.status !== 'pending') {
    fail(409, 'Payment or another change is already in progress. Reload.');
  }

  if (payment.checkout_url && !paymentHasExpired(payment)) {
    return json({
      success: true,
      status: 'checkout',
      checkoutUrl: payment.checkout_url
    });
  }

  if (payment.checkout_session_id && paymentHasExpired(payment)) {
    const recovered = await recoverExpiredCheckout(env, row, payment);

    if (recovered === 'paid') {
      fail(409, 'Payment is being confirmed. Reload this reveal shortly.');
    }

    if (recovered === 'expired' && !retry) {
      const current = await env.DB
        .prepare('SELECT * FROM reveals WHERE id = ?')
        .bind(row.id)
        .first();

      return await startCheckout(request, env, current, true);
    }
  }

  return await createStripeCheckout(request, env, row, payment);
}

function paymentHasExpired(payment) {
  if (!payment.expires_at) return false;
  const expires = Date.parse(payment.expires_at);
  return Number.isFinite(expires) && expires <= Date.now();
}

async function recoverExpiredCheckout(env, row, payment) {
  let session;

  try {
    session = await stripeRequest(
      env,
      '/checkout/sessions/' + encodeURIComponent(payment.checkout_session_id),
      'GET'
    );
  } catch {
    fail(502, 'Stripe could not check this payment. Please try again.');
  }

  if (session.payment_status === 'paid' || session.status === 'complete') {
    return 'paid';
  }

  if (session.status !== 'expired') {
    if (session.url && validCheckoutUrl(session.url)) {
      await env.DB
        .prepare(
          `UPDATE payments SET checkout_url = ?, expires_at = ?, updated_at = ?
          WHERE id = ? AND status = 'pending'`
        )
        .bind(
          session.url,
          stripeExpiry(session.expires_at),
          now(),
          payment.id
        )
        .run();
      return 'open';
    }

    fail(409, 'Payment is still being checked. Reload this reveal shortly.');
  }

  const timestamp = now();
  await env.DB.batch([
    env.DB
      .prepare(
        `UPDATE payments SET status = 'expired', updated_at = ?
        WHERE id = ? AND reveal_id = ? AND status = 'pending'`
      )
      .bind(timestamp, payment.id, row.id),
    env.DB
      .prepare(
        `UPDATE reveals SET status = 'confirmed', updated_at = ?
        WHERE id = ? AND status = 'checkout'
          AND NOT EXISTS (
            SELECT 1 FROM payments
            WHERE reveal_id = ? AND status IN ('pending', 'paid')
          )`
      )
      .bind(timestamp, row.id, row.id)
  ]);

  return 'expired';
}

async function createStripeCheckout(request, env, row, payment) {
  const pageUrl = new URL('/reveal.html', request.url);
  pageUrl.searchParams.set('id', row.id);
  pageUrl.searchParams.set('payment', 'success');

  const cancelUrl = new URL('/reveal.html', request.url);
  cancelUrl.searchParams.set('id', row.id);
  cancelUrl.searchParams.set('payment', 'cancelled');

  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', pageUrl.toString());
  form.set('cancel_url', cancelUrl.toString());
  form.set('client_reference_id', row.id);
  form.set('line_items[0][price]', String(env.STRIPE_PRICE_ID));
  form.set('line_items[0][quantity]', '1');
  form.set('locale', 'en-GB');
  form.set('submit_type', 'pay');
  form.set('expires_at', String(expiresAt));
  form.set('metadata[integration]', 'reveal-mvp');
  form.set('metadata[reveal_id]', row.id);
  form.set('metadata[payment_id]', payment.id);
  form.set('metadata[price_id]', String(env.STRIPE_PRICE_ID));
  form.set('metadata[revision]', String(row.revision));
  form.set('payment_intent_data[metadata][integration]', 'reveal-mvp');
  form.set('payment_intent_data[metadata][reveal_id]', row.id);
  form.set('payment_intent_data[metadata][payment_id]', payment.id);

  let session;

  try {
    session = await stripeRequest(
      env,
      '/checkout/sessions',
      'POST',
      form,
      'reveal-checkout-' + payment.id
    );
  } catch (error) {
    if (error instanceof StripeApiError && !error.retryable) {
      await failPaymentAttempt(env, row.id, payment.id);
    }

    fail(502, 'Stripe could not start checkout. Please try again.');
  }

  const valid =
    typeof session.id === 'string' &&
    session.id.startsWith('cs_') &&
    validCheckoutUrl(session.url) &&
    session.mode === 'payment' &&
    session.status === 'open' &&
    session.payment_status === 'unpaid' &&
    validStripeAmounts(session) &&
    session.currency === STRIPE_CURRENCY &&
    Boolean(session.livemode) === stripeLiveMode(env);

  if (!valid) {
    if (typeof session.id === 'string' && session.id.startsWith('cs_')) {
      try {
        await stripeRequest(
          env,
          '/checkout/sessions/' + encodeURIComponent(session.id) + '/expire',
          'POST'
        );
      } catch {
        // The database remains locked and no reveal is fulfilled.
      }
    }

    await failPaymentAttempt(env, row.id, payment.id);
    fail(502, 'Stripe returned an unexpected checkout. Please try again.');
  }

  const result = await env.DB
    .prepare(
      `UPDATE payments
      SET checkout_session_id = ?, checkout_url = ?, expires_at = ?,
          updated_at = ?
      WHERE id = ? AND reveal_id = ? AND status = 'pending'
        AND checkout_session_id IS NULL`
    )
    .bind(
      session.id,
      session.url,
      stripeExpiry(session.expires_at),
      now(),
      payment.id,
      row.id
    )
    .run();

  if (result.meta.changes !== 1) {
    const current = await env.DB
      .prepare('SELECT * FROM payments WHERE id = ?')
      .bind(payment.id)
      .first();

    if (
      current?.status === 'pending' &&
      current.checkout_session_id === session.id &&
      validCheckoutUrl(current.checkout_url)
    ) {
      return json({
        success: true,
        status: 'checkout',
        checkoutUrl: current.checkout_url
      });
    }

    fail(409, 'The payment state changed. Reload this reveal.');
  }

  return json({
    success: true,
    status: 'checkout',
    checkoutUrl: session.url
  });
}

function stripeExpiry(value) {
  return Number.isInteger(value) && value > 0
    ? new Date(value * 1000).toISOString()
    : null;
}

function validCheckoutUrl(value) {
  if (typeof value !== 'string') return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com';
  } catch {
    return false;
  }
}

function validStripeAmounts(session) {
  return (
    Number.isInteger(session.amount_subtotal) &&
    session.amount_subtotal === STRIPE_AMOUNT_MINOR &&
    Number.isInteger(session.amount_total) &&
    session.amount_total >= session.amount_subtotal
  );
}

async function failPaymentAttempt(env, revealId, paymentId) {
  const timestamp = now();

  await env.DB.batch([
    env.DB
      .prepare(
        `UPDATE payments SET status = 'failed', updated_at = ?
        WHERE id = ? AND reveal_id = ? AND status = 'pending'
          AND checkout_session_id IS NULL`
      )
      .bind(timestamp, paymentId, revealId),
    env.DB
      .prepare(
        `UPDATE reveals SET status = 'confirmed', updated_at = ?
        WHERE id = ? AND status = 'checkout'
          AND NOT EXISTS (
            SELECT 1 FROM payments
            WHERE reveal_id = ? AND status IN ('pending', 'paid')
          )`
      )
      .bind(timestamp, revealId, revealId)
  ]);
}

async function stripeRequest(
  env,
  path,
  method,
  form = null,
  idempotencyKey = null
) {
  const headers = new Headers({
    Authorization: 'Bearer ' + String(env.STRIPE_SECRET_KEY)
  });

  if (form) {
    headers.set('Content-Type', 'application/x-www-form-urlencoded');
  }

  if (idempotencyKey) {
    headers.set('Idempotency-Key', idempotencyKey);
  }

  let response;

  try {
    response = await fetch(STRIPE_API + path, {
      method,
      headers,
      ...(form ? {body: form.toString()} : {})
    });
  } catch {
    throw new StripeApiError(0, true);
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new StripeApiError(response.status, response.status >= 500);
  }

  if (!response.ok) {
    throw new StripeApiError(
      response.status,
      response.status === 429 || response.status >= 500
    );
  }

  return data;
}

async function stripeWebhook(request, env) {
  requireStripeSettings(env);

  if (Number(request.headers.get('Content-Length')) > MAX_WEBHOOK_BODY) {
    fail(413, 'Webhook body is too large.');
  }

  const body = new Uint8Array(await request.arrayBuffer());

  if (body.byteLength > MAX_WEBHOOK_BODY) {
    fail(413, 'Webhook body is too large.');
  }

  const signature = request.headers.get('Stripe-Signature');
  const validSignature = await verifyStripeSignature(
    body,
    signature,
    String(env.STRIPE_WEBHOOK_SECRET)
  );

  if (!validSignature) {
    fail(400, 'Invalid webhook signature.');
  }

  let event;

  try {
    event = JSON.parse(new TextDecoder().decode(body));
  } catch {
    fail(400, 'Invalid webhook body.');
  }

  if (
    !event ||
    typeof event.id !== 'string' ||
    !event.id.startsWith('evt_') ||
    typeof event.type !== 'string' ||
    Boolean(event.livemode) !== stripeLiveMode(env)
  ) {
    fail(400, 'Invalid webhook event.');
  }

  if (!HANDLED_STRIPE_EVENTS.has(event.type)) {
    return json({received: true});
  }

  const session = event.data?.object;

  if (
    !session ||
    session.object !== 'checkout.session' ||
    session.metadata?.integration !== 'reveal-mvp' ||
    session.metadata?.price_id !== String(env.STRIPE_PRICE_ID)
  ) {
    // The same Stripe account may legitimately use Checkout for another app.
    return json({received: true});
  }

  const revealId = session.metadata?.reveal_id;
  const paymentId = session.metadata?.payment_id;

  if (
    typeof revealId !== 'string' ||
    typeof paymentId !== 'string' ||
    session.client_reference_id !== revealId ||
    typeof session.id !== 'string' ||
    !session.id.startsWith('cs_')
  ) {
    fail(400, 'Invalid checkout metadata.');
  }

  const payment = await env.DB
    .prepare(
      `SELECT * FROM payments
      WHERE id = ? AND reveal_id = ? AND provider = 'stripe'`
    )
    .bind(paymentId, revealId)
    .first();

  if (
    !payment ||
    payment.checkout_session_id !== session.id ||
    payment.amount_minor !== STRIPE_AMOUNT_MINOR ||
    payment.currency !== STRIPE_CURRENCY
  ) {
    fail(503, 'Webhook could not be reconciled.');
  }

  const timestamp = now();
  const eventStatement = env.DB
    .prepare(
      `INSERT OR IGNORE INTO stripe_events (
        id, event_type, livemode, received_at, processed_at
      ) VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      event.id,
      event.type,
      event.livemode ? 1 : 0,
      timestamp,
      timestamp
    );

  const isSuccessful =
    (event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded') &&
    session.payment_status === 'paid' &&
    validStripeAmounts(session) &&
    session.currency === STRIPE_CURRENCY &&
    session.mode === 'payment';

  if (isSuccessful) {
    const paymentIntent =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : null;

    await env.DB.batch([
      env.DB
        .prepare(
          `UPDATE payments
          SET status = 'paid', payment_intent_id = ?, paid_at = COALESCE(paid_at, ?),
              updated_at = ?
          WHERE id = ? AND reveal_id = ? AND checkout_session_id = ?
            AND status IN ('pending', 'paid')`
        )
        .bind(
          paymentIntent,
          timestamp,
          timestamp,
          paymentId,
          revealId,
          session.id
        ),
      env.DB
        .prepare(
          `UPDATE reveals
          SET status = 'paid', paid_at = COALESCE(paid_at, ?), updated_at = ?
          WHERE id = ? AND status IN ('checkout', 'paid')
            AND EXISTS (
              SELECT 1 FROM payments
              WHERE id = ? AND reveal_id = ? AND checkout_session_id = ?
                AND status = 'paid' AND amount_minor = ? AND currency = ?
            )`
        )
        .bind(
          timestamp,
          timestamp,
          revealId,
          paymentId,
          revealId,
          session.id,
          STRIPE_AMOUNT_MINOR,
          STRIPE_CURRENCY
        ),
      eventStatement
    ]);

    return json({received: true});
  }

  if (
    event.type === 'checkout.session.expired' ||
    event.type === 'checkout.session.async_payment_failed'
  ) {
    const nextStatus =
      event.type === 'checkout.session.expired' ? 'expired' : 'failed';

    await env.DB.batch([
      env.DB
        .prepare(
          `UPDATE payments SET status = ?, updated_at = ?
          WHERE id = ? AND reveal_id = ? AND checkout_session_id = ?
            AND status = 'pending'`
        )
        .bind(nextStatus, timestamp, paymentId, revealId, session.id),
      env.DB
        .prepare(
          `UPDATE reveals SET status = 'confirmed', updated_at = ?
          WHERE id = ? AND status = 'checkout'
            AND NOT EXISTS (
              SELECT 1 FROM payments
              WHERE reveal_id = ? AND status IN ('pending', 'paid')
            )`
        )
        .bind(timestamp, revealId, revealId),
      eventStatement
    ]);

    return json({received: true});
  }

  // A completed session can be unpaid for delayed payment methods. It remains
  // locked until Stripe later sends async_payment_succeeded.
  await eventStatement.run();
  return json({received: true});
}

async function verifyStripeSignature(body, header, secret) {
  if (!header || !secret) return false;

  const timestamps = [];
  const signatures = [];

  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 't' && /^\d+$/.test(value)) timestamps.push(Number(value));
    if (key === 'v1' && /^[a-f0-9]{64}$/i.test(value)) {
      signatures.push(value.toLowerCase());
    }
  }

  if (timestamps.length === 0 || signatures.length === 0) return false;

  const timestamp = timestamps[0];
  const current = Math.floor(Date.now() / 1000);

  if (Math.abs(current - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }

  const prefix = new TextEncoder().encode(String(timestamp) + '.');
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix, 0);
  signed.set(body, prefix.length);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign']
  );

  const digest = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, signed)
  );

  const expected = Array.from(
    digest,
    byte => byte.toString(16).padStart(2, '0')
  ).join('');

  return signatures.some(signature => constantTimeEqual(expected, signature));
}

function constantTimeEqual(left, right) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return difference === 0;
}

async function imageResponse(env, row) {
  if (!row.image_key) {
    fail(404, 'Image not found.');
  }

  const object = await env.IMAGES.get(row.image_key);

  if (!object) {
    fail(404, 'Image not found.');
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set(
    'Content-Type',
    IMAGE_TYPES.has(headers.get('Content-Type'))
      ? headers.get('Content-Type')
      : 'application/octet-stream'
  );
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');

  return new Response(object.body, {headers});
}

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]
  );
}

function recipientPage(row) {
  // Booking URLs and editor credentials are never included in this page.
  const escape = escapeHtml;
  const nonce = randomToken();
  const details = [
    ['When', [row.event_date, row.event_time].filter(Boolean).join(' · ')],
    ['Where', row.venue],
    ['For', row.admit]
  ]
    .filter(([, value]) => value)
    .map(
      ([label, value]) =>
        `<dt>${label}</dt><dd>${escape(value)}</dd>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>A surprise for you · Reveal</title>
  <style nonce="${nonce}">
    *{box-sizing:border-box}
    body{margin:0;min-height:100svh;padding:24px;display:grid;place-items:center;background:#17152b;color:#f8f5ef;font:18px/1.6 system-ui,sans-serif}
    main{width:100%;max-width:580px;text-align:center}
    h1{font-size:clamp(30px,7vw,48px);line-height:1.15;overflow-wrap:anywhere}
    p,dd{white-space:pre-wrap;overflow-wrap:anywhere}
    button{min-height:52px;padding:14px 28px;border:0;border-radius:999px;background:#eed7a6;color:#17152b;font:inherit;cursor:pointer}
    button:focus-visible{outline:3px solid white;outline-offset:5px}
    .card{padding:28px;background:#26223b;border:1px solid #524666;border-radius:24px;animation:appear .7s ease-out}
    img{max-width:100%;max-height:400px;object-fit:contain;border-radius:12px}
    dl{text-align:left}
    dt{color:#eed7a6;font-size:14px}
    dd{margin:0 0 14px}
    small{color:#c1b8d2}
    [hidden]{display:none}
    @keyframes appear{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @media(prefers-reduced-motion:reduce){.card{animation:none}}
  </style>
</head>
<body>
  <main>
    <section id="intro">
      <small>REVEAL</small>
      <h1>${escape(row.recipient)}, a surprise awaits.</h1>
      <p>With love from ${escape(row.sender)}</p>
      <button id="open" type="button">Open your surprise</button>
    </section>
    <section id="gift" class="card" hidden aria-labelledby="title">
      <small>JUST FOR YOU</small>
      <h1 id="title" tabindex="-1">${escape(row.event_name)}</h1>
      ${
        row.image_key
          ? `<img src="/r/${escape(row.public_slug)}/image" alt="Your surprise" loading="lazy">`
          : ''
      }
      <p>${escape(row.personal_message)}</p>
      <dl>${details}</dl>
      <p>From ${escape(row.sender)}</p>
      <small>You can return to this link whenever you like.</small>
    </section>
    <noscript><p>Enable JavaScript to open your surprise.</p></noscript>
  </main>
  <script nonce="${nonce}">
    document.getElementById('open').addEventListener('click',()=>{
      document.getElementById('intro').hidden=true;
      document.getElementById('gift').hidden=false;
      document.getElementById('title').focus();
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy':
        `default-src 'none'; img-src 'self'; style-src 'nonce-${nonce}'; ` +
        `script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`
    }
  });
}
