// Nefro Kons service worker — caches only the app files, never form data.
const CACHE = 'nefro-kons-1.6.1';
const CORE = ['./', './index.html', './kartlar.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './fonts/fonts.css', './fonts/atkinson-hyperlegible-mono-latin-400-normal.woff2', './fonts/atkinson-hyperlegible-mono-latin-600-normal.woff2', './fonts/atkinson-hyperlegible-mono-latin-ext-400-normal.woff2', './fonts/atkinson-hyperlegible-mono-latin-ext-600-normal.woff2', './fonts/atkinson-hyperlegible-next-latin-400-normal.woff2', './fonts/atkinson-hyperlegible-next-latin-500-normal.woff2', './fonts/atkinson-hyperlegible-next-latin-700-normal.woff2', './fonts/atkinson-hyperlegible-next-latin-800-normal.woff2', './fonts/atkinson-hyperlegible-next-latin-ext-400-normal.woff2', './fonts/atkinson-hyperlegible-next-latin-ext-500-normal.woff2', './fonts/atkinson-hyperlegible-next-latin-ext-700-normal.woff2', './fonts/atkinson-hyperlegible-next-latin-ext-800-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE))); });
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // App page: network first (fresh version when online), cache fallback offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', cp)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  // Static files (same origin only): cache first
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; })));
  }
});
