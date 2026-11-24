// Real walking distances on the street network (OpenStreetMap, built by tools/build-walk.mjs). Works in the browser and
// in Node. Distances are metres plus the waiting at street crossings (stored as extra metres).
const R = 6371000, rad = Math.PI / 180;
const TY = 0.01, TX = 0.02;
const OFF = 1.25;   // off the mapped streets (to the street from a door or a stop pole): straight line × 1.25
const tileOf = (la, lo) => `${Math.floor(la / TY)}_${Math.floor(lo / TX)}`;

class Heap {
  constructor() { this.k = []; this.v = []; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() { const k = this.k, v = this.v, top = v[0], tk = k[0], lk = k.pop(), lv = v.pop(), n = k.length;
    if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; }
    this.top = tk; return top; }
  get size() { return this.k.length; }
}

export class Graph {
  constructor() { this.adj = new Map(); this.ll = new Map(); this.pen = new Map(); this.te = new Map(); this.seen = new Set(); this.tiles = new Set(); }
  add(key, t) {
    if (this.tiles.has(key)) return; this.tiles.add(key);
    for (let i = 0; i < t.n.length; i += 4) { this.ll.set(t.n[i], [t.n[i + 1] / 1e5, t.n[i + 2] / 1e5]); if (t.n[i + 3]) this.pen.set(t.n[i], t.n[i + 3]); }
    const own = [];
    for (let i = 0; i < t.e.length; i += 3) {
      const a = t.e[i], b = t.e[i + 1], w = t.e[i + 2]; own.push(a, b, w);
      const k = a * 4194304 + b; if (this.seen.has(k)) continue; this.seen.add(k);
      (this.adj.get(a) || this.adj.set(a, []).get(a)).push(b, w);
      (this.adj.get(b) || this.adj.set(b, []).get(b)).push(a, w);
    }
    this.te.set(key, own);
  }
  /* The nearest point on the network to [lon, lat] within `max` m: {a, b, w, t, perp} (t = 0 at a, 1 at b) */
  snap(ll, max = 150) { return this.snaps(ll, max, 1)[0] || null; }
  /* Up to `k` nearest streets (different stretches), each no more than 40 m further than the nearest one. */
  snaps([lo, la], max = 150, k = 4) {
    const cy = Math.floor(la / TY), cx = Math.floor(lo / TX), kx = Math.cos(la * rad) * rad * R, ky = rad * R;
    const all = [];
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
      const E = this.te.get(`${y}_${x}`); if (!E) continue;
      for (let i = 0; i < E.length; i += 3) {
        const A = this.ll.get(E[i]), B = this.ll.get(E[i + 1]); if (!A || !B) continue;
        const ax = (A[1] - lo) * kx, ay = (A[0] - la) * ky, bx = (B[1] - lo) * kx, by = (B[0] - la) * ky, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0, px = ax + t * dx, py = ay + t * dy, d = Math.sqrt(px * px + py * py);
        if (d <= max) all.push({ a: E[i], b: E[i + 1], w: E[i + 2], t, perp: d });
      }
    }
    all.sort((x, y) => x.perp - y.perp);
    const out = [], seen = new Set();
    for (const c of all) { if (out.length >= k || c.perp > all[0].perp + 40) break; const key = c.a + "," + c.b; if (seen.has(key)) continue; seen.add(key); out.push(c); }
    return out;
  }
  /* Shortest walks from a snapped point to every network point up to `limit` m. */
  from(src, limit = 3000) {
    const d = new Map(), h = new Heap();
    const seed = (n, v) => { v += this.pen.get(n) || 0; if (v < (d.get(n) ?? Infinity)) { d.set(n, v); h.push(v, n); } };
    for (const s of [].concat(src)) { const o = s.perp * OFF; seed(s.a, o + s.t * s.w); seed(s.b, o + (1 - s.t) * s.w); }
    while (h.size) {
      const n = h.pop(), v = h.top; if (v > (d.get(n) ?? Infinity) || v > limit) continue;
      const A = this.adj.get(n); if (!A) continue;
      for (let i = 0; i < A.length; i += 2) { const o = A[i], nv = v + A[i + 1] + (this.pen.get(o) || 0); if (nv < (d.get(o) ?? Infinity) && nv <= limit) { d.set(o, nv); h.push(nv, o); } }
    }
    return d;
  }
  /* Metres from the source of `d` (snapped as `src`) to the snapped point `tgt`. */
  to(d, tgt, src) {
    let m = Math.min((d.get(tgt.a) ?? Infinity) + tgt.t * tgt.w, (d.get(tgt.b) ?? Infinity) + (1 - tgt.t) * tgt.w);
    for (const s of src ? [].concat(src) : []) if ((s.a === tgt.a && s.b === tgt.b) || (s.a === tgt.b && s.b === tgt.a)) {
      const t2 = s.a === tgt.a ? tgt.t : 1 - tgt.t; m = Math.min(m, s.perp * OFF + Math.abs(s.t - t2) * tgt.w);
    }
    return m + tgt.perp * OFF;
  }
}

/* Browser side: loads the tiles around a place when needed and answers "how far is it to walk from here to these stops". */
export function walker(base = "") {
  const g = new Graph(), wait = new Map();
  let idx = null, stops = null;
  const ready = (async () => {
    try {
      const [i, s] = await Promise.all([fetch(base + "/data/walk/index.json").then((r) => r.json()), fetch(base + "/data/walk/stops.json").then((r) => r.json())]);
      idx = new Set(i.tiles); stops = s;
    } catch (e) { idx = new Set(); }
  })();
  async function around([lo, la], m) {
    await ready;
    const dy = m / 111000, dx = m / (111000 * Math.cos(la * rad)), jobs = [];
    for (let y = Math.floor((la - dy) / TY); y <= Math.floor((la + dy) / TY); y++)
      for (let x = Math.floor((lo - dx) / TX); x <= Math.floor((lo + dx) / TX); x++) {
        const k = `${y}_${x}`; if (!idx.has(k) || g.tiles.has(k)) continue;
        if (!wait.has(k)) wait.set(k, fetch(`${base}/data/walk/t_${k}.json`).then((r) => r.json()).then((t) => g.add(k, t)).catch(() => wait.delete(k)));
        jobs.push(wait.get(k));
      }
    await Promise.all(jobs);
  }
  const memo = new Map();
  return {
    ready, g,
    get stops() { return stops; },
    /* Real walks from a place to stops: near = [[stop, straight m]] -> {list: [[stop, real m]], to(ll)} or null when the place
       is off the network (outside the mapped area). Stops off the network keep their straight line (null m). */
    async from(ll, near, limit = 3000) {
      const key = ll[0].toFixed(5) + "," + ll[1].toFixed(5);
      if (memo.has(key)) return memo.get(key);
      await around(ll, limit * 0.8);
      const s = stops && g.snaps(ll, 150);
      if (!s || !s.length) return null;
      const d = g.from(s, limit);
      const list = near.map(([st, sl]) => { const t = stops.snap[st]; return [st, t ? g.to(d, t, s) : null, sl]; });
      const out = { list, to: (ll2) => Math.min(Infinity, ...g.snaps(ll2, 150).map((t) => g.to(d, t, s))) };
      memo.set(key, out); if (memo.size > 20) memo.delete(memo.keys().next().value);
      return out;
    },
    snapIn: (ll) => g.snap(ll, 150),
    tileOf,
  };
}
