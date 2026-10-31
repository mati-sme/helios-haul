/* Helios Haul — service worker. Network-first for pages/scripts/styles (so updates reach the phone), cache fallback offline.
   Bump CACHE on every release. */
var CACHE = 'helios-haul-v2';
var ASSETS = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'js/data.js',
  'js/save.js',
  'js/audio.js',
  'js/input.js',
  'js/tree.js',
  'js/game.js',
  'js/economy.js',
  'js/render.js',
  'js/main.js',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function fresh(req) {
  return fetch(req).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  var live = req.mode === 'navigate' || /\.(html|js|css)$/.test(url.pathname) || url.pathname.slice(-1) === '/';
  if (live) {
    e.respondWith(fresh(req).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined);
      });
    }));
    return;
  }
  // icons, manifest, everything else: cache-first
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || fresh(req); }));
});
