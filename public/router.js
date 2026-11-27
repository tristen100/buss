// Trip planner: RAPTOR over Tallinn's and Tartu's timetables plus county buses and Elron (public/data/tt.json), minutes since local midnight.
// Live delays (from transport.tallinn.ee SIRI) are passed in per trip, so a route is chosen by expected times.
// Plain ES module with no DOM, so the comparison tests run it in Node too.

export const KX = 111320 * Math.cos(59.43 * Math.PI / 180), KY = 110574;
export const DETOUR = 1.25;           // straight line to walking path (Tristen's choice; real street walks are used where known)
export const BOARD = 1;               // minutes spare at a stop (default; q.board when walking, q.boardFast when jogging/running)
export const ACCESS = 2000, XFER = 600;      // straight-line metres: to/from a stop, between stops (wider finds 1+ min faster trips for ~9%)
const ROUNDS = 5;
const SPAN = 30;     // "leave at t" shows the options leaving in the next half hour

export const dist = (a, b) => Math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY);

export class Router {
  constructor(tt) {
    this.tt = tt;
    const S = tt.stops, n = S.n.length;
    this.n = n;
    this.ll = Array.from({ length: n }, (_, i) => [S.lon[i] / 1e5, S.lat[i] / 1e5]);
    this.byStop = Array.from({ length: n }, () => []);
    // nb / na: stops of a pattern where you may not get on / off (long-distance lines in Tallinn)
    tt.pats.forEach(p => { p.nbS = p.nb && new Set(p.nb); p.naS = p.na && new Set(p.na); });
    // county buses (mode reg). q.noReg: no county bus ride from one city stop to another (people in town rarely
    // take them); rides that start or end outside the city stay. Set after the grid below.
    tt.pats.forEach(p => { p.reg = tt.routes[p.r][1] === "reg"; });
    tt.pats.forEach((p, pi) => p.s.forEach((s, i) => { if (i < p.s.length - 1) this.byStop[s].push([pi, i]); }));
    // stops near each other (grid of ~500 m cells)
    const cell = s => [Math.floor(this.ll[s][0] * KX / 500), Math.floor(this.ll[s][1] * KY / 500)];
    this.grid = new Map();
    for (let s = 0; s < n; s++) { const k = cell(s).join(","); (this.grid.get(k) || this.grid.set(k, []).get(k)).push(s); }
    // "in town" = a city stop (a Tallinn or Tartu city line stops there) or a county-only stop within 300 m of one
    const city = new Uint8Array(n); tt.pats.forEach(p => { if (/^(bus|tram|trol)$/.test(tt.routes[p.r][1])) p.s.forEach(s => (city[s] = 1)); });
    this.town = Array.from({ length: n }, (_, s) => city[s] || S.siri[s] ? 1 : this.near(this.ll[s], 300).some(([o]) => city[o]) ? 1 : 0);
    this.foot = Array.from({ length: n }, (_, s) => this.near(this.ll[s], XFER).filter(([o]) => o !== s));
    this.days = new Map();
    this.siriIx = new Map(); S.siri.forEach((id, i) => { if (id) this.siriIx.set(id, i); });
  }

  /* Real stop-to-stop walks from walk.js data (stops.json): replaces the straight-line guess where both stops are on the
     mapped street network. Distances are kept as straight-line-equivalent metres (real / DETOUR), like everywhere else. */
  setWalk(w) {
    if (!w || w.tt !== this.tt.v) return false;        // built for another timetable: stop numbers would not match
    for (let s = 0; s < this.n; s++) {
      const f = w.foot[s]; if (!f) continue;
      const real = new Map(); for (let i = 0; i < f.length; i += 2) real.set(f[i], f[i + 1] / DETOUR);
      this.foot[s] = this.near(this.ll[s], XFER).filter(([o]) => o !== s && (!w.snap[o] || real.has(o))).map(([o, d]) => [o, w.snap[o] ? real.get(o) : d]);
    }
    return true;
  }

  // stops within r metres (straight line): [[stop, metres]]
  near(ll, r) {
    const cx = Math.floor(ll[0] * KX / 500), cy = Math.floor(ll[1] * KY / 500), R = Math.ceil(r / 500), out = [];
    for (let x = cx - R; x <= cx + R; x++) for (let y = cy - R; y <= cy + R; y++) {
      for (const s of this.grid.get(x + "," + y) || []) { const d = dist(ll, this.ll[s]); if (d <= r) out.push([s, d]); }
    }
    return out.sort((a, b) => a[1] - b[1]);
  }

  // which services run on a date (YYYYMMDD number, weekday 0=Mon)
  running(ymd) {
    const y = Math.floor(ymd / 1e4), m = Math.floor(ymd / 100) % 100, d = ymd % 100;
    const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    return this.tt.svc.map(([mask, a, b, add, rem]) => add.includes(ymd) || (!rem.includes(ymd) && a <= ymd && ymd <= b && (mask >> wd & 1)));
  }

  // trips that run around a date: yesterday's after-midnight trips, today's, tomorrow's early ones; sorted per pattern
  day(ymd) {
    if (this.days.has(ymd)) return this.days.get(ymd);
    const shift = k => { const dt = new Date(Date.UTC(Math.floor(ymd / 1e4), Math.floor(ymd / 100) % 100 - 1, ymd % 100 + k)); return dt.getUTCFullYear() * 1e4 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate(); };
    const sets = [[-1440, this.running(shift(-1))], [0, this.running(ymd)], [1440, this.running(shift(1))]];
    const out = this.tt.pats.map((p, pi) => {
      const a = [];
      for (const [off, run] of sets) p.t.forEach((t, ti) => {
        if (!run[t[0]]) return;
        const t0 = t[1] + off, last = t0 + p.d[t[2]][p.s.length - 1];
        if (last < 0 || t0 > 1440 * 1.5) return;
        a.push({ t0, pr: p.d[t[2]], key: pi + ":" + ti + ":" + off, pi, ti, off });
      });
      return a.sort((x, y) => x.t0 - y.t0);
    });
    if (this.days.size > 3) this.days.clear();
    this.days.set(ymd, out);
    return out;
  }

  /* One search. q = {from:[lon,lat], to:[lon,lat], t (minutes), ymd, walk (km/h), fast (km/h or 0), maxFast (m),
     delays: Map(tripKey -> minutes late), rounds, noReg} -> journeys, one per number of rides that is faster than fewer rides */
  search(q) {
    const trips = this.day(q.ymd), pats = this.tt.pats, n = this.n;
    const vw = q.walk / 3.6 * 60, vf = q.fast ? q.fast / 3.6 * 60 : 0;           // metres per minute
    const legT = (m, eg) => { const p = m * DETOUR; return vf && !eg && p <= q.maxFast ? p / vf : p / vw; };
    const delays = q.delays || new Map(), rounds = q.rounds || ROUNDS, bw = q.board ?? BOARD, bw1 = q.boardFirst ?? bw; // bw1: the first boarding only
    const town = this.town, noReg = !!q.noReg;
    const dly = tr => delays.get(tr.key) || 0;
    const best = new Float64Array(n).fill(Infinity);
    const tau = [], par = [];
    const acc = q.acc || this.near(q.from, ACCESS), egr = q.egr || this.near(q.to, ACCESS); // q.acc/q.egr: real walks (walk.js), as straight-line-equivalent m
    const egMap = new Map(egr.map(([s, d]) => [s, d]));
    const direct = dist(q.from, q.to);
    const directM = q.directM ?? direct * DETOUR;
    let tgt = q.noWalk ? Infinity : directM / vw + q.t; // walking the whole way is always an option
    let marked = new Set();
    tau[0] = new Float64Array(n).fill(Infinity); par[0] = new Array(n);
    for (const [s, d] of acc) { const t = q.t + legT(d); tau[0][s] = t; best[s] = t; par[0][s] = { k: "acc", d }; marked.add(s); }
    const results = [];
    for (let k = 1; k <= rounds; k++) {
      const prev = tau[k - 1], cur = new Float64Array(prev), P = new Array(n);
      tau[k] = cur; par[k] = P;
      // patterns that pass a marked stop, from its earliest such stop
      const Q = new Map();
      for (const s of marked) for (const [pi, i] of this.byStop[s]) { const o = Q.get(pi); if (o == null || i < o) Q.set(pi, i); }
      const newly = new Set();
      for (const [pi, i0] of Q) {
        const p = pats[pi], S = p.s, list = trips[pi];
        let tr = null, bi = -1;
        for (let i = i0; i < S.length; i++) {
          const s = S[i];
          if (tr && !p.naS?.has(i) && !(noReg && p.reg && town[S[bi]] && town[s])) {
            const arr = tr.t0 + tr.pr[i] + dly(tr);
            if (arr < Math.min(best[s], tgt)) { cur[s] = arr; best[s] = arr; P[s] = { k: "ride", pi, tr, i0: bi, i1: i }; newly.add(s); }
          }
          const ready = prev[s] + (k === 1 ? bw1 : bw);
          if (ready === Infinity || i === S.length - 1 || p.nbS?.has(i)) continue;
          if (!tr || ready <= tr.t0 + tr.pr[i] + dly(tr)) {
            const c = this.catch(list, i, ready, dly);
            if (c && (!tr || c.t0 + c.pr[i] + dly(c) < tr.t0 + tr.pr[i] + dly(tr))) { tr = c; bi = i; }
          }
        }
      }
      // walk between stops after riding
      const walked = new Set();
      for (const s of newly) for (const [o, d] of this.foot[s]) {
        const t = cur[s] + legT(d);
        if (t < Math.min(best[o], tgt) && t < cur[o]) { cur[o] = t; best[o] = t; P[o] = { k: "walk", from: s, d }; walked.add(o); }
      }
      marked = new Set([...newly, ...walked]);
      // destination
      let bt = Infinity, bs = -1;
      for (const [s, d] of egr) if (P[s] && P[s].k === "ride") { const t = cur[s] + legT(d, 1); if (t < bt) { bt = t; bs = s; } }
      if (bs >= 0 && bt < tgt) { tgt = bt; results.push(this.trace(k, bs, egMap.get(bs), q, tau, par, legT)); }
      if (!marked.size) break;
    }
    return { journeys: results, walk: { m: directM, min: directM / vw } };
  }

  // earliest trip of a pattern leaving stop index i at or after `ready` (delays can reorder trips)
  catch(list, i, ready, dly) {
    let lo = 0, hi = list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].t0 + list[m].pr[i] < ready - 30) lo = m + 1; else hi = m; }
    let best = null, bt = Infinity;
    for (let j = lo; j < list.length; j++) {
      const sched = list[j].t0 + list[j].pr[i];
      if (sched - 30 > bt) break;
      const t = sched + dly(list[j]);
      if (t >= ready && t < bt) { bt = t; best = list[j]; }
    }
    return best;
  }

  trace(k, s, egD, q, tau, par, legT) {
    const legs = [];
    legs.unshift({ m: "walk", eg: 1, fromStop: s, to: q.to, d: egD * DETOUR, a: tau[k][s], b: tau[k][s] + legT(egD, 1) });
    let r = k;
    while (r >= 0) {
      while (r > 0 && !par[r][s]) r--;
      const p = par[r][s];
      if (!p) break;
      if (p.k === "acc") { legs.unshift({ m: "walk", from: q.from, toStop: s, d: p.d * DETOUR, b: tau[0][s] }); break; }
      if (p.k === "walk") { legs.unshift({ m: "walk", fromStop: p.from, toStop: s, d: p.d * DETOUR, a: tau[r][p.from], b: tau[r][s] }); s = p.from; continue; }
      const pat = this.tt.pats[p.pi], tr = p.tr, dl = q.delays?.get(tr.key) || 0;
      legs.unshift({ m: "ride", pi: p.pi, key: tr.key, off: tr.off, delay: dl, i0: p.i0, i1: p.i1, fromStop: pat.s[p.i0], toStop: pat.s[p.i1],
        sched: tr.t0 + tr.pr[p.i0], a: tr.t0 + tr.pr[p.i0] + dl, b: tr.t0 + tr.pr[p.i1] + dl, schedB: tr.t0 + tr.pr[p.i1] });
      s = pat.s[p.i0]; r--;
    }
    // time the walks: the first one ends just before the first ride, so you leave as late as you can
    const first = legs.find(l => l.m === "ride");
    if (!first) return null;
    const lt = l => legT(l.d / DETOUR, l.eg);
    const i0 = legs.indexOf(first);
    let t = first.a - (q.boardFirst ?? q.board ?? BOARD);
    for (let i = i0 - 1; i >= 0; i--) { legs[i].b = t; legs[i].a = t - lt(legs[i]); t = legs[i].a; }
    for (let i = i0 + 1; i < legs.length; i++) if (legs[i].m === "walk") { legs[i].a = legs[i - 1].b; legs[i].b = legs[i].a + lt(legs[i]); }
    return { legs, dep: legs[0].a, arr: legs[legs.length - 1].b, rides: legs.filter(l => l.m === "ride").length };
  }

  /* Several options for "leave at t": search again after each one's departure, then sort by arrival.
     Rides are offered even when walking the whole way is quicker (late at night the wait often makes it so; the walk
     is shown beside them anyway), and the options reach at least SPAN minutes past t. */
  plan(q, want = 5, tries = 7) {
    const seen = new Map(), span = q.span ?? SPAN;
    let t = q.t, walk = null, far = -Infinity;
    for (let i = 0; i < tries + 6 && (i < tries && seen.size < want + 3 || far < q.t + span); i++) {
      const r = this.search({ noWalk: 1, ...q, t });
      walk = walk || r.walk;
      if (!r.journeys.length) break;
      let next = Infinity;
      for (const j of r.journeys) {
        if (!j) continue;
        const sig = j.legs.filter(l => l.m === "ride").map(l => l.key + "@" + l.i0).join("|");
        if (!seen.has(sig)) seen.set(sig, j);
        next = Math.min(next, j.dep);
        far = Math.max(far, j.dep);
      }
      if (next === Infinity) break;
      t = Math.max(t + 1, Math.floor(next) + 1);
    }
    let out = [...seen.values()].sort((a, b) => a.arr - b.arr || b.dep - a.dep);
    // drop options that leave earlier and arrive later than another, and near copies of the same line plan
    out = out.filter((j, i) => !out.some((o, k) => k !== i && o.arr <= j.arr && o.dep >= j.dep && (o.arr < j.arr || o.dep > j.dep || k < i)));
    // everything leaving in the next SPAN minutes (up to 8), and at least `want` options
    const soon = out.filter(j => j.dep <= q.t + span).length;
    return { journeys: out.slice(0, Math.max(want, Math.min(soon, 8))), walk };
  }

  /* Latest departure that still arrives by `t` (binary search over the leave time). */
  arriveBy(q, want = 4) {
    let lo = q.t - 240, hi = q.t, ok = null, walk = null;
    const arr = t => { const r = this.search({ ...q, t }); walk = walk || r.walk; const j = r.journeys.filter(Boolean).sort((a, b) => a.arr - b.arr)[0]; return j ? j.arr : Infinity; };
    // the earliest start that still gets there in time; at night a search from 4 h before may find nothing at all
    // (no service yet), so try later starts too
    let start = null;
    for (const back of [240, 180, 120, 90, 60, 30]) if (arr(q.t - back) <= q.t) { start = q.t - back; break; }
    if (start == null) return { journeys: [], walk };
    lo = start;
    while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (arr(m) <= q.t) { lo = m; ok = m; } else hi = m; }
    const r = this.plan({ ...q, t: Math.max(start, lo - 20) }, 12, 12);
    r.walk = r.walk || walk;
    r.journeys = r.journeys.filter(j => j.arr <= q.t).sort((a, b) => b.dep - a.dep).slice(0, want).sort((a, b) => a.arr - b.arr);
    return r;
  }

  /* Last connection of the evening (leaves before 04:00, night lines included) and first in the morning (from 04:00). */
  lastOne(q) {
    // night lines (91-96 in Tallinn) run until about 03:30, so the evening's last ride can leave as late as 04:00
    let lo = 18 * 60, hi = 28 * 60;
    const ok = t => this.search({ ...q, t, noWalk: 1 }).journeys.some(j => j && j.arr < 29 * 60 && j.legs.some(l => l.m === "ride" && l.a >= t));
    if (!ok(lo)) return { journeys: [], walk: null };
    while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (ok(m)) lo = m; else hi = m; }
    const r = this.search({ ...q, t: lo, noWalk: 1 });
    r.journeys = r.journeys.filter(Boolean).slice(-2);
    return r;
  }
  firstOne(q) { return this.plan({ ...q, t: 4 * 60, noWalk: 1 }, 3); }

  /* Jõua kiiremini: for each walk before a ride, the slowest pace that still catches it: walk, jog or run.
     The first walk starts no earlier than q.t. Returns null when it needs more fast metres than q.maxFast. */
  pace(j, q) {
    const v = k => q[k] / 3.6 * 60;
    let prevEnd = q.t, fastM = 0;
    const legs = j.legs.map(l => ({ ...l }));
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i];
      if (l.m === "ride") { prevEnd = l.b; continue; }
      if (l.eg) { l.a = prevEnd; l.b = l.a + l.d / v("walk"); l.m = "walk"; continue; }
      const next = legs[i + 1], need = next.a - (q.board ?? BOARD), have = need - prevEnd, haveF = next.a - (q.boardFast ?? BOARD) - prevEnd;
      const tw = l.d / v("walk"), tj = l.d / v("jog"), tr = l.d / v("run");
      if (tw <= have) { l.m = "walk"; l.b = need; l.a = i === 0 ? need - tw : prevEnd; l.alt = null; }
      else if (tj <= haveF) { l.m = "jog"; l.a = prevEnd; l.b = prevEnd + tj; l.walkAt = prevEnd + tw; fastM += l.d; }
      else if (tr <= haveF + 0.05) { l.m = "run"; l.a = prevEnd; l.b = prevEnd + tr; l.walkAt = prevEnd + tw; l.jogAt = prevEnd + tj; fastM += l.d; }
      else return null;
      if (i > 0 && legs[i - 1].m !== "ride") return null;
    }
    if (fastM > q.maxFast + 1) return null;
    return { ...j, legs, dep: legs[0].a, arr: legs[legs.length - 1].b, fastM };
  }

  /* Plan with Jõua kiiremini: search at run pace, then give every walk the pace it really needs. */
  fastPlan(q, want = 5) {
    const r = this.plan({ ...q, fast: q.run, board: Math.min(q.board ?? BOARD, q.boardFast ?? BOARD) }, want + 4);
    const out = [];
    for (const j of r.journeys) { const p = this.pace(j, q); if (p) out.push(p); }
    const n = this.plan({ ...q, fast: 0 }, want);
    for (const j of n.journeys) { const p = this.pace(j, q); if (p && !out.some(o => sig(o) === sig(p))) out.push(p); }
    out.sort((a, b) => a.arr - b.arr || b.dep - a.dep);
    // as in plan(): drop an option that leaves earlier and gets there no sooner than another (e.g. the same bus a stop earlier)
    const keep = out.filter((j, i) => !out.some((o, k) => k !== i && o.arr <= j.arr && o.dep >= j.dep && (o.arr < j.arr || o.dep > j.dep || k < i)));
    return { journeys: keep.slice(0, want), walk: r.walk };
  }

  // SIRI departures at one stop -> delays per trip. rows: [{route, mode, exp, sched}] in seconds
  matchSiri(stop, rows, ymd) {
    const trips = this.day(ymd), out = new Map(), pats = this.tt.pats, R = this.tt.routes;
    for (const [pi, i] of this.byStop[stop]) {
      const p = pats[pi], rt = R[p.r];
      for (const row of rows) {
        if (row.route !== rt[0] || (row.mode && row.mode !== rt[1])) continue;
        const sm = row.sched / 60;
        for (const tr of trips[pi]) {
          if (Math.abs(tr.t0 + tr.pr[i] - sm) < 0.6) out.set(tr.key, Math.round((row.exp - row.sched) / 6) / 10);
        }
      }
    }
    return out;
  }
}

const sig = j => j.legs.filter(l => l.m === "ride").map(l => l.key + "@" + l.i0).join("|");

export function decodePoly(s) {
  const out = []; let i = 0, la = 0, lo = 0;
  while (i < s.length) {
    for (const k of [0, 1]) {
      let r = 0, sh = 0, b;
      do { b = s.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
      const v = r & 1 ? ~(r >> 1) : r >> 1;
      if (k) lo += v; else la += v;
    }
    out.push([lo / 1e5, la / 1e5]);
  }
  return out;
}
