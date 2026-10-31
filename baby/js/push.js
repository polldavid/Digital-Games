/* =========================================================
   Alaga — push.js
   Reminders with the app closed, on the web and iPhone (Web
   Push). The Android app schedules them itself (native.js).

   After every change, the next 48 hours of reminders go to the
   sync server: when each is due, and its wording encrypted with
   a key that never leaves this phone (kept in IndexedDB, where
   the service worker can use it too). The server sends each
   one as a push at its time; sw.js decrypts it and shows the
   notification. So the server learns the times, nothing else.
   See server/push.js.

   Device id + token (dg-babylog-push) are random, per phone,
   and unrelated to partner sharing.
   ========================================================= */
(function () {
  'use strict';

  var App = window.BabyApp, S = window.BabyStore, N = window.BabyNative, Sync = window.BabySync;
  var LS = 'dg-babylog-push', enc = new TextEncoder();

  function supported() {
    return !App.platform.native && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && 'indexedDB' in window && !!(window.crypto && crypto.subtle);
  }
  function wanted() {
    var s = S.get().settings;
    return !!s.notify && s.closedRemind !== false && Notification.permission === 'granted';
  }

  function b64u(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), function (c) { return c.charCodeAt(0); }); }
  function rand(n) { return b64u(crypto.getRandomValues(new Uint8Array(n))); }

  /* ---------- The wording key (IndexedDB, shared with sw.js) ---------- */
  function keyStore(mode, fn) {
    return new Promise(function (resolve, reject) {
      var rq = indexedDB.open('babylog-push', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('k'); };
      rq.onerror = function () { reject(rq.error); };
      rq.onsuccess = function () {
        var tx = rq.result.transaction('k', mode), r = fn(tx.objectStore('k'));
        tx.oncomplete = function () { rq.result.close(); resolve(r && r.result); };
        tx.onerror = function () { rq.result.close(); reject(tx.error); };
      };
    });
  }
  function wordingKey() {
    return keyStore('readonly', function (st) { return st.get('aes'); }).then(function (k) {
      if (k) return k;
      // Not extractable: even the page can't read it back out.
      return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']).then(function (nk) {
        return keyStore('readwrite', function (st) { st.put(nk, 'aes'); }).then(function () { return nk; });
      });
    });
  }
  function seal(key, obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(JSON.stringify(obj))).then(function (ct) {
      var out = new Uint8Array(12 + ct.byteLength); out.set(iv); out.set(new Uint8Array(ct), 12);
      return b64u(out);
    });
  }

  /* ---------- This phone on the server ---------- */
  function device() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) {}
    if (!d || !d.id) {
      var hex = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(16)), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      d = { id: hex, token: rand(32), on: false };
      save(d);
    }
    return d;
  }
  function save(d) { try { localStorage.setItem(LS, JSON.stringify(d)); } catch (e) {} }
  function call(method, path, body) {
    var d = device();
    return fetch(Sync.serverUrl() + path, {
      method: method,
      headers: { Authorization: 'Bearer ' + d.id + '.' + d.token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { if (!r.ok) throw new Error('push ' + r.status); return r.json(); });
  }
  function subscription(reg) {
    return reg.pushManager.getSubscription().then(function (sub) {
      if (sub) return sub;
      return fetch(Sync.serverUrl() + '/v1/remind/key').then(function (r) { return r.json(); }).then(function (j) {
        return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(j.key) });
      });
    });
  }

  /* ---------- Send the list (debounced; only when it changed) ---------- */
  var timer = null, last = '', status = { ok: 0, error: '' };
  function sync() {
    if (!supported()) return;
    clearTimeout(timer);
    timer = setTimeout(run, 1500);
  }
  function run() {
    if (!wanted()) return off();
    var now = Date.now(), items = N.upcoming(now).slice(0, 60);
    var sig = JSON.stringify(items.map(function (r) { return [r.key, r.at, r.title, r.body, r.quiet]; }));
    if (sig === last) return Promise.resolve();
    return navigator.serviceWorker.ready.then(function (reg) {
      return Promise.all([subscription(reg), wordingKey()]);
    }).then(function (x) {
      var sub = x[0], key = x[1];
      return Promise.all(items.map(function (r) {
        return seal(key, { t: r.title, b: r.body, g: r.key, q: r.quiet ? 1 : 0 }).then(function (b) { return { at: r.at, b: b }; });
      })).then(function (list) { return call('PUT', '/v1/remind', { sub: sub.toJSON(), items: list }); });
    }).then(function () {
      last = sig; status = { ok: Date.now(), error: '' };
      var d = device(); if (!d.on) { d.on = true; save(d); }
    }).catch(function (e) { status.error = String(e && e.message || e); });
  }
  // Notifications turned off: the server forgets this phone.
  function off() {
    last = '';
    var d = device();
    if (!d.on) return Promise.resolve();
    return call('DELETE', '/v1/remind').then(function () {
      d.on = false; save(d);
      return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) { return sub && sub.unsubscribe(); });
    }).catch(function () {});
  }

  // The list only covers 48 hours: refresh it while the app is open.
  if (supported()) setInterval(sync, 30 * 60e3);

  window.BabyPush = { supported: supported, sync: sync, run: run, status: function () { return status; } };
})();
