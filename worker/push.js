// "Mine 5 min pärast" as Web Push, so it comes even when the phone is locked.
// The app stores a reminder (its push subscription + the first ride); a cron every minute follows that ride's live
// delay from Tallinn's SIRI and sends the push 5 minutes before you have to leave.
// Web Push by hand with WebCrypto: payload encryption RFC 8291 (aes128gcm), VAPID RFC 8292 (ES256 JWT). The VAPID key
// pair is made by the Worker itself on first use and kept in D1 (it only lets someone push to this app's subscribers).

const LEAD = 5;          // minutes before leaving
const PER_SUB = 3;       // reminders kept per subscription
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/];
const SIRI = "https://transport.tallinn.ee/siri-stop-departures.php?stopid=";
const SIRI_MODE = { bus: "bus", nightbus: "bus", tram: "tram", trol: "trol", trolley: "trol" };
const MODE = { bus: "Buss", reg: "Maakonnabuss", tram: "Tramm", trol: "Troll", train: "Rong" };

const te = new TextEncoder();
export const b64u = (b) => { const a = new Uint8Array(b); let s = ""; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export const ub64 = (s) => { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); s += "===".slice(0, (4 - (s.length % 4)) % 4); return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const cat = (...p) => { const n = p.reduce((a, x) => a + x.length, 0), o = new Uint8Array(n); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}

/* RFC 8291: one aes128gcm record */
export async function encrypt(sub, payload) {
  const ua = ub64(sub.keys.p256dh), auth = ub64(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, secret, cat(te.encode("WebPush: info\0"), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(te.encode(payload), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPub.length]), asPub, ct);
}

/* VAPID key pair: {pub: base64url raw point, jwk: private JWK} */
let VAPID = null;
export async function vapid(env) {
  if (VAPID) return VAPID;
  const row = await env.DB.prepare("SELECT v FROM kv WHERE k = 'vapid'").first();
  if (row) return (VAPID = JSON.parse(row.v));
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const v = { pub: b64u(await crypto.subtle.exportKey("raw", kp.publicKey)), jwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
  await env.DB.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES ('vapid', ?)").bind(JSON.stringify(v)).run();
  const again = await env.DB.prepare("SELECT v FROM kv WHERE k = 'vapid'").first(); // two first calls at once: keep one pair
  return (VAPID = JSON.parse(again.v));
}
export async function vapidJWT(v, endpoint, now = Date.now()) {
  const enc = (o) => b64u(te.encode(JSON.stringify(o)));
  const data = enc({ typ: "JWT", alg: "ES256" }) + "." + enc({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: "https://buss.veebi.dev" });
  const key = await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(data));
  return data + "." + b64u(sig);
}
export async function sendPush(env, sub, msg) {
  const v = await vapid(env);
  const body = await encrypt(sub, JSON.stringify(msg));
  return fetch(sub.endpoint, {
    method: "POST",
    headers: { TTL: "600", Urgency: "high", Topic: "bussleave", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", Authorization: `vapid t=${await vapidJWT(v, sub.endpoint)}, k=${v.pub}` },
    body,
  });
}

/* Tallinn time: {ymd, min} */
const TZ = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Tallinn", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
export function tallinn(d = new Date()) { const p = {}; for (const x of TZ.formatToParts(d)) p[x.type] = +x.value; return { ymd: p.year * 1e4 + p.month * 100 + p.day, min: p.hour * 60 + p.minute + p.second / 60 }; }
const minutesFrom = (ymd, c) => (c.ymd > ymd ? c.min + 1440 : c.ymd < ymd ? c.min - 1440 : c.min);
const hm = (t) => { t = Math.round(t); t = ((t % 1440) + 1440) % 1440; return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };

const okEndpoint = (e) => { try { const u = new URL(e); return u.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(u.hostname)); } catch { return false; } };
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
const str = (x, n) => String(x ?? "").slice(0, n);

/* /api/push/key, /api/push/alarm (POST create/update, DELETE ?id=) */
export async function pushApi(req, env, url) {
  if (url.pathname === "/api/push/key") return json({ key: (await vapid(env)).pub });
  if (url.pathname !== "/api/push/alarm") return json({ error: "not found" }, 404);
  if (req.method === "DELETE") {
    const id = url.searchParams.get("id") || "";
    if (/^[a-f0-9]{32}$/.test(id)) await env.DB.prepare("DELETE FROM reminders WHERE id = ?").bind(id).run();
    return json({ ok: 1 });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (new URL(req.headers.get("origin") || "https://x").hostname !== url.hostname) return json({ error: "origin" }, 403);
  let b; try { b = await req.json(); } catch { return json({ error: "json" }, 400); }
  const sub = b.sub;
  if (!sub || !okEndpoint(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth || JSON.stringify(sub).length > 2000) return json({ error: "subscription" }, 400);
  const c = tallinn(), ymd = +b.ymd, sched = +b.sched, lead = +b.lead, delay = +b.delay || 0;
  if (!(ymd === c.ymd || ymd === tallinn(new Date(Date.now() - 6 * 3600e3)).ymd) || !isFinite(sched) || !isFinite(lead) || lead < 0 || lead > 120 || Math.abs(delay) > 120) return json({ error: "time" }, 400);
  const leave = sched + delay - lead, now = minutesFrom(ymd, c);
  if (leave < now - 2 || leave > now + 720) return json({ error: "time" }, 400);
  const mode = MODE[b.mode] ? b.mode : "bus";
  const row = [str(sub.endpoint, 1000), JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: str(sub.keys.p256dh, 200), auth: str(sub.keys.auth, 100) } }), ymd, Math.max(0, Math.floor(+b.siri) || 0), mode, str(b.route, 12), sched, lead, delay, str(b.stop, 80), str(b.dest, 80)];
  let id = /^[a-f0-9]{32}$/.test(b.id || "") ? b.id : null;
  if (id) {
    const r = await env.DB.prepare("UPDATE reminders SET endpoint=?, sub=?, ymd=?, siri=?, mode=?, route=?, sched=?, lead=?, delay=?, stop=?, dest=?, status='new' WHERE id=?").bind(...row, id).run();
    if (!r.meta.changes) id = null;
  }
  if (!id) {
    id = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("INSERT INTO reminders (endpoint, sub, ymd, siri, mode, route, sched, lead, delay, stop, dest, id, created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(...row, id, Date.now()).run();
    // keep the newest few per subscription
    await env.DB.prepare(`DELETE FROM reminders WHERE endpoint = ? AND id NOT IN (SELECT id FROM reminders WHERE endpoint = ? ORDER BY created DESC LIMIT ${PER_SUB})`).bind(row[0], row[0]).run();
  }
  return json({ id, at: hm(leave - LEAD) });
}

/* every minute: follow the live delay, send what is due, drop the old */
export async function pushCron(env) {
  const c = tallinn();
  await env.DB.prepare("DELETE FROM reminders WHERE created < ?").bind(Date.now() - 36 * 3600e3).run();
  const { results } = await env.DB.prepare("SELECT * FROM reminders WHERE status = 'new'").all();
  const siriCache = new Map();
  const siri = (id) => { if (!siriCache.has(id)) siriCache.set(id, fetch(SIRI + id, { cf: { cacheTtl: 15 } }).then((r) => (r.ok ? r.text() : "")).catch(() => "")); return siriCache.get(id); };
  for (const r of results) {
    const now = minutesFrom(r.ymd, c);
    let leave = r.sched + r.delay - r.lead;
    if (now > leave + 3) { await env.DB.prepare("DELETE FROM reminders WHERE id = ?").bind(r.id).run(); continue; }
    if (leave - now > 40) continue;
    // live delay of the first ride (Tallinn city lines)
    if (r.siri && (r.mode === "bus" || r.mode === "tram" || r.mode === "trol")) {
      const lines = (await siri(r.siri)).trim().split("\n").map((l) => l.split(","));
      for (const l of lines.slice(1)) {
        if (l.length < 5 || l[0] === "stop") continue;
        const m = SIRI_MODE[l[0]] || l[0], route = l[1].replace(/^T(?=\d)/, ""), exp = +l[2], sch = +l[3];
        if (route !== r.route || m !== r.mode) continue;
        // the scheduled time in SIRI is of the service day; our sched may be past 24:00 for after-midnight trips
        if (Math.abs(sch / 60 - r.sched) < 0.6 || Math.abs(sch / 60 + 1440 - r.sched) < 0.6) {
          const d = Math.round((exp - sch) / 6) / 10;
          if (d !== r.delay) { r.delay = d; await env.DB.prepare("UPDATE reminders SET delay = ? WHERE id = ?").bind(d, r.id).run(); }
          break;
        }
      }
      leave = r.sched + r.delay - r.lead;
    }
    if (leave - now > LEAD + 0.5) continue;
    const left = Math.max(0, Math.round(leave - now));
    const msg = { title: left >= 1 ? `Mine ${left} min pärast` : "Mine kohe", body: `${MODE[r.mode] || "Buss"} ${r.route} väljub ${hm(r.sched + r.delay)} peatusest ${r.stop} · ${r.dest}`, tag: "buss-leave", id: r.id };
    let status = "sent";
    try {
      const res = await sendPush(env, JSON.parse(r.sub), msg);
      if (res.status === 404 || res.status === 410) status = "gone";
      else if (!res.ok) { status = "err" + res.status; console.log("push failed", res.status, (await res.text()).slice(0, 200)); }
    } catch (e) { status = "err"; console.log("push error", String(e)); }
    await env.DB.prepare("UPDATE reminders SET status = ? WHERE id = ?").bind(status, r.id).run();
  }
}
