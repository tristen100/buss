// Real walking distances from OpenStreetMap, so the app stops guessing "straight line × 1.25".
//   node tools/build-walk.mjs osm [tallinn.json]  -> public/data/walk/t_<y>_<x>.json  (street network in ~1 km tiles)
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

async function fetchOsm() {
  const q = `[out:json][timeout:180];(way["highway"]["highway"!~"motorway|motorway_link|construction|proposed|raceway|bus_guideway|abandoned|platform"](${BOX});
    );out body;>;out skel qt;node["highway"~"crossing|traffic_signals"](${BOX});out body;node["crossing"](${BOX});out body;`;
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

async function buildOsm(file) {
  const osm = file ? JSON.parse(readFileSync(file, "utf8")) : await fetchOsm();
  const ll = new Map(), pen = new Map(), ways = [];
  for (const e of osm.elements) {
    if (e.type === "node") { if (e.lat != null) ll.set(e.id, [e.lat, e.lon]); const p = penalty(e.tags); if (p) pen.set(e.id, p); }
    else if (e.type === "way" && walkable(e.tags)) ways.push(e);
  }
  // nodes kept in the network: where ways meet or end; the rest are folded into the edges
  const use = new Map();
  for (const w of ways) w.nodes.forEach((n, i) => use.set(n, (use.get(n) || 0) + (i === 0 || i === w.nodes.length - 1 ? 2 : 1)));
  const id = new Map(), nodes = [];
  const keep = (n) => { if (!id.has(n)) { id.set(n, nodes.length); const [la, lo] = ll.get(n); nodes.push([Math.round(la * 1e5), Math.round(lo * 1e5), pen.get(n) || 0]); } return id.get(n); };
  const edges = new Map();
  for (const w of ways) {
    const f = w.tags.highway === "steps" ? 1.4 : 1;
    const ns = w.nodes.filter((n) => ll.has(n)); if (ns.length < 2) continue;
    let a = ns[0], len = 0;
    for (let i = 1; i < ns.length; i++) {
      const n = ns[i]; len += dist(ll.get(ns[i - 1]), ll.get(n)) * f;
      if (i === ns.length - 1 || use.get(n) > 1) {
        const A = keep(a), B = keep(n);
        if (A !== B) { const k = A < B ? A + "," + B : B + "," + A, wt = Math.round(len); if (!edges.has(k) || edges.get(k) > wt) edges.set(k, wt); }
        a = n; len = 0;
      } else len += pen.get(n) || 0;             // a crossing in the middle of a stretch
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
  const T = new Map(), tile = (k) => T.get(k) || T.set(k, { n: [], e: [] }).get(k);
  nodes.forEach(([la, lo, p], i) => { if (big(i)) tile(tileOf(la / 1e5, lo / 1e5)).n.push(i, la, lo, p); });
  for (const [k, w] of edges) {
    const [a, b] = k.split(",").map(Number), ta = tileOf(nodes[a][0] / 1e5, nodes[a][1] / 1e5), tb = tileOf(nodes[b][0] / 1e5, nodes[b][1] / 1e5);
    tile(ta).e.push(a, b, w); if (tb !== ta) tile(tb).e.push(a, b, w);
  }
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.startsWith("t_")) (await import("node:fs")).unlinkSync(join(OUT, f));
  let bytes = 0;
  for (const [k, t] of T) { const s = JSON.stringify(t); bytes += s.length; writeFileSync(join(OUT, `t_${k}.json`), s); }
  writeFileSync(join(OUT, "index.json"), JSON.stringify({ v: new Date().toISOString().slice(0, 10), ty: TY, tx: TX, tiles: [...T.keys()] }));
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

const [cmd, file] = process.argv.slice(2);
if (cmd === "osm") await buildOsm(file);
else if (cmd === "stops") buildStops();
else console.log("usage: node tools/build-walk.mjs osm [file] | stops");
