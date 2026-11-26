// Real walking distances from OpenStreetMap, so the app stops guessing "straight line × 1.25".
//   node tools/build-walk.mjs osm [tallinn.json [buildings.json]]  -> public/data/walk/t_<y>_<x>.json  (street network in
//                                                    ~1 km tiles, with a 4.5 m map of where buildings stand)
//   node tools/build-walk.mjs stops               -> public/data/walk/stops.json     (each stop's place on the network +
//                                                    real walks to stops nearby; run after every timetable rebuild)
// Crossing a street costs time: traffic lights about 15 s of waiting on average, a zebra or plain crossing a few seconds. That time is
// stored as extra metres at 5.5 km/h. Steps count 1.4×. Without a file, `osm` downloads the area from the Overpass API.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT = "public/data/walk";
const BOX = [59.33, 24.52, 59.52, 25.0];           // south, west, north, east: Tallinn and a bit around it
export const TY = 0.01, TX = 0.02;                 // tile size in degrees (about 1.1 × 1.1 km)
const V = 5.5 / 3.6;                               // m/s, to turn waiting seconds into metres
const PEN = { lights: Math.round(15 * V), plain: Math.round(6 * V), marked: Math.round(3 * V) }; // average wait: half a red light, a look both ways
const XFER = 600, XMAX = 1100;                      // stop-to-stop walks: straight line up to 600 m, real walk up to 1100 m
const R = 6371000, rad = Math.PI / 180;
const dist = (a, b) => { const x = (b[1] - a[1]) * rad * Math.cos(((a[0] + b[0]) / 2) * rad), y = (b[0] - a[0]) * rad; return Math.sqrt(x * x + y * y) * R; };
const tileOf = (la, lo) => `${Math.floor(la / TY)}_${Math.floor(lo / TX)}`;

async function overpass(q) {
  for (const u of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"])
    for (const wait of [5, 30, 60]) {
      try {
        const r = await fetch(u, { method: "POST", headers: { "User-Agent": "buss-walk-build", "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
        const t = await r.text(); if (r.ok && t.startsWith("{")) return JSON.parse(t);
      } catch (e) {}
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  throw new Error("Overpass: no answer");
}
// in six pieces: one query for the whole area is often refused when the servers are busy
async function fetchBuildings() {
  const els = [], [S, W, N, E] = BOX;
  for (const [s, n] of [[S, 59.40], [59.40, 59.46], [59.46, N]]) for (const [w, e] of [[W, 24.76], [24.76, E]])
    els.push(...(await overpass(`[out:json][timeout:240];way["building"](${s},${w},${n},${e});out geom qt;`)).elements);
  return { elements: els };
}
// fences, walls, hedges, city walls: lines nobody walks through (only at a gate or where a path meets them)
async function fetchFences() {
  const els = [], [S, W, N, E] = BOX;
  for (const [s, n] of [[S, 59.43], [59.43, N]]) for (const [w, e] of [[W, 24.76], [24.76, E]])
    els.push(...(await overpass(`[out:json][timeout:240];way["barrier"~"^(fence|wall|hedge|city_wall)$"](${s},${w},${n},${e});out geom qt;`)).elements);
  return { elements: els };
}
// fence lines per tile as exact segments (lat5, lon5 pairs), simplified to 1 m, and the gaps in them (gates, paths that
// meet them): a segment goes to the tiles of both its ends
function fenceLines(fj, keys, holes) {
  const want = new Set(keys), L = new Map(), H = new Map();
  const put = (M, k, ...v) => { if (want.has(k)) (M.get(k) || M.set(k, []).get(k)).push(...v); };
  for (const e of fj.elements) { const G = e.geometry; if (!G || G.length < 2) continue;
    const P = simplify(G.map((p) => [p.lat, p.lon]), 1).map(([la, lo]) => [Math.round(la * 1e5), Math.round(lo * 1e5)]);
    for (let i = 1; i < P.length; i++) { const [a, b] = [P[i - 1], P[i]], k1 = tileOf(a[0] / 1e5, a[1] / 1e5), k2 = tileOf(b[0] / 1e5, b[1] / 1e5);
      put(L, k1, a[0], a[1], b[0], b[1]); if (k2 !== k1) put(L, k2, a[0], a[1], b[0], b[1]); } }
  for (const [la, lo] of holes) put(H, tileOf(la, lo), Math.round(la * 1e5), Math.round(lo * 1e5));
  return { L, H };
}
// where buildings stand, per tile: NY × NX cells (about 4.5 m), 1 bit each, row by row from the south-west corner
export const NY = 250, NX = 250;
function buildingMap(bj, keys) {
  const want = new Set(keys), bits = new Map();
  const set = (k, r, c) => { let b = bits.get(k); if (!b) bits.set(k, (b = new Uint8Array((NY * NX) / 8))); const i = r * NX + c; b[i >> 3] |= 1 << (i & 7); };
  const cy = TY / NY, cx = TX / NX;
  for (const e of bj.elements) {
    const t = e.tags || {}, G = e.geometry;
    if (!G || G.length < 4 || ["roof", "carport", "no", "ruins", "construction"].includes(t.building) || t["building:part"]) continue;
    let s = 90, w = 180, n = -90, ea = -180; for (const p of G) { s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lon); ea = Math.max(ea, p.lon); }
    for (let y = Math.floor(s / cy); y <= Math.floor(n / cy); y++) {
      const la = (y + 0.5) * cy, xs = [];
      for (let i = 0, j = G.length - 1; i < G.length; j = i++) if ((G[i].lat > la) !== (G[j].lat > la)) xs.push(G[i].lon + ((la - G[i].lat) * (G[j].lon - G[i].lon)) / (G[j].lat - G[i].lat));
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) for (let x = Math.ceil(xs[q] / cx - 0.5); x + 0.5 <= xs[q + 1] / cx; x++) {
        const ty = Math.floor(y / NY), tx = Math.floor(x / NX), k = `${ty}_${tx}`; if (want.has(k)) set(k, y - ty * NY, x - tx * NX);
      }
    }
  }
  return bits;
}

async function fetchOsm() {
  const q = `[out:json][timeout:180];(way["highway"]["highway"!~"motorway|motorway_link|construction|proposed|raceway|bus_guideway|abandoned|platform"](${BOX});
    );out body;>;out skel qt;node["highway"~"crossing|traffic_signals"](${BOX});out body;node["crossing"](${BOX});out body;node["barrier"](${BOX});out body;`;
  for (const u of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"])
    for (const wait of [5, 30, 60]) {
      try {
        const r = await fetch(u, { method: "POST", headers: { "User-Agent": "buss-walk-build", "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
        const t = await r.text(); if (r.ok && t.startsWith("{")) return JSON.parse(t);
      } catch (e) {}
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  throw new Error("Overpass: no answer");
}

const walkable = (t) => {
  if (!t || !t.highway || t.highway === "elevator" || t.highway === "busway" || t.highway === "services") return false;
  const foot = t.foot, acc = t.access;
  if (foot === "no" || foot === "private" || foot === "use_sidepath") return false;
  if ((acc === "no" || acc === "private") && !["yes", "designated", "permissive"].includes(foot)) return false;
  if (t.area === "yes" && t.highway !== "pedestrian" && t.highway !== "footway") return false;
  // corridors inside buildings (shopping centres, stations): closed at night and drawn across the building on the map
  if (t.highway === "corridor" || t.indoor && t.indoor !== "no" || t.location === "indoor") return false;
  // paths on an upper or lower floor (malls, stations) unless it is a bridge
  if (t.level != null && !/^0(;0)*$/.test(t.level) && !t.bridge) return false;
  // car parks inside buildings: lanes covered, underground or on another floor
  if (t.highway === "service" && (t.tunnel === "yes" || t.covered === "yes" || (t.layer && t.layer !== "0") || /parking_aisle|drive-through/.test(t.service || "") && t.covered && t.covered !== "no")) return false;
  return true;
};
function penalty(t) {
  if (!t) return 0;
  // only pedestrian crossings: a road's own signal point would charge walkers who just pass along the street
  if (t.highway !== "crossing" && !t.crossing) return 0;
  if (t.crossing === "traffic_signals" || t["crossing:signals"] === "yes" || /pelican|toucan|puffin/.test(t.crossing_ref || "")) return PEN.lights;
  if (t.crossing === "no") return 0;
  if (t.crossing === "zebra" || t.crossing === "marked" || t.crossing === "uncontrolled" || t["crossing:markings"] && t["crossing:markings"] !== "no") return PEN.marked;
  if (t.highway === "crossing" || t.crossing) return PEN.plain;
  return 0;
}

// Douglas-Peucker on [lat, lon] points, tolerance in metres
function simplify(P, tol = 1.5) {
  if (P.length < 3) return P;
  const keepI = new Uint8Array(P.length); keepI[0] = keepI[P.length - 1] = 1;
  const kx = Math.cos(P[0][0] * rad) * rad * R, ky = rad * R, st = [[0, P.length - 1]];
  while (st.length) {
    const [i, j] = st.pop(); let best = -1, bi = -1;
    const ax = P[i][1] * kx, ay = P[i][0] * ky, dx = P[j][1] * kx - ax, dy = P[j][0] * ky - ay, L = dx * dx + dy * dy;
    for (let k = i + 1; k < j; k++) {
      const px = P[k][1] * kx - ax, py = P[k][0] * ky - ay, t = L ? Math.max(0, Math.min(1, (px * dx + py * dy) / L)) : 0;
      const d = Math.hypot(px - t * dx, py - t * dy); if (d > best) { best = d; bi = k; }
    }
    if (best > tol) { keepI[bi] = 1; st.push([i, bi], [bi, j]); }
  }
  return P.filter((_, i) => keepI[i]);
}

async function buildOsm(file, bfile, ffile) {
  const osm = file ? JSON.parse(readFileSync(file, "utf8")) : await fetchOsm();
  const bj = bfile ? { elements: bfile.split(",").flatMap((f) => JSON.parse(readFileSync(f, "utf8")).elements) } : await fetchBuildings();
  // all tiles that may get streets, for the building map
  const keysAll = new Set(); for (const e of osm.elements) if (e.type === "node" && e.lat != null) keysAll.add(tileOf(e.lat, e.lon));
  const BM = buildingMap(bj, keysAll);
  const fj = ffile ? { elements: ffile.split(",").flatMap((f) => JSON.parse(readFileSync(f, "utf8")).elements) } : await fetchFences();
  const blocked = (la, lo) => { const y = Math.floor(la / (TY / NY)), x = Math.floor(lo / (TX / NX)), ty = Math.floor(y / NY), tx = Math.floor(x / NX), b = BM.get(`${ty}_${tx}`);
    if (!b) return false; const i = (y - ty * NY) * NX + (x - tx * NX); return !!(b[i >> 3] & (1 << (i & 7))); };
  const ll = new Map(), pen = new Map(), ways = [], shut = new Set(), gates = [];
  for (const e of osm.elements) {
    if (e.type === "node") { if (e.lat != null) ll.set(e.id, [e.lat, e.lon]); const p = penalty(e.tags); if (p) pen.set(e.id, p);
      // gates: locked or private ones close the way there; the rest are holes in the fence
      const t = e.tags; if (t && t.barrier && !["kerb", "bollard", "block", "cycle_barrier", "fence", "wall", "hedge"].includes(t.barrier)) {
        if (t.locked === "yes" || t.foot === "no" || t.foot === "private" || ((t.access === "private" || t.access === "no") && !["yes", "permissive", "designated"].includes(t.foot))) shut.add(e.id);
        else gates.push(e.id); } }
    else if (e.type === "way" && walkable(e.tags)) ways.push(e);
  }
  // cut ways where they run inside a building (a run of steps mostly inside, 8+ m in all): a footway through a terminal,
  // a mall or a block is not a way to walk at night and is drawn across the building on the map
  let dropIn = 0;
  for (let i = ways.length - 1; i >= 0; i--) {
    const w = ways[i], t = w.tags; if (t.tunnel || t.bridge || (t.covered && t.covered !== "no") || (t.layer && t.layer !== "0")) continue;
    const ns = w.nodes.filter((n) => ll.has(n)), bad = [];
    for (let k = 1; k < ns.length; k++) { const A = ll.get(ns[k - 1]), B = ll.get(ns[k]), L = dist(A, B), n = Math.max(1, Math.ceil(L / 2)); let ins = 0;
      for (let q = 0; q < n; q++) { const f = (q + 0.5) / n; if (blocked(A[0] + f * (B[0] - A[0]), A[1] + f * (B[1] - A[1]))) ins += L / n; }
      bad.push(ins >= L * 0.6 ? ins : -1); }
    // runs of bad steps; cut only runs with 8+ m inside
    const cut = new Array(bad.length).fill(false);
    for (let k = 0; k < bad.length;) { if (bad[k] < 0) { k++; continue; } let e = k, m = 0; while (e < bad.length && bad[e] >= 0) m += bad[e++]; if (m >= 8) for (let q = k; q < e; q++) cut[q] = true; k = e; }
    if (!cut.some(Boolean)) continue;
    const parts = []; let cur = [ns[0]];
    for (let k = 1; k < ns.length; k++) { if (cut[k - 1]) { if (cur.length > 1) parts.push(cur); cur = [ns[k]]; } else cur.push(ns[k]); }
    if (cur.length > 1) parts.push(cur);
    ways.splice(i, 1, ...parts.map((nodes) => ({ ...w, nodes }))); dropIn++;
  }
  console.log(`cut ${dropIn} paths where they run inside buildings`);
  // fences: a yard path, lane or track that crosses a fence line without meeting it (no gate there) is cut at that
  // spot, and closed gates close the way. Streets and their sidewalks are left alone (a fence across them is a mapping slip).
  const FG = new Map(), FK = (la, lo) => `${Math.floor(la / 0.001)}_${Math.floor(lo / 0.002)}`;
  for (const e of fj.elements) { const G = e.geometry; if (!G) continue;
    for (let i = 1; i < G.length; i++) { const a = G[i - 1], b = G[i], seg = [a.lat, a.lon, b.lat, b.lon];
      for (let y = Math.floor(Math.min(a.lat, b.lat) / 0.001); y <= Math.floor(Math.max(a.lat, b.lat) / 0.001); y++)
        for (let x = Math.floor(Math.min(a.lon, b.lon) / 0.002); x <= Math.floor(Math.max(a.lon, b.lon) / 0.002); x++) { const k = `${y}_${x}`; (FG.get(k) || FG.set(k, []).get(k)).push(seg); } } }
  const side = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const crosses = (A, B) => { const seen = new Set();
    for (let y = Math.floor(Math.min(A[0], B[0]) / 0.001); y <= Math.floor(Math.max(A[0], B[0]) / 0.001); y++)
      for (let x = Math.floor(Math.min(A[1], B[1]) / 0.002); x <= Math.floor(Math.max(A[1], B[1]) / 0.002); x++)
        for (const f of FG.get(`${y}_${x}`) || []) { if (seen.has(f)) continue; seen.add(f);
          const d1 = side(f[1], f[0], f[3], f[2], A[1], A[0]), d2 = side(f[1], f[0], f[3], f[2], B[1], B[0]), d3 = side(A[1], A[0], B[1], B[0], f[1], f[0]), d4 = side(A[1], A[0], B[1], B[0], f[3], f[2]);
          if (d1 * d2 < 0 && d3 * d4 < 0) return true; }
    return false; };
  const yard = (t) => /^(service|footway|path|track|steps|pedestrian|cycleway|bridleway)$/.test(t.highway) && !/^(sidewalk|crossing|traffic_island)$/.test(t.footway || "");
  let cutF = 0, cutG = 0;
  for (let i = ways.length - 1; i >= 0; i--) {
    const w = ways[i], t = w.tags, ns = w.nodes.filter((n) => ll.has(n)), cut = new Array(Math.max(0, ns.length - 1)).fill(false); let any = false;
    for (let k = 1; k < ns.length; k++) {
      if (shut.has(ns[k])) { cut[k - 1] = true; any = true; cutG++; continue; } // a closed gate: no way through it
      if (yard(t) && !t.bridge && !t.tunnel && !(t.layer && t.layer !== "0") && crosses(ll.get(ns[k - 1]), ll.get(ns[k]))) { cut[k - 1] = true; any = true; cutF++; }
    }
    if (!any) continue;
    const parts = []; let cur = [ns[0]];
    for (let k = 1; k < ns.length; k++) { if (cut[k - 1]) { if (cur.length > 1) parts.push(cur); cur = [ns[k]]; } else cur.push(ns[k]); }
    if (cur.length > 1) parts.push(cur);
    ways.splice(i, 1, ...parts.map((nodes) => ({ ...w, nodes })));
  }
  console.log(`cut ${cutF} path steps that cross a fence, ${cutG} at closed gates`);
  // holes in the fence map: open gates and every node a fence shares with a path
  const fnodes = new Set(); for (const e of fj.elements) for (const n of e.nodes || []) fnodes.add(n);
  const holes = []; for (const id of gates) if (ll.has(id)) holes.push(ll.get(id));
  for (const w of ways) for (const n of w.nodes) if (fnodes.has(n) && ll.has(n)) holes.push(ll.get(n));
  const FM = fenceLines(fj, keysAll, holes);
  // nodes kept in the network: where ways meet or end; the rest are folded into the edges
  const use = new Map();
  for (const w of ways) w.nodes.forEach((n, i) => use.set(n, (use.get(n) || 0) + (i === 0 || i === w.nodes.length - 1 ? 2 : 1)));
  const id = new Map(), nodes = [];
  const keep = (n) => { if (!id.has(n)) { id.set(n, nodes.length); const [la, lo] = ll.get(n); nodes.push([Math.round(la * 1e5), Math.round(lo * 1e5), pen.get(n) || 0]); } return id.get(n); };
  const edges = new Map();
  for (const w of ways) {
    const f = w.tags.highway === "steps" ? 1.4 : 1;
    const ns = w.nodes.filter((n) => ll.has(n)); if (ns.length < 2) continue;
    let a = ns[0], len = 0, mid = [];
    for (let i = 1; i < ns.length; i++) {
      const n = ns[i]; len += dist(ll.get(ns[i - 1]), ll.get(n)) * f;
      if (i === ns.length - 1 || use.get(n) > 1) {
        const A = keep(a), B = keep(n);
        if (A !== B) {
          // the stretch's shape (points between its ends, simplified to ~1.5 m), stored from the lower id to the higher
          const pts = simplify([ll.get(a), ...mid.map((x) => ll.get(x)), ll.get(n)]).slice(1, -1);
          const k = A < B ? A + "," + B : B + "," + A, wt = Math.round(len), g = A < B ? pts : pts.reverse();
          if (!edges.has(k) || edges.get(k).w > wt) edges.set(k, { w: wt, g });
        }
        a = n; len = 0; mid = [];
      } else { len += pen.get(n) || 0; mid.push(n); } // a crossing in the middle of a stretch
    }
  }
  // drop small separate pieces (a courtyard path that meets no street): a place snapped there could not get anywhere
  const adj = nodes.map(() => []); for (const k of edges.keys()) { const [x, y] = k.split(",").map(Number); adj[x].push(y); adj[y].push(x); }
  const comp = new Int32Array(nodes.length).fill(-1), size = []; 
  for (let i = 0; i < nodes.length; i++) { if (comp[i] >= 0) continue; const c = size.length, st = [i]; comp[i] = c; let n = 0;
    while (st.length) { const x = st.pop(); n++; for (const y of adj[x]) if (comp[y] < 0) { comp[y] = c; st.push(y); } } size.push(n); }
  const big = (i) => size[comp[i]] >= 40;
  for (const k of [...edges.keys()]) if (!big(+k.split(",")[0])) edges.delete(k);
  console.log(`dropped ${nodes.filter((_, i) => !big(i)).length} points in ${size.filter((n) => n < 40).length} small pieces`);
  // tiles: each node in its tile, each edge in the tiles of both its ends
  // tile: n = [id, lat5, lon5, penalty, ...], e = [a, b, metres, ...], g = per stretch its inner points [lat5, lon5, ...] or 0
  const T = new Map(), tile = (k) => T.get(k) || T.set(k, { n: [], e: [], g: [] }).get(k);
  nodes.forEach(([la, lo, p], i) => { if (big(i)) tile(tileOf(la / 1e5, lo / 1e5)).n.push(i, la, lo, p); });
  for (const [k, { w, g }] of edges) {
    const [a, b] = k.split(",").map(Number), ta = tileOf(nodes[a][0] / 1e5, nodes[a][1] / 1e5), tb = tileOf(nodes[b][0] / 1e5, nodes[b][1] / 1e5);
    const geo = g.length ? g.flatMap(([la, lo]) => [Math.round(la * 1e5), Math.round(lo * 1e5)]) : 0;
    tile(ta).e.push(a, b, w); tile(ta).g.push(geo);
    if (tb !== ta) { tile(tb).e.push(a, b, w); tile(tb).g.push(geo); }
  }
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.startsWith("t_")) (await import("node:fs")).unlinkSync(join(OUT, f));
  let bytes = 0;
  for (const [k, t] of T) { const b = BM.get(k); t.b = b ? Buffer.from(b).toString("base64") : 0; t.f = FM.L.get(k) || 0; t.fh = FM.H.get(k) || 0; const s = JSON.stringify(t); bytes += s.length; writeFileSync(join(OUT, `t_${k}.json`), s); }
  writeFileSync(join(OUT, "index.json"), JSON.stringify({ v: new Date().toISOString().slice(0, 10), ty: TY, tx: TX, ny: NY, nx: NX, tiles: [...T.keys()] }));
  console.log(`walk network: ${nodes.length} points, ${edges.size} stretches, ${T.size} tiles, ${(bytes / 1e6).toFixed(1)} MB`);
}

// ---------- stops ----------
import { Graph } from "../public/walk.js";
function buildStops() {
  const tt = JSON.parse(readFileSync("public/data/tt.json", "utf8"));
  const idx = JSON.parse(readFileSync(join(OUT, "index.json"), "utf8"));
  const g = new Graph();
  for (const k of idx.tiles) g.add(k, JSON.parse(readFileSync(join(OUT, `t_${k}.json`), "utf8")));
  const S = tt.stops.n.map((_, i) => [tt.stops.lat[i] / 1e5, tt.stops.lon[i] / 1e5]);
  const snap = S.map(([la, lo]) => (la > BOX[0] && la < BOX[2] && lo > BOX[1] && lo < BOX[3] ? g.snap([lo, la], 80) : null));
  // stops by grid cell, for "stops within 600 m"
  const cell = new Map(), ck = (la, lo) => `${Math.floor(la / 0.006)}_${Math.floor(lo / 0.012)}`;
  S.forEach(([la, lo], i) => { const k = ck(la, lo); (cell.get(k) || cell.set(k, []).get(k)).push(i); });
  const foot = [];
  let pairs = 0;
  for (let s = 0; s < S.length; s++) {
    if (!snap[s]) { foot.push(0); continue; }
    const d = g.from(snap[s], XMAX), out = [];
    const [la, lo] = S[s], cy = Math.floor(la / 0.006), cx = Math.floor(lo / 0.012);
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) for (const o of cell.get(`${y}_${x}`) || []) {
      if (o === s || !snap[o] || dist(S[s], S[o]) > XFER) continue;
      const m = g.to(d, snap[o], snap[s]);
      if (m <= XMAX) { out.push(o, Math.round(m)); pairs++; }
    }
    foot.push(out);
  }
  writeFileSync(join(OUT, "stops.json"), JSON.stringify({ v: idx.v, tt: tt.v, snap: snap.map((x) => x || 0), foot }));
  console.log(`stops: ${snap.filter(Boolean).length} of ${S.length} on the walk network, ${pairs} real stop-to-stop walks`);
}

const [cmd, file, bfile, ffile] = process.argv.slice(2);
if (cmd === "osm") await buildOsm(file, bfile, ffile);
else if (cmd === "stops") buildStops();
else console.log("usage: node tools/build-walk.mjs osm [ways.json [buildings.json,... [fences.json,...]]] | stops");
