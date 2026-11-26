// /api/vault: the "Konto" store. The app sends only a 64-hex id derived from the user's word and data it encrypted
// itself; we keep sha256(id) and the ciphertext. Guessing words is slowed by the app's PBKDF2 and limited here per network.
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (t) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
const LIMIT = { get: 300, miss: 20, put: 200, del: 20 }; // per network per 10 min; a "miss" (a word with no account) is what guessing looks like
const MAX = 60000; // bytes of ciphertext

async function salt(env) {
  const r = await env.DB.prepare("SELECT v FROM kv WHERE k='vault-salt'").first();
  if (r) return r.v;
  const s = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES ('vault-salt', ?)").bind(s).run();
  return (await env.DB.prepare("SELECT v FROM kv WHERE k='vault-salt'").first()).v;
}
async function net(req, env) {
  const ip = req.headers.get("cf-connecting-ip") || "";
  const net = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip; // IPv6: the /64
  return (await sha((await salt(env)) + "|" + net)).slice(0, 32);
}
const win = () => Math.floor(Date.now() / 600000);
async function bump(env, h, op) {
  const r = await env.DB.prepare("INSERT INTO tries (h, win, op, n) VALUES (?, ?, ?, 1) ON CONFLICT (h, win, op) DO UPDATE SET n = n + 1 RETURNING n").bind(h, win(), op).first();
  return r.n <= LIMIT[op];
}
async function count(env, h, op) {
  const r = await env.DB.prepare("SELECT n FROM tries WHERE h = ? AND win = ? AND op = ?").bind(h, win(), op).first();
  return r ? r.n : 0;
}

export async function vaultApi(req, env, url) {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (new URL(req.headers.get("origin") || "https://x").hostname !== url.hostname) return json({ error: "origin" }, 403);
  let b; try { b = await req.json(); } catch { return json({ error: "json" }, 400); }
  const op = b.op;
  if (!["get", "put", "del"].includes(op) || !/^[a-f0-9]{64}$/.test(b.id || "")) return json({ error: "bad" }, 400);
  const h = await net(req, env);
  if (!(await bump(env, h, op)) || (op === "get" && (await count(env, h, "miss")) >= LIMIT.miss)) return json({ error: "slow" }, 429);
  const k = await sha("vault|" + b.id);
  if (op === "get") {
    const r = await env.DB.prepare("SELECT data, at FROM vault WHERE k = ?").bind(k).first();
    if (r) return json({ data: r.data, at: r.at });
    await bump(env, h, "miss");
    return json({ none: 1 });
  }
  if (op === "del") { await env.DB.prepare("DELETE FROM vault WHERE k = ?").bind(k).run(); return json({ ok: 1 }); }
  const data = String(b.data || ""), at = Math.floor(+b.at);
  if (!/^[A-Za-z0-9+/=]{40,}$/.test(data) || data.length > MAX || !(at > 0)) return json({ error: "bad" }, 400);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO vault (k, data, at, created) VALUES (?, ?, ?, ?) ON CONFLICT (k) DO UPDATE SET data = excluded.data, at = excluded.at").bind(k, data, Math.min(at, now + 60000), now).run();
  return json({ ok: 1 });
}
export async function vaultCron(env) {
  await env.DB.prepare("DELETE FROM tries WHERE win < ?").bind(Math.floor(Date.now() / 600000) - 144).run();
}
