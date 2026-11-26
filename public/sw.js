// Keeps the app shell and timetable for a fast start; live data always comes from the network.
const C = "buss-1a050944ff3c73a1e562b284";
const SHELL = ["/", "/app.js", "/app.css", "/router.js", "/live.js", "/walk.js", "/data/tt.json", "/data/walk/index.json", "/data/walk/stops.json", "/data/shapes.json", "/manifest.webmanifest", "/icons/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  // network first, cache as fallback (so a new version shows at once when online)
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(C).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(l => l.length ? l[0].focus() : self.clients.openWindow("/")));
});
// "Mine 5 min pärast" from the server (worker/push.js), also with the app closed and the phone locked
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: e.data ? e.data.text() : "Buss" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Mine varsti", { body: d.body || "", tag: d.tag || "buss-leave", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", renotify: true, vibrate: [200, 100, 200], data: { id: d.id } }));
});
