---
# Replaces the old Baby Log service worker at /Digital-Games/baby/sw.js. Installed
# copies pick it up on their next update check; it clears the old app's cached
# files (never the log itself, which is in the browser's storage), unregisters,
# and reloads, so the "moved" page shows.
permalink: /baby/sw.js
---
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('babylog-') === 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.registration.unregister(); }).then(function () {
    return self.clients.matchAll({ type: 'window' });
  }).then(function (list) {
    list.forEach(function (c) { if ('navigate' in c) c.navigate(c.url); });
  }));
});
