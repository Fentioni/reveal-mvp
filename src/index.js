// Reveal: stage 2
// Uses the existing DB, IMAGES and ASSETS bindings.

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_BODY = MAX_IMAGE + 128 * 1024;

const IMAGE_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"]
]);

const FIELDS = [
  ["recipient", "recipient", 80],
  ["sender", "sender", 80],
  ["eventName", "event_name", 160],
  ["eventDate", "event_date", 40],
  ["eventTime", "event_time", 20],
  ["venue", "venue", 200],
  ["admit", "admit", 120],
  ["personalMessage", "personal_message", 1200],
  ["ticketUrl", "ticket_url", 2048]
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function fail(status, message) {
  throw new HttpError(status, message);
}

function now() {
  return new Date().toISOString();
}

function randomToken() {
  const bytes = crypto.getRandomValues(
    new Uint8Array(32)
  );

  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, "0")
  ).join("");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}


/* MAIN ROUTER */

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (
        path === "/api/health" &&
        request.method === "GET"
      ) {
        return await health(env);
      }

      if (
        ["POST", "PUT", "PATCH", "DELETE"].includes(
          request.method
        )
      ) {
        const origin = request.headers.get("Origin");

        if (origin && origin !== url.origin) {
          fail(
            403,
            "Cross-origin changes are not allowed."
          );
        }
      }

      if (
        path === "/api/reveals" &&
        request.method === "POST"
      ) {
        return await create(request, env);
      }

      const owner = path.match(
        /^\/api\/reveals\/([A-Za-z0-9_-]+)(?:\/(image|confirm|amend))?$/
      );

      if (owner) {
        const [, id, action = ""] = owner;

        const row = await env.DB
          .prepare(
            "SELECT * FROM reveals WHERE id = ?"
          )
          .bind(id)
          .first();

        if (!row) {
          fail(404, "Reveal not found.");
        }

        await authorise(request, row);

        if (
          action === "" &&
          request.method === "GET"
        ) {
          return json({
            success: true,
            reveal: ownerData(row)
          });
        }

        if (
          action === "" &&
          request.method === "PUT"
        ) {
          return await update(request, env, row);
        }

        if (
          action === "image" &&
          request.method === "GET"
        ) {
          return await imageResponse(env, row);
        }

        if (
          action === "confirm" &&
          request.method === "POST"
        ) {
          return await confirm(env, row);
        }

        if (
          action === "amend" &&
          request.method === "POST"
        ) {
          return await amend(env, row);
        }

        fail(405, "Method not allowed.");
      }

      const publicRoute = path.match(
        /^\/r\/([A-Za-z0-9_-]+)(\/image)?\/?$/
      );

      if (publicRoute) {
        if (
          request.method !== "GET" &&
          request.method !== "HEAD"
        ) {
          fail(405, "Method not allowed.");
        }

        const row = await env.DB
          .prepare(
            "SELECT * FROM reveals WHERE public_slug = ?"
          )
          .bind(publicRoute[1])
          .first();

        // Unpaid and nonexistent links receive the
        // same response without customer details.
        if (!isPaid(row)) {
          fail(404, "This reveal is not available.");
        }

        const response = publicRoute[2]
          ? await imageResponse(env, row)
          : recipientPage(row);

        if (request.method === "HEAD") {
          return new Response(null, {
            status: response.status,
            headers: response.headers
          });
        }

        return response;
      }

      if (
        path === "/r" ||
        path.startsWith("/r/") ||
        path.startsWith("/api/")
      ) {
        fail(404, "Route not found.");
      }

      return await env.ASSETS.fetch(request);

    } catch (error) {
      // Do not log tokens, customer content,
      // booking URLs or SQL bindings.
      if (!(error instanceof HttpError)) {
        console.error("Reveal request failed.");
      }

      return json(
        {
          success: false,
          error:
            error instanceof HttpError
              ? error.message
              : "Something went wrong on the server."
        },
        error instanceof HttpError
          ? error.status
          : 500
      );
    }
  }
};


/* HEALTH */

function isPaid(row) {
  return Boolean(
    row &&
    row.status === "paid" &&
    row.paid_at
  );
}

async function health(env) {
  let database = false;
  let schema = false;

  if (env.DB) {
    try {
      await env.DB
        .prepare("SELECT 1 AS ok")
        .first();

      database = true;

      await env.DB
        .prepare(
          "SELECT public_slug, revision FROM reveals LIMIT 1"
        )
        .first();

      await env.DB
        .prepare(
          "SELECT id, checkout_session_id FROM payments LIMIT 1"
        )
        .first();

      await env.DB
        .prepare(
          "SELECT id, r2_key FROM reveal_assets LIMIT 1"
        )
        .first();

      schema = true;

    } catch {
      // Return no database error details.
    }
  }

  const success =
    database &&
    schema &&
    Boolean(env.IMAGES) &&
    Boolean(env.ASSETS);

  return json(
    {
      success,
      message: success
        ? "Reveal Worker is running"
        : "Reveal setup is incomplete",
      version: "stage-2",
      d1: database,
      schema,
      r2: Boolean(env.IMAGES),
      assets: Boolean(env.ASSETS)
    },
    success ? 200 : 503
  );
}


/* EDITOR AUTHORISATION */

async function authorise(request, row) {
  const token = request.headers.get(
    "X-Edit-Token"
  );

  if (!token || token.length > 256) {
    fail(
      403,
      "You do not have permission to edit or review this reveal."
    );
  }

  const hash = await hashToken(token);

  let difference =
    hash.length ^ row.edit_token.length;

  for (let i = 0; i < hash.length; i++) {
    difference |=
      hash.charCodeAt(i) ^
      (row.edit_token.charCodeAt(i) || 0);
  }

  if (difference !== 0) {
    fail(
      403,
      "You do not have permission to edit or review this reveal."
    );
  }
}

function ownerData(row) {
  const data = Object.fromEntries(
    FIELDS.map(([api, db]) => [
      api,
      row[db]
    ])
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

    ...(isPaid(row)
      ? {
          shareUrl: "/r/" + row.public_slug
        }
      : {})
  };
}


/* FORM PARSING AND VALIDATION */

async function readForm(request) {
  const contentType = request.headers.get(
    "Content-Type"
  );

  if (
    !contentType
      ?.toLowerCase()
      .startsWith("multipart/form-data")
  ) {
    fail(
      415,
      "Please submit the reveal as multipart form data."
    );
  }

  if (
    Number(
      request.headers.get("Content-Length")
    ) > MAX_BODY
  ) {
    fail(413, "The upload is too large.");
  }

  if (!request.body) {
    fail(400, "The form is empty.");
  }

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    size += value.byteLength;

    if (size > MAX_BODY) {
      await reader.cancel();
      fail(413, "The upload is too large.");
    }

    chunks.push(value);
  }

  let form;

  try {
    form = await new Response(
      new Blob(chunks),
      {
        headers: {
          "Content-Type": contentType
        }
      }
    ).formData();

  } catch {
    fail(400, "The form could not be read.");
  }

  const values = FIELDS.map(
    ([key, , limit]) => {
      const value = form.get(key) ?? "";

      if (typeof value !== "string") {
        fail(
          400,
          "Invalid text field: " + key
        );
      }

      const clean = value.trim();

      if (clean.length > limit) {
        fail(400, key + " is too long.");
      }

      return clean;
    }
  );

  const data = Object.fromEntries(
    FIELDS.map(([key], index) => [
      key,
      values[index]
    ])
  );

  const required = [
    ["recipient", "who the reveal is for"],
    ["sender", "who the reveal is from"],
    ["eventName", "the surprise or event"]
  ];

  for (const [key, label] of required) {
    if (!data[key]) {
      fail(
        400,
        "Please enter " + label + "."
      );
    }
  }

  // Dates are optional for gifts and
  // experiences without a booked date.
  if (
    data.eventDate &&
    (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        data.eventDate
      ) ||
      !Number.isFinite(
        Date.parse(data.eventDate)
      ) ||
      new Date(data.eventDate)
        .toISOString()
        .slice(0, 10) !== data.eventDate
    )
  ) {
    fail(
      400,
      "Please enter a valid event date."
    );
  }

  if (
    data.eventTime &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(
      data.eventTime
    )
  ) {
    fail(
      400,
      "Please enter a valid event time."
    );
  }

  if (data.ticketUrl) {
    let parsed;

    try {
      parsed = new URL(data.ticketUrl);
    } catch {
      fail(
        400,
        "Please enter a valid ticket or booking link."
      );
    }

    if (
      !["https:", "http:"].includes(
        parsed.protocol
      ) ||
      parsed.username ||
      parsed.password
    ) {
      fail(
        400,
        "Please use an http:// or https:// booking link without embedded login details."
      );
    }
  }

  let image = form.get("image");

  if (image && typeof image === "string") {
    fail(
      400,
      "Please upload an image file."
    );
  }

  if (!image?.size) {
    image = null;
  }

  if (image) {
    if (image.size > MAX_IMAGE) {
      fail(
        413,
        "The image must be no larger than 10 MB."
      );
    }

    if (!IMAGE_TYPES.has(image.type)) {
      fail(
        400,
        "Only JPEG, PNG and WebP images are supported."
      );
    }

    const bytes = new Uint8Array(
      await image
        .slice(0, 12)
        .arrayBuffer()
    );

    let valid = false;

    if (image.type === "image/jpeg") {
      valid =
        bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255;

    } else if (image.type === "image/png") {
      valid = [
        137, 80, 78, 71, 13, 10, 26, 10
      ].every(
        (value, index) =>
          bytes[index] === value
      );

    } else if (image.type === "image/webp") {
      const decoder = new TextDecoder();

      valid =
        decoder.decode(
          bytes.slice(0, 4)
        ) === "RIFF" &&
        decoder.decode(
          bytes.slice(8, 12)
        ) === "WEBP";
    }

    if (!valid) {
      fail(
        400,
        "The image contents do not match its file type."
      );
    }
  }

  const revisionText = form.get("revision");

  if (
    revisionText !== null &&
    (
      typeof revisionText !== "string" ||
      !/^\d+$/.test(revisionText)
    )
  ) {
    fail(400, "Invalid revision.");
  }

  return {
    values,
    image,
    removeImage:
      form.get("removeImage") === "1",
    revision:
      revisionText === null
        ? null
        : Number(revisionText)
  };
}


/* IMAGE STORAGE */

async function upload(env, id, image) {
  const key =
    "reveals/" +
    id +
    "/" +
    crypto.randomUUID() +
    IMAGE_TYPES.get(image.type);

  await env.IMAGES.put(
    key,
    await image.arrayBuffer(),
    {
      httpMetadata: {
        contentType: image.type
      },
      customMetadata: {
        revealId: id,
        uploadedAt: now()
      }
    }
  );

  return key;
}

async function cleanup(env, key) {
  if (!key) return;

  try {
    await env.IMAGES.delete(key);
  } catch {
    console.warn(
      "An unused image needs cleanup."
    );
  }
}


/* CREATE DRAFT */

async function create(request, env) {
  const { values, image } =
    await readForm(request);

  const id = crypto.randomUUID();
  const editToken = randomToken();
  const tokenHash = await hashToken(
    editToken
  );

  let imageKey = null;

  try {
    if (image) {
      imageKey = await upload(
        env,
        id,
        image
      );
    }

    const timestamp = now();

    const columns = FIELDS
      .map(([, db]) => db)
      .join(",");

    const placeholders = FIELDS
      .map(() => "?")
      .join(",");

    await env.DB
      .prepare(`
        INSERT INTO reveals (
          id,
          edit_token,
          ${columns},
          image_key,
          status,
          created_at,
          updated_at
        )
        VALUES (
          ?,
          ?,
          ${placeholders},
          ?,
          'draft',
          ?,
          ?
        )
      `)
      .bind(
        id,
        tokenHash,
        ...values,
        imageKey,
        timestamp,
        timestamp
      )
      .run();

  } catch (error) {
    await cleanup(env, imageKey);
    throw error;
  }

  return json(
    {
      success: true,
      id,
      editToken,
      status: "draft",
      revision: 0
    },
    201
  );
}


/* UPDATE DRAFT */

async function update(request, env, row) {
  if (row.status !== "draft") {
    fail(
      409,
      "Use Amend before editing a confirmed reveal."
    );
  }

  const {
    values,
    image,
    removeImage,
    revision
  } = await readForm(request);

  if (
    revision !== null &&
    revision !== row.revision
  ) {
    fail(
      409,
      "This draft has changed. Reload before saving."
    );
  }

  let replacement = null;
  let committed = false;

  try {
    if (image) {
      replacement = await upload(
        env,
        row.id,
        image
      );
    }

    const key =
      replacement ||
      (
        removeImage
          ? null
          : row.image_key
      );

    const assignments = FIELDS
      .map(([, db]) => db + " = ?")
      .join(",");

    const result = await env.DB
      .prepare(`
        UPDATE reveals
        SET
          ${assignments},
          image_key = ?,
          updated_at = ?,
          revision = revision + 1
        WHERE id = ?
          AND status = 'draft'
          AND revision = ?
      `)
      .bind(
        ...values,
        key,
        now(),
        row.id,
        row.revision
      )
      .run();

    if (result.meta.changes !== 1) {
      fail(
        409,
        "This draft changed while saving. Reload and try again."
      );
    }

    committed = true;

    if (row.image_key !== key) {
      await cleanup(
        env,
        row.image_key
      );
    }

    return json({
      success: true,
      id: row.id,
      status: "draft",
      revision: row.revision + 1
    });

  } catch (error) {
    if (!committed) {
      await cleanup(
        env,
        replacement
      );
    }

    throw error;
  }
}


/* CONFIRM DRAFT */

async function confirm(env, row) {
  if (
    row.status === "confirmed" ||
    isPaid(row)
  ) {
    return json({
      success: true,
      id: row.id,
      status: row.status
    });
  }

  if (row.status !== "draft") {
    fail(
      409,
      "This reveal cannot be confirmed in its current state."
    );
  }

  const timestamp = now();

  const result = await env.DB
    .prepare(`
      UPDATE reveals
      SET
        status = 'confirmed',
        confirmed_at = ?,
        updated_at = ?,
        revision = revision + 1
      WHERE id = ?
        AND status = 'draft'
        AND revision = ?
    `)
    .bind(
      timestamp,
      timestamp,
      row.id,
      row.revision
    )
    .run();

  if (result.meta.changes !== 1) {
    fail(
      409,
      "This draft changed. Reload and review it again."
    );
  }

  return json({
    success: true,
    id: row.id,
    status: "confirmed",
    revision: row.revision + 1
  });
}


/* RETURN CONFIRMED REVEAL TO DRAFT */

async function amend(env, row) {
  if (row.status === "draft") {
    return json({
      success: true,
      id: row.id,
      status: "draft",
      revision: row.revision
    });
  }

  if (row.status !== "confirmed") {
    fail(
      409,
      "This reveal cannot be amended in its current state."
    );
  }

  // A future checkout integration must set
  // the reveal to checkout before creating
  // a payment-provider session.

  const result = await env.DB
    .prepare(`
      UPDATE reveals
      SET
        status = 'draft',
        confirmed_at = NULL,
        updated_at = ?,
        revision = revision + 1
      WHERE id = ?
        AND status = 'confirmed'
        AND revision = ?
        AND NOT EXISTS (
          SELECT 1
          FROM payments
          WHERE reveal_id = ?
            AND status IN (
              'pending',
              'paid'
            )
        )
    `)
    .bind(
      now(),
      row.id,
      row.revision,
      row.id
    )
    .run();

  if (result.meta.changes !== 1) {
    fail(
      409,
      "Payment or another change is in progress. Reload this reveal."
    );
  }

  return json({
    success: true,
    id: row.id,
    status: "draft",
    revision: row.revision + 1
  });
}


/* PROTECTED IMAGE RESPONSE */

async function imageResponse(env, row) {
  if (!row.image_key) {
    fail(404, "Image not found.");
  }

  const object = await env.IMAGES.get(
    row.image_key
  );

  if (!object) {
    fail(404, "Image not found.");
  }

  const headers = new Headers();

  object.writeHttpMetadata(headers);

  const contentType = headers.get(
    "Content-Type"
  );

  headers.set(
    "Content-Type",
    IMAGE_TYPES.has(contentType)
      ? contentType
      : "application/octet-stream"
  );

  headers.set(
    "Cache-Control",
    "private, no-store"
  );

  headers.set(
    "X-Content-Type-Options",
    "nosniff"
  );

  headers.set(
    "Referrer-Policy",
    "no-referrer"
  );

  return new Response(
    object.body,
    { headers }
  );
}


/* STARTER PAID RECIPIENT PAGE */

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character])
  );
}

function recipientPage(row) {
  // Called only after the router verifies payment.
  // Booking URLs and editor credentials are excluded.

  const e = escapeHtml;
  const nonce = randomToken();

  const details = [
    [
      "When",
      [
        row.event_date,
        row.event_time
      ]
        .filter(Boolean)
        .join(" · ")
    ],
    ["Where", row.venue],
    ["For", row.admit]
  ]
    .filter(([, value]) => value)
    .map(
      ([label, value]) =>
        `<dt>${label}</dt><dd>${e(value)}</dd>`
    )
    .join("");

  const image = row.image_key
    ? `
      <img
        src="/r/${e(row.public_slug)}/image"
        alt="Your surprise"
        loading="lazy"
      >
    `
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >

  <meta
    name="robots"
    content="noindex,nofollow"
  >

  <title>A surprise for you · Reveal</title>

  <style nonce="${nonce}">
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100svh;
      padding: 24px;
      display: grid;
      place-items: center;
      background: #17152b;
      color: #f8f5ef;
      font: 18px/1.6 system-ui, sans-serif;
    }

    main {
      width: 100%;
      max-width: 580px;
      text-align: center;
    }

    h1 {
      font-size: clamp(30px, 7vw, 48px);
      line-height: 1.15;
      overflow-wrap: anywhere;
    }

    p,
    dd {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    button {
      min-height: 52px;
      padding: 14px 28px;
      border: 0;
      border-radius: 999px;
      background: #eed7a6;
      color: #17152b;
      font: inherit;
      cursor: pointer;
    }

    button:focus-visible {
      outline: 3px solid white;
      outline-offset: 5px;
    }

    .card {
      padding: 28px;
      background: #26223b;
      border: 1px solid #524666;
      border-radius: 24px;
      animation: appear .7s ease-out;
    }

    img {
      max-width: 100%;
      max-height: 400px;
      object-fit: contain;
      border-radius: 12px;
    }

    dl {
      text-align: left;
    }

    dt {
      color: #eed7a6;
      font-size: 14px;
    }

    dd {
      margin: 0 0 14px;
    }

    small {
      color: #c1b8d2;
    }

    [hidden] {
      display: none;
    }

    @keyframes appear {
      from {
        opacity: 0;
        transform: translateY(16px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .card {
        animation: none;
      }
    }
  </style>
</head>

<body>
  <main>
    <section id="intro">
      <small>REVEAL</small>

      <h1>
        ${e(row.recipient)}, a surprise awaits.
      </h1>

      <p>With love from ${e(row.sender)}</p>

      <button id="open" type="button">
        Open your surprise
      </button>
    </section>

    <section
      id="gift"
      class="card"
      hidden
      aria-labelledby="title"
    >
      <small>JUST FOR YOU</small>

      <h1 id="title" tabindex="-1">
        ${e(row.event_name)}
      </h1>

      ${image}

      <p>${e(row.personal_message)}</p>

      <dl>${details}</dl>

      <p>From ${e(row.sender)}</p>

      <small>
        You can return to this link whenever you like.
      </small>
    </section>

    <noscript>
      <p>
        Enable JavaScript to open your surprise.
      </p>
    </noscript>
  </main>

  <script nonce="${nonce}">
    document
      .getElementById("open")
      .addEventListener("click", () => {
        document.getElementById("intro").hidden = true;
        document.getElementById("gift").hidden = false;
        document.getElementById("title").focus();
      });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",

      "Content-Security-Policy":
        "default-src 'none'; " +
        "img-src 'self'; " +
        `style-src 'nonce-${nonce}'; ` +
        `script-src 'nonce-${nonce}'; ` +
        "base-uri 'none'; " +
        "frame-ancestors 'none'; " +
        "form-action 'none'"
    }
  });
}
