// Keeps the app opening when the server is briefly unreachable. Data is never cached here.
const C = "garagelog-shell-v2";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.endsWith("/api/state")) return;
  if (r.mode === "navigate" && (u.pathname.endsWith("/") || u.pathname.endsWith("/index.html"))) {
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(C).then(x => x.put("./", c)); return res; }).catch(() => caches.match("./")));
  }
});
