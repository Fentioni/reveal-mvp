export default {

  async fetch(request, env) {

    const url =
      new URL(request.url);


    /*
      API TEST

      This proves that the project now has
      an actual Cloudflare Worker runtime.

      Later, the reveal API will live here.
    */

    if (
      url.pathname === "/api/health"
    ) {

      return Response.json({
        success: true,
        message: "Reveal Worker is running"
      });

    }


    /*
      Everything else continues to be served
      from the existing static website.
    */

    return env.ASSETS.fetch(request);

  }

};
