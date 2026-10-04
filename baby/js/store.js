/* =========================================================
   Baby Log — store.js
   State, persistence, queries and the reminder engine.
   No DOM. Everything is kept in localStorage on this device;
   export/import moves it between phones (e.g. to a partner).

   Units are stored canonically — ml, °C, kg, cm, ms epoch —
   and only converted for display.
   ========================================================= */
(function (root) {
  'use strict';

  var G = root.BabyGuide || (typeof require !== 'undefined' ? require('./guide.js') : null);
  var STORE_KEY = 'dg-babylog-v1';
  var MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function defaults() {
    return {
      v: 1,
      babies: [],
      activeBaby: null,
      events: [],
      timers: {},      // babyId -> { sleep:{start}, breast:{side,start,accL,accR}, tummy:{start}, pump:{start} }
      custom: [],      // custom reminders
      health: {},      // babyId -> { profile, appointments, rx, vaccines, docs }
      fired: {},       // reminder key -> time fired (so each fires once)
      snoozed: {},     // reminder key -> snooze-until time
      settings: {
        volume: 'ml', temp: 'C', length: 'cm',
        notify: false, chime: true,
        feedRemind: true, feedIntervalH: 0,      // 0 = automatic from age
        diaperRemind: false, diaperIntervalH: 3,
        napRemind: true,
        vitdRemind: false, vitdTime: '09:00',
        tummyRemind: false, tummyTime: '16:00',
        quietNight: true,                        // 10pm–7am: vibrate only, no chime
        quickLog: [],                            // Today buttons chosen by the parent ([] = age-based default)
        installTipDismissed: false
      }
    };
  }

  /* ---------- Persistence ---------- */
  var state = defaults();

  function load(storage) {
    storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    try {
      var raw = storage && storage.getItem(STORE_KEY);
      if (raw) state = normalize(JSON.parse(raw));
    } catch (e) { state = defaults(); }
    return state;
  }

  function save(storage) {
    storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    try { if (storage) storage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* private mode / full */ }
  }

  // Fill in anything missing (older saves, imports).
  function normalize(s) {
    var d = defaults();
    if (!s || typeof s !== 'object') return d;
    var out = {};
    for (var k in d) out[k] = s[k] != null ? s[k] : d[k];
    out.settings = {};
    for (var k2 in d.settings) out.settings[k2] = s.settings && s.settings[k2] != null ? s.settings[k2] : d.settings[k2];
    if (!Array.isArray(out.events)) out.events = [];
    if (!Array.isArray(out.babies)) out.babies = [];
    if (!Array.isArray(out.custom)) out.custom = [];
    if (!out.health || typeof out.health !== 'object') out.health = {};
    if (!out.activeBaby && out.babies[0]) out.activeBaby = out.babies[0].id;
    return out;
  }

  function get() { return state; }
  function set(s) { state = normalize(s); return state; }
  function reset() { state = defaults(); return state; }

  /* ---------- Babies ---------- */
  function baby(id) {
    id = id || state.activeBaby;
    for (var i = 0; i < state.babies.length; i++) if (state.babies[i].id === id) return state.babies[i];
    return null;
  }

  function addBaby(b) {
    var nb = { id: uid(), name: b.name || 'Baby', birth: b.birth, feeding: b.feeding || 'breast', emoji: b.emoji || '👶' };
    state.babies.push(nb);
    state.activeBaby = nb.id;
    return nb;
  }

  function updateBaby(id, patch) {
    var b = baby(id);
    if (b) for (var k in patch) b[k] = patch[k];
    return b;
  }

  function removeBaby(id) {
    state.babies = state.babies.filter(function (b) { return b.id !== id; });
    state.events = state.events.filter(function (e) { return e.baby !== id; });
    state.custom = state.custom.filter(function (r) { return r.baby !== id; });
    delete state.timers[id];
    delete state.health[id];
    if (state.activeBaby === id) state.activeBaby = state.babies[0] ? state.babies[0].id : null;
  }

  function ageDays(now, id) {
    var b = baby(id);
    return b ? G.ageInDays(b.birth, now) : 0;
  }

  /* ---------- Events ---------- */
  function addEvent(ev) {
    var e = { id: ev.id || uid(), baby: ev.baby || state.activeBaby, type: ev.type, time: ev.time || Date.now(), end: ev.end || null, data: ev.data || {} };
    state.events.push(e);
    sortEvents();
    return e;
  }

  function updateEvent(id, patch) {
    var e = findEvent(id);
    if (!e) return null;
    for (var k in patch) e[k] = patch[k];
    sortEvents();
    return e;
  }

  function removeEvent(id) { state.events = state.events.filter(function (e) { return e.id !== id; }); }
  function findEvent(id) { for (var i = 0; i < state.events.length; i++) if (state.events[i].id === id) return state.events[i]; return null; }
  function sortEvents() { state.events.sort(function (a, b) { return a.time - b.time; }); }

  // Events for the active baby, optionally filtered by type and time range [from, to).
  function events(opts) {
    opts = opts || {};
    var id = opts.baby || state.activeBaby;
    return state.events.filter(function (e) {
      if (e.baby !== id) return false;
      if (opts.type && (Array.isArray(opts.type) ? opts.type : [opts.type]).indexOf(e.type) < 0) return false;
      var t = e.end || e.time;
      if (opts.from != null && t < opts.from) return false;
      if (opts.to != null && e.time >= opts.to) return false;
      return true;
    });
  }

  function last(type, pred, id) {
    var list = state.events;
    id = id || state.activeBaby;
    for (var i = list.length - 1; i >= 0; i--) {
      var e = list[i];
      if (e.baby === id && e.type === type && (!pred || pred(e))) return e;
    }
    return null;
  }

  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

  // Milliseconds of an interval event that fall inside [from, to).
  function overlap(e, from, to, now) {
    var s = e.time, en = e.end || now || Date.now();
    return Math.max(0, Math.min(en, to) - Math.max(s, from));
  }

  /* ---------- Health records ---------- */
  function health(id) {
    id = id || state.activeBaby;
    var hl = state.health[id];
    if (!hl) hl = state.health[id] = {};
    hl.profile = hl.profile || {};
    hl.appointments = hl.appointments || [];
    hl.rx = hl.rx || [];
    hl.vaccines = hl.vaccines || { schedule: '', given: {}, custom: [] };
    hl.vaccines.given = hl.vaccines.given || {};
    hl.vaccines.custom = hl.vaccines.custom || [];
    hl.docs = hl.docs || [];
    return hl;
  }
  function findIn(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

  // A prescription course: when it ends, how many doses so far, when the next one is.
  function rxStatus(rx, now, id) {
    now = now || Date.now();
    var end = rx.durationDays ? rx.start + rx.durationDays * DAY : null;
    var doses = events({ baby: id, type: 'med' }).filter(function (e) { return e.data.rxId === rx.id; });
    var lastDose = doses[doses.length - 1] || null;
    var expected = rx.durationDays && rx.timesPerDay ? rx.durationDays * rx.timesPerDay : null;
    var active = !rx.stopped && (!end || now < end);
    var nextAt = rx.prn || !rx.intervalH ? null : lastDose ? lastDose.time + rx.intervalH * HOUR : rx.start;
    if (nextAt && end && nextAt >= end) nextAt = null;
    return { end: end, doses: doses.length, expected: expected, lastDose: lastDose, active: active, nextAt: active ? nextAt : null };
  }

  /* ---------- Timers (survive refresh / lock screen: just timestamps) ---------- */
  function timers(id) {
    id = id || state.activeBaby;
    if (!state.timers[id]) state.timers[id] = {};
    return state.timers[id];
  }

  function startTimer(kind, extra, now) {
    var t = timers();
    t[kind] = Object.assign({ start: now || Date.now() }, extra || {});
    return t[kind];
  }

  function stopTimer(kind) {
    var t = timers();
    var v = t[kind];
    delete t[kind];
    return v;
  }

  // Breastfeeding timer: switch sides, banking time on the old side.
  function breastSwitch(side, now) {
    now = now || Date.now();
    var t = timers();
    var b = t.breast;
    if (!b) { t.breast = { side: side, firstSide: side, start: now, segStart: now, accL: 0, accR: 0, paused: false }; return t.breast; }
    bankBreast(b, now);
    b.side = side; b.paused = false; b.segStart = now;
    return b;
  }

  function breastPause(now) {
    var b = timers().breast;
    if (!b) return null;
    now = now || Date.now();
    if (b.paused) { b.paused = false; b.segStart = now; }
    else { bankBreast(b, now); b.paused = true; }
    return b;
  }

  function bankBreast(b, now) {
    if (b.paused || !b.segStart) return;
    var d = now - b.segStart;
    if (b.side === 'L') b.accL += d; else b.accR += d;
    b.segStart = now;
  }

  function breastTotals(b, now) {
    var L = b.accL, R = b.accR;
    if (!b.paused && b.segStart) { var d = (now || Date.now()) - b.segStart; if (b.side === 'L') L += d; else R += d; }
    return { L: L, R: R, total: L + R };
  }

  /* ---------- Pump timer ----------
     Left and right run independently, so a double pump can time both
     at once and a single pump can do one side, then the other.
     Finishing pauses everything but keeps the session until the
     amounts are saved, so closing the sheet never loses it. */
  function newPump(now) { return { start: now, L: { on: false, acc: 0, seg: 0 }, R: { on: false, acc: 0, seg: 0 } }; }
  function bankSide(sd, now) { if (sd.on) { sd.acc += now - sd.seg; sd.on = false; } }

  function pumpSide(side, now) {
    now = now || Date.now();
    var t = timers();
    if (!t.pump) t.pump = newPump(now);
    var p = t.pump, sd = p[side];
    if (p.done) { p.done = false; delete p.end; } // tapping a side again resumes
    if (sd.on) bankSide(sd, now); else { sd.on = true; sd.seg = now; }
    return p;
  }

  // Start both sides; if both are already running, pause both.
  function pumpBoth(now) {
    now = now || Date.now();
    var t = timers();
    if (!t.pump) t.pump = newPump(now);
    var p = t.pump;
    if (p.done) { p.done = false; delete p.end; }
    if (p.L.on && p.R.on) { bankSide(p.L, now); bankSide(p.R, now); }
    else ['L', 'R'].forEach(function (k) { if (!p[k].on) { p[k].on = true; p[k].seg = now; } });
    return p;
  }

  function pumpFinish(now) {
    now = now || Date.now();
    var p = timers().pump;
    if (!p || p.done) return p || null;
    bankSide(p.L, now); bankSide(p.R, now);
    p.done = true; p.end = now;
    return p;
  }

  function pumpTotals(p, now) {
    now = p.done ? p.end : (now || Date.now());
    var side = function (sd) { return sd.acc + (sd.on ? now - sd.seg : 0); };
    return { L: side(p.L), R: side(p.R), total: now - p.start, running: p.L.on || p.R.on };
  }

  /* ---------- Derived status ---------- */
  function isAsleep(id) { return !!timers(id).sleep; }

  // When did baby last wake? (end of the last finished sleep)
  function awakeSince(now, id) {
    if (isAsleep(id)) return null;
    var s = last('sleep', function (e) { return e.end; }, id);
    return s ? s.end : null;
  }

  function lastFeedAnchor(id) {
    // Breast timer counts as "feeding now".
    var b = timers(id).breast;
    if (b) return { time: b.start, end: null, live: true };
    var f = last('feed', function (e) { return e.data.kind !== 'solids'; }, id);
    return f ? { time: f.time, end: f.end, id: f.id, event: f } : null;
  }

  function feedIntervalH(now, id) {
    var b = baby(id);
    if (state.settings.feedIntervalH > 0) return state.settings.feedIntervalH;
    return G.feedingFor(ageDays(now, id), b ? b.feeding : 'breast').intervalH;
  }

  // Totals for a calendar day — powers the "is baby getting enough?" checks.
  function daySummary(dayStart, now, id) {
    now = now || Date.now();
    var to = dayStart + DAY;
    var list = events({ baby: id, from: dayStart, to: to });
    var s = { feeds: 0, breastMs: 0, bottleMl: 0, pumpMl: 0, solids: 0, wet: 0, dirty: 0, sleepMs: 0, tummyMs: 0, meds: 0, lastTemp: null };
    list.forEach(function (e) {
      var d = e.data || {};
      if (e.time >= dayStart && e.time < to) {
        if (e.type === 'feed') {
          if (d.kind === 'solids') s.solids++; else s.feeds++;
          if (d.kind === 'breast') s.breastMs += (d.left || 0) + (d.right || 0);
          if (d.kind === 'bottle') s.bottleMl += d.amountMl || 0;
        }
        if (e.type === 'diaper') { if (d.wet) s.wet++; if (d.dirty) s.dirty++; }
        if (e.type === 'pump') s.pumpMl += d.amountMl || 0;
        if (e.type === 'med') s.meds++;
        if (e.type === 'temp') s.lastTemp = d.tempC;
      }
      if (e.type === 'sleep') s.sleepMs += overlap(e, dayStart, to, now);
      if (e.type === 'tummy') s.tummyMs += overlap(e, dayStart, to, now);
    });
    // Running timers count too.
    var t = timers(id);
    if (t.sleep) s.sleepMs += Math.max(0, Math.min(now, to) - Math.max(t.sleep.start, dayStart));
    if (t.tummy) s.tummyMs += Math.max(0, Math.min(now, to) - Math.max(t.tummy.start, dayStart));
    return s;
  }

  // Rolling 24h — fairer than "today" at 7am.
  function last24(now, id) {
    now = now || Date.now();
    var from = now - DAY;
    var s = daySummary(from, now, id);
    return s;
  }

  /* ---------- Medicine spacing ---------- */
  function medKeyOf(d) {
    if (d.rxId) return 'rx:' + d.rxId;
    return d.medId === 'custom' ? 'custom:' + (d.name || '').toLowerCase() : d.medId;
  }
  function medStatus(medKey, now, id) {
    now = now || Date.now();
    var doses = events({ baby: id, type: 'med', from: now - DAY }).filter(function (e) { return medKeyOf(e.data) === medKey; });
    if (!doses.length) return null;
    var lastDose = doses[doses.length - 1];
    var interval = (lastDose.data.intervalH || 0) * HOUR;
    var preset = G.medicine(lastDose.data.medId);
    return {
      last: lastDose,
      nextAt: interval ? lastDose.time + interval : null,
      count24: doses.length,
      max: lastDose.data.maxPerDay || preset.maxPerDay || 0
    };
  }

  /* ---------- Reminder engine ----------
     Returns every reminder with its due time. The UI shows the
     upcoming ones; `due()` returns those that should fire now. */
  function hm(str, now) {
    var p = String(str || '09:00').split(':');
    var d = new Date(now); d.setHours(+p[0] || 0, +p[1] || 0, 0, 0);
    return d.getTime();
  }
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  function reminders(now, id) {
    now = now || Date.now();
    id = id || state.activeBaby;
    var b = baby(id);
    if (!b) return [];
    var st = state.settings, out = [];
    var name = b.name || 'Baby';
    var days = ageDays(now, id);

    // A sleeping baby is never "due" for a diaper change, tummy time or vitamin D —
    // those wait until they wake. Feeds only interrupt sleep for young newborns.
    var asleep = isAsleep(id);

    // Next feed — from the START of the last feed, like a pediatrician counts it.
    if (st.feedRemind) {
      var lf = lastFeedAnchor(id);
      if (lf && !lf.live) {
        var iv = feedIntervalH(now, id);
        if (!asleep) {
          out.push({ key: 'feed:' + lf.id, kind: 'feed', icon: '🍼', title: 'Feed due', text: name + ' last fed ' + G.fmtDur((now - lf.time) / MIN) + ' ago (every ~' + G.fmtHours(iv) + ').', at: lf.time + iv * HOUR });
        } else if (days < 14) {
          // Newborns shouldn't go more than ~4 hours between feeds until back to birth weight.
          out.push({ key: 'feedwake:' + lf.id, kind: 'feed', icon: '🍼', title: 'Time to wake for a feed', text: name + ' last fed ' + G.fmtDur((now - lf.time) / MIN) + ' ago. Newborns under 2 weeks shouldn’t go more than about 4 hours between feeds.', at: Math.max(lf.time + iv * HOUR, lf.time + 4 * HOUR) });
        }
      }
    }

    // Diaper check.
    if (st.diaperRemind && !asleep) {
      var ld = last('diaper', null, id);
      if (ld) out.push({ key: 'diaper:' + ld.id, kind: 'diaper', icon: '🧷', title: 'Diaper check', text: 'Last change was ' + G.fmtDur((now - ld.time) / MIN) + ' ago.', at: ld.time + st.diaperIntervalH * HOUR });
    }

    // Nap window — when the wake window starts closing.
    if (st.napRemind) {
      var woke = awakeSince(now, id);
      if (woke) {
        var nap = G.nextNap(days, woke, now);
        out.push({ key: 'nap:' + woke, kind: 'nap', icon: '😴', title: 'Nap window', text: name + ' has been awake ' + G.fmtDur((now - woke) / MIN) + '. Watch for sleepy cues and start winding down.', at: nap.from + Math.round((nap.to - nap.from) / 2) });
      }
    }

    // Medicine — next dose allowed (only if the parent asked to be reminded).
    var seen = {};
    events({ baby: id, type: 'med', from: now - 2 * DAY }).forEach(function (e) {
      var key = medKeyOf(e.data);
      seen[key] = e;
    });
    Object.keys(seen).forEach(function (k) {
      var e = seen[k];
      if (!e.data.remind || !e.data.intervalH) return;
      out.push({ key: 'med:' + e.id, kind: 'med', icon: '💊', title: (e.data.name || 'Medicine') + ' — next dose allowed', text: 'Last dose ' + G.fmtDur((now - e.time) / MIN) + ' ago. Check the dose before giving.', at: e.time + e.data.intervalH * HOUR });
    });

    // Daily vitamin D (skipped if already logged today).
    if (st.vitdRemind && !asleep) {
      var start = startOfDay(now);
      var given = events({ baby: id, type: 'med', from: start }).some(function (e) { return e.data.medId === 'vitd'; });
      var at = hm(st.vitdTime, now);
      if (given) at = hm(st.vitdTime, now + DAY);
      out.push({ key: 'vitd:' + dayKey(at), kind: 'vitd', icon: '☀️', title: 'Vitamin D drops', text: 'Daily vitamin D for ' + name + '.', at: at });
    }

    // Tummy time daily nudge if under goal.
    if (st.tummyRemind && !asleep) {
      var goal = G.tummyGoalMin(days);
      if (goal) {
        var doneMin = daySummary(startOfDay(now), now, id).tummyMs / MIN;
        var tat = hm(st.tummyTime, now);
        if (doneMin >= goal) tat = hm(st.tummyTime, now + DAY);
        out.push({ key: 'tummy:' + dayKey(tat), kind: 'tummy', icon: '🤸', title: 'Tummy time', text: Math.round(doneMin) + ' of ' + goal + ' minutes done today.', at: tat });
      }
    }

    // Appointments: the evening before (7 pm) and 2 hours before.
    var hl = health(id);
    hl.appointments.forEach(function (a) {
      if (a.done || !a.at || a.at < now - 6 * HOUR) return;
      var title = (a.title || 'Doctor’s visit') + (a.place ? ' · ' + a.place : '');
      var eve = new Date(a.at - DAY); eve.setHours(19, 0, 0, 0);
      if (eve.getTime() < a.at - 3 * HOUR) out.push({ key: 'appt:' + a.id + ':eve', kind: 'appt', icon: '🩺', title: 'Tomorrow: ' + title, text: 'At ' + new Date(a.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '. Bring the vaccine card and your questions.', at: eve.getTime(), apptId: a.id });
      out.push({ key: 'appt:' + a.id + ':soon', kind: 'appt', icon: '🩺', title: 'In 2 hours: ' + title, text: name + '’s appointment is at ' + new Date(a.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.', at: a.at - 2 * HOUR, apptId: a.id });
    });
    // Prescription courses with reminders on: each next dose until the course ends.
    hl.rx.forEach(function (rx) {
      if (!rx.remind) return;
      var rs = rxStatus(rx, now, id);
      if (!rs.nextAt) return;
      out.push({ key: 'rx:' + rx.id + ':' + (rs.lastDose ? rs.lastDose.id : 'first'), kind: 'rx', icon: '💊', title: rx.name + ' — dose due', text: (rx.dose ? rx.dose + ' · ' : '') + 'dose ' + (rs.doses + 1) + (rs.expected ? ' of ' + rs.expected : '') + '.', at: rs.nextAt, rxId: rx.id });
    });
    // Vaccines: one nudge at 9 am on the due date (only for ones not given and not long overdue).
    if (hl.vaccines.schedule && b.birth) {
      var dueDays = {};
      G.vaccinePlan(hl.vaccines.schedule, b.birth, hl.vaccines.given, now).forEach(function (v) {
        if (v.status === 'given' || v.due < startOfDay(now) - 7 * DAY) return;
        var k = dayKey(v.due); (dueDays[k] = dueDays[k] || []).push(v);
      });
      Object.keys(dueDays).forEach(function (k) {
        var list = dueDays[k], d9 = new Date(list[0].due); d9.setHours(9, 0, 0, 0);
        out.push({ key: 'vax:' + k, kind: 'vax', icon: '💉', title: 'Vaccines due', text: list.map(function (v) { return v.name; }).join(', ') + '.', at: d9.getTime() });
      });
    }

    // Custom reminders.
    state.custom.filter(function (r) { return r.baby === id && r.on !== false; }).forEach(function (r) {
      var at2, key;
      if (r.repeat === 'daily') {
        at2 = hm(r.time, now);
        if (state.fired['custom:' + r.id + ':' + dayKey(at2)]) at2 = hm(r.time, now + DAY);
        key = 'custom:' + r.id + ':' + dayKey(at2);
      } else if (r.repeat === 'every') {
        var iv2 = (r.everyH || 3) * HOUR;
        var base = r.anchor || r.created || now;
        // The most recent slot if it hasn't fired yet, otherwise the next one.
        var n = Math.floor((now - base) / iv2);
        at2 = base + Math.max(1, n) * iv2;
        if (n >= 1 && state.fired['custom:' + r.id + ':' + at2 + '@' + at2]) at2 += iv2;
        key = 'custom:' + r.id + ':' + at2;
      } else {
        at2 = r.at; key = 'custom:' + r.id;
      }
      out.push({ key: key, kind: 'custom', icon: r.icon || '🔔', title: r.label || 'Reminder', text: r.note || '', at: at2, customId: r.id });
    });

    // Apply snoozes.
    out.forEach(function (r) {
      var s = state.snoozed[r.key];
      if (s && s > r.at) { r.at = s; r.snoozed = true; }
      r.done = !!state.fired[r.key + '@' + r.at];
    });
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  }

  function due(now, id) {
    now = now || Date.now();
    return reminders(now, id).filter(function (r) { return r.at <= now && !state.fired[r.key + '@' + r.at]; });
  }

  function markFired(r) {
    state.fired[r.key + '@' + r.at] = Date.now();
    if (r.kind === 'custom') state.fired[r.key] = Date.now();
    // Keep the map small.
    var keys = Object.keys(state.fired);
    if (keys.length > 300) keys.sort(function (a, b) { return state.fired[a] - state.fired[b]; }).slice(0, keys.length - 200).forEach(function (k) { delete state.fired[k]; });
  }

  function snooze(key, until) { state.snoozed[key] = until; }

  /* ---------- Export / import ---------- */
  function exportJSON() {
    return JSON.stringify({ app: 'baby-log', exported: new Date().toISOString(), state: state });
  }

  // Merge another device's log in: babies by id, events by id (newer wins on clash).
  function importJSON(text, mode) {
    var parsed = JSON.parse(text);
    var incoming = normalize(parsed.state || parsed);
    if (mode === 'replace') { state = incoming; return { babies: state.babies.length, events: state.events.length }; }
    var added = 0;
    incoming.babies.forEach(function (b) { if (!baby(b.id)) state.babies.push(b); });
    var byId = {};
    state.events.forEach(function (e) { byId[e.id] = e; });
    incoming.events.forEach(function (e) { if (!byId[e.id]) { state.events.push(e); added++; } });
    incoming.custom.forEach(function (r) { if (!state.custom.some(function (x) { return x.id === r.id; })) state.custom.push(r); });
    // Health records: merge lists by id; keep local profile fields, fill in missing ones.
    Object.keys(incoming.health || {}).forEach(function (bid) {
      var src = incoming.health[bid], dst = state.health[bid];
      if (!dst) { state.health[bid] = src; return; }
      ['appointments', 'rx', 'docs'].forEach(function (k) { (src[k] || []).forEach(function (x) { dst[k] = dst[k] || []; if (!findIn(dst[k], x.id)) dst[k].push(x); }); });
      dst.profile = Object.assign({}, src.profile || {}, dst.profile || {});
      if (src.vaccines) {
        dst.vaccines = dst.vaccines || { schedule: '', given: {}, custom: [] };
        dst.vaccines.schedule = dst.vaccines.schedule || src.vaccines.schedule;
        dst.vaccines.given = Object.assign({}, src.vaccines.given || {}, dst.vaccines.given || {});
      }
    });
    if (!state.activeBaby && state.babies[0]) state.activeBaby = state.babies[0].id;
    sortEvents();
    return { babies: incoming.babies.length, events: added };
  }

  function exportCSV(id) {
    var b = baby(id);
    var rows = [['baby', 'type', 'start', 'end', 'duration_min', 'details']];
    events({ baby: id }).forEach(function (e) {
      var dur = e.end ? Math.round((e.end - e.time) / MIN) : '';
      rows.push([b ? b.name : '', e.type, new Date(e.time).toISOString(), e.end ? new Date(e.end).toISOString() : '', dur, JSON.stringify(e.data)]);
    });
    return rows.map(function (r) { return r.map(function (c) { c = String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n');
  }

  var api = {
    STORE_KEY: STORE_KEY, uid: uid, defaults: defaults,
    load: load, save: save, get: get, set: set, reset: reset, normalize: normalize,
    baby: baby, addBaby: addBaby, updateBaby: updateBaby, removeBaby: removeBaby, ageDays: ageDays,
    addEvent: addEvent, updateEvent: updateEvent, removeEvent: removeEvent, findEvent: findEvent, events: events, last: last,
    startOfDay: startOfDay, overlap: overlap,
    timers: timers, startTimer: startTimer, stopTimer: stopTimer,
    breastSwitch: breastSwitch, breastPause: breastPause, breastTotals: breastTotals,
    pumpSide: pumpSide, pumpBoth: pumpBoth, pumpFinish: pumpFinish, pumpTotals: pumpTotals,
    isAsleep: isAsleep, awakeSince: awakeSince, lastFeedAnchor: lastFeedAnchor, feedIntervalH: feedIntervalH,
    daySummary: daySummary, last24: last24, medStatus: medStatus, medKeyOf: medKeyOf,
    health: health, findIn: findIn, rxStatus: rxStatus,
    reminders: reminders, due: due, markFired: markFired, snooze: snooze,
    exportJSON: exportJSON, importJSON: importJSON, exportCSV: exportCSV
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BabyStore = api;
})(this);
