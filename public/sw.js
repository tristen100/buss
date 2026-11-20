// Keeps the app shell and timetable for a fast start; live data always comes from the network.
const C = "buss-66d7336d7fb25049";
const SHELL = ["/", "/app.js", "/app.css", "/router.js", "/live.js", "/data/tt.json", "/data/shapes.json", "/manifest.webmanifest", "/icons/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  // network first, cache as fallback (so a new version shows at once when online)
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(C).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
