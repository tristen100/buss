// Builds the app's timetable from Tallinn's public GTFS (transport.tallinn.ee/data/gtfs.zip).
// Run: node tools/build-data.mjs  ->  public/data/tt.json (stops, lines, trips) + public/data/shapes.json (line paths)
// Run again whenever Tallinn publishes a new timetable (the app shows the data date in Seaded).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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
for (const [id, i] of shapeIds) {
  const a = (shapePts.get(id) || []).sort((x, y) => x[0] - y[0]).map(x => [x[1], x[2]]);
  shapes[i] = enc(simplify(a, 3));
}

const feedDate = (() => { try { return csv("feed_info.txt")[0].feed_version; } catch { return null; } })();
const v = new Date().toISOString().slice(0, 10);
writeFileSync("public/data/tt.json", JSON.stringify({ v, src: feedDate, stops, routes, svc, pats }));
writeFileSync("public/data/shapes.json", JSON.stringify(shapes));
const sz = f => (readFileSync(f).length / 1024).toFixed(0) + " KB";
console.log(`stops ${stops.n.length}, lines ${routes.length}, patterns ${pats.length}, trips ${pats.reduce((a, p) => a + p.t.length, 0)}, profiles ${pats.reduce((a, p) => a + p.d.length, 0)}`);
console.log("tt.json", sz("public/data/tt.json"), "shapes.json", sz("public/data/shapes.json"));
