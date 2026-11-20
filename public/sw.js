// Keeps the app opening when the server is briefly unreachable. Data is never cached here.
const C = "garagelog-shell-v3";
const CODE = /\/(app\.js|lib\.js|app\.css)$/;
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.endsWith("/api/state")) return;
  // The app's own script and style files are kept too, so the page still opens offline. They are fetched fresh when the network is there.
  if (CODE.test(u.pathname)) {
    e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(C).then(x => x.put(r, c)); } return res; }).catch(() => caches.match(r, { ignoreSearch: true })));
    return;
  }
  if (r.mode === "navigate" && (u.pathname.endsWith("/") || u.pathname.endsWith("/index.html"))) {
    e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(C).then(x => x.put("./", c)); } return res; }).catch(() => caches.match("./")));
  }
});
