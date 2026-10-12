const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const ID_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";


export default {

  async fetch(request, env) {

    try {

      const url =
        new URL(request.url);


      /*
        HEALTH CHECK
      */

      if (
        url.pathname === "/api/health" &&
        request.method === "GET"
      ) {

        return jsonResponse({
          success: true,
          message: "Reveal Worker is running",
          d1: Boolean(env.DB),
          r2: Boolean(env.IMAGES),
          assets: Boolean(env.ASSETS)
        });

      }



      /*
        CREATE A NEW DRAFT
      */

      if (
        url.pathname === "/api/reveals" &&
        request.method === "POST"
      ) {

        return await createReveal(
          request,
          env
        );

      }



      /*
        ROUTES FOR A SPECIFIC REVEAL
      */

      const match =
        url.pathname.match(
          /^\/api\/reveals\/([A-Za-z0-9_-]+)(?:\/(image|confirm))?$/
        );


      if (match) {

        const revealId =
          match[1];

        const action =
          match[2] || "";


        /*
          LOAD IMAGE
        */

        if (
          action === "image" &&
          request.method === "GET"
        ) {

          return await getRevealImage(
            request,
            env,
            revealId
          );

        }


        /*
          CONFIRM DRAFT
        */

        if (
          action === "confirm" &&
          request.method === "POST"
        ) {

          return await confirmReveal(
            request,
            env,
            revealId
          );

        }


        /*
          GET DRAFT
        */

        if (
          action === "" &&
          request.method === "GET"
        ) {

          return await getReveal(
            request,
            env,
            revealId
          );

        }


        /*
          UPDATE DRAFT
        */

        if (
          action === "" &&
          request.method === "PUT"
        ) {

          return await updateReveal(
            request,
            env,
            revealId
          );

        }

      }



      /*
        UNKNOWN API ROUTE
      */

      if (
        url.pathname.startsWith("/api/")
      ) {

        return jsonResponse(
          {
            success: false,
            error: "API route not found."
          },
          404
        );

      }



      /*
        EVERYTHING ELSE IS THE STATIC WEBSITE
      */

      return env.ASSETS.fetch(
        request
      );

    } catch (error) {

      console.error(
        "Unhandled Worker error:",
        error
      );


      return jsonResponse(
        {
          success: false,
          error:
            "Something went wrong on the server."
        },
        500
      );

    }

  }

};



/*
  CREATE
*/

async function createReveal(
  request,
  env
) {

  const form =
    await request.formData();


  const data =
    parseRevealForm(form);


  const validation =
    validateReveal(data);


  if (!validation.valid) {

    return jsonResponse(
      {
        success: false,
        error: validation.error
      },
      400
    );

  }


  const image =
    getUploadedImage(form);


  const imageValidation =
    validateImage(image);


  if (!imageValidation.valid) {

    return jsonResponse(
      {
        success: false,
        error: imageValidation.error
      },
      400
    );

  }


  const id =
    generateId(10);


  const editToken =
    generateEditToken();


  const editTokenHash =
    await hashToken(
      editToken
    );


  const now =
    new Date().toISOString();


  let imageKey =
    null;


  try {

    if (image) {

      imageKey =
        await storeImage(
          env,
          id,
          image
        );

    }


    await env.DB
      .prepare(
        `
        INSERT INTO reveals (
          id,
          edit_token,
          recipient,
          sender,
          event_name,
          event_date,
          event_time,
          venue,
          admit,
          personal_message,
          ticket_url,
          image_key,
          status,
          created_at,
          updated_at,
          confirmed_at,
          paid_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL
        )
        `
      )
      .bind(
        id,
        editTokenHash,
        data.recipient,
        data.sender,
        data.eventName,
        data.eventDate,
        data.eventTime,
        data.venue,
        data.admit,
        data.personalMessage,
        data.ticketUrl,
        imageKey,
        "draft",
        now,
        now
      )
      .run();


    return jsonResponse(
      {
        success: true,
        id,
        editToken,
        status: "draft"
      },
      201
    );

  } catch (error) {

    if (imageKey) {

      try {

        await env.IMAGES.delete(
          imageKey
        );

      } catch {
        // Ignore clean-up failure.
      }

    }


    console.error(
      "Create reveal error:",
      error
    );


    return jsonResponse(
      {
        success: false,
        error:
          "The reveal could not be saved."
      },
      500
    );

  }

}



/*
  GET
*/

async function getReveal(
  request,
  env,
  revealId
) {

  const row =
    await getRevealRow(
      env,
      revealId
    );


  if (!row) {

    return jsonResponse(
      {
        success: false,
        error: "Reveal not found."
      },
      404
    );

  }


  const authorised =
    await isAuthorisedEditor(
      request,
      row
    );


  if (!authorised) {

    return jsonResponse(
      {
        success: false,
        error:
          "You do not have permission to edit or review this reveal."
      },
      403
    );

  }


  return jsonResponse({
    success: true,

    reveal: {
      id: row.id,
      recipient: row.recipient,
      sender: row.sender,
      eventName: row.event_name,
      eventDate: row.event_date,
      eventTime: row.event_time,
      venue: row.venue,
      admit: row.admit,
      personalMessage:
        row.personal_message,
      ticketUrl:
        row.ticket_url,
      hasImage:
        Boolean(row.image_key),
      status:
        row.status,
      createdAt:
        row.created_at,
      updatedAt:
        row.updated_at,
      confirmedAt:
        row.confirmed_at
    }

  });

}



/*
  UPDATE
*/

async function updateReveal(
  request,
  env,
  revealId
) {

  const existing =
    await getRevealRow(
      env,
      revealId
    );


  if (!existing) {

    return jsonResponse(
      {
        success: false,
        error: "Reveal not found."
      },
      404
    );

  }


  const authorised =
    await isAuthorisedEditor(
      request,
      existing
    );


  if (!authorised) {

    return jsonResponse(
      {
        success: false,
        error:
          "You do not have permission to edit this reveal."
      },
      403
    );

  }


  if (
    existing.status !== "draft"
  ) {

    return jsonResponse(
      {
        success: false,
        error:
          "This reveal has already been confirmed and can no longer be edited."
      },
      409
    );

  }


  const form =
    await request.formData();


  const data =
    parseRevealForm(form);


  const validation =
    validateReveal(data);


  if (!validation.valid) {

    return jsonResponse(
      {
        success: false,
        error: validation.error
      },
      400
    );

  }


  const newImage =
    getUploadedImage(form);


  const imageValidation =
    validateImage(newImage);


  if (!imageValidation.valid) {

    return jsonResponse(
      {
        success: false,
        error:
          imageValidation.error
      },
      400
    );

  }


  const removeImage =
    form.get("removeImage") ===
    "1";


  let newImageKey =
    existing.image_key;


  let uploadedReplacementKey =
    null;


  try {

    if (newImage) {

      uploadedReplacementKey =
        await storeImage(
          env,
          revealId,
          newImage
        );


      newImageKey =
        uploadedReplacementKey;

    } else if (removeImage) {

      newImageKey =
        null;

    }


    const now =
      new Date().toISOString();


    await env.DB
      .prepare(
        `
        UPDATE reveals
        SET
          recipient = ?,
          sender = ?,
          event_name = ?,
          event_date = ?,
          event_time = ?,
          venue = ?,
          admit = ?,
          personal_message = ?,
          ticket_url = ?,
          image_key = ?,
          updated_at = ?
        WHERE id = ?
        `
      )
      .bind(
        data.recipient,
        data.sender,
        data.eventName,
        data.eventDate,
        data.eventTime,
        data.venue,
        data.admit,
        data.personalMessage,
        data.ticketUrl,
        newImageKey,
        now,
        revealId
      )
      .run();



    /*
      REMOVE THE OLD IMAGE ONLY AFTER
      THE DATABASE UPDATE SUCCEEDS
    */

    if (
      existing.image_key &&
      existing.image_key !==
      newImageKey
    ) {

      try {

        await env.IMAGES.delete(
          existing.image_key
        );

      } catch {
        // Non-critical.
      }

    }


    return jsonResponse({
      success: true,
      id: revealId,
      status: "draft"
    });

  } catch (error) {

    /*
      REMOVE A NEWLY UPLOADED IMAGE
      IF THE DATABASE UPDATE FAILED
    */

    if (
      uploadedReplacementKey
    ) {

      try {

        await env.IMAGES.delete(
          uploadedReplacementKey
        );

      } catch {
        // Ignore clean-up failure.
      }

    }


    console.error(
      "Update reveal error:",
      error
    );


    return jsonResponse(
      {
        success: false,
        error:
          "The changes could not be saved."
      },
      500
    );

  }

}



/*
  CONFIRM
*/

async function confirmReveal(
  request,
  env,
  revealId
) {

  const row =
    await getRevealRow(
      env,
      revealId
    );


  if (!row) {

    return jsonResponse(
      {
        success: false,
        error: "Reveal not found."
      },
      404
    );

  }


  const authorised =
    await isAuthorisedEditor(
      request,
      row
    );


  if (!authorised) {

    return jsonResponse(
      {
        success: false,
        error:
          "You do not have permission to confirm this reveal."
      },
      403
    );

  }


  /*
    ALREADY CONFIRMED
  */

  if (
    row.status === "confirmed"
  ) {

    return jsonResponse({
      success: true,
      id: revealId,
      status: "confirmed"
    });

  }


  /*
    LATER THIS WILL HANDLE PAID
  */

  if (
    row.status === "paid"
  ) {

    return jsonResponse({
      success: true,
      id: revealId,
      status: "paid"
    });

  }


  if (
    row.status !== "draft"
  ) {

    return jsonResponse(
      {
        success: false,
        error:
          "This reveal cannot be confirmed in its current state."
      },
      409
    );

  }


  const now =
    new Date().toISOString();


  await env.DB
    .prepare(
      `
      UPDATE reveals
      SET
        status = ?,
        confirmed_at = ?,
        updated_at = ?
      WHERE id = ?
      `
    )
    .bind(
      "confirmed",
      now,
      now,
      revealId
    )
    .run();


  return jsonResponse({
    success: true,
    id: revealId,
    status: "confirmed"
  });

}



/*
  IMAGE
*/

async function getRevealImage(
  request,
  env,
  revealId
) {

  const row =
    await getRevealRow(
      env,
      revealId
    );


  if (!row) {

    return new Response(
      "Reveal not found.",
      {
        status: 404
      }
    );

  }


  const authorised =
    await isAuthorisedEditor(
      request,
      row
    );


  if (!authorised) {

    return new Response(
      "Forbidden.",
      {
        status: 403
      }
    );

  }


  if (!row.image_key) {

    return new Response(
      "Image not found.",
      {
        status: 404
      }
    );

  }


  const object =
    await env.IMAGES.get(
      row.image_key
    );


  if (!object) {

    return new Response(
      "Image not found.",
      {
        status: 404
      }
    );

  }


  const headers =
    new Headers();


  object.writeHttpMetadata(
    headers
  );


  if (
    !headers.has(
      "Content-Type"
    )
  ) {

    headers.set(
      "Content-Type",
      "application/octet-stream"
    );

  }


  headers.set(
    "Cache-Control",
    "private, no-store"
  );


  headers.set(
    "X-Content-Type-Options",
    "nosniff"
  );


  return new Response(
    object.body,
    {
      headers
    }
  );

}



/*
  DATABASE HELPERS
*/

async function getRevealRow(
  env,
  revealId
) {

  return await env.DB
    .prepare(
      `
      SELECT *
      FROM reveals
      WHERE id = ?
      LIMIT 1
      `
    )
    .bind(
      revealId
    )
    .first();

}



/*
  AUTHORISATION
*/

async function isAuthorisedEditor(
  request,
  row
) {

  const suppliedToken =
    request.headers.get(
      "X-Edit-Token"
    );


  if (!suppliedToken) {

    return false;
  }


  const suppliedHash =
    await hashToken(
      suppliedToken
    );


  return suppliedHash ===
    row.edit_token;

}



/*
  FORM PARSING
*/

function parseRevealForm(form) {

  return {

    recipient:
      cleanText(
        form.get("recipient"),
        80
      ),

    sender:
      cleanText(
        form.get("sender"),
        80
      ),

    eventName:
      cleanText(
        form.get("eventName"),
        160
      ),

    eventDate:
      cleanText(
        form.get("eventDate"),
        40
      ),

    eventTime:
      cleanText(
        form.get("eventTime"),
        20
      ),

    venue:
      cleanText(
        form.get("venue"),
        200
      ),

    admit:
      cleanText(
        form.get("admit"),
        120
      ),

    personalMessage:
      cleanText(
        form.get("personalMessage"),
        1200
      ),

    ticketUrl:
      cleanText(
        form.get("ticketUrl"),
        2048
      )

  };

}



/*
  VALIDATION
*/

function validateReveal(data) {

  if (!data.recipient) {

    return {
      valid: false,
      error:
        "Please enter who the reveal is for."
    };

  }


  if (!data.sender) {

    return {
      valid: false,
      error:
        "Please enter who the reveal is from."
    };

  }


  if (!data.eventName) {

    return {
      valid: false,
      error:
        "Please enter the surprise or event."
    };

  }


  if (!data.eventDate) {

    return {
      valid: false,
      error:
        "Please enter the event date."
    };

  }


  if (data.ticketUrl) {

    try {

      const url =
        new URL(
          data.ticketUrl
        );


      if (
        url.protocol !== "https:" &&
        url.protocol !== "http:"
      ) {

        return {
          valid: false,
          error:
            "The ticket or booking link must start with http:// or https://."
        };

      }

    } catch {

      return {
        valid: false,
        error:
          "Please enter a valid ticket or booking link."
      };

    }

  }


  return {
    valid: true
  };

}



function getUploadedImage(form) {

  const image =
    form.get("image");


  if (
    !image ||
    typeof image !== "object" ||
    typeof image.size !== "number" ||
    image.size === 0
  ) {

    return null;
  }


  return image;

}



function validateImage(image) {

  if (!image) {

    return {
      valid: true
    };

  }


  if (
    image.size >
    MAX_IMAGE_SIZE
  ) {

    return {
      valid: false,
      error:
        "The image must be smaller than 10 MB."
    };

  }


  if (
    !ALLOWED_IMAGE_TYPES.has(
      image.type
    )
  ) {

    return {
      valid: false,
      error:
        "Only JPEG, PNG and WebP images are supported."
    };

  }


  return {
    valid: true
  };

}



/*
  R2
*/

async function storeImage(
  env,
  revealId,
  image
) {

  const extension =
    extensionForContentType(
      image.type
    );


  const imageKey =
    "reveals/" +
    revealId +
    "/" +
    crypto.randomUUID() +
    extension;


  const bytes =
    await image.arrayBuffer();


  await env.IMAGES.put(
    imageKey,
    bytes,
    {
      httpMetadata: {
        contentType:
          image.type
      },

      customMetadata: {
        revealId,
        uploadedAt:
          new Date().toISOString()
      }
    }
  );


  return imageKey;

}



function extensionForContentType(
  contentType
) {

  if (
    contentType === "image/png"
  ) {

    return ".png";
  }


  if (
    contentType === "image/webp"
  ) {

    return ".webp";
  }


  return ".jpg";

}



/*
  TOKEN AND ID HELPERS
*/

function generateId(length) {

  const bytes =
    new Uint8Array(
      length
    );


  crypto.getRandomValues(
    bytes
  );


  let value = "";


  for (
    let i = 0;
    i < length;
    i++
  ) {

    value +=
      ID_ALPHABET[
        bytes[i] %
        ID_ALPHABET.length
      ];

  }


  return value;

}



function generateEditToken() {

  const bytes =
    new Uint8Array(32);


  crypto.getRandomValues(
    bytes
  );


  let binary = "";


  for (
    const byte of bytes
  ) {

    binary +=
      String.fromCharCode(
        byte
      );

  }


  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

}



async function hashToken(token) {

  const bytes =
    new TextEncoder()
      .encode(token);


  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    );


  return Array.from(
    new Uint8Array(
      digest
    )
  )
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");

}



/*
  GENERAL HELPERS
*/

function cleanText(
  value,
  maxLength
) {

  if (
    value === null ||
    value === undefined
  ) {

    return "";
  }


  return String(value)
    .trim()
    .slice(
      0,
      maxLength
    );

}



function jsonResponse(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store",

        "X-Content-Type-Options":
          "nosniff"
      }
    }
  );

}
