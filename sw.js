/* Network first and always re-checked with the host, so updates show up straight away; the saved copy is only used when offline. */
const CACHE = 'torquetable-v4';
const FILES = ["./", "index.html", "chef.html", "css/styles.css", "js/vendor/supabase.js", "js/config.js", "js/data.js", "js/store.js", "js/app.js", "img/logo.webp", "img/icon-180.png", "img/icon-192.png", "fonts/cinzel-latin-500-normal.woff2", "fonts/cinzel-latin-600-normal.woff2", "fonts/cinzel-latin-700-normal.woff2", "fonts/jost-latin-400-normal.woff2", "fonts/jost-latin-500-normal.woff2", "fonts/jost-latin-600-normal.woff2", "fonts/tangerine-latin-700-normal.woff2"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
