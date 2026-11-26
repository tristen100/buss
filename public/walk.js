// Real walking distances on the street network (OpenStreetMap, built by tools/build-walk.mjs). Works in the browser and
// in Node. Distances are metres plus the waiting at street crossings (stored as extra metres).
const R = 6371000, rad = Math.PI / 180;
const TY = 0.01, TX = 0.02, NY = 250, NX = 250;   // tiles; each with a NY × NX map of where buildings stand
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

const segM = (A, B, kx, ky) => Math.hypot((B[1] - A[1]) * kx, (B[0] - A[0]) * ky);

export class Graph {
  constructor() { this.adj = new Map(); this.ll = new Map(); this.pen = new Map(); this.te = new Map(); this.geo = new Map(); this.blk = new Map(); this.fen = new Map(); this.tiles = new Set(); }
  add(key, t) {
    if (this.tiles.has(key)) return; this.tiles.add(key);
    if (t.b) { const s = atob(t.b), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); this.blk.set(key, b); }
    if (t.f) this.fen.set(key, { l: t.f, h: t.fh || [] });
    for (let i = 0; i < t.n.length; i += 4) { this.ll.set(t.n[i], [t.n[i + 1] / 1e5, t.n[i + 2] / 1e5]); if (t.n[i + 3]) this.pen.set(t.n[i], t.n[i + 3]); }
    const own = [];
    for (let i = 0, j = 0; i < t.e.length; i += 3, j++) {
      const a = t.e[i], b = t.e[i + 1], w = t.e[i + 2]; own.push(a, b, w);
      const k = a * 4194304 + b; if (this.geo.has(k)) continue;
      const g = t.g && t.g[j], mid = [];
      if (g) for (let x = 0; x < g.length; x += 2) mid.push([g[x] / 1e5, g[x + 1] / 1e5]);
      this.geo.set(k, mid);
      (this.adj.get(a) || this.adj.set(a, []).get(a)).push(b, w);
      (this.adj.get(b) || this.adj.set(b, []).get(b)).push(a, w);
    }
    this.te.set(key, own);
  }
  /* a stretch's shape from a to b: [[lat, lon], ...] including both ends (null until both end tiles are loaded) */
  line(a, b) {
    const lo = Math.min(a, b), hi = Math.max(a, b), mid = this.geo.get(lo * 4194304 + hi), A = this.ll.get(a), B = this.ll.get(b);
    if (!mid || !A || !B) return null;
    return [A, ...(a === lo ? mid : mid.slice().reverse()), B];
  }
  /* is there a building at [lat, lon]? (false where the map is not loaded) */
  inside(la, lo) {
    const y = Math.floor(la / (TY / NY)), x = Math.floor(lo / (TX / NX)), ty = Math.floor(y / NY), tx = Math.floor(x / NX), b = this.blk.get(`${ty}_${tx}`);
    if (!b) return false; const i = (y - ty * NY) * NX + (x - tx * NX); return !!(b[i >> 3] & (1 << (i & 7)));
  }
  /* would the straight step from a place to the street cross a building? The place's own building (when it is inside
     one, as an address point often is) and the last 4 m by the street (pavements hug the walls) do not count. */
  /* does the straight line a→b ([lat, lon]) cross a fence, wall or hedge? Not within 3 m of a gap (gate, path). */
  overFence(a, b, kx, ky) {
    const keys = new Set([`${Math.floor(a[0] / TY)}_${Math.floor(a[1] / TX)}`, `${Math.floor(b[0] / TY)}_${Math.floor(b[1] / TX)}`]);
    const ax = a[1] * kx, ay = a[0] * ky, bx = b[1] * kx, by = b[0] * ky, side = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    for (const k of keys) { const F = this.fen.get(k); if (!F) continue; const l = F.l;
      for (let i = 0; i < l.length; i += 4) {
        const cx = l[i + 1] / 1e5 * kx, cy = l[i] / 1e5 * ky, dx = l[i + 3] / 1e5 * kx, dy = l[i + 2] / 1e5 * ky;
        const d1 = side(cx, cy, dx, dy, ax, ay), d2 = side(cx, cy, dx, dy, bx, by); if (d1 * d2 >= 0) continue;
        const d3 = side(ax, ay, bx, by, cx, cy), d4 = side(ax, ay, bx, by, dx, dy); if (d3 * d4 >= 0) continue;
        const f = d1 / (d1 - d2), xx = ax + f * (bx - ax), yy = ay + f * (by - ay); let gap = false;
        for (const G of [F, ...[...keys].filter((x) => x !== k).map((x) => this.fen.get(x)).filter(Boolean)])
          for (let j = 0; j < G.h.length && !gap; j += 2) if (Math.hypot(G.h[j + 1] / 1e5 * kx - xx, G.h[j] / 1e5 * ky - yy) < 3) gap = true;
        if (!gap) return true;
      } }
    return false;
  }
  /* The straight step from a place to the street must not go through another building or over a fence, wall or hedge
     (exact lines; a gate or a path meeting the fence leaves a gap). The place's own building and the last 4 m by the street don't count. */
  hopBlocked([la, lo], [pla, plo], kx, ky) {
    const L = Math.hypot((plo - lo) * kx, (pla - la) * ky), n = Math.ceil(L / 2); let own = true;
    for (let i = 1; i < n; i++) {
      const f = i / n; if (L * (1 - f) < 4) break;
      const qa = la + f * (pla - la), qo = lo + f * (plo - lo), b = this.inside(qa, qo);
      if (!b) own = false; else if (!own) return true;
    }
    return this.overFence([la, lo], [pla, plo], kx, ky);
  }
  /* The nearest point on the network to [lon, lat] within `max` m: {a, b, w, t, perp, p} (t = share of the way from a to b, p = [lat, lon]) */
  snap(ll, max = 150) { return this.snaps(ll, max, 1)[0] || null; }
  /* Up to `k` nearest streets (different stretches), each no more than 40 m further than the nearest one. Measured along
     each street's real shape, so a curved street is not cut across. */
  snaps([lo, la], max = 150, k = 4) {
    const cy = Math.floor(la / TY), cx = Math.floor(lo / TX), kx = Math.cos(la * rad) * rad * R, ky = rad * R;
    const all = [], seen = new Set();
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
      const E = this.te.get(`${y}_${x}`); if (!E) continue;
      for (let i = 0; i < E.length; i += 3) {
        const a = E[i], b = E[i + 1], key = a * 4194304 + b; if (seen.has(key)) continue; seen.add(key);
        const P = this.line(a, b); if (!P) continue;
        let best = Infinity, bt = 0, bp = null, run = 0, tot = 0;
        const L = []; for (let q = 1; q < P.length; q++) { L.push(segM(P[q - 1], P[q], kx, ky)); tot += L[q - 1]; }
        for (let q = 1; q < P.length; q++) {
          const ax = (P[q - 1][1] - lo) * kx, ay = (P[q - 1][0] - la) * ky, dx = (P[q][1] - P[q - 1][1]) * kx, dy = (P[q][0] - P[q - 1][0]) * ky, l2 = dx * dx + dy * dy;
          const u = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0, px = ax + u * dx, py = ay + u * dy, d = Math.hypot(px, py);
          if (d < best) { best = d; bt = tot ? (run + u * L[q - 1]) / tot : 0; bp = [P[q - 1][0] + u * (P[q][0] - P[q - 1][0]), P[q - 1][1] + u * (P[q][1] - P[q - 1][1])]; }
          run += L[q - 1];
        }
        if (best <= max) all.push({ a, b, w: E[i + 2], t: bt, perp: best, p: bp });
      }
    }
    all.sort((x, y) => x.perp - y.perp);
    // streets reached without walking through a building first (up to 80 m further than the nearest); else as before
    const clear = [];
    for (const c of all) { if (clear.length >= k || c.perp > all[0].perp + 80) break; if (!this.hopBlocked([la, lo], c.p, kx, ky)) clear.push(c); }
    if (clear.length) return clear.filter((c) => c.perp <= clear[0].perp + 40);
    const out = [];
    for (const c of all) { if (out.length >= k || c.perp > all[0].perp + 40) break; out.push(c); }
    return out;
  }
  /* Shortest walks from a snapped point to every network point up to `limit` m. With `prev`, also how each was reached. */
  from(src, limit = 3000, prev = null) {
    const d = new Map(), h = new Heap();
    const seed = (n, v, from) => { v += this.pen.get(n) || 0; if (v < (d.get(n) ?? Infinity)) { d.set(n, v); h.push(v, n); if (prev) prev.set(n, from); } };
    [].concat(src).forEach((s, i) => { const o = s.perp * OFF; seed(s.a, o + s.t * s.w, -1 - i); seed(s.b, o + (1 - s.t) * s.w, -1 - i); });
    while (h.size) {
      const n = h.pop(), v = h.top; if (v > (d.get(n) ?? Infinity) || v > limit) continue;
      const A = this.adj.get(n); if (!A) continue;
      for (let i = 0; i < A.length; i += 2) { const o = A[i], nv = v + A[i + 1] + (this.pen.get(o) || 0); if (nv < (d.get(o) ?? Infinity) && nv <= limit) { d.set(o, nv); h.push(nv, o); if (prev) prev.set(o, n); } }
    }
    return d;
  }
  /* Metres from the source of `d` (snapped as `src`) to the snapped point `tgt`. */
  to(d, tgt, src) { return this.best(d, tgt, src).m; }
  best(d, tgt, src) {
    const ma = (d.get(tgt.a) ?? Infinity) + tgt.t * tgt.w, mb = (d.get(tgt.b) ?? Infinity) + (1 - tgt.t) * tgt.w;
    let r = ma <= mb ? { m: ma, end: tgt.a } : { m: mb, end: tgt.b };
    [].concat(src || []).forEach((s, i) => {
      if ((s.a === tgt.a && s.b === tgt.b) || (s.a === tgt.b && s.b === tgt.a)) {
        const t2 = s.a === tgt.a ? tgt.t : 1 - tgt.t, m = s.perp * OFF + Math.abs(s.t - t2) * tgt.w;
        if (m < r.m) r = { m, same: i };
      }
    });
    r.m += tgt.perp * OFF;
    return r;
  }
  /* part of a snapped stretch's shape, from the snapped point to its end `n` */
  part(s, n) {
    const P = this.line(s.a, s.b); if (!P) return [s.p];
    const kx = Math.cos(P[0][0] * rad) * rad * R, ky = rad * R, L = [0];
    for (let q = 1; q < P.length; q++) L.push(L[q - 1] + segM(P[q - 1], P[q], kx, ky));
    const at = s.t * L[L.length - 1], out = [s.p];
    if (n === s.b) { for (let q = 0; q < P.length; q++) if (L[q] > at) out.push(P[q]); }
    else { for (let q = P.length - 1; q >= 0; q--) if (L[q] < at) out.push(P[q]); }
    return out;
  }
  /* The walk itself as [[lon, lat], ...] from `fromLL` to `toLL` (both [lon, lat]), following the streets. */
  path(fromLL, src, d, prev, tgt, toLL) {
    src = [].concat(src);
    const r = this.best(d, tgt, src), out = [[fromLL[1], fromLL[0]]];
    if (r.m === Infinity) return null;
    if (r.same != null) {
      // start and end on the same stretch: along it between the two points
      const s = src[r.same], t2 = s.a === tgt.a ? tgt.t : 1 - tgt.t, P = this.line(s.a, s.b) || [];
      const kx = Math.cos(fromLL[1] * rad) * rad * R, ky = rad * R, L = [0];
      for (let q = 1; q < P.length; q++) L.push(L[q - 1] + segM(P[q - 1], P[q], kx, ky));
      const tot = L[L.length - 1], lo = Math.min(s.t, t2) * tot, hi = Math.max(s.t, t2) * tot;
      const mid = P.filter((_, q) => L[q] > lo && L[q] < hi); if (s.t > t2) mid.reverse();
      out.push(s.p, ...mid, tgt.a === s.a ? tgt.p : tgt.p);
    } else {
      const chain = []; let n = r.end, guard = 0;
      while (n >= 0 && guard++ < 100000) { chain.push(n); n = prev.get(n); if (n === undefined) return null; }
      const s = src[-1 - n]; chain.reverse();
      out.push(...this.part(s, chain[0]));
      for (let i = 1; i < chain.length; i++) { const P = this.line(chain[i - 1], chain[i]); if (P) out.push(...P.slice(1)); else out.push(this.ll.get(chain[i])); }
      out.push(...this.part(tgt, r.end).reverse());
    }
    out.push([toLL[1], toLL[0]]);
    // drop repeats
    const res = []; for (const [la, lo] of out) { const l = res[res.length - 1]; if (!l || Math.abs(l[0] - lo) > 1e-7 || Math.abs(l[1] - la) > 1e-7) res.push([lo, la]); }
    return res;
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
    async from(ll, near, limit = 3000, stop = null) {
      const key = ll[0].toFixed(5) + "," + ll[1].toFixed(5) + "," + limit + "," + stop;
      let w = memo.get(key);
      if (!w) {
        await around(ll, limit * 0.8);
        const s = stop != null && stops && stops.snap[stop] ? [stops.snap[stop]] : stops && g.snaps(ll, 150);
        if (!s || !s.length) return null;
        const prev = new Map();
        w = { s, prev, d: g.from(s, limit, prev) };
        memo.set(key, w); if (memo.size > 30) memo.delete(memo.keys().next().value);
      }
      const { s, d, prev } = w;
      return {
        list: (near || []).map(([st, sl]) => { const t = stops.snap[st]; return [st, t ? g.to(d, t, s) : null, sl]; }),
        to: (ll2) => Math.min(Infinity, ...g.snaps(ll2, 150).map((t) => g.to(d, t, s))),
        /* the walk's shape to a place [lon, lat] or a stop (its place on the network), null when not on the network */
        path: (ll2, st) => {
          const ts = st != null && stops.snap[st] ? [stops.snap[st]] : g.snaps(ll2, 150);
          let b = null; for (const t of ts) { const r = g.best(d, t, s); if (!b || r.m < b.m) b = { m: r.m, t }; }
          return b && b.m < Infinity ? g.path(ll, s, d, prev, b.t, ll2) : null;
        },
      };
    },
    /* a walk's shape between two places [lon, lat] (with their stop indexes when they are stops), or null */
    async path(a, b, sa = null, sb = null) {
      const R2 = Math.hypot((b[0] - a[0]) * 111000 * Math.cos(a[1] * rad), (b[1] - a[1]) * 111000);
      await around(b, 300);
      const w = await this.from(a, null, Math.min(3500, Math.round(R2 * 2.2 + 300)), sa);
      return w ? w.path(b, sb) : null;
    },
    snapIn: (ll) => g.snap(ll, 150),
    tileOf,
  };
}
