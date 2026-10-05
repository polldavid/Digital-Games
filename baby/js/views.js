/* =========================================================
   Baby Log — views.js
   Today (dashboard), History (timeline) and Trends (charts).
   ========================================================= */
(function () {
  'use strict';

  var G = window.BabyGuide, S = window.BabyStore, App = window.BabyApp, h = App.h;
  var esc = h.esc, MIN = h.MIN, HOUR = h.HOUR, DAY = h.DAY;

  /* ======================= TODAY =======================
     Isotype: one drawn symbol means one thing. Today leads with one colour
     field — what is happening now, or what comes next — then the last of
     each thing, the log buttons, and the last 24 hours counted in symbols. */

  var ic = h.ic;

  // A running timer owns the field: it is what the parent is in the middle of.
  function liveCards(now) {
    var t = S.timers(), out = '';
    if (t.breast) {
      var b = t.breast;
      out += '<div class="card live" aria-live="off"><div class="live__head">' + ic('breast', 'live__icon') + '<div><div class="live__label">' + (b.paused ? '' : '<span class="live-dot" aria-hidden="true"></span>') + (b.paused ? 'Feed paused' : 'Feeding · ' + (b.side === 'L' ? 'left' : 'right')) + '</div><div class="live__sub">started ' + h.fmtTime(b.start) + '</div></div><span class="live__clock" data-breast="T">0:00</span></div>' +
        '<div class="btn-row"><button class="btn btn--sm btn--on-field" data-action="breast-side" data-side="' + (b.side === 'L' ? 'R' : 'L') + '">' + ic('swap') + 'Switch to ' + (b.side === 'L' ? 'right' : 'left') + '</button>' +
        '<button class="btn btn--sm btn--on-field" data-action="breast-pause">' + (b.paused ? ic('play') + 'Resume' : ic('pause') + 'Pause') + '</button>' +
        '<button class="btn btn--sm btn--field" data-action="breast-finish">' + ic('check') + 'Done</button></div></div>';
    }
    if (t.sleep) {
      out += '<div class="card live live--sleep"><div class="live__head">' + ic('moon', 'live__icon') + '<div><div class="live__label"><span class="live-dot" aria-hidden="true"></span>Asleep</div><div class="live__sub">since ' + h.fmtTime(t.sleep.start) + '</div></div><span class="live__clock" data-elapsed="' + t.sleep.start + '">0:00</span></div>' +
        '<button class="btn btn--field btn--block" data-action="sleep-stop">' + ic('sun') + 'Woke up</button></div>';
    }
    if (t.pump) {
      var p = t.pump, both = p.L.on && p.R.on;
      var state = p.done ? 'Pumping finished' : both ? 'Pumping · both sides' : p.L.on ? 'Pumping · left' : p.R.on ? 'Pumping · right' : 'Pumping paused';
      out += '<div class="card live"><div class="live__head">' + ic('pump', 'live__icon') + '<div><div class="live__label">' + (p.done ? '' : '<span class="live-dot" aria-hidden="true"></span>') + state + '</div><div class="live__sub">L <span data-pump="L">0:00</span> · R <span data-pump="R">0:00</span></div></div><span class="live__clock" data-pump="T">0:00</span></div>' +
        (p.done ? '<button class="btn btn--field btn--block" data-action="pump-finish">Enter amounts</button>'
          : '<div class="btn-row"><button class="btn btn--sm btn--on-field" data-action="pump-both">' + (both ? ic('pause') + 'Pause' : ic('play') + 'Both sides') + '</button><button class="btn btn--sm btn--field" data-action="pump-finish">' + ic('check') + 'Done</button></div>') + '</div>';
    }
    if (t.tummy) {
      out += '<div class="card live"><div class="live__head">' + ic('tummy', 'live__icon') + '<div><div class="live__label"><span class="live-dot" aria-hidden="true"></span>Tummy time</div><div class="live__sub">since ' + h.fmtTime(t.tummy.start) + '</div></div><span class="live__clock" data-elapsed="' + t.tummy.start + '">0:00</span></div>' +
        '<button class="btn btn--field btn--block" data-action="tummy-stop">' + ic('check') + 'Done</button></div>';
    }
    return out;
  }

  // No timer running: the field holds the next feed, the question every parent asks first.
  function nextField(now) {
    var lf = S.lastFeedAnchor(), b = S.baby();
    if (!lf) {
      return '<div class="card live live--next"><div class="next__k">Nothing logged yet</div><div class="next__big next__big--word">Log the first feed</div>' +
        '<div class="next__sub">Feeds, diapers and sleep fill in Today as you go.</div><button class="btn btn--field" data-action="log" data-type="feed">' + ic('bottle') + 'Log a feed</button></div>';
    }
    var iv = S.feedIntervalH(now), at = lf.time + iv * HOUR, side = window.BabyForms.nextSide();
    var due = at <= now, last = lf.event ? h.describe(lf.event) : null;
    var detail = [last && last.sub, side && b.feeding !== 'formula' ? 'start on the ' + (side === 'L' ? 'left' : 'right') : ''].filter(Boolean).join(' · ');
    return '<div class="card live live--next' + (due ? ' live--due' : '') + '"><div class="next__k">' + (due ? 'Feed due now' : 'Next feed') + '</div>' +
      '<div class="next__row"><div class="next__big">' + h.fmtTime(at) + '</div><button class="btn btn--field" data-action="log" data-type="feed">' + ic('bottle') + 'Feed now</button></div>' +
      '<div class="next__sub">' + (due ? 'due ' : '') + '<span data-until="' + at + '">' + h.until(at, now) + '</span> · last fed <span data-ago="' + lf.time + '">' + h.ago(lf.time, now) + '</span></div>' +
      (detail ? '<div class="next__sub next__sub--2">' + esc(detail) + '</div>' : '') + '</div>';
  }

  /* One hairline row under the field for the other thing a parent needs to
     know right now: the next feed while a timer runs, or how long baby has
     been awake. Everything else is counted below. */
  function stateRow(now, days, live) {
    var t = S.timers(), b = S.baby(), rows = [];
    if (live && !t.breast) {
      var lf = S.lastFeedAnchor();
      if (lf) {
        var at = lf.time + S.feedIntervalH(now) * HOUR, side = window.BabyForms.nextSide();
        rows.push(srow('bottle', 'Next feed ' + h.fmtTime(at), '<span data-until="' + at + '">' + h.until(at, now) + '</span>' + (side && b.feeding !== 'formula' ? ' · start on the ' + (side === 'L' ? 'left' : 'right') : ''), 'log', 'feed', 'Feed'));
      }
    }
    if (!t.sleep) {
      var woke = S.awakeSince(now);
      if (woke) {
        var nap = G.nextNap(days, woke, now);
        var note = nap.state === 'early' ? 'nap window ' + h.fmtTime(nap.from) + '–' + h.fmtTime(nap.to) : nap.state === 'window' ? 'in the nap window now' : 'past the ' + nap.wake[1] + '-min wake window';
        rows.push(srow('sun', 'Awake <span data-since="' + woke + '">' + h.since(now - woke) + '</span>', '<span class="' + (nap.state === 'late' || nap.state === 'over' ? 't-due' : '') + '">' + note + '</span>', 'sleep-start', '', 'Start sleep', true));
      }
    }
    return rows.length ? '<div class="state">' + rows.join('') + '</div>' : '';
  }
  function srow(icon, title, sub, action, type, label, raw) {
    return '<div class="srow">' + ic(icon, 'srow__icon ' + h.tone(icon)) + '<div class="srow__main"><div class="srow__t">' + title + '</div><div class="srow__s">' + sub + '</div></div>' +
      '<button class="btn btn--link srow__go" data-action="' + action + '"' + (type ? ' data-type="' + type + '"' : '') + '>' + label + '</button></div>';
  }

  // Every button the Today grid can show. Parents choose which ones and
  // in what order (Settings or More → Edit buttons); the rest live under More.
  function allItems() {
    var t = S.timers();
    return {
      feed:      ['feed', 'bottle', t.breast ? 'Feeding…' : 'Feed', !!t.breast, 'log'],
      diaper:    ['diaper', 'diaper', 'Diaper', false, 'log'],
      sleep:     ['sleep', t.sleep ? 'sun' : 'moon', t.sleep ? 'Woke up' : 'Sleep', !!t.sleep, 'sleep-toggle'],
      tummy:     ['tummy', 'tummy', t.tummy ? 'Stop tummy' : 'Tummy', !!t.tummy, 'tummy-toggle'],
      solids:    ['solids', 'bowl', 'Solids', false, 'log-solids'],
      pump:      ['pump', 'pump', t.pump ? 'Pumping…' : 'Pump', !!t.pump, 'log'],
      med:       ['med', 'pill', 'Medicine', false, 'log'],
      temp:      ['temp', 'thermometer', 'Temp', false, 'log'],
      scan:      ['scan', 'camera', 'Scan Rx', false, 'rx-scan'],
      visit:     ['visit', 'stethoscope', 'Visit', false, 'appt-edit'],
      growth:    ['growth', 'ruler', 'Growth', false, 'log'],
      bath:      ['bath', 'tub', 'Bath', false, 'log'],
      milestone: ['milestone', 'star', 'Milestone', false, 'log'],
      note:      ['note', 'note', 'Note', false, 'log'],
      sounds:    ['sounds', 'wave', 'Sounds', !!window.BabySound.playing(), 'help-sounds'],
      cry:       ['cry', 'cry', 'Crying?', false, 'help']
    };
  }
  var ITEM_ORDER = ['feed', 'diaper', 'sleep', 'tummy', 'solids', 'pump', 'med', 'temp', 'scan', 'visit', 'growth', 'bath', 'milestone', 'note', 'sounds', 'cry'];
  function defaultQuick(days) {
    return ['feed', 'diaper', 'sleep', G.tummyGoalMin(days) && days < 150 ? 'tummy' : 'solids', 'pump', 'med', 'temp'];
  }
  // The parent's chosen buttons (or the age-based default), then everything else.
  function quickIds(days) {
    var saved = S.get().settings.quickLog;
    var ids = Array.isArray(saved) && saved.length ? saved.filter(function (id) { return ITEM_ORDER.indexOf(id) >= 0; }) : defaultQuick(days);
    return { main: ids, more: ITEM_ORDER.filter(function (id) { return ids.indexOf(id) < 0; }) };
  }
  function quickItems(days) {
    var all = allItems(), ids = quickIds(days);
    var pick = function (id) { return all[id]; };
    return { main: ids.main.map(pick), more: ids.more.map(pick) };
  }
  function qaButtons(list) {
    return list.map(function (q) {
      return '<button class="qa' + (q[3] ? ' qa--on' : '') + '" data-action="' + q[4] + '" data-type="' + q[0] + '"' + (q[0] === 'cry' ? ' data-topic="cry"' : '') + '>' + ic(q[1], 'qa__icon ' + h.tone(q[1])) + '<span class="qa__label">' + q[2] + '</span></button>';
    }).join('');
  }
  function quickActions(days) {
    var it = quickItems(days);
    var moreOn = it.more.some(function (q) { return q[3]; });
    return '<div class="qa-grid">' + qaButtons(it.main) +
      '<button class="qa' + (moreOn ? ' qa--on' : '') + '" data-action="log-more">' + ic('more', 'qa__icon c-mute') + '<span class="qa__label">More</span></button></div>';
  }
  function moreActions(days) {
    var more = quickItems(days).more;
    return (more.length ? '<div class="qa-grid qa-grid--3">' + qaButtons(more) + '</div>' : '<p class="muted">Every button is already on Today.</p>') +
      '<button class="btn btn--block" data-action="quick-edit">' + ic('edit') + 'Choose which buttons show on Today</button>';
  }

  // Pick and order the Today buttons. Changes apply straight away.
  function quickEditor(days) {
    var all = allItems(), ids = quickIds(days), on = ids.main;
    var rows = on.concat(ids.more).map(function (id) {
      var q = all[id], i = on.indexOf(id), shown = i >= 0;
      return '<div class="row qe-row' + (shown ? '' : ' qe-row--off') + '">' +
        '<label class="check-line qe-row__main"><input type="checkbox" data-action-change="quick-toggle" data-id="' + id + '"' + (shown ? ' checked' : '') + ' />' + ic(q[1], 'row__icon ' + h.tone(q[1])) + esc(q[2].replace('…', '')) + '</label>' +
        (shown ? '<button class="iconbtn" data-action="quick-move" data-id="' + id + '" data-d="-1" aria-label="Move ' + esc(q[2]) + ' earlier"' + (i === 0 ? ' disabled' : '') + '>' + ic('chevron', 'ic--up') + '</button>' +
          '<button class="iconbtn" data-action="quick-move" data-id="' + id + '" data-d="1" aria-label="Move ' + esc(q[2]) + ' later"' + (i === on.length - 1 ? ' disabled' : '') + '>' + ic('chevron', 'ic--down') + '</button>' : '') + '</div>';
    }).join('');
    var n = on.length, full = (n + 1) % 4 === 0;
    return '<p class="muted">Ticked buttons show on Today in this order, followed by <strong>More</strong> for the rest.</p>' +
      '<p class="faint">' + h.plural(n, 'button') + ' + More' + (full ? ' — fills ' + ((n + 1) / 4) + ' full rows.' : ' — tip: 3, 7 or 11 buttons fill whole rows.') + '</p>' +
      '<div class="rows">' + rows + '</div>' +
      '<div class="btn-row sheet-save"><button class="btn" data-action="quick-reset">Reset to default</button><button class="btn btn--primary btn--lg" data-action="sheet-close">Done</button></div>';
  }

  // One-time tip: installing matters for notifications (iPhone) and for keeping logs (Safari).
  function installTip() {
    var P = App.platform;
    if (P.standalone || S.get().settings.installTipDismissed) return '';
    if (P.ios) return '<div class="card tipcard"><div class="tipcard__t">' + ic('share') + 'Add Baby Log to your Home Screen</div><p class="muted small">In Safari, tap <strong>Share</strong> then <strong>Add to Home Screen</strong>, and open it from the new icon. On iPhone that’s what lets reminders arrive as notifications — and it stops Safari clearing your logs if you don’t visit for a week.</p><div class="btn-row"><button class="btn btn--sm" data-action="install-dismiss">Got it</button></div></div>';
    if (App.installPrompt) return '<div class="card tipcard"><div class="tipcard__t">' + ic('share') + 'Install Baby Log</div><p class="muted small">Opens like an app, works offline, and sends reminders as notifications.</p><div class="btn-row"><button class="btn btn--sm" data-action="install-dismiss">Not now</button><button class="btn btn--sm btn--primary" data-action="install-prompt">Install</button></div></div>';
    return '';
  }

  /* "Is baby getting enough?" — the last 24 hours against age norms, drawn
     the Isotype way: one symbol per feed, per diaper, per hour of sleep.
     Filled = what happened; faint = the rest of the expected range. Symbols
     never grow or shrink — more means more of them. */
  var ROW_CAP = 16;
  function counted(name, n, lo, hi) {
    var shown = Math.min(n, ROW_CAP), reach = Math.min(Math.max(hi || lo || 0, n), ROW_CAP), s = '';
    for (var i = 0; i < reach; i++) {
      s += ic(name, i < shown ? 'count__on' : 'count__off');
      // Neurath's countability rule: a gap after every fifth symbol.
      if (i % 5 === 4 && i < reach - 1) s += '<span class="count__gap" aria-hidden="true"></span>';
    }
    if (n > ROW_CAP) s += '<span class="count__more">+' + (n - ROW_CAP) + '</span>';
    return s;
  }
  function checks(now, days) {
    var b = S.baby(), s = S.last24(now);
    var feed = G.feedingFor(days, b.feeding), dia = G.diapersFor(days), sl = G.sleepFor(days), tg = G.tummyGoalMin(days);
    var first = S.events()[0];
    var partial = !first || now - first.time < DAY;
    var rows = [];
    // One row per kind of thing; the unit is in the label, the explanations live in "What's normal?".
    function row(name, label, unitNote, value, shownValue, lo, hi, unit, show, perSymbol) {
      if (show === false) return;
      var range = lo ? (hi ? lo + '–' + hi : lo + '+') + (unit ? ' ' + unit : '') : '';
      var level = !lo ? 'info' : value >= lo ? 'ok' : partial ? 'info' : 'warn';
      var per = perSymbol || 1;
      rows.push('<div class="count count--' + level + ' ' + h.tone(name) + '">' +
        '<div class="count__k"><span class="count__label">' + label + (unitNote ? '<span class="count__unit">' + unitNote + '</span>' : '') + '</span><span class="count__v">' + shownValue + (unit ? '<small> ' + unit + '</small>' : '') + '</span>' + (range ? '<span class="count__range">of ' + range + '</span>' : '') + '</div>' +
        '<div class="count__row" role="img" aria-label="' + esc(label + ': ' + shownValue + (unit ? ' ' + unit : '') + (range ? ', expected ' + range : '')) + '">' + counted(name, Math.round(value / per), Math.round(lo / per), Math.round((hi || lo) / per)) + '</div></div>');
    }
    var sleepH = Math.round(s.sleepMs / HOUR * 10) / 10;
    row('bottle', 'Feeds', '', s.feeds, s.feeds, feed.perDay[0], feed.perDay[1], '');
    row('drop', 'Wet', '', s.wet, s.wet, dia.wet, 0, '');
    row('poo', 'Dirty', '', s.dirty, s.dirty, dia.dirty, 0, '');
    row('moon', 'Sleep', '1 per 2 h', sleepH, sleepH, sl.totalH[0], sl.totalH[1], 'h', true, 2);
    row('tummy', 'Tummy', '1 per 5 min', Math.round(s.tummyMs / MIN), Math.round(s.tummyMs / MIN), tg, 0, 'min', tg > 0, 5);
    var html = '<div class="counts"><p class="counts__key">One symbol = one feed or one diaper. Faint = the rest of the usual range.</p>' + rows.join('') + '</div>';
    if (partial) html += '<p class="faint">' + (first ? 'You started logging ' + h.ago(first.time, now) + ' — this check is complete after a full 24 hours.' : 'Log feeds, diapers and sleep and this fills in.') + '</p>';
    else {
      var low = [];
      if (s.wet < dia.wet) low.push('wet diapers');
      if (s.feeds < feed.perDay[0]) low.push('feeds');
      if (low.length) html += h.note('warn', 'Fewer ' + low.join(' and ') + ' than usual', 'Missed logging some? If not — and especially with fewer wet diapers, sleepiness at feeds or dark pee — call your pediatrician or a lactation consultant today.');
      else html += '<p class="verdict">' + ic('check', 'c-ok') + 'Looking good — feeds and wet diapers are in the usual range for ' + esc(G.ageLabel(days).toLowerCase()) + '.</p>';
    }
    return html;
  }

  function reminderRows(list, now) {
    if (!list.length) return '<p class="quiet">No reminders coming up.</p>';
    return '<div class="rows">' + list.map(function (r) {
      var overdue = r.at <= now;
      return '<div class="row' + (r.done ? ' row--done' : '') + '">' + h.icon(r.icon, 'row__icon ' + h.tone(r.icon)) + '<div class="row__main"><div class="row__t">' + esc(r.title) + '</div><div class="row__s">' + esc(r.text) + '</div></div>' +
        '<div class="row__time"><strong>' + h.fmtTime(r.at) + '</strong><span data-until="' + r.at + '">' + h.until(r.at, now) + '</span>' +
        (overdue ? '<br><button class="btn btn--link btn--sm" data-action="snooze" data-key="' + esc(r.key) + '" data-at="' + r.at + '">Snooze 15m</button>' : '') + '</div></div>';
    }).join('') + '</div>';
  }

  function timelineRows(list, now) {
    if (!list.length) return '<p class="quiet">Nothing logged yet today — tap a button above to start.</p>';
    return '<div class="rows">' + list.map(function (e) {
      var d = h.describe(e, now);
      return '<button class="row' + (d.flag ? ' row--flag' : '') + '" data-action="edit" data-id="' + e.id + '">' + ic(d.icon, 'row__icon ' + h.tone(d.icon)) + '<div class="row__main"><div class="row__t">' + esc(d.title) + (d.flag ? ' ' + h.statusPill('warn', 'worth a look') : '') + '</div><div class="row__s">' + esc(d.sub || ' ') + '</div></div>' +
        '<div class="row__time"><strong>' + h.fmtTime(e.time) + '</strong>' + h.ago(e.end || e.time, now) + '</div></button>';
    }).join('') + '</div>';
  }

  function today() {
    var now = Date.now(), days = S.ageDays(now);
    var rem = S.reminders(now).filter(function (r) { return !r.done; }).slice(0, 4);
    var todays = S.events({ from: S.startOfDay(now) }).filter(function (e) { return e.time >= S.startOfDay(now); }).reverse();
    var live = liveCards(now);
    return '<h1 class="sr-only">Today</h1>' + (live || nextField(now)) +
      stateRow(now, days, !!live) +
      quickActions(days) +
      '<div class="section-title"><h2>Last 24 hours</h2> <button class="btn--link" data-action="help" data-topic="enough">What’s normal?</button></div>' +
      '<div class="card">' + checks(now, days) + '</div>' +
      '<button class="cry-cta" data-action="help" data-topic="cry">' + ic('cry', 'cry-cta__icon') + '<span class="cry-cta__t">Crying? See the likely reasons</span>' + ic('chevron', 'cry-cta__go') + '</button>' +
      '<div class="section-title"><h2>Coming up</h2> <button class="btn--link" data-action="go" data-view="settings" data-focus="reminders">Manage</button></div>' +
      '<div class="card">' + reminderRows(rem, now) + '</div>' +
      '<div class="section-title"><h2>Today</h2> <button class="btn--link" data-action="go" data-view="log">All history</button></div>' +
      '<div class="card">' + timelineRows(todays.slice(0, 10), now) +
      (todays.length > 10 ? '<button class="btn btn--link btn--block" data-action="go" data-view="log">See all ' + todays.length + ' entries today</button>' : '') + '</div>' +
      installTip();
  }

  /* ======================= HISTORY ======================= */
  function modeSwitch(cur) {
    return '<h1 class="h1">History</h1><div class="seg" role="tablist">' + [['timeline', 'Timeline'], ['trends', 'Trends']].map(function (m) {
      return '<button class="seg__btn' + (cur === m[0] ? ' seg__btn--on' : '') + '" role="tab" aria-selected="' + (cur === m[0]) + '" data-action="hist-mode" data-mode="' + m[0] + '">' + m[1] + '</button>';
    }).join('') + '</div>';
  }
  var FILTERS = [['all', 'All', ''], ['feed', 'Feeds', 'bottle'], ['diaper', 'Diapers', 'diaper'], ['sleep', 'Sleep', 'moon'], ['pump', 'Pump', 'pump'], ['med', 'Meds', 'pill'], ['temp', 'Temp', 'thermometer'], ['growth', 'Growth', 'ruler'], ['tummy', 'Tummy', 'tummy'], ['milestone', 'Milestones', 'star'], ['note', 'Notes', 'note'], ['bath', 'Baths', 'tub']];

  function history() {
    var ui = App.ui, now = Date.now();
    var from = S.startOfDay(now) - (ui.historyDays - 1) * DAY;
    var list = S.events({ from: from, type: ui.historyType === 'all' ? null : ui.historyType }).filter(function (e) { return e.time >= from; }).reverse();
    var html = modeSwitch('timeline') +
      '<div class="btn-row"><button class="btn btn--sm" data-action="add-past">' + ic('plus') + 'Add past entry</button><button class="btn btn--sm" data-action="handoff">' + ic('share') + 'Share summary</button></div>' +
      '<div class="chips chips--scroll" role="toolbar" aria-label="Filter">' + FILTERS.map(function (f) { return '<button class="chip" data-action="hist-filter" data-type="' + f[0] + '" aria-pressed="' + (ui.historyType === f[0]) + '">' + (f[2] ? ic(f[2], h.tone(f[2])) : '') + f[1] + '</button>'; }).join('') + '</div>';
    if (!list.length) return html + '<div class="card"><div class="empty">' + ic('note', 'empty__icon') + 'Nothing here for the last ' + h.plural(ui.historyDays, 'day') + '.</div></div>';
    var groups = {}, order = [];
    list.forEach(function (e) { var k = S.startOfDay(e.time); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(e); });
    html += '<div class="card">';
    order.forEach(function (k) {
      var s = S.daySummary(k, now);
      var sum = [s.feeds && h.plural(s.feeds, 'feed'), (s.wet || s.dirty) && s.wet + ' wet · ' + s.dirty + ' dirty', s.sleepMs && h.hoursStr(s.sleepMs) + ' sleep'].filter(Boolean).join(' · ');
      html += '<div class="daygroup"><span>' + h.dayLabel(k, now) + '</span><span>' + sum + '</span></div>' + timelineRows(groups[k], now);
    });
    html += '</div>';
    var older = S.events({ to: from }).length;
    if (older) html += '<button class="btn btn--block" data-action="hist-more">Show earlier days</button>';
    return html;
  }

  /* ======================= TRENDS ======================= */
  function dayStats(n, now) {
    var out = [], d0 = S.startOfDay(now);
    for (var i = n - 1; i >= 0; i--) {
      var start = d0 - i * DAY;
      // DST-safe: normalise to local midnight.
      start = S.startOfDay(start + 2 * HOUR);
      var s = S.daySummary(start, now);
      s.start = start;
      s.hasData = S.events({ from: start, to: start + DAY }).length > 0 || s.sleepMs > 0;
      out.push(s);
    }
    return out;
  }

  function barChart(o) {
    // o: { title, sub, days, series:[{key, label, cls}], fmt, band:[lo,hi], unit }
    var max = 0;
    o.days.forEach(function (d) { var tot = 0; o.series.forEach(function (s) { tot += o.value(d, s.key); }); max = Math.max(max, tot); });
    if (o.band) max = Math.max(max, o.band[1]);
    max = max || 1;
    var cols = o.days.map(function (d, i) {
      var parts = o.series.map(function (s) { return { s: s, v: o.value(d, s.key) }; });
      var tot = parts.reduce(function (a, p) { return a + p.v; }, 0);
      var tip = h.dayLabel(d.start) + ': ' + parts.map(function (p) { return (o.series.length > 1 ? p.s.label + ' ' : '') + o.fmt(p.v); }).join(', ');
      var segs = parts.slice().reverse().map(function (p, j) {
        if (!p.v) return '';
        return '<div class="bar' + (p.s.cls ? ' ' + p.s.cls : '') + (j === 0 || parts.slice().reverse().slice(0, j).every(function (q) { return !q.v; }) ? ' bar--top' : '') + '" style="height:' + (p.v / max * 100) + '%"></div>';
      }).join('');
      var showVal = o.days.length <= 7 || i === o.days.length - 1;
      return '<div class="bars__col" tabindex="0" role="img" aria-label="' + esc(tip) + '" data-tip="' + esc(tip) + '">' + (showVal && tot ? '<span class="bars__val">' + o.fmt(tot) + '</span>' : '') + segs + '</div>';
    }).join('');
    var band = o.band ? '<div class="bars__band" style="bottom:' + (o.band[0] / max * 100) + '%;height:' + ((o.band[1] - o.band[0]) / max * 100) + '%"></div>' : '';
    var every = o.days.length > 14 ? 5 : 1; // thin out labels on the 30-day view
    var labels = o.days.map(function (d, i) { var last = i === o.days.length - 1; return '<span>' + (last || (o.days.length - 1 - i) % every === 0 ? h.shortDay(d.start) : '') + '</span>'; }).join('');
    // Bars take the colour of what they count: sleep is sleep's colour everywhere.
    var legend = o.series.length > 1 ? '<div class="legend">' + o.series.map(function (s) { return '<span class="' + (s.tone || o.tone) + '"><i></i>' + s.label + '</span>'; }).join('') + '</div>' : '';
    return '<div class="card chart"><div class="chart__title">' + o.title + '</div><div class="chart__sub">' + o.sub + '</div>' + legend +
      '<div class="bars ' + o.tone + '" role="group" aria-label="' + esc(o.title) + ', one bar per day">' + band + cols + '</div><div class="bars__labels" aria-hidden="true">' + labels + '</div></div>';
  }

  function dayMap(n, now) {
    var d0 = S.startOfDay(now), rows = [];
    var sleeps = S.events({ type: 'sleep', from: d0 - n * DAY });
    var feeds = S.events({ type: 'feed', from: d0 - n * DAY }).filter(function (e) { return e.data.kind !== 'solids'; });
    var t = S.timers();
    if (t.sleep) sleeps = sleeps.concat([{ time: t.sleep.start, end: now }]);
    for (var i = n - 1; i >= 0; i--) {
      var start = S.startOfDay(d0 - i * DAY + 2 * HOUR), end = start + DAY;
      var sleptMs = 0;
      var segs = sleeps.map(function (e) {
        var s = Math.max(e.time, start), en = Math.min(e.end || now, end);
        if (en <= s) return '';
        sleptMs += en - s;
        return '<span class="daymap__sleep" style="left:' + ((s - start) / DAY * 100) + '%;width:' + Math.max(0.4, (en - s) / DAY * 100) + '%" data-tip="Sleep ' + h.fmtTime(e.time) + '–' + h.fmtTime(e.end || now) + ' (' + h.durMs((e.end || now) - e.time) + ')"></span>';
      }).join('');
      var dayFeeds = feeds.filter(function (e) { return e.time >= start && e.time < end; });
      var ticks = dayFeeds.map(function (e) {
        return '<span class="daymap__feed" style="left:' + ((e.time - start) / DAY * 100) + '%" data-tip="' + esc(h.describe(e).title + ' at ' + h.fmtTime(e.time)) + '"></span>';
      }).join('');
      // Screen readers get each day in words; the bars are for eyes.
      var said = h.dayLabel(start, now) + ': slept ' + (sleptMs ? h.durMs(sleptMs) : 'none logged') + ', ' + h.plural(dayFeeds.length, 'feed');
      rows.push('<div class="daymap__row"><span class="daymap__label" aria-hidden="true">' + h.shortDay(start, now) + '</span><div class="daymap__track" role="img" aria-label="' + esc(said) + '">' + segs + ticks + '</div></div>');
    }
    return '<div class="card chart"><div class="chart__title">Daily rhythm</div><div class="chart__sub">Each row is one day, midnight to midnight. Watch night sleep join up over the weeks.</div>' +
      '<div class="legend"><span class="c-sleep"><i></i>Sleep</span><span class="c-feed"><i></i>Feed</span></div>' +
      '<div class="daymap">' + rows.join('') + '<div class="daymap__axis"><span></span><div class="daymap__ticks"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span></div></div></div></div>';
  }

  function growthCard() {
    var g = S.events({ type: 'growth' }), b = S.baby();
    if (!g.length && !b.birthWeightKg) return '';
    var pts = g.filter(function (e) { return e.data.weightKg; }).map(function (e) { return { t: e.time, w: e.data.weightKg }; });
    if (b.birthWeightKg && b.birth) { var p = b.birth.split('-'); pts.unshift({ t: new Date(+p[0], +p[1] - 1, +p[2], 12).getTime(), w: b.birthWeightKg, birth: true }); }
    var svg = '';
    if (pts.length >= 2) {
      var W = 320, H = 120, pad = 10;
      var t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1, wmin = Math.min.apply(null, pts.map(function (p) { return p.w; })), wmax = Math.max.apply(null, pts.map(function (p) { return p.w; }));
      if (wmax - wmin < 0.2) { wmax += 0.1; wmin -= 0.1; }
      var X = function (t) { return pad + (t - t0) / ((t1 - t0) || 1) * (W - 2 * pad); }, Y = function (w) { return H - pad - (w - wmin) / (wmax - wmin) * (H - 2 * pad); };
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.w).toFixed(1); }).join(' ');
      svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Weight over time" style="display:block;margin:6px 0 4px">' +
        '<line x1="0" x2="' + W + '" y1="' + (H - pad) + '" y2="' + (H - pad) + '" stroke="var(--grid)" />' +
        '<path d="' + d + '" fill="none" stroke="var(--c-ok)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />' +
        pts.map(function (p) { return '<circle cx="' + X(p.t).toFixed(1) + '" cy="' + Y(p.w).toFixed(1) + '" r="4.5" fill="var(--c-ok)" stroke="var(--ground)" stroke-width="2" tabindex="0" data-tip="' + esc((p.birth ? 'Birth' : h.fmtDate(p.t)) + ': ' + h.weight(p.w)) + '" />'; }).join('') + '</svg>';
    }
    var rowsH = g.slice().reverse().slice(0, 8).map(function (e) {
      return '<tr><td>' + h.fmtDate(e.time) + '</td><td class="num">' + (e.data.weightKg ? h.weight(e.data.weightKg) : '—') + '</td><td class="num">' + (e.data.lengthCm ? h.len(e.data.lengthCm) : '—') + '</td><td class="num">' + (e.data.headCm ? h.len(e.data.headCm) : '—') + '</td></tr>';
    }).join('');
    return '<div class="card chart"><div class="chart__title">Growth</div><div class="chart__sub">Weight' + (b.birthWeightKg ? ' since birth (' + h.weight(b.birthWeightKg) + ')' : '') + '. Your pediatrician plots this on WHO growth charts at check-ups.</div>' + svg +
      (rowsH ? '<div class="tbl-wrap" tabindex="0" role="region" aria-label="Table (scrolls sideways)"><table class="tbl"><thead><tr><th>Date</th><th class="num">Weight</th><th class="num">Length</th><th class="num">Head</th></tr></thead><tbody>' + rowsH + '</tbody></table></div>' : '') +
      '<button class="btn btn--sm" data-action="log" data-type="growth" style="margin-top:10px">' + ic('plus') + 'Add measurement</button></div>';
  }

  function trends() {
    var now = Date.now(), n = App.ui.trendDays, days = S.ageDays(now), b = S.baby();
    var ds = dayStats(n, now);
    var full = ds.filter(function (d) { return d.hasData && d.start < S.startOfDay(now); });
    var avg = function (f) { return full.length ? full.reduce(function (a, d) { return a + f(d); }, 0) / full.length : null; };
    var sleeps = S.events({ type: 'sleep', from: now - n * DAY }).filter(function (e) { return e.end; });
    var longest = sleeps.reduce(function (m, e) { return Math.max(m, e.end - e.time); }, 0);
    var sl = G.sleepFor(days), feed = G.feedingFor(days, b.feeding);
    var html = modeSwitch('trends') +
      '<div class="chips" role="toolbar" aria-label="Range">' + [7, 14, 30].map(function (k) { return '<button class="chip" data-action="trend-range" data-days="' + k + '" aria-pressed="' + (n === k) + '">' + k + ' days</button>'; }).join('') + '</div>';
    var aSleep = avg(function (d) { return d.sleepMs; }), aFeeds = avg(function (d) { return d.feeds; }), aWet = avg(function (d) { return d.wet; });
    html += '<div class="stats">' +
      stat(aSleep != null ? h.hoursStr(aSleep) : '—', 'Avg sleep / day') +
      stat(longest ? h.durMs(longest) : '—', 'Longest stretch') +
      stat(aFeeds != null ? Math.round(aFeeds * 10) / 10 : '—', 'Avg feeds / day') +
      '</div>';
    if (!full.length) html += h.note('info', 'Trends need a full day of logs', 'Averages use complete days only, so they’ll appear from tomorrow. The charts below already include today.');
    if (n <= 14) html += dayMap(n, now);
    html += barChart({ title: 'Sleep per day', sub: 'Shaded band: typical ' + sl.totalH[0] + '–' + sl.totalH[1] + 'h for ' + sl.label.toLowerCase() + '.', days: ds, tone: 'c-sleep', series: [{ key: 'sleep', label: 'Sleep' }], value: function (d) { return d.sleepMs / HOUR; }, fmt: function (v) { return (Math.round(v * 10) / 10) + 'h'; }, band: sl.totalH });
    html += barChart({ title: 'Feeds per day', sub: 'Shaded band: typical ' + feed.perDay[0] + '–' + feed.perDay[1] + ' at ' + feed.label.toLowerCase() + '.', days: ds, tone: 'c-feed', series: [{ key: 'feeds', label: 'Feeds' }], value: function (d) { return d.feeds; }, fmt: function (v) { return String(v); }, band: feed.perDay });
    html += barChart({ title: 'Diapers per day', sub: 'Wet and dirty changes (a “both” counts once in each).' + (aWet != null ? ' Average wet: ' + Math.round(aWet * 10) / 10 + '.' : ''), days: ds, tone: 'c-wet', series: [{ key: 'wet', label: 'Wet', tone: 'c-wet' }, { key: 'dirty', label: 'Dirty', cls: 'bar--2', tone: 'c-dirty' }], value: function (d, k) { return d[k]; }, fmt: function (v) { return String(v); } });
    if (ds.some(function (d) { return d.bottleMl; })) html += barChart({ title: 'Bottle volume per day', sub: 'Total from logged bottles, in ' + h.volUnit() + '.', days: ds, tone: 'c-feed', series: [{ key: 'b', label: 'Bottle' }], value: function (d) { return h.volToDisplay(d.bottleMl); }, fmt: function (v) { return String(Math.round(v)); } });
    if (ds.some(function (d) { return d.pumpMl; })) html += barChart({ title: 'Pumped per day', sub: 'Total pumped, in ' + h.volUnit() + '.', days: ds, tone: 'c-feed', series: [{ key: 'p', label: 'Pumped' }], value: function (d) { return h.volToDisplay(d.pumpMl); }, fmt: function (v) { return String(Math.round(v)); } });
    html += growthCard();
    // Table view of the same numbers (accessibility + screen readers).
    html += '<details class="card more"><summary>Show as a table</summary><div class="tbl-wrap" tabindex="0" role="region" aria-label="Table (scrolls sideways)"><table class="tbl" style="margin-top:8px"><thead><tr><th>Day</th><th class="num">Feeds</th><th class="num">Wet</th><th class="num">Dirty</th><th class="num">Sleep</th></tr></thead><tbody>' +
      ds.slice().reverse().map(function (d) { return '<tr><td>' + h.dayLabel(d.start, now) + '</td><td class="num">' + d.feeds + '</td><td class="num">' + d.wet + '</td><td class="num">' + d.dirty + '</td><td class="num">' + h.hoursStr(d.sleepMs) + '</td></tr>'; }).join('') +
      '</tbody></table></div></details>';
    return html;
  }
  function stat(v, k) { return '<div class="stat"><div class="stat__v">' + v + '</div><div class="stat__k">' + k + '</div></div>'; }

  window.BabyViews = { quickEditor: quickEditor, quickIds: quickIds, ITEM_ORDER: ITEM_ORDER, moreActions: moreActions, today: today, history: history, trends: trends, checks: checks, reminderRows: reminderRows, dayStats: dayStats };
})();
