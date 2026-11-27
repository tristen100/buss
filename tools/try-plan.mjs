// Quick look at what the router offers: node tools/try-plan.mjs <ymd> <HH:MM> [fromLon,fromLat] [toLon,toLat]
import { readFileSync } from "node:fs";
import { Router } from "../public/router.js";
const tt = JSON.parse(readFileSync("public/data/tt.json", "utf8")), R = new Router(tt);
R.setWalk(JSON.parse(readFileSync("public/data/walk/stops.json", "utf8")));
const [ymd, hm, f = "24.7425,59.4308", to = "24.7372,59.4400"] = process.argv.slice(2);
const t = +hm.split(":")[0] * 60 + +hm.split(":")[1];
const q = { from: f.split(",").map(Number), to: to.split(",").map(Number), t, ymd: +ymd, walk: 5, fast: 0, maxFast: 750, noReg: true };
const r = R.plan(q);
const T = m => { m = Math.round(m); const d = Math.floor(m / 1440); m -= d * 1440; return `${d ? "+" + d + "d " : ""}${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
console.log("walk only:", r.walk && Math.round(r.walk.arr - r.walk.dep) + " min");
for (const j of r.journeys) if (j) console.log(T(j.dep), "->", T(j.arr), j.legs.map(l => l.m === "ride" ? tt.routes[tt.pats[l.pi]?.r]?.[0] ?? l.route ?? "ride" : l.m).join(" "));
