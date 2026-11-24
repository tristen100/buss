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

/* The trip's rides, for transfer warnings: [{m, n, s0, s1, t0, t1, n0, n1, w}] = mode, line, SIRI stop ids at boarding and
   getting off, scheduled times there, stop names, walk minutes from the previous ride. '' when there is no transfer. */
function cleanLegs(x) {
  if (!Array.isArray(x) || x.length < 2 || x.length > 6) return "";
  const out = [];
  for (const l of x) {
    const t0 = +l.t0, t1 = +l.t1, w = +l.w || 0;
    if (!isFinite(t0) || !isFinite(t1) || t1 < t0 || t1 - t0 > 240 || w < 0 || w > 60) return "";
    out.push({ m: MODE[l.m] ? l.m : "bus", n: str(l.n, 12), s0: Math.max(0, Math.floor(+l.s0) || 0), s1: Math.max(0, Math.floor(+l.s1) || 0), t0, t1, n0: str(l.n0, 80), n1: str(l.n1, 80), w });
  }
  return JSON.stringify(out);
}

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
  const legs = cleanLegs(b.legs);
  const row = [str(sub.endpoint, 1000), JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: str(sub.keys.p256dh, 200), auth: str(sub.keys.auth, 100) } }), ymd, Math.max(0, Math.floor(+b.siri) || 0), mode, str(b.route, 12), sched, lead, delay, str(b.stop, 80), str(b.dest, 80), legs];
  let id = /^[a-f0-9]{32}$/.test(b.id || "") ? b.id : null;
  if (id) {
    const r = await env.DB.prepare("UPDATE reminders SET endpoint=?, sub=?, ymd=?, siri=?, mode=?, route=?, sched=?, lead=?, delay=?, stop=?, dest=?, legs=?, status='new' WHERE id=?").bind(...row, id).run();
    if (!r.meta.changes) id = null;
  }
  if (!id) {
    id = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("INSERT INTO reminders (endpoint, sub, ymd, siri, mode, route, sched, lead, delay, stop, dest, legs, id, created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(...row, id, Date.now()).run();
    // keep the newest few per subscription
    await env.DB.prepare(`DELETE FROM reminders WHERE endpoint = ? AND id NOT IN (SELECT id FROM reminders WHERE endpoint = ? ORDER BY created DESC LIMIT ${PER_SUB})`).bind(row[0], row[0]).run();
  }
  return json({ id, at: hm(leave - LEAD) });
}

/* every minute: follow the live delay, send what is due, drop the old */
const CITY = (m) => m === "bus" || m === "tram" || m === "trol";
/* live delay (minutes) of line `route` due at SIRI stop `id` at scheduled minute `sched`, or null */
async function liveDelay(siri, id, mode, route, sched) {
  if (!id || !CITY(mode)) return null;
  const lines = (await siri(id)).trim().split("\n").map((l) => l.split(","));
  for (const l of lines.slice(1)) {
    if (l.length < 5 || l[0] === "stop") continue;
    const m = SIRI_MODE[l[0]] || l[0], rt = l[1].replace(/^T(?=\d)/, ""), exp = +l[2], sch = +l[3];
    if (rt !== route || m !== mode) continue;
    // the scheduled time in SIRI is of the service day; ours may be past 24:00 for after-midnight trips
    if (Math.abs(sch / 60 - sched) < 0.6 || Math.abs(sch / 60 + 1440 - sched) < 0.6) return Math.round((exp - sch) / 6) / 10;
  }
  return null;
}
async function push(env, r, msg) {
  try {
    const res = await sendPush(env, JSON.parse(r.sub), msg);
    if (res.status === 404 || res.status === 410) return "gone";
    if (!res.ok) { console.log("push failed", res.status, (await res.text()).slice(0, 200)); return "err" + res.status; }
    return "ok";
  } catch (e) { console.log("push error", String(e)); return "err"; }
}

/* every minute: follow the live delay, send what is due, then watch the transfers during the trip, drop the old */
export async function pushCron(env) {
  const c = tallinn();
  await env.DB.prepare("DELETE FROM reminders WHERE created < ?").bind(Date.now() - 36 * 3600e3).run();
  const { results } = await env.DB.prepare("SELECT * FROM reminders WHERE status = 'new' OR status = 'ride'").all();
  const siriCache = new Map();
  const siri = (id) => { if (!siriCache.has(id)) siriCache.set(id, fetch(SIRI + id, { cf: { cacheTtl: 15 } }).then((r) => (r.ok ? r.text() : "")).catch(() => "")); return siriCache.get(id); };
  for (const r of results) {
    const now = minutesFrom(r.ymd, c), legs = r.legs ? JSON.parse(r.legs) : null;
    if (r.status === "ride") { if (legs) await watchTransfers(env, r, legs, now, siri); else await env.DB.prepare("DELETE FROM reminders WHERE id = ?").bind(r.id).run(); continue; }
    let leave = r.sched + r.delay - r.lead;
    if (now > leave + 3) {
      if (legs) await env.DB.prepare("UPDATE reminders SET status = 'ride' WHERE id = ?").bind(r.id).run();
      else await env.DB.prepare("DELETE FROM reminders WHERE id = ?").bind(r.id).run();
      continue;
    }
    if (leave - now > 40) continue;
    // live delay of the first ride (Tallinn city lines)
    const d = await liveDelay(siri, r.siri, r.mode, r.route, r.sched);
    if (d != null && d !== r.delay) { r.delay = d; await env.DB.prepare("UPDATE reminders SET delay = ? WHERE id = ?").bind(d, r.id).run(); }
    leave = r.sched + r.delay - r.lead;
    if (leave - now > LEAD + 0.5) continue;
    const left = Math.max(0, Math.round(leave - now));
    const msg = { title: left >= 1 ? `Mine ${left} min pärast` : "Mine kohe", body: `${MODE[r.mode] || "Buss"} ${r.route} väljub ${hm(r.sched + r.delay)} peatusest ${r.stop} · ${r.dest}`, tag: "buss-leave", id: r.id };
    const st = await push(env, r, msg);
    const status = st === "ok" ? (legs ? "ride" : "sent") : st === "gone" ? "gone" : legs ? "ride" : st;
    await env.DB.prepare("UPDATE reminders SET status = ? WHERE id = ?").bind(status, r.id).run();
  }
}

/* During the trip: for each transfer, when the ride you are on gets off and when the next one leaves, from SIRI at both
   stops. When the next one will be gone before you can walk to it, one push per transfer. */
export function transferState(legs, i, firstDelay) {
  const a = legs[i - 1], b = legs[i];
  const dA = a.d1 ?? a.d0 ?? (i === 1 ? firstDelay : 0) ?? 0, dB = b.d0 ?? 0;
  const arrive = a.t1 + dA, ready = arrive + b.w, leaves = b.t0 + dB;
  return { arrive, ready, leaves, slack: leaves - ready };
}
async function watchTransfers(env, r, legs, now, siri) {
  const last = legs[legs.length - 1];
  if (now > last.t0 + (last.d0 || 0) + 3 || r.status === "gone") { await env.DB.prepare("DELETE FROM reminders WHERE id = ?").bind(r.id).run(); return; }
  let changed = false;
  if (legs[0].d0 == null && r.delay) legs[0].d0 = r.delay;
  for (let i = 1; i < legs.length; i++) {
    const a = legs[i - 1], b = legs[i];
    if (b.x || now > b.t0 + (b.d0 || 0) + 2) continue;          // warned already, or this transfer is behind us
    if (b.t0 - now > 40 || now < a.t0 + (a.d0 || 0) - 2) continue; // too early: SIRI does not list it yet / not on the way
    const d1 = await liveDelay(siri, a.s1, a.m, a.n, a.t1), d0 = await liveDelay(siri, b.s0, b.m, b.n, b.t0);
    if (d1 != null && d1 !== a.d1) { a.d1 = d1; changed = true; }
    if (d0 != null && d0 !== b.d0) { b.d0 = d0; changed = true; }
    const s = transferState(legs, i, r.delay);
    if (s.slack < 0 && (d1 != null || d0 != null)) {
      b.x = 1; changed = true;
      const nm = (m) => (MODE[m] || "Buss").toLowerCase();
      const msg = { title: "Ümberistumine võib jääda ära", body: `${MODE[a.m] || "Buss"} ${a.n} jõuab peatusesse ${a.n1} ${hm(s.arrive)}, ${nm(b.m)} ${b.n} väljub ${b.n0 !== a.n1 ? `peatusest ${b.n0} ` : ""}${hm(s.leaves)}. Ava äpp, et leida uus teekond.`, tag: "buss-xfer", id: r.id };
      if ((await push(env, r, msg)) === "gone") { await env.DB.prepare("DELETE FROM reminders WHERE id = ?").bind(r.id).run(); return; }
    }
  }
  if (changed) await env.DB.prepare("UPDATE reminders SET legs = ? WHERE id = ?").bind(JSON.stringify(legs), r.id).run();
}
