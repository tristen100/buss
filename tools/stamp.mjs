// Puts ?v=<hash> on app.js, app.css, router.js and live.js links so browsers never mix old and new files.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const P = new URL("../public/", import.meta.url).pathname;
const h = f => createHash("sha1").update(readFileSync(P + f)).digest("hex").slice(0, 8);
let app = readFileSync(P + "app.js", "utf8");
for (const f of ["router.js", "live.js", "walk.js"]) app = app.replace(new RegExp(`'\\./${f.replace(".", "\\.")}(\\?v=\\w+)?'`, "g"), `'./${f}?v=${h(f)}'`);
writeFileSync(P + "app.js", app);
let html = readFileSync(P + "index.html", "utf8");
for (const f of ["app.js", "app.css"]) html = html.replace(new RegExp(`"${f.replace(".", "\\.")}(\\?v=\\w+)?"`, "g"), `"${f}?v=${h(f)}"`);
writeFileSync(P + "index.html", html);
let sw = readFileSync(P + "sw.js", "utf8");
sw = sw.replace(/const C = "buss-[^"]*"/, `const C = "buss-${h("app.js")}${h("data/tt.json")}${h("data/walk/stops.json")}"`);
writeFileSync(P + "sw.js", sw);
console.log("stamped");
