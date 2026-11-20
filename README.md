# buss.veebi.dev

The fastest way across Tallinn by bus, tram and trolley, with live times. Made by [VeebiDev](https://veebi.dev).

**Live:** https://buss.veebi.dev

- Plans trips over the Tallinn timetable (GTFS) with a RAPTOR search in the browser, then corrects them with live
  departures (SIRI) from transport.tallinn.ee and plans again.
- **Jõua kiiremini** (get there sooner): finds trips that need a short jog or run to catch an earlier bus, and gives
  each walk the slowest pace that still makes it (walk, jog or run, speeds are yours to set).
- Leave now, leave at, arrive by, last and first connection.
- Departures near you, live vehicles on the map, favourites on the device, light and dark map.

## How it is built

| Path | What |
| --- | --- |
| `public/router.js` | the planner (also runs in Node) |
| `public/live.js` | live departures and vehicle positions |
| `public/app.js`, `app.css`, `index.html` | the app |
| `tools/build-data.mjs` | turns the GTFS zip into `public/data/tt.json` and `shapes.json` |
| `tools/stamp.mjs` | version stamps on file links before a deploy |
| `worker/index.js` | Cloudflare Worker: static files and a proxy for the vehicle feed |

```bash
node tools/build-data.mjs        # fresh timetable from transport.tallinn.ee
node tools/stamp.mjs
npx wrangler@4 dev               # local
npx wrangler@4 deploy
```

Data: transport.tallinn.ee (timetable and live), Maa-amet In-ADS and Photon (addresses), OpenStreetMap and
OpenFreeMap (map). MIT licence.
