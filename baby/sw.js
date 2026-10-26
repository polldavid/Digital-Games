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
var V = '35';
var VERSION = 'babylog-v' + V;
var VERSIONED = ['css/styles.css', '../theme.css', '../theme.js',
  'js/guide.js', 'js/store.js', 'js/sync.js', 'js/sound.js', 'js/rx.js', 'js/voice.js', 'js/files.js', 'js/viewer.js', 'js/ui.js', 'js/forms.js', 'js/views.js', 'js/help.js', 'js/health.js', 'js/milk.js', 'js/native.js', 'js/push.js', 'js/share.js', 'js/mic.js', 'js/ping.js', 'js/app.js'];
var FILES = ['./', 'index.html', 'privacy.html', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'img/mascot/wave.webp', 'img/mascot/peek.webp', 'img/mascot/sleep.webp', 'img/mascot/cheer.webp', 'img/mascot/star.webp', 'img/mascot/face.webp',
  'img/mascot/girl/wave.webp', 'img/mascot/girl/peek.webp', 'img/mascot/girl/sleep.webp', 'img/mascot/girl/cheer.webp', 'img/mascot/girl/star.webp', 'img/mascot/girl/face.webp'
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

// Reminders with the app closed (js/push.js, server/push.js): the push carries
// the reminder's wording encrypted with this phone's own key (IndexedDB).
function wordingKey() {
  return new Promise(function (resolve) {
    var rq = indexedDB.open('babylog-push', 1);
    rq.onupgradeneeded = function () { rq.result.createObjectStore('k'); };
    rq.onerror = function () { resolve(null); };
    rq.onsuccess = function () {
      var g = rq.result.transaction('k').objectStore('k').get('aes');
      g.onsuccess = function () { rq.result.close(); resolve(g.result || null); };
      g.onerror = function () { rq.result.close(); resolve(null); };
    };
  });
}
function unseal(key, b) {
  var a = Uint8Array.from(atob(b.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b.length + 3) % 4)), function (c) { return c.charCodeAt(0); });
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: a.slice(0, 12) }, key, a.slice(12)).then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
}
self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (x) {}
  var icon = 'icons/icon-192.png';
  e.waitUntil(wordingKey().then(function (k) { return k && data.b ? unseal(k, data.b) : null; }).catch(function () { return null; }).then(function (m) {
    // Every push must show something; if this phone can't read it, say so plainly.
    if (!m) return self.registration.showNotification('🔔 Alaga', { body: 'You have a reminder. Open Alaga to see it.', tag: 'alaga-reminder', icon: icon, badge: icon });
    // Already showing (the open app raised it): update it quietly instead of buzzing twice.
    return self.registration.getNotifications({ tag: m.g }).then(function (old) {
      var quiet = !!m.q || old.length > 0, opts = { body: m.b, tag: m.g, icon: icon, badge: icon, renotify: !old.length, silent: quiet, data: { url: self.registration.scope } };
      if (!quiet) opts.vibrate = [200, 100, 200]; // a silent notification can't vibrate
      return self.registration.showNotification(m.t, opts);
    });
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
