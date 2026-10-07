/* =========================================================
   Alaga — ping.js
   The anonymous usage count: at most once a day, a phone says
   "Alaga was used here today", plus whether that's its first time
   this week, this month, or ever. The server only adds these up,
   which gives daily / weekly / monthly active users and new installs
   without any ID: each phone remembers what it has already counted.

   Sent: { v: app version, p: platform, d: 1, w, m, n: 0|1, s: sharing on }
   Never sent: an ID, anything from the log, the baby's name.
   On by default; Settings → Your data → Anonymous usage count turns it off.
   ========================================================= */
(function (root) {
  'use strict';

  var KEY = 'dg-alaga-ping';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  // ISO week ("2026-W41"): weeks start on Monday.
  function weekKey(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var wd = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - wd);
    var y = t.getUTCFullYear(), first = new Date(Date.UTC(y, 0, 1));
    return y + '-W' + pad(Math.ceil(((t - first) / 864e5 + 1) / 7));
  }

  // What this phone should report now, given what it reported before.
  // Returns null when it already counted itself today.
  function due(last, now) {
    var d = new Date(now), day = dayKey(d), week = weekKey(d), month = monthKey(d);
    last = last || {};
    if (last.day === day) return null;
    return {
      flags: { d: 1, w: last.week === week ? 0 : 1, m: last.month === month ? 0 : 1, n: last.day ? 0 : 1 },
      next: { day: day, week: week, month: month }
    };
  }

  var api = { due: due, weekKey: weekKey, dayKey: dayKey, KEY: KEY };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  /* ---------- In the app ---------- */
  var S = root.BabyStore, App = root.BabyApp, Sync = root.BabySync;
  var busy = false;

  function version() { var m = /[?&]v=(\d+)/.exec((document.querySelector('script[src*="js/app.js"]') || {}).src || ''); return m ? +m[1] : 0; }
  function platform() {
    var C = root.Capacitor;
    if (App.platform.native) return C && C.getPlatform ? C.getPlatform() + '-app' : 'app';
    if (App.platform.ios) return App.platform.standalone ? 'ios-home' : 'ios-web';
    return App.platform.standalone ? 'web-app' : 'web';
  }
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }

  function maybeSend() {
    if (busy || !S.get().settings.usageCount || navigator.onLine === false || !Sync) return;
    var plan = due(read(), Date.now());
    if (!plan) return;
    busy = true;
    var body = { v: version(), p: platform(), d: 1, w: plan.flags.w, m: plan.flags.m, n: plan.flags.n, s: Sync.Client && root.BabyShare && root.BabyShare.client.on() ? 1 : 0 };
    fetch(Sync.serverUrl() + '/v1/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true })
      .then(function (r) { if (r.ok) write(plan.next); })
      .catch(function () {})
      .then(function () { busy = false; });
  }

  api.init = function () {
    setTimeout(maybeSend, 5000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(maybeSend, 2000); });
    root.addEventListener('online', function () { setTimeout(maybeSend, 2000); });
  };
  root.BabyPing = api;
})(this);
