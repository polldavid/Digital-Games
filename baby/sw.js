/* =========================================================
   Baby Log — service worker
   Caches the app so it opens instantly and works offline
   (handy at 3 a.m. with no signal), and brings the app to
   the front when a reminder notification is tapped.
   When any cached file changes, bump V here AND every ?v= in index.html
   (tests/unit.test.js fails if they differ). The page asks for
   styles.css?v=14 etc., so a new page can never be paired with an old
   cached stylesheet or script — not from this cache, nor from the
   browser's HTTP cache (GitHub Pages caches files for 10 minutes).
   ========================================================= */
var V = '28';
var VERSION = 'babylog-v' + V;
var VERSIONED = ['css/styles.css', '../theme.css', '../theme.js',
  'js/guide.js', 'js/store.js', 'js/sync.js', 'js/sound.js', 'js/rx.js', 'js/voice.js', 'js/files.js', 'js/ui.js', 'js/forms.js', 'js/views.js', 'js/help.js', 'js/health.js', 'js/milk.js', 'js/native.js', 'js/share.js', 'js/mic.js', 'js/ping.js', 'js/app.js'];
var FILES = ['./', 'index.html', 'privacy.html', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'
].concat(VERSIONED.map(function (f) { return f + '?v=' + V; }));

self.addEventListener('install', function (e) {
  // cache: 'reload' skips the browser's HTTP cache, so an install never stores a stale copy.
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); })); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('babylog-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// A page cached through a redirect can't answer a navigation as it is (browsers
// refuse redirected responses there), so it's re-wrapped. "/privacy" also finds
// the copy cached as "privacy.html".
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

// Network first for pages (so updates arrive), cache first for everything else.
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) {
      // A redirect (Cloudflare sends privacy.html -> /privacy) is the browser's to follow.
      if (res.type === 'opaqueredirect') return res;
      // Never let a server error page replace the working copy of the app.
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
    if (hit) { net.catch(function () {}); return hit; } // offline: the cached copy is enough
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
