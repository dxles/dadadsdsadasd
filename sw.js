// Çınla servis çalışanı: uygulama kabuğunu çevrimdışı açılabilir yapar.
// Strateji: önce ağ (güncellemeler hemen gelsin), ağ yoksa önbellek.
// Sadece kendi dosyalarımız önbelleğe alınır; YouTube, API ve söz sağlayıcı istekleri hiç karışılmaz.
const CACHE = "cinla-shell-v1";
const SHELL = ["./", "index.html", "player.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // YouTube, API'ler, fontlar: dokunma

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"))
      )
  );
});
