// buss.veebi.dev Worker: static files, plus /api/gps and /api/notices (Tallinn's vehicle positions and disruption
// notices have no CORS, so we pass them on), plus /api/push/* and a cron for the "Mine 5 min pärast" push (push.js).
import { pushApi, pushCron } from "./push.js";
import { vaultApi, vaultCron } from "./vault.js";
let last = { at: 0, body: "" };
let notes = { at: 0, body: "" };

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
    if (url.pathname === "/api/notices") {
      // Tallinn's disruption notices (transport.tallinn.ee/announcements.json, no CORS either)
      if (Date.now() - notes.at > 300000) {
        try {
          const r = await fetch("https://transport.tallinn.ee/announcements.json", { cf: { cacheTtl: 300 } });
          if (r.ok) notes = { at: Date.now(), body: await r.text() };
        } catch (e) { /* keep the last copy */ }
      }
      return new Response(notes.body || "[]", { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=120", "access-control-allow-origin": "*" } });
    }
    if (url.pathname.startsWith("/api/push/")) return pushApi(req, env, url);
    if (url.pathname === "/api/vault") return vaultApi(req, env, url);
    const res = await env.ASSETS.fetch(req);
    if (url.pathname.startsWith("/data/")) {
      const h = new Headers(res.headers); h.set("cache-control", "public, max-age=3600");
      return new Response(res.body, { status: res.status, headers: h });
    }
    return res;
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pushCron(env));
    if (new Date().getUTCMinutes() === 7) ctx.waitUntil(vaultCron(env));
  },
};
