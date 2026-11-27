// Builds the app's timetable from Tallinn's public GTFS (transport.tallinn.ee/data/gtfs.zip) plus county buses and
// Elron trains around Tallinn, and Tartu's city buses, county buses and trains, from the national GTFS.
// Run: node tools/build-data.mjs [tallinn.zip] [national.zip]  ->  public/data/tt.json (stops, lines, trips) + public/data/shapes.json (line paths)
// Run again whenever Tallinn publishes a new timetable (the app shows the data date in Seaded).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SRC = "https://transport.tallinn.ee/data/gtfs.zip";
const dir = mkdtempSync(join(tmpdir(), "buss-gtfs-"));
const zip = process.argv[2] && existsSync(process.argv[2]) ? process.argv[2] : join(dir, "gtfs.zip");
if (zip === join(dir, "gtfs.zip")) {
  const r = await fetch(SRC);
  if (!r.ok) throw new Error("GTFS download failed: " + r.status);
  writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
}
execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);

function csv(name) {
  const text = readFileSync(join(dir, name), "utf8").replace(/^﻿/, "");
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); f = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift();
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const mins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

// stops
const stopsIn = csv("stops.txt");
const stopIx = new Map();
const stops = { n: [], lat: [], lon: [], siri: [], code: [] };
for (const s of stopsIn) {
  if (s.location_type && s.location_type !== "0") continue;
  stopIx.set(s.stop_id, stops.n.length);
  stops.n.push(s.stop_name);
  stops.lat.push(Math.round(+s.stop_lat * 1e5));
  stops.lon.push(Math.round(+s.stop_lon * 1e5));
  stops.siri.push(+(s.thoreb_id || s.stop_id) || 0);
  stops.code.push(s.stop_code);
}

// lines
const routesIn = csv("routes.txt");
const routeIx = new Map(), routes = [];
for (const r of routesIn) {
  const t = r.route_id.includes("_tram_") || r.route_type === "900" || r.route_type === "0" ? "tram"
    : r.route_id.includes("_trol_") || r.route_type === "800" || r.route_type === "11" ? "trol" : "bus";
  routeIx.set(r.route_id, routes.length);
  routes.push([r.route_short_name.replace(/^T(?=\d)/, ""), t, r.route_long_name]);
}

// services: [weekday mask Mon=1..Sun=64, start, end, [added dates], [removed dates]]
const svcIx = new Map(), svc = [];
const getSvc = id => {
  if (!svcIx.has(id)) { svcIx.set(id, svc.length); svc.push([0, 0, 0, [], []]); }
  return svc[svcIx.get(id)];
};
for (const c of csv("calendar.txt")) {
  const s = getSvc(c.service_id);
  s[0] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].reduce((a, d, i) => a | (c[d] === "1" ? 1 << i : 0), 0);
  s[1] = +c.start_date; s[2] = +c.end_date;
}
for (const c of csv("calendar_dates.txt")) getSvc(c.service_id)[c.exception_type === "1" ? 3 : 4].push(+c.date);

// trips grouped into patterns (same line, headsign and stop list)
const tripsIn = csv("trips.txt");
const tripInfo = new Map(tripsIn.map(t => [t.trip_id, t]));
const times = new Map();
for (const st of csv("stop_times.txt")) {
  let a = times.get(st.trip_id);
  if (!a) times.set(st.trip_id, a = []);
  a.push([+st.stop_sequence, stopIx.get(st.stop_id), mins(st.arrival_time), mins(st.departure_time)]);
}
const patIx = new Map(), pats = [];
const shapeIds = new Map();
for (const [tid, a] of times) {
  const t = tripInfo.get(tid);
  if (!t || !routeIx.has(t.route_id)) continue;
  a.sort((x, y) => x[0] - y[0]);
  const s = a.map(x => x[1]);
  if (s.some(x => x == null)) continue;
  const key = t.route_id + "|" + t.trip_headsign + "|" + s.join(",");
  let p = patIx.get(key);
  if (p == null) {
    p = pats.length; patIx.set(key, p);
    if (!shapeIds.has(t.shape_id)) shapeIds.set(t.shape_id, shapeIds.size);
    pats.push({ r: routeIx.get(t.route_id), h: t.trip_headsign, s, sh: shapeIds.get(t.shape_id), d: [], dk: new Map(), t: [] });
  }
  const P = pats[p];
  // time profile: minutes from the first departure, departure at each stop (arrival = departure in this feed)
  const t0 = a[0][3];
  const prof = a.map(x => x[3] - t0).join(",");
  let di = P.dk.get(prof);
  if (di == null) { di = P.d.length; P.dk.set(prof, di); P.d.push(a.map(x => x[3] - t0)); }
  P.t.push([svcIx.get(t.service_id) ?? getSvcIdx(t.service_id), t0, di, +t.thoreb_id || 0]);
}
function getSvcIdx(id) { getSvc(id); return svcIx.get(id); }
/* Tallinn's feed keeps the night lines (91-96) on the service of the morning they run in, with times past 24:00
   (Friday night's 00:26 is Saturday's service at 24:26). Live SIRI confirms it, so services with only such trips
   are moved back a day. */
const minT0 = new Map();
for (const P of pats) for (const t of P.t) minT0.set(t[0], Math.min(minT0.get(t[0]) ?? 1e9, t[1]));
let night = 0;
for (const P of pats) for (const t of P.t) if (minT0.get(t[0]) >= 1440) { t[1] -= 1440; night++; }
console.log("night trips moved back a day:", night);
/* ===== county buses and Elron trains from the national feed (peatus.ee data, Regionaal- ja Põllumajandusministeerium,
   unified by Remix). Tallinn's own lines (TLT) come from Tallinn's feed above, so they are skipped here. Only the part of
   each trip inside the app's area is kept; a stop with the same stop code as a Tallinn stop is that stop (live times work).
   Pickup-only / drop-off-only stops are kept per pattern (nb = no boarding, na = no getting off). */
const NAT = "https://eu-gtfs.remix.com/estonia_unified_gtfs.zip";
// the app's areas: Tallinn with Harjumaa around it, Tartu with the places around it
const BOXES = [{ w: 24.3, e: 25.3, s: 59.25, n: 59.62 }, { w: 26.45, e: 27.0, s: 58.25, n: 58.5, tartu: 1 }];
const ndir = join(dir, "nat");
{
  const nzip = process.argv[3] && existsSync(process.argv[3]) ? process.argv[3] : join(dir, "nat.zip");
  if (nzip === join(dir, "nat.zip")) {
    const r = await fetch(NAT);
    if (!r.ok) throw new Error("national GTFS download failed: " + r.status);
    writeFileSync(nzip, Buffer.from(await r.arrayBuffer()));
  }
  execFileSync("unzip", ["-o", "-q", nzip, "-d", ndir]);
}
const split = l => { const o = []; let f = "", q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"') { if (l[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"') q = true; else if (c === ",") { o.push(f); f = ""; } else f += c; } o.push(f); return o; };
async function each(name, fn) {
  const rl = createInterface({ input: createReadStream(join(ndir, name)) }); let h = null;
  for await (const l of rl) { if (!h) { h = split(l.replace(/^﻿/, "")); continue; } if (!l) continue; const r = split(l), o = {}; h.forEach((k, i) => (o[k] = r[i] ?? "")); fn(o); }
}
const TLT = "10312960";
const inBox = (B, s) => s && s.lon >= B.w && s.lon <= B.e && s.lat >= B.s && s.lat <= B.n;
const codeIx = new Map(); stops.code.forEach((c, i) => { if (c && !codeIx.has(c)) codeIx.set(c, i); });
const nStops = new Map(); await each("stops.txt", s => nStops.set(s.stop_id, { code: s.stop_code, name: s.stop_name, lat: +s.stop_lat, lon: +s.stop_lon }));
const nIx = new Map(); let shared = 0;
const nStop = id => {
  if (nIx.has(id)) return nIx.get(id);
  const s = nStops.get(id); let i = inBox(BOXES[0], s) ? codeIx.get(s.code) : null;
  if (i != null) shared++;
  else { i = stops.n.length; stops.n.push(s.name); stops.lat.push(Math.round(s.lat * 1e5)); stops.lon.push(Math.round(s.lon * 1e5)); stops.siri.push(0); stops.code.push(s.code); }
  nIx.set(id, i); return i;
};
const nRoutes = new Map(); await each("routes.txt", r => {
  // Tartu's own city lines (competent authority "Tartu linn") are city buses there; they have no live times
  r.tartu = r.competent_authority === "Tartu linn" && r.route_type === "3"; if (r.agency_id !== TLT && (r.route_type === "2" || r.route_type === "3")) nRoutes.set(r.route_id, r); });
const nTrips = new Map(); await each("trips.txt", t => { if (nRoutes.has(t.route_id)) nTrips.set(t.trip_id, t); });
const nTimes = new Map();
await each("stop_times.txt", st => {
  if (!nTrips.has(st.trip_id)) return;
  let a = nTimes.get(st.trip_id); if (!a) nTimes.set(st.trip_id, a = []);
  a.push([+st.stop_sequence, st.stop_id, mins(st.arrival_time || st.departure_time), mins(st.departure_time || st.arrival_time), st.pickup_type === "1", st.drop_off_type === "1"]);
});
const nRouteIx = new Map(), nSvcUsed = new Set(), clips = new Map(); // shape key -> {id, a:[lat,lon], b:[lat,lon]}
let nTripsKept = 0;
for (const [tid, a0] of nTimes) {
  a0.sort((x, y) => x[0] - y[0]);
  for (const B of BOXES) {
  // the longest run of stops inside the area (a Tallinn-Tartu bus gives a piece in each)
  let bs = -1, bl = 0;
  for (let i = 0; i < a0.length;) { if (!inBox(B, nStops.get(a0[i][1]))) { i++; continue; } let j = i; while (j < a0.length && inBox(B, nStops.get(a0[j][1]))) j++; if (j - i > bl) { bl = j - i; bs = i; } i = j; }
  if (bl < 2) continue;
  const a = a0.slice(bs, bs + bl).filter(x => !(x[4] && x[5]));
  // a ride needs a stop to get on before a stop to get off
  const firstOn = a.findIndex(x => !x[4]), lastOff = a.length - 1 - [...a].reverse().findIndex(x => !x[5]);
  if (firstOn < 0 || lastOff >= a.length || lastOff <= firstOn) continue;
  const t = nTrips.get(tid), R = nRoutes.get(t.route_id);
  if (!nRouteIx.has(R.route_id)) { nRouteIx.set(R.route_id, routes.length); routes.push(R.tartu ? [R.route_short_name, "bus", R.route_long_name, "trt"] : [R.route_short_name, R.route_type === "2" ? "train" : "reg", R.route_long_name]); }
  const s = a.map(x => nStop(x[1])), nb = [], na = [];
  a.forEach((x, i) => { if (x[4]) nb.push(i); if (x[5]) na.push(i); });
  const shKey = "N:" + t.shape_id + "|" + a[0][1] + "|" + a[a.length - 1][1];
  const key = "N" + R.route_id + "|" + t.trip_headsign + "|" + s.join(",") + "|" + nb + "|" + na;
  let p = patIx.get(key);
  if (p == null) {
    p = pats.length; patIx.set(key, p);
    if (!shapeIds.has(shKey)) { shapeIds.set(shKey, shapeIds.size); const A = nStops.get(a[0][1]), B = nStops.get(a[a.length - 1][1]); clips.set(shKey, { id: t.shape_id, a: [A.lat, A.lon], b: [B.lat, B.lon] }); }
    const P = { r: nRouteIx.get(R.route_id), h: t.trip_headsign || R.route_long_name.split(/\s*-\s*/).pop(), s, sh: shapeIds.get(shKey), d: [], dk: new Map(), t: [] };
    if (nb.length) P.nb = nb; if (na.length) P.na = na;
    pats.push(P);
  }
  const P = pats[p], t0 = a[0][3];
  const prof = a.map((x, i) => (i ? x[2] : x[3]) - t0); // arrival where you get off, departure at the first stop
  const pk = prof.join(",");
  let di = P.dk.get(pk);
  if (di == null) { di = P.d.length; P.dk.set(pk, di); P.d.push(prof); }
  const sid = "N:" + t.service_id; nSvcUsed.add(t.service_id);
  P.t.push([getSvcIdx(sid), t0, di, 0]);
  nTripsKept++;
  }
}
await each("calendar.txt", c => {
  if (!nSvcUsed.has(c.service_id)) return;
  const s = getSvc("N:" + c.service_id);
  s[0] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].reduce((a, d, i) => a | (c[d] === "1" ? 1 << i : 0), 0);
  s[1] = +c.start_date; s[2] = +c.end_date;
});
await each("calendar_dates.txt", c => { if (nSvcUsed.has(c.service_id)) getSvc("N:" + c.service_id)[c.exception_type === "1" ? 3 : 4].push(+c.date); });
console.log(`national: lines ${nRouteIx.size}, trips ${nTripsKept}, stops shared with Tallinn ${shared}, new stops ${nIx.size - shared}`);
const nShapeIds = new Set([...clips.values()].map(c => c.id)), nShapePts = new Map();
await each("shapes.txt", p => { if (!nShapeIds.has(p.shape_id)) return; let a = nShapePts.get(p.shape_id); if (!a) nShapePts.set(p.shape_id, a = []); a.push([+p.shape_pt_sequence, +p.shape_pt_lat, +p.shape_pt_lon]); });
for (const a of nShapePts.values()) a.sort((x, y) => x[0] - y[0]);

for (const P of pats) { P.t.sort((x, y) => x[1] - y[1]); delete P.dk; }

// shapes, simplified (about 3 m) and polyline-encoded
const shapePts = new Map();
for (const p of csv("shapes.txt")) {
  if (!shapeIds.has(p.shape_id)) continue;
  let a = shapePts.get(p.shape_id);
  if (!a) shapePts.set(p.shape_id, a = []);
  a.push([+p.shape_pt_sequence, +p.shape_pt_lat, +p.shape_pt_lon]);
}
const KX = 111320 * Math.cos(59.43 * Math.PI / 180), KY = 110574;
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][1] * KX, ay = pts[a][0] * KY, bx = pts[b][1] * KX, by = pts[b][0] * KY;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][1] * KX, py = pts[i][0] * KY;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
      const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function enc(pts) {
  let out = "", pa = 0, po = 0;
  const e = v => { v = v < 0 ? ~(v << 1) : v << 1; let s = ""; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
  for (const [la, lo] of pts) { const a = Math.round(la * 1e5), o = Math.round(lo * 1e5); out += e(a - pa) + e(o - po); pa = a; po = o; }
  return out;
}
const shapes = [];
const near2 = (pts, ll, from) => { let bi = from, bd = Infinity; for (let i = from; i < pts.length; i++) { const d = ((pts[i][0] - ll[0]) * KY) ** 2 + ((pts[i][1] - ll[1]) * KX) ** 2; if (d < bd) { bd = d; bi = i; } } return bi; };
for (const [id, i] of shapeIds) {
  const c = clips.get(id);
  if (c) { // national: the shape between the first and last kept stop (straight lines if the feed has none)
    const all = (nShapePts.get(c.id) || []).map(x => [x[1], x[2]]);
    let a = [c.a, c.b];
    if (all.length > 1) { const i0 = near2(all, c.a, 0), i1 = near2(all, c.b, i0); if (i1 > i0) a = all.slice(i0, i1 + 1); }
    shapes[i] = enc(simplify(a, 3)); continue;
  }
  const a = (shapePts.get(id) || []).sort((x, y) => x[0] - y[0]).map(x => [x[1], x[2]]);
  shapes[i] = enc(simplify(a, 3));
}

const feedDate = (() => { try { return readFileSync(join(ndir, "feed_info.txt"), "utf8").split("\n")[1].match(/Updated: ([^"]+)/)[1]; } catch { return null; } })();
const v = new Date().toISOString().slice(0, 10);
writeFileSync("public/data/tt.json", JSON.stringify({ v, src: feedDate, stops, routes, svc, pats }));
writeFileSync("public/data/shapes.json", JSON.stringify(shapes));
const sz = f => (readFileSync(f).length / 1024).toFixed(0) + " KB";
console.log(`stops ${stops.n.length}, lines ${routes.length}, patterns ${pats.length}, trips ${pats.reduce((a, p) => a + p.t.length, 0)}, profiles ${pats.reduce((a, p) => a + p.d.length, 0)}`);
console.log("tt.json", sz("public/data/tt.json"), "shapes.json", sz("public/data/shapes.json"));
