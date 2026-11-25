// Network first so updates show up at once; the cache only serves when offline.
const CACHE = 'notinha-v1';
const FILES = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/lib.js', 'js/parse.js', 'js/db.js', 'js/scan.js', 'js/chart.js', 'js/qr.js', 'vendor/qrcode.mjs',
  'vendor/jsQR.js', 'icon.svg', 'manifest.webmanifest',
  'fonts/barlow-latin-400-normal.woff2', 'fonts/barlow-latin-600-normal.woff2',
  'fonts/barlow-condensed-latin-600-normal.woff2', 'fonts/barlow-condensed-latin-700-normal.woff2'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
