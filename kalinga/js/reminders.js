/* =========================================================
   Kalinga — reminders.js
   The in-page alarm engine (web). It checks every 15 s and when
   the app comes back to the front, and rings on the ELDER's
   phone (elder mode) only:
   - a medicine slot at its due time and each re-ring (+10, +20
     by default), until it is answered or the cutoff passes;
   - again when a snooze ends;
   - never for a medicine already taken in a moved slot
     (timeline item.takenEarlier).
   Measurement reminders (vital logReminders) are gentle: a
   chime, a notification and a highlighted home tile.
   Which rings already fired and the snoozes are per phone
   (localStorage 'kalinga-rings'), never synced.

   A browser can only ring while the page is open or recently
   backgrounded; the Android app (plan 1C) rings with it closed.
   ========================================================= */
(function () {
  'use strict';

  var App = window.KalingaApp, Sch = window.KalingaSchedule, h = App.h, I = window.KalingaI18n, t = I.t;
  var KEY = 'kalinga-rings', MIN = h.MIN, HOUR = h.HOUR, DAY = h.DAY;
  var SNOOZE_LATE = 2 * HOUR; // a snooze still rings up to 2 h after the due time
  var handlers = {}, timer = null;

  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    s = s && typeof s === 'object' ? s : {};
    s.fired = s.fired || {}; s.snooze = s.snooze || {};
    return s;
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function prune(s, now) {
    Object.keys(s.fired).forEach(function (k) { if (s.fired[k] < now - 3 * DAY) delete s.fired[k]; });
    Object.keys(s.snooze).forEach(function (k) { if (s.snooze[k] < now - DAY) delete s.snooze[k]; });
  }

  function S() { return App.store; }
  function device() { return S().get().device; }
  function elder() { var d = device(); return d.mode === 'elder' && d.elderId ? S().find('elders', d.elderId) : null; }

  // Slots of the elder's day that still need an answer now: due (or snoozed) and not already taken earlier.
  function open(now, elderId) {
    var from = h.startOfDay(now);
    return S().timeline(elderId, from, now + MIN, now).filter(function (slot) {
      return !slot.orphan && slot.items.some(function (it) { return (it.status === 'due' || it.status === 'unconfirmed') && !it.takenEarlier; });
    });
  }

  // The ring that should be showing now for a slot (key), or null.
  function ringFor(slot, el, st, now) {
    var snooze = st.snooze[slot.slotKey];
    if (snooze) {
      // The snooze end is a new due time: ring then, and re-ring after it (+10, +20 by default).
      if (now < snooze || now - slot.at >= SNOOZE_LATE) return null;
      var sr = Sch.rings(snooze, el.alerts).filter(function (r) { return r <= now; });
      return slot.slotKey + '@s' + sr[sr.length - 1];
    }
    if (now >= Sch.cutoff(slot.at, el.alerts)) return null;
    var rs = Sch.rings(slot.at, el.alerts).filter(function (r) { return r <= now; });
    return rs.length ? slot.slotKey + '@' + rs[rs.length - 1] : null;
  }

  // Measurements due now: a log reminder passed in the last hour with no reading since.
  function measuresDue(el, now) {
    var day = h.startOfDay(now), out = [];
    S().list('vitalTypes', function (v) { return v.elderId === el.id && (v.logReminders || []).length; }).forEach(function (v) {
      (v.logReminders || []).forEach(function (hm) {
        var p = Sch.parseHM(hm); if (!p) return;
        var at = day + p.h * HOUR + p.m * MIN;
        if (now < at || now >= at + HOUR) return;
        var since = S().list('readings', function (r) { return r.vitalTypeId === v.id && r.at >= at - 30 * MIN; });
        if (!since.length) out.push({ type: v, at: at, key: 'm:' + v.id + '@' + at });
      });
    });
    return out;
  }

  function tick() {
    if (!S()) return;
    // A stale copy of the app (another tab saved since) must not ring for answered doses.
    if (S().isCurrent && !S().isCurrent()) return;
    var el = elder(), now = Date.now(), st = load();
    prune(st, now);
    if (st.test && now >= st.test) { delete st.test; save(st); if (handlers.test) handlers.test(); return; }
    if (!el) { save(st); return; }
    var ring = null, ringKey = null;
    open(now, el.id).forEach(function (slot) {
      var key = ringFor(slot, el, st, now);
      if (key && !st.fired[key] && !ring) { ring = slot; ringKey = key; }
    });
    var measure = measuresDue(el, now).filter(function (m) { return !st.fired[m.key]; });
    measure.forEach(function (m) { st.fired[m.key] = now; });
    // A ring counts as fired only once it has really sounded: the handler
    // returns false when another slot's card is open (it rings after that).
    if (ring && handlers.ring && handlers.ring(ring) !== false) st.fired[ringKey] = now;
    save(st);
    if (measure.length && handlers.measure) handlers.measure(measure);
  }

  function start(hs) {
    handlers = hs || {};
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 15000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
    setTimeout(tick, 600);
  }

  function snooze(slotKey, minutes) { var st = load(); st.snooze[slotKey] = Date.now() + (minutes || 10) * MIN; save(st); }
  function clearSnooze(slotKey) { var st = load(); delete st.snooze[slotKey]; save(st); }
  function setTest(ms) { var st = load(); st.test = Date.now() + (ms || MIN); save(st); }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }

  /* ---------- Sound and notifications ---------- */
  var ctx = null, loop = null, alarms = 0;
  function chime() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      [0, 0.32, 0.64].forEach(function (d, i) {
        var o = ctx.createOscillator(), g = ctx.createGain(), at = ctx.currentTime + d;
        o.type = 'sine'; o.frequency.value = [880, 988, 1175][i];
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.5, at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
        o.connect(g); g.connect(ctx.destination); o.start(at); o.stop(at + 0.3);
      });
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate([400, 200, 400]); } catch (e) {}
  }
  /* The alarm: chime, then speak (speakFn(onDone)), pause, repeat — for up
     to 3 minutes. The card stays on screen after the sound stops. */
  function alarm(speakFn) {
    stopAlarm();
    alarms++;
    var until = Date.now() + 3 * MIN, me = {};
    loop = me;
    (function round() {
      if (loop !== me) return;
      chime();
      setTimeout(function () {
        if (loop !== me) return;
        speakFn(function () { if (loop === me && Date.now() < until) me.t = setTimeout(round, 9000); });
      }, 1200);
    })();
  }
  function stopAlarm() { if (loop && loop.t) clearTimeout(loop.t); loop = null; if (window.KalingaVoice) window.KalingaVoice.stop(); }

  function notifyPermission() { return 'Notification' in window ? Notification.permission : 'unsupported'; }
  function askNotify() { return 'Notification' in window ? Notification.requestPermission() : Promise.resolve('unsupported'); }
  function notify(title, body, tag) {
    if (!document.hidden || notifyPermission() !== 'granted') return;
    var opts = { body: body, tag: tag || 'kalinga', renotify: true, requireInteraction: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [400, 200, 400] };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification(title, opts); }).catch(function () { try { new Notification(title, opts); } catch (e) {} });
    } else { try { new Notification(title, opts); } catch (e) {} }
  }

  window.KalingaReminders = {
    start: start, tick: tick, alarmCount: function () { return alarms; }, open: open, measuresDue: measuresDue, snooze: snooze, clearSnooze: clearSnooze,
    setTest: setTest, reset: reset, chime: chime, alarm: alarm, stopAlarm: stopAlarm,
    notifyPermission: notifyPermission, askNotify: askNotify, notify: notify
  };
})();
