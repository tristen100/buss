// Live data from transport.tallinn.ee: expected departures per stop (SIRI) and vehicle positions (gps.txt).
// Works in the browser and in Node (the comparison tests).

const SIRI = "https://transport.tallinn.ee/siri-stop-departures.php?stopid=";
const cache = new Map();   // siri id -> {at, rows}
const MODE = { bus: "bus", nightbus: "bus", tram: "tram", trol: "trol", trolley: "trol" };

/* Departures at one stop: [{mode, route, exp, sched, head}] with seconds since local midnight; `now` is the
   stop's own clock (seconds) from the reply. Cached 20 s. */
export async function siri(id, maxAge = 20000) {
  const c = cache.get(id);
  if (c && Date.now() - c.at < maxAge) return c.then || c;
  const p = (async () => {
    const r = await fetch(SIRI + id, { cache: "no-store" });
    if (!r.ok) throw new Error("siri " + r.status);
    const lines = (await r.text()).trim().split("\n").map(l => l.split(","));
    const now = +lines[0][4];
    const rows = [];
    for (const l of lines.slice(1)) {
      if (l.length < 5 || l[0] === "stop") continue;
      rows.push({ mode: MODE[l[0]] || l[0], route: l[1].replace(/^T(?=\d)/, ""), exp: +l[2], sched: +l[3], head: l[4] });
    }
    return { at: Date.now(), now, rows };
  })();
  cache.set(id, { at: Date.now(), then: p });
  try { const v = await p; cache.set(id, v); return v; }
  catch (e) { cache.delete(id); throw e; }
}

/* Fetch SIRI for many stops (a few at a time) and turn them into trip delays for the router. */
export async function delaysFor(router, stops, ymd, into = new Map()) {
  const ids = [...new Set(stops)].filter(s => router.tt.stops.siri[s]);
  let i = 0;
  const work = async () => {
    while (i < ids.length) {
      const s = ids[i++];
      try {
        const r = await siri(router.tt.stops.siri[s]);
        for (const [k, v] of router.matchSiri(s, r.rows, ymd)) if (!into.has(k)) into.set(k, v);
      } catch (e) { /* one stop failing is fine */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, work));
  return into;
}

/* Vehicle positions through our Worker (gps.txt has no CORS): [{mode, route, ll, brg, id}] */
export async function vehicles(base = "") {
  const r = await fetch(base + "/api/gps", { cache: "no-store" });
  if (!r.ok) throw new Error("gps " + r.status);
  const out = [];
  for (const l of (await r.text()).trim().split("\n")) {
    const f = l.split(",");
    if (f.length < 7) continue;
    const mode = f[0] === "1" ? "trol" : f[0] === "3" ? "tram" : "bus";
    out.push({ mode, route: f[1].replace(/^T/, ""), ll: [+f[2] / 1e6, +f[3] / 1e6], brg: +f[5], id: f[6], head: f[9] || "" });
  }
  return out;
}
