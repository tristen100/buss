// buss.veebi.dev Worker: static files, plus /api/gps (Tallinn's vehicle positions have no CORS, so we pass them on).
let last = { at: 0, body: "" };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.hostname.startsWith("www.")) return Response.redirect("https://buss.veebi.dev" + url.pathname + url.search, 301);
    if (url.pathname === "/api/gps") {
      if (Date.now() - last.at > 2000) {
        try {
          const r = await fetch("https://transport.tallinn.ee/gps.txt", { cf: { cacheTtl: 2 } });
          if (r.ok) last = { at: Date.now(), body: await r.text() };
        } catch (e) { /* keep the last copy */ }
      }
      if (!last.body) return new Response("", { status: 502 });
      return new Response(last.body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } });
    }
    const res = await env.ASSETS.fetch(req);
    if (url.pathname.startsWith("/data/")) {
      const h = new Headers(res.headers); h.set("cache-control", "public, max-age=3600");
      return new Response(res.body, { status: res.status, headers: h });
    }
    return res;
  },
};
