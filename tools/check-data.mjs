// Sanity check after a data rebuild: the router must still find trips on a few everyday routes next weekday morning,
// and the walk data must belong to this timetable. Exits 1 (and the weekly rebuild stops) when something is off.
import { readFileSync } from "node:fs";
import { Router } from "../public/router.js";
const tt = JSON.parse(readFileSync("public/data/tt.json", "utf8")), walk = JSON.parse(readFileSync("public/data/walk/stops.json", "utf8"));
const R = new Router(tt);
if (!R.setWalk(walk)) { console.error("walk data is for timetable", walk.tt, "not", tt.v); process.exit(1); }
const d = new Date(Date.now() + 86400000); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
const ymd = d.getFullYear() * 1e4 + (d.getMonth() + 1) * 100 + d.getDate();
const T = [[[24.7536, 59.4372], [24.6920, 59.4050]], [[24.7210, 59.4400], [24.8390, 59.4680]], [[24.7570, 59.4310], [24.8330, 59.4340]], [[24.6520, 59.4300], [24.8000, 59.4220]],
  // Tartu: Raekoja plats to Annelinn, the bus station to Lõunakeskus
  [[26.7225, 58.3805], [26.7650, 58.3720]], [[26.7330, 58.3780], [26.6990, 58.3580]]];
let bad = 0;
for (const [from, to] of T) { const r = R.plan({ from, to, t: 9 * 60, ymd, walk: 5.5, fast: 0, maxFast: 750, noReg: true }); if (!r.journeys.filter(Boolean).length) bad++; }
console.log(`timetable ${tt.v} (feed ${tt.src}), ${tt.stops.n.length} stops, ${tt.pats.length} patterns; ${T.length - bad}/${T.length} test trips found on ${ymd}`);
if (bad || tt.stops.n.length < 1500) process.exit(1);
