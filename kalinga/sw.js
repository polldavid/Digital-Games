/* =========================================================
   Kalinga — service worker
   Caches the app so it opens instantly and works offline, and
   brings the app to the front when a reminder notification is
   tapped. When any cached file changes, bump V here AND every
   ?v= in index.html together (tests/e2e.smoke.js checks they
   match), so a new page is never paired with an old script.
   ========================================================= */
var V = '2';
var VERSION = 'kalinga-v' + V;
var VERSIONED = ['css/kalinga.css',
  'js/schedule.js', 'js/stock.js', 'js/scale.js', 'js/vitals.js', 'js/conditions.js', 'js/speechnum.js', 'js/rximport.js', 'js/store.js',
  'js/i18n.js', 'js/files.js', 'js/rxpdf.js', 'js/ui.js', 'js/voice.js', 'js/show.js', 'js/reminders.js', 'js/elder.js', 'js/care.js', 'js/app.js'];
var FILES = ['./', 'index.html', 'privacy.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']
  .concat(VERSIONED.map(function (f) { return f + '?v=' + V; }));

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); })); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('kalinga-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function fromCache(req) {
  var url = typeof req === 'string' ? req : req.url;
  return caches.match(req).then(function (r) {
    if (!r && !/\.[a-z]+$|\/$/.test(new URL(url, location.href).pathname)) return caches.match(url + '.html');
    return r;
  }).then(function (r) {
    if (!r || !r.redirected) return r;
    return r.blob().then(function (body) { return new Response(body, { status: r.status, statusText: r.statusText, headers: r.headers }); });
  });
}

// Pages: network first (updates arrive). Everything else: cache first.
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) {
      if (res.type === 'opaqueredirect') return res;
      if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return res.ok ? res : fromCache(req).then(function (r) { return r || res; });
    }).catch(function () { return fromCache(req).then(function (r) { return r || fromCache('index.html'); }); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    });
    if (hit) { net.catch(function () {}); return hit; }
    return net;
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(self.registration.scope) === 0 && 'focus' in list[i]) { list[i].postMessage({ type: 'focus' }); return list[i].focus(); }
    }
    return self.clients.openWindow('./');
  }));
});
