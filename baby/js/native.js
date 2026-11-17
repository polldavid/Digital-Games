/* =========================================================
   Alaga — native.js
   One place for everything that differs between the web app
   and the App Store / Play Store builds (Capacitor shell).
   On the web every function falls back to what browsers do;
   inside the shell it uses native plugins when they exist:

     @capacitor/local-notifications  reminders that fire with the app closed
     @capacitor/filesystem + share   backups and CSV exports
     @capacitor/preferences          a durable copy of the log
     Widget (WidgetPlugin.java)      the home-screen widget
     Nudge (NudgePlugin.java)        reminders (Alaga's own scheduler), and
                                     keeping the partner's phone up to date

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
    syncWidget();
    if (window.BabyPush) window.BabyPush.sync(); // the web: reminders with the app closed
    if (!LN() && !plugin('Nudge')) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(scheduleNow, 800);
  }

  /* ---------- Running timers on the lock screen (Android app) ----------
     One ongoing notification per running timer, counting up by itself. Its
     buttons open babylog://timer?baby=…&do=<action> — the same actions as the
     buttons on Today. */
  function timerList(now) {
    var st = S.get(), many = st.babies.length > 1, list = [];
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
    return list;
  }
  function syncTimers() {
    var TN = plugin('TimerNotification');
    if (!TN) return;
    var list = timerList(Date.now());
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

  /* ---------- Home-screen widget (Android app) ----------
     What AlagaWidget.java shows for the baby on screen: a counter since the
     last feed (or since a breastfeed started), and clock times, which stay
     right while the app is closed. */
  function at(t, now) {
    var d = new Date(t), same = d.toDateString() === new Date(now).toDateString();
    return (same ? '' : d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ') + h.fmtTime(t);
  }
  function widgetData(now) {
    var b = S.baby();
    if (!b) return {};
    var sleep = S.timers().sleep, lf = S.lastFeedAnchor(), ld = S.last('diaper');
    var d = { name: b.name, asleep: !!sleep, status: sleep ? '😴 Asleep since ' + h.fmtTime(sleep.start) : '', sinceAt: 0, sinceLabel: '', feed: 'No feeds yet', next: '' };
    if (lf && lf.live) { d.sinceAt = lf.time; d.sinceLabel = 'feeding now'; d.feed = '🤱 Started ' + h.fmtTime(lf.time); }
    else if (lf) {
      d.sinceAt = lf.time; d.sinceLabel = 'since last feed';
      var ds = h.describe(lf.event);
      d.feed = (ds.icon || '🍼') + ' ' + at(lf.time, now) + ' · ' + ds.title + (ds.sub ? ', ' + ds.sub : ''); // the time first, so it never gets cut off
      if (S.ageDays(now) < 365) d.next = 'Next feed ~' + at(lf.time + S.feedIntervalH(now) * HOUR, now);
    }
    if (ld) d.next = (d.next ? d.next + ' · ' : '') + '🧷 ' + at(ld.time, now);
    return d;
  }
  function syncWidget() {
    var W = plugin('Widget');
    if (!W) return;
    var d = widgetData(Date.now()), sig = JSON.stringify(d);
    if (sig === lastWidget) return; // nothing changed: don't redraw
    lastWidget = sig;
    W.update(d).catch(function () {});
  }
  var lastWidget = '';

  /* ---------- babylog:// links (shortcuts, timer buttons, reminders) ---------- */
  var onTap = null;
  function openUrl(u) {
    var m;
    if (!u) return;
    if ((m = /^babylog:\/\/do\/(\w+)/.exec(u))) { App.runShortcut(m[1]); return; }
    if (/^babylog:\/\/remind/.test(u)) { if (onTap) onTap(); return; }
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
  // Every baby's reminders in the next 48 hours, soonest first, worded as of
  // when each fires ("last fed 3h ago"), not as of now. Scheduled here in the
  // Android app, and sent ahead for Web Push on the web (push.js).
  function upcoming(now) {
    var st = S.get(), many = st.babies.length > 1, list = [];
    st.babies.forEach(function (b) {
      S.reminders(now, b.id).forEach(function (r) {
        if (r.done || r.at <= now || r.at > now + 48 * HOUR) return;
        var then = S.reminders(r.at, b.id).filter(function (x) { return x.key === r.key; })[0] || r;
        list.push({ key: r.key, at: r.at, baby: b.id, title: r.icon + ' ' + r.title + (many ? ' · ' + b.name : ''), body: then.text || '', quiet: !!st.settings.quietNight && quietAt(r.at) });
      });
    });
    return list.sort(function (a, b) { return a.at - b.at; });
  }
  /* What the Android app's own scheduler (Reminders.java) is given:
       n  reminders on (0: cancel them all, and take down any showing)
       r  the next ones: { i: notification id, k: key, at, t: title, b: text, q: quiet }
       k  every reminder that still stands, due or not — one showing in the
          shade whose key isn't here (a newer feed came in, baby fell asleep,
          the dose was given) is taken down. */
  function reminderState(now) {
    var st = S.get(), on = !!st.settings.notify, keys = [];
    st.babies.forEach(function (b) { S.reminders(now, b.id).forEach(function (r) { if (!r.done) keys.push(r.key); }); });
    return {
      n: on ? 1 : 0, k: keys,
      r: !on ? [] : upcoming(now).slice(0, 60).map(function (r) { return { i: hashId(r.key + '@' + r.at), k: r.key, at: r.at, t: r.title, b: r.body, q: r.quiet ? 1 : 0 }; })
    };
  }
  var MIGRATED = 'dg-babylog-reminders-native';
  function scheduleNow() {
    var Nu = plugin('Nudge'), ln = LN(), now = Date.now();
    if (Nu) {
      // Reminders used to go through @capacitor/local-notifications: cancel what it still has pending, once.
      var moved = false;
      try { moved = localStorage.getItem(MIGRATED) === '1'; } catch (e) {}
      if (!moved && ln) ln.getPending().then(function (p) {
        var old = (p && p.notifications || []).map(function (n) { return { id: n.id }; });
        return old.length ? ln.cancel({ notifications: old }) : null;
      }).then(function () { try { localStorage.setItem(MIGRATED, '1'); } catch (e) {} }).catch(function () {});
      Nu.reminders(reminderState(now)).catch(function () {});
      return;
    }
    var st = S.get();
    var setup = channelsMade || !ln.createChannel ? Promise.resolve() : Promise.all([
      ln.createChannel({ id: 'reminders', name: 'Reminders', description: 'Feeds, diapers, naps, medicine and visits', importance: 4, vibration: true }),
      ln.createChannel({ id: 'quiet', name: 'Night reminders (no sound)', description: 'Reminders during quiet hours', importance: 2, vibration: true })
    ]).then(function () { channelsMade = true; }).catch(function () {});
    var list = !st.settings.notify ? [] : upcoming(now).slice(0, 60).map(function (r) { // iOS keeps at most 64 pending
      return { id: hashId(r.key + '@' + r.at), title: r.title, body: r.body, schedule: { at: new Date(r.at), allowWhileIdle: true }, channelId: r.quiet ? 'quiet' : 'reminders', extra: { key: r.key, baby: r.baby } };
    });
    setup.then(function () { return ln.getPending(); }).then(function (p) {
      var old = (p && p.notifications || []).map(function (n) { return { id: n.id }; });
      return old.length ? ln.cancel({ notifications: old }) : null;
    }).then(function () {
      return list.length ? ln.schedule({ notifications: list }) : null;
    }).catch(function () {});
  }

  /* ---------- Keeping the partner's phone up to date (Android app) ----------
     Reminders, the widget and timer notifications are worked out on each
     phone from its own copy of the log, so the partner's go stale until Alaga
     opens there. So after this phone sends a change, it works out what every
     other phone in the family should show — with that phone's own reminder
     settings, which each phone shares (sealed) as its "profile" — and sends it
     through the sync server (server/nudge.js). A silent Firebase message wakes
     the Android code on the other phone (NudgeService.java), which fetches
     it, opens it with the family key and applies it, even with Alaga closed.

     Everything is sealed with a key from the family secret (BabySync.nudgeKey);
     the server can't read it. Only phones running the Android app take part. */
  var NUDGE_ID = 'dg-babylog-nudge';
  var PROFILE_SETTINGS = ['notify', 'feedRemind', 'feedIntervalH', 'diaperRemind', 'diaperIntervalH', 'napRemind', 'vitdRemind', 'vitdTime', 'tummyRemind', 'tummyTime', 'quietNight'];
  var nk = null, lastMe = '', lastCfg = '', resend = false, tries = 0, tok = { v: '', at: 0 };

  function client() { return window.BabyShare && window.BabyShare.client; }
  function nudgeOn() {
    var c = client();
    return !!(plugin('Nudge') && window.BabySync && c && c.on() && !c.meta().joining && window.crypto && crypto.subtle);
  }
  function myId() {
    var id = '';
    try { id = localStorage.getItem(NUDGE_ID) || ''; } catch (e) {}
    if (!/^[0-9a-f]{32}$/.test(id)) {
      id = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(16)), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      try { localStorage.setItem(NUDGE_ID, id); } catch (e) {}
    }
    return id;
  }
  function b64u(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(str) { var s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function nudgeKeys() {
    var secret = client().secret();
    if (nk && nk.secret === secret) return Promise.resolve(nk);
    return Promise.all([BabySync.deriveKeys(secret), BabySync.nudgeKey(secret)]).then(function (r) {
      return crypto.subtle.importKey('raw', r[1], 'AES-GCM', false, ['encrypt', 'decrypt']).then(function (key) {
        nk = { secret: secret, auth: r[0].family + '.' + r[0].token, key: key, raw: b64u(r[1]) };
        return nk;
      });
    });
  }
  function seal(obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, nk.key, new TextEncoder().encode(JSON.stringify(obj))).then(function (ct) {
      var out = new Uint8Array(12 + ct.byteLength); out.set(iv, 0); out.set(new Uint8Array(ct), 12);
      return b64u(out);
    });
  }
  function unseal(blob) {
    var a = unb64u(blob);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: a.slice(0, 12) }, nk.key, a.slice(12)).then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
  }
  function nudgeCall(method, path, body, auth) {
    return fetch(BabySync.serverUrl() + path, {
      method: method,
      headers: { Authorization: 'Bearer ' + (auth || nk.auth), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      if (res.status === 409) return res.json().then(function (j) { var e = new Error('stale'); e.stale = true; e.seq = j && j.seq; throw e; });
      if (!res.ok) throw new Error('nudge ' + res.status);
      return res.json();
    });
  }

  // This phone's reminder settings, which baby it shows, and its fired and
  // snoozed reminders: what another phone needs to work out its reminders.
  function profile(now) {
    var st = S.get(), s = {}, f = {}, z = {};
    PROFILE_SETTINGS.forEach(function (k) { s[k] = st.settings[k]; });
    Object.keys(st.fired || {}).forEach(function (k) { if (st.fired[k] > now - 3 * 24 * HOUR) f[k] = st.fired[k]; });
    Object.keys(st.snoozed || {}).forEach(function (k) { if (st.snoozed[k] > now) z[k] = st.snoozed[k]; });
    return { s: s, a: st.activeBaby, f: f, z: z };
  }
  // Runs fn as if this were the phone `p` describes, then puts everything back.
  function asPhone(p, fn) {
    var st = S.get(), keep = { settings: st.settings, active: st.activeBaby, fired: st.fired, snoozed: st.snoozed }, s2 = {}, k;
    for (k in st.settings) s2[k] = st.settings[k];
    PROFILE_SETTINGS.forEach(function (x) { if (p.s && p.s[x] !== undefined) s2[x] = p.s[x]; });
    st.settings = s2;
    if (p.a && S.baby(p.a)) st.activeBaby = p.a;
    st.fired = p.f || {}; st.snoozed = p.z || {};
    try { return fn(); } finally { st.settings = keep.settings; st.activeBaby = keep.active; st.fired = keep.fired; st.snoozed = keep.snoozed; }
  }
  // Everything one phone shows by itself: reminders, the widget, timer notifications.
  function phoneState(now) {
    var rs = reminderState(now);
    rs.w = widgetData(now);
    rs.t = timerList(now);
    return rs;
  }
  function stateFor(p, now) { return asPhone(p, function () { return phoneState(now); }); }

  // Tell the Android side how to fetch and open states (it keeps them in its
  // private storage), and the server this phone's token and profile.
  function hello() {
    var Nu = plugin('Nudge'), me = myId();
    return nudgeKeys().then(function () {
      var cfg = JSON.stringify([BabySync.serverUrl(), nk.auth, me, nk.raw]);
      var told = cfg === lastCfg ? null : Nu.config({ server: BabySync.serverUrl(), auth: nk.auth, device: me, key: nk.raw }).then(function () { lastCfg = cfg; });
      // Sync runs every 10 s while open; Firebase's token rarely changes (NudgeService reports a new one itself).
      var fresh = Date.now() - tok.at < 30 * 60e3 ? Promise.resolve({ token: tok.v }) : Nu.token().then(function (r) { tok = { v: (r && r.token) || '', at: Date.now() }; return r; });
      return Promise.all([fresh.catch(function () { return {}; }), told]);
    }).then(function (r) {
      var token = (r[0] && r[0].token) || '', p = profile(Date.now()), sig = token + '|' + JSON.stringify(p);
      if (sig === lastMe) return;
      return seal(p).then(function (b) { return nudgeCall('PUT', '/v1/nudge/me', { d: me, t: token, p: b }); }).then(function () { lastMe = sig; });
    });
  }
  // After a sync round. `seq`: the family's last write this phone has seen.
  function afterSync(res, seq) {
    var Nu = plugin('Nudge');
    if (!nudgeOn()) return Promise.resolve();
    Nu.seen({ seq: seq }).catch(function () {}); // states older than this phone's own view are ignored
    return hello().then(function () {
      if (!(res && res.sent) && !resend) return;
      resend = false;
      return sendStates(seq);
    }).catch(function (e) {
      // Someone else's change landed first: pull it, then work it out again.
      if (e && e.stale && tries++ < 3) { resend = true; client().soon(500); }
    });
  }
  function sendStates(seq) {
    var me = myId(), now = Date.now();
    return nudgeCall('GET', '/v1/nudge/devices').then(function (res) {
      var others = (res.rows || []).filter(function (r) { return r.d !== me && r.p; });
      if (!others.length) return;
      return Promise.all(others.map(function (o) {
        return unseal(o.p).then(function (p) { return seal(stateFor(p, now)); }).then(function (b) { return { d: o.d, b: b }; }, function () { return null; });
      })).then(function (items) {
        items = items.filter(Boolean);
        if (items.length) return nudgeCall('POST', '/v1/nudge/state', { from: me, based: seq, items: items }).then(function () { tries = 0; });
      });
    });
  }
  // Stopped sharing here: the server forgets this phone, the Android side forgets the key.
  function goodbye() {
    var Nu = plugin('Nudge');
    if (!Nu) return;
    var auth = nk && nk.auth;
    if (auth) nudgeCall('DELETE', '/v1/nudge/me?d=' + myId(), null, auth).catch(function () {});
    Nu.config({ clear: true }).catch(function () {});
    nk = null; lastMe = ''; lastCfg = ''; tok = { v: '', at: 0 };
  }

  function init(onReminderTap) {
    protectStorage();
    onTap = onReminderTap;
    var ln = LN();
    if (ln && ln.addListener) ln.addListener('localNotificationActionPerformed', function () { if (onReminderTap) onReminderTap(); });
    var c = client();
    if (c && plugin('Nudge')) { c.onSynced = afterSync; c.onLeave = goodbye; }
    // Android back button inside the shell behaves like the browser's Back.
    var AppPlugin = plugin('App');
    if (AppPlugin && AppPlugin.addListener) {
      AppPlugin.addListener('backButton', function (e) { if (e && e.canGoBack) history.back(); else if (AppPlugin.exitApp) AppPlugin.exitApp(); });
      // Back in front: redo the widget, the timer notifications and the
      // reminders (the Android side may have changed them meanwhile).
      AppPlugin.addListener('appStateChange', function (s) {
        if (!s.isActive) { S.flush(); return; }
        lastWidget = ''; lastTimers = '';
        syncReminders();
      });
      AppPlugin.addListener('appUrlOpen', function (e) { openUrl(e && e.url); });
      // Started from a shortcut or a notification button while closed.
      if (AppPlugin.getLaunchUrl) AppPlugin.getLaunchUrl().then(function (r) { if (r && r.url) setTimeout(function () { openUrl(r.url); }, 300); }).catch(function () {});
    }
  }

  window.BabyNative = {
    saveFile: saveFile, shareText: shareText,
    permission: permission, requestPermission: requestPermission,
    syncReminders: syncReminders, restoreIfEmpty: restoreIfEmpty, upcoming: upcoming,
    nativeReminders: function () { return !!LN() || !!plugin('Nudge'); },
    stateFor: stateFor, profile: profile, // for tests
    init: init
  };
})();
