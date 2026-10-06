/* =========================================================
   Baby Log — native.js
   One place for everything that differs between the web app
   and the App Store / Play Store builds (Capacitor shell).
   On the web every function falls back to what browsers do;
   inside the shell it uses native plugins when they exist:

     @capacitor/local-notifications  reminders that fire with the app closed
     @capacitor/filesystem + share   backups and CSV exports
     @capacitor/preferences          a durable copy of the log

   Nothing here is required: a missing plugin means the web path.
   ========================================================= */
(function () {
  'use strict';

  var App = window.BabyApp, S = window.BabyStore, h = App.h;
  var HOUR = h.HOUR;
  var C = window.Capacitor, plugins = (C && C.Plugins) || {};
  function plugin(name) { return App.platform.native && plugins[name] ? plugins[name] : null; }

  /* ---------- Files ----------
     Resolves 'shared' (native share sheet) or 'downloaded' (browser). */
  function saveFile(name, text, type) {
    var Fs = plugin('Filesystem'), Sh = plugin('Share');
    if (Fs && Sh) {
      return Fs.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' })
        .then(function (r) { return Sh.share({ title: name, url: r.uri, dialogTitle: 'Save or send ' + name }); })
        .then(function () { return 'shared'; });
    }
    return new Promise(function (resolve, reject) {
      try {
        var blob = new Blob([text], { type: type });
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
        resolve('downloaded');
      } catch (e) { reject(e); }
    });
  }

  // Text for a partner or the doctor. Resolves 'shared' | 'copied', rejects when neither works.
  function shareText(text, title) {
    var Sh = plugin('Share');
    if (Sh) return Sh.share({ title: title, text: text, dialogTitle: title }).then(function () { return 'shared'; });
    if (navigator.share) return navigator.share({ title: title, text: text }).then(function () { return 'shared'; });
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return 'copied'; });
    return Promise.reject(new Error('no share'));
  }

  /* ---------- Durable storage ----------
     Browsers may clear localStorage under storage pressure; ask them not to.
     In the shell, also keep a copy in native Preferences and restore from it
     if the WebView's storage ever comes back empty. */
  var PREF_KEY = 'babylog-state';
  function protectStorage() {
    var Pref = plugin('Preferences');
    if (Pref) {
      S.onSaved = function (json) { Pref.set({ key: PREF_KEY, value: json }).catch(function () {}); };
      return;
    }
    try {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persisted().then(function (on) { if (!on) return navigator.storage.persist(); }).catch(function () {});
      }
    } catch (e) {}
  }
  // Resolves true if a saved log was brought back.
  function restoreIfEmpty() {
    var Pref = plugin('Preferences');
    if (!Pref || S.get().babies.length) return Promise.resolve(false);
    return Pref.get({ key: PREF_KEY }).then(function (r) {
      if (!r || !r.value) return false;
      try { localStorage.setItem(S.STORE_KEY, r.value); } catch (e) {}
      S.set(JSON.parse(r.value));
      return S.get().babies.length > 0;
    }).catch(function () { return false; });
  }

  /* ---------- Notifications ---------- */
  function LN() { return plugin('LocalNotifications'); }

  // 'granted' | 'denied' | 'default' | 'unsupported'
  function permission() {
    var ln = LN();
    if (ln) return ln.checkPermissions().then(function (p) { return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'default'; }).catch(function () { return 'unsupported'; });
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    return Promise.resolve(Notification.permission);
  }
  function requestPermission() {
    var ln = LN();
    if (ln) return ln.requestPermissions().then(function (p) { return p.display === 'granted' ? 'granted' : 'denied'; });
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    return Notification.requestPermission();
  }

  // Native reminders are scheduled ahead of time, so they fire with the app
  // closed. Recomputed (debounced) after every change: logging a feed moves
  // the next "feed due", starting the sleep timer holds diaper reminders.
  var syncTimer = null, channelsMade = false;
  function syncReminders() {
    syncTimers();
    if (!LN()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(scheduleNow, 800);
  }

  /* ---------- Running timers on the lock screen (Android app) ----------
     One ongoing notification per running timer, counting up by itself. Its
     buttons open babylog://timer?baby=…&do=<action> — the same actions as the
     buttons on Today. */
  function syncTimers() {
    var TN = plugin('TimerNotification');
    if (!TN) return;
    var st = S.get(), now = Date.now(), many = st.babies.length > 1, list = [];
    st.babies.forEach(function (b) {
      var T = st.timers[b.id] || {}, who = many ? ' · ' + b.name : '';
      var url = function (d, side) { return 'babylog://timer?baby=' + encodeURIComponent(b.id) + '&do=' + d + (side ? '&side=' + side : ''); };
      var add = function (kind, title, text, elapsed, running, actions) { list.push({ key: b.id + ':' + kind, title: title + who, text: text, base: now - elapsed, running: running, actions: actions }); };
      if (T.sleep) add('sleep', '😴 Asleep', 'Since ' + h.fmtTime(T.sleep.start), now - T.sleep.start, true, [{ title: '☀️ Woke up', url: url('sleep-stop') }]);
      if (T.breast) {
        var bt = S.breastTotals(T.breast, now), other = T.breast.side === 'L' ? 'R' : 'L';
        add('breast', T.breast.paused ? '🤱 Feed paused' : '🤱 Feeding · ' + (T.breast.side === 'L' ? 'left' : 'right'), 'Started ' + h.fmtTime(T.breast.start) + (T.breast.paused ? ' · ' + h.clock(bt.total) + ' so far' : ''), bt.total, !T.breast.paused,
          [{ title: '⇄ Switch to ' + (other === 'L' ? 'left' : 'right'), url: url('breast-side', other) }, { title: T.breast.paused ? '▶ Resume' : '⏸ Pause', url: url('breast-pause') }, { title: '✓ Done', url: url('breast-finish') }]);
      }
      if (T.bottle) {
        var bo = T.bottle, tot = S.bottleTotal(bo, now);
        add('bottle', bo.done ? '🍼 Bottle finished — how much?' : bo.paused ? '🍼 Bottle paused' : '🍼 Bottle feeding', 'Started ' + h.fmtTime(bo.start) + (bo.done || bo.paused ? ' · ' + h.clock(tot) : ''), tot, !bo.done && !bo.paused,
          bo.done ? [{ title: 'Enter amount', url: url('bottle-finish') }] : [{ title: bo.paused ? '▶ Resume' : '⏸ Pause', url: url('bottle-pause') }, { title: '✓ Finished', url: url('bottle-finish') }]);
      }
      if (T.pump) {
        var pt = S.pumpTotals(T.pump, now);
        add('pump', T.pump.done ? '🧴 Pumping finished' : pt.running ? '🧴 Pumping' : '🧴 Pumping paused', 'Started ' + h.fmtTime(T.pump.start), pt.total, !T.pump.done, [{ title: '✓ Done', url: url('pump-finish') }]);
      }
      if (T.tummy) add('tummy', '🤸 Tummy time', 'Since ' + h.fmtTime(T.tummy.start), now - T.tummy.start, true, [{ title: '■ Stop', url: url('tummy-stop') }]);
    });
    var sig = JSON.stringify(list.map(function (x) { return [x.key, x.title, x.text, Math.round(x.base / 1000), x.running]; }));
    // The first running timer is a natural moment to ask for notifications (Android 13+).
    if (list.length && !askedPerm && LN()) {
      askedPerm = true;
      LN().checkPermissions().then(function (p) { if (p && /prompt/.test(p.display)) return LN().requestPermissions().then(function () { lastTimers = ''; syncTimers(); }); }).catch(function () {});
    }
    if (sig === lastTimers) return; // nothing changed: don't re-post
    lastTimers = sig;
    TN.sync({ timers: list }).catch(function () {});
  }
  var lastTimers = '', askedPerm = false;

  /* ---------- babylog:// links (shortcuts, timer buttons) ---------- */
  function openUrl(u) {
    var m;
    if (!u) return;
    if ((m = /^babylog:\/\/do\/(\w+)/.exec(u))) { App.runShortcut(m[1]); return; }
    if (/^babylog:\/\/timer/.test(u)) {
      var q = {};
      (u.split('?')[1] || '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[p[0]] = decodeURIComponent(p[1] || ''); });
      if (q.baby && S.baby(q.baby) && q.baby !== S.get().activeBaby) S.get().activeBaby = q.baby;
      if (q['do']) { h.closeSheet(); App.ui.view = 'today'; App.act(q['do'], { side: q.side }); App.commit(); }
    }
  }
  function hashId(str) {
    var x = 0;
    for (var i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) | 0;
    return (x & 0x7fffffff) || 1;
  }
  function quietAt(t) { var hr = new Date(t).getHours(); return hr >= 22 || hr < 7; }
  function scheduleNow() {
    var ln = LN(), st = S.get(), now = Date.now();
    var setup = channelsMade || !ln.createChannel ? Promise.resolve() : Promise.all([
      ln.createChannel({ id: 'reminders', name: 'Reminders', description: 'Feeds, diapers, naps, medicine and visits', importance: 4, vibration: true }),
      ln.createChannel({ id: 'quiet', name: 'Night reminders (no sound)', description: 'Reminders during quiet hours', importance: 2, vibration: true })
    ]).then(function () { channelsMade = true; }).catch(function () {});
    var list = [];
    if (st.settings.notify) {
      var many = st.babies.length > 1;
      st.babies.forEach(function (b) {
        S.reminders(now, b.id).forEach(function (r) {
          if (r.done || r.at <= now || r.at > now + 48 * HOUR) return;
          // Word it as of when it fires ("last fed 3h ago"), not as of now.
          var then = S.reminders(r.at, b.id).filter(function (x) { return x.key === r.key; })[0] || r;
          var quiet = st.settings.quietNight && quietAt(r.at);
          list.push({
            id: hashId(r.key + '@' + r.at),
            title: r.icon + ' ' + r.title + (many ? ' · ' + b.name : ''),
            body: then.text || '',
            schedule: { at: new Date(r.at), allowWhileIdle: true },
            channelId: quiet ? 'quiet' : 'reminders',
            extra: { key: r.key, baby: b.id }
          });
        });
      });
      list.sort(function (a, b) { return a.schedule.at - b.schedule.at; });
      list = list.slice(0, 60); // iOS keeps at most 64 pending
    }
    setup.then(function () { return ln.getPending(); }).then(function (p) {
      var old = (p && p.notifications || []).map(function (n) { return { id: n.id }; });
      return old.length ? ln.cancel({ notifications: old }) : null;
    }).then(function () {
      return list.length ? ln.schedule({ notifications: list }) : null;
    }).catch(function () {});
  }

  function init(onReminderTap) {
    protectStorage();
    var ln = LN();
    if (ln && ln.addListener) ln.addListener('localNotificationActionPerformed', function () { if (onReminderTap) onReminderTap(); });
    // Android back button inside the shell behaves like the browser's Back.
    var AppPlugin = plugin('App');
    if (AppPlugin && AppPlugin.addListener) {
      AppPlugin.addListener('backButton', function (e) { if (e && e.canGoBack) history.back(); else if (AppPlugin.exitApp) AppPlugin.exitApp(); });
      AppPlugin.addListener('appStateChange', function (s) { if (!s.isActive) S.flush(); });
      AppPlugin.addListener('appUrlOpen', function (e) { openUrl(e && e.url); });
      // Started from a shortcut or a notification button while closed.
      if (AppPlugin.getLaunchUrl) AppPlugin.getLaunchUrl().then(function (r) { if (r && r.url) setTimeout(function () { openUrl(r.url); }, 300); }).catch(function () {});
    }
  }

  window.BabyNative = {
    saveFile: saveFile, shareText: shareText,
    permission: permission, requestPermission: requestPermission,
    syncReminders: syncReminders, restoreIfEmpty: restoreIfEmpty,
    nativeReminders: function () { return !!LN(); },
    init: init
  };
})();
