/* =========================================================
   Baby Log — views.js
   Today (dashboard), History (timeline) and Trends (charts).
   ========================================================= */
(function () {
  'use strict';

  var G = window.BabyGuide, S = window.BabyStore, App = window.BabyApp, h = App.h;
  var esc = h.esc, MIN = h.MIN, HOUR = h.HOUR, DAY = h.DAY;

  /* ======================= TODAY ======================= */

  function liveCards(now) {
    var t = S.timers(), out = '';
    if (t.breast) {
      var b = t.breast;
      out += '<div class="card live" aria-live="off"><div class="live__head"><span class="live__icon">🤱</span><div><div class="live__label"><span class="pulse"></span>' + (b.paused ? 'Feed paused' : 'Feeding · ' + (b.side === 'L' ? 'left' : 'right')) + '</div><div class="live__sub">started ' + h.fmtTime(b.start) + '</div></div><span class="live__clock" data-breast="T">0:00</span></div>' +
        '<div class="btn-row"><button class="btn btn--sm" data-action="breast-side" data-side="' + (b.side === 'L' ? 'R' : 'L') + '">⇄ Switch to ' + (b.side === 'L' ? 'right' : 'left') + '</button>' +
        '<button class="btn btn--sm" data-action="breast-pause">' + (b.paused ? '▶ Resume' : '⏸ Pause') + '</button>' +
        '<button class="btn btn--sm btn--primary" data-action="breast-finish">✓ Done</button></div></div>';
    }
    if (t.sleep) {
      out += '<div class="card live live--sleep"><div class="live__head"><span class="live__icon">😴</span><div><div class="live__label"><span class="pulse"></span>Asleep</div><div class="live__sub">since ' + h.fmtTime(t.sleep.start) + '</div></div><span class="live__clock" data-elapsed="' + t.sleep.start + '">0:00</span></div>' +
        '<button class="btn btn--primary btn--block" data-action="sleep-stop">☀️ Woke up</button></div>';
    }
    if (t.pump) {
      var p = t.pump, both = p.L.on && p.R.on;
      var state = p.done ? 'Pumping finished' : both ? 'Pumping · both sides' : p.L.on ? 'Pumping · left' : p.R.on ? 'Pumping · right' : 'Pumping paused';
      out += '<div class="card live"><div class="live__head"><span class="live__icon">🧴</span><div><div class="live__label">' + (p.done ? '' : '<span class="pulse"></span>') + state + '</div><div class="live__sub">L <span data-pump="L">0:00</span> · R <span data-pump="R">0:00</span></div></div><span class="live__clock" data-pump="T">0:00</span></div>' +
        (p.done ? '<button class="btn btn--primary btn--block" data-action="pump-finish">Enter amounts</button>'
          : '<div class="btn-row"><button class="btn btn--sm" data-action="pump-both">' + (both ? '⏸ Pause' : '▶▶ Both') + '</button><button class="btn btn--sm btn--primary" data-action="pump-finish">✓ Done</button></div>') + '</div>';
    }
    if (t.tummy) {
      out += '<div class="card live"><div class="live__head"><span class="live__icon">🤸</span><div><div class="live__label"><span class="pulse"></span>Tummy time</div><div class="live__sub">since ' + h.fmtTime(t.tummy.start) + '</div></div><span class="live__clock" data-elapsed="' + t.tummy.start + '">0:00</span></div>' +
        '<button class="btn btn--primary btn--block" data-action="tummy-stop">✓ Done</button></div>';
    }
    return out;
  }

  function tiles(now, days) {
    var b = S.baby(), out = [];

    // Feed
    var lf = S.lastFeedAnchor(), iv = S.feedIntervalH(now);
    var feedV, feedS;
    if (lf && lf.live) {
      var prev = S.last('feed', function (e) { return e.data.kind !== 'solids'; });
      feedV = prev ? '<span data-ago="' + prev.time + '">' + h.ago(prev.time, now) + '</span>' : '—';
      feedS = '<span class="tile__s">' + (prev ? 'Previous feed, ' + esc(h.describe(prev).title.toLowerCase()) : 'First feed in progress') + '</span>';
    }
    else if (lf) {
      var nextAt = lf.time + iv * HOUR, side = window.BabyForms.nextSide();
      feedV = '<span data-ago="' + lf.time + '">' + h.ago(lf.time, now) + '</span>';
      feedS = (nextAt <= now ? '<span class="tile__s tile__s--due">Due now (every ~' + G.fmtHours(iv) + ')</span>' : '<span class="tile__s">Next ~' + h.fmtTime(nextAt) + '</span>') +
        (side && b.feeding !== 'formula' ? '<span class="tile__s">Next side: <strong>' + (side === 'L' ? 'Left' : 'Right') + '</strong></span>' : '');
    } else { feedV = '—'; feedS = '<span class="tile__s">No feeds yet</span>'; }
    out.push(tile('feed', '🍼 Last feed', feedV, feedS));

    // Diaper
    var ld = S.last('diaper');
    out.push(tile('diaper', '🧷 Diaper', ld ? '<span data-ago="' + ld.time + '">' + h.ago(ld.time, now) + '</span>' : '—', '<span class="tile__s">' + (ld ? esc(h.describe(ld).title) : 'No changes yet') + '</span>'));

    // Sleep / wake window
    var t = S.timers(), sv, ss, sk = '😴 Sleep';
    if (t.sleep) { sk = '😴 Asleep'; sv = '<span data-since="' + t.sleep.start + '">' + h.since(now - t.sleep.start) + '</span>'; ss = '<span class="tile__s">Since ' + h.fmtTime(t.sleep.start) + '</span>'; }
    else {
      var woke = S.awakeSince(now);
      if (woke) {
        var nap = G.nextNap(days, woke, now);
        sk = '😴 Awake for'; sv = '<span data-since="' + woke + '">' + h.since(now - woke) + '</span>';
        ss = nap.state === 'early' ? '<span class="tile__s">Nap window ' + h.fmtTime(nap.from) + '–' + h.fmtTime(nap.to) + '</span>'
          : nap.state === 'window' ? '<span class="tile__s tile__s--ok">In the nap window now</span>'
          : '<span class="tile__s tile__s--due">Past wake window (' + nap.wake[1] + ' min)</span>';
      } else { sv = '—'; ss = '<span class="tile__s">Log a sleep to see wake windows</span>'; }
    }
    out.push(tile('sleep', sk, sv, ss));

    // Medicine if any in the last 24h, else tummy time.
    var lm = S.last('med');
    if (lm && now - lm.time < DAY) {
      var ms = S.medStatus(lm.data.medId === 'custom' ? 'custom:' + (lm.data.name || '').toLowerCase() : lm.data.medId, now);
      var mv = ms && ms.nextAt && ms.nextAt > now ? 'Next ' + h.fmtTime(ms.nextAt) : 'OK to give';
      if (ms && ms.nextAt && ms.nextAt <= now && ms.max && ms.count24 >= ms.max) mv = 'Daily max';
      out.push(tile('med', '💊 ' + esc(lm.data.name || 'Medicine'), mv, '<span class="tile__s">Last <span data-ago="' + lm.time + '">' + h.ago(lm.time, now) + '</span></span>'));
    } else {
      var goal = G.tummyGoalMin(days), done = Math.round(S.daySummary(S.startOfDay(now), now).tummyMs / MIN);
      if (goal) out.push(tile('tummy', '🤸 Tummy time', done + ' / ' + goal + ' min', '<span class="tile__s' + (done >= goal ? ' tile__s--ok' : '') + '">' + (done >= goal ? 'Goal reached today' : 'Today’s goal') + '</span>'));
      else {
        var lt = S.last('temp');
        out.push(tile('temp', '🌡️ Temperature', lt ? h.temp(lt.data.tempC) : '—', '<span class="tile__s">' + (lt ? h.ago(lt.time, now) : 'Not taken') + '</span>'));
      }
    }
    return '<div class="tiles">' + out.join('') + '</div>';
  }
  function tile(type, k, v, s) {
    return '<button class="tile" data-action="log" data-type="' + type + '"><span class="tile__k">' + k + '</span><span class="tile__v">' + v + '</span>' + s + '</button>';
  }

  // The seven things parents log most, plus "More" for the rest — two rows,
  // so they stay on screen even with a timer card above them.
  function quickItems(days) {
    var t = S.timers();
    var tummy = ['tummy', '🤸', t.tummy ? 'Stop tummy' : 'Tummy', !!t.tummy, 'tummy-toggle'];
    var solids = ['solids', '🥣', 'Solids', false, 'log-solids'];
    var main = [
      ['feed', '🍼', t.breast ? 'Feeding…' : 'Feed', !!t.breast, 'log'],
      ['diaper', '🧷', 'Diaper', false, 'log'],
      ['sleep', t.sleep ? '☀️' : '🌙', t.sleep ? 'Woke up' : 'Sleep', !!t.sleep, 'sleep-toggle'],
      G.tummyGoalMin(days) && days < 150 ? tummy : solids,
      ['pump', '🧴', t.pump ? 'Pumping…' : 'Pump', !!t.pump, 'log'],
      ['med', '💊', 'Medicine', false, 'log'],
      ['temp', '🌡️', 'Temp', false, 'log']
    ];
    var more = [
      main[3] === tummy ? solids : tummy,
      ['growth', '📏', 'Growth', false, 'log'],
      ['bath', '🛁', 'Bath', false, 'log'],
      ['milestone', '⭐', 'Milestone', false, 'log'],
      ['note', '📝', 'Note', false, 'log'],
      ['sounds', '🎶', 'Sleep sounds', !!window.BabySound.playing(), 'help-sounds']
    ];
    return { main: main, more: more };
  }
  function qaButtons(list) {
    return list.map(function (q) {
      return '<button class="qa' + (q[3] ? ' qa--on' : '') + '" data-action="' + q[4] + '" data-type="' + q[0] + '"><span class="qa__icon">' + q[1] + '</span><span class="qa__label">' + q[2] + '</span></button>';
    }).join('');
  }
  function quickActions(days) {
    var it = quickItems(days);
    var moreOn = it.more.some(function (q) { return q[3]; });
    return '<div class="qa-grid">' + qaButtons(it.main) +
      '<button class="qa' + (moreOn ? ' qa--on' : '') + '" data-action="log-more"><span class="qa__icon">➕</span><span class="qa__label">More</span></button></div>';
  }
  function moreActions(days) { return '<div class="qa-grid qa-grid--3">' + qaButtons(quickItems(days).more) + '</div>'; }

  // One-time tip: installing matters for notifications (iPhone) and for keeping logs (Safari).
  function installTip() {
    var P = App.platform;
    if (P.standalone || S.get().settings.installTipDismissed) return '';
    if (P.ios) return '<div class="card tipcard"><div class="tipcard__t">📲 Add Baby Log to your Home Screen</div><p class="muted small">In Safari, tap <strong>Share</strong> <span aria-hidden="true">⬆︎</span> then <strong>Add to Home Screen</strong>, and open it from the new icon. On iPhone that’s what lets reminders arrive as notifications — and it stops Safari clearing your logs if you don’t visit for a week.</p><div class="btn-row"><button class="btn btn--sm" data-action="install-dismiss">Got it</button></div></div>';
    if (App.installPrompt) return '<div class="card tipcard"><div class="tipcard__t">📲 Install Baby Log</div><p class="muted small">Opens like an app, works offline, and sends reminders as notifications.</p><div class="btn-row"><button class="btn btn--sm" data-action="install-dismiss">Not now</button><button class="btn btn--sm btn--primary" data-action="install-prompt">Install</button></div></div>';
    return '';
  }

  // "Is baby getting enough?" — the last 24 hours against age norms.
  function checks(now, days) {
    var b = S.baby(), s = S.last24(now);
    var feed = G.feedingFor(days, b.feeding), dia = G.diapersFor(days), sl = G.sleepFor(days), tg = G.tummyGoalMin(days);
    var first = S.events()[0];
    var partial = !first || now - first.time < DAY;
    var rows = [];
    function row(icon, label, value, target, max, unit, noteText, show) {
      if (show === false) return;
      var pct = target ? Math.min(100, (value / target) * 100) : 100;
      var level = !target ? 'info' : value >= target ? 'ok' : partial ? 'info' : 'warn';
      var fillCls = level === 'ok' ? ' check__fill--ok' : level === 'warn' ? ' check__fill--warn' : '';
      rows.push('<div class="check"><span class="check__icon">' + icon + '</span><span class="check__k">' + label + '</span><span class="check__v">' + value + unit + (target ? ' <span class="faint">/ ' + (max ? target + '–' + max : target + '+') + unit + '</span>' : '') + '</span>' +
        '<div class="check__bar" role="img" aria-label="' + esc(label + ': ' + value + ' of ' + target) + '"><div class="check__fill' + fillCls + '" style="width:' + pct + '%"></div></div>' +
        (noteText ? '<div class="check__note">' + noteText + '</div>' : '') + '</div>');
    }
    var sleepH = Math.round(s.sleepMs / HOUR * 10) / 10;
    row('🍼', 'Feeds', s.feeds, feed.perDay[0], feed.perDay[1], '', s.bottleMl ? 'Bottles: ' + h.vol(s.bottleMl) + (s.breastMs ? ' · breast ' + h.durMs(s.breastMs) : '') : (s.breastMs ? 'Breast: ' + h.durMs(s.breastMs) + ' total' : ''));
    row('💧', 'Wet diapers', s.wet, dia.wet, 0, '', days < 5 ? 'Day ' + (days + 1) + ' of life: expect at least ' + dia.wet + '. From day 5, 6+ a day.' : 'Pale yellow pee is a good sign of enough milk.');
    row('💩', 'Dirty diapers', s.dirty, dia.dirty, 0, '', esc(dia.dirtyNote));
    row('😴', 'Sleep', sleepH, sl.totalH[0], sl.totalH[1], 'h', 'Only counts sleeps you’ve logged.');
    row('🤸', 'Tummy time', Math.round(s.tummyMs / MIN), tg, 0, ' min', '', tg > 0);
    var html = '<div class="checks">' + rows.join('') + '</div>';
    if (partial) html += '<p class="faint" style="margin-top:12px">' + (first ? 'You started logging ' + h.ago(first.time, now) + ' — this check is complete after a full 24 hours.' : 'Log feeds, diapers and sleep and this fills in.') + '</p>';
    else {
      var low = [];
      if (s.wet < dia.wet) low.push('wet diapers');
      if (s.feeds < feed.perDay[0]) low.push('feeds');
      if (low.length) html += '<div style="margin-top:12px">' + h.note('warn', 'Fewer ' + low.join(' and ') + ' than usual', 'Missed logging some? If not — and especially with fewer wet diapers, sleepiness at feeds or dark pee — call your pediatrician or a lactation consultant today.') + '</div>';
      else html += '<div style="margin-top:12px">' + h.note('ok', 'Looking good', 'Feeds and wet diapers are in the expected range for ' + esc(G.ageLabel(days).toLowerCase()) + '.') + '</div>';
    }
    return html;
  }

  function reminderRows(list, now) {
    if (!list.length) return '<div class="empty"><span class="empty__icon">🔕</span>No reminders coming up.</div>';
    return '<div class="rows">' + list.map(function (r) {
      var overdue = r.at <= now;
      return '<div class="row' + (r.done ? ' row--done' : '') + '"><span class="row__icon">' + r.icon + '</span><div class="row__main"><div class="row__t">' + esc(r.title) + '</div><div class="row__s">' + esc(r.text) + '</div></div>' +
        '<div class="row__time"><strong>' + h.fmtTime(r.at) + '</strong><span data-until="' + r.at + '">' + h.until(r.at, now) + '</span>' +
        (overdue ? '<br><button class="btn btn--link btn--sm" data-action="snooze" data-key="' + esc(r.key) + '" data-at="' + r.at + '">Snooze 15m</button>' : '') + '</div></div>';
    }).join('') + '</div>';
  }

  function timelineRows(list, now) {
    if (!list.length) return '<div class="empty"><span class="empty__icon">🗒️</span>Nothing logged yet today. Tap a button above to start.</div>';
    return '<div class="rows">' + list.map(function (e) {
      var d = h.describe(e, now);
      return '<button class="row' + (d.flag ? ' row--flag' : '') + '" data-action="edit" data-id="' + e.id + '"><span class="row__icon">' + d.icon + '</span><div class="row__main"><div class="row__t">' + esc(d.title) + (d.flag ? ' ⚠️' : '') + '</div><div class="row__s">' + esc(d.sub || ' ') + '</div></div>' +
        '<div class="row__time"><strong>' + h.fmtTime(e.time) + '</strong>' + h.ago(e.end || e.time, now) + '</div></button>';
    }).join('') + '</div>';
  }

  function today() {
    var now = Date.now(), days = S.ageDays(now), b = S.baby();
    var rem = S.reminders(now).filter(function (r) { return !r.done; }).slice(0, 4);
    var todays = S.events({ from: S.startOfDay(now) }).filter(function (e) { return e.time >= S.startOfDay(now); }).reverse();
    return liveCards(now) +
      quickActions(days) +
      tiles(now, days) +
      '<button class="cry-cta" data-action="help" data-topic="cry"><span class="cry-cta__icon">😭</span><span class="cry-cta__t">Crying? See the likely reasons</span><span class="cry-cta__go">›</span></button>' +
      installTip() +
      '<div class="section-title">Last 24 hours <button class="btn--link" data-action="help" data-topic="enough">What’s normal?</button></div>' +
      '<div class="card">' + checks(now, days) + '</div>' +
      '<div class="section-title">Coming up <button class="btn--link" data-action="go" data-view="settings" data-focus="reminders">Manage</button></div>' +
      '<div class="card">' + reminderRows(rem, now) + '</div>' +
      '<div class="section-title">Today <button class="btn--link" data-action="go" data-view="log">All history</button></div>' +
      '<div class="card">' + timelineRows(todays.slice(0, 10), now) +
      (todays.length > 10 ? '<button class="btn btn--link btn--block" data-action="go" data-view="log">See all ' + todays.length + ' entries today</button>' : '') + '</div>';
  }

  /* ======================= HISTORY ======================= */
  var FILTERS = [['all', 'All'], ['feed', '🍼 Feeds'], ['diaper', '🧷 Diapers'], ['sleep', '😴 Sleep'], ['pump', '🧴 Pump'], ['med', '💊 Meds'], ['temp', '🌡️ Temp'], ['growth', '📏 Growth'], ['tummy', '🤸 Tummy'], ['milestone', '⭐ Milestones'], ['note', '📝 Notes'], ['bath', '🛁 Baths']];

  function history() {
    var ui = App.ui, now = Date.now();
    var from = S.startOfDay(now) - (ui.historyDays - 1) * DAY;
    var list = S.events({ from: from, type: ui.historyType === 'all' ? null : ui.historyType }).filter(function (e) { return e.time >= from; }).reverse();
    var html = '<h1 class="h1">History</h1>' +
      '<div class="btn-row"><button class="btn btn--sm" data-action="add-past">＋ Add past entry</button><button class="btn btn--sm" data-action="handoff">📤 Share summary</button></div>' +
      '<div class="chips chips--scroll" role="toolbar" aria-label="Filter">' + FILTERS.map(function (f) { return '<button class="chip" data-action="hist-filter" data-type="' + f[0] + '" aria-pressed="' + (ui.historyType === f[0]) + '">' + f[1] + '</button>'; }).join('') + '</div>';
    if (!list.length) return html + '<div class="card"><div class="empty"><span class="empty__icon">🗒️</span>Nothing here for the last ' + h.plural(ui.historyDays, 'day') + '.</div></div>';
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
      return '<div class="bars__col" tabindex="0" data-tip="' + esc(tip) + '">' + (showVal && tot ? '<span class="bars__val">' + o.fmt(tot) + '</span>' : '') + segs + '</div>';
    }).join('');
    var band = o.band ? '<div class="bars__band" style="bottom:' + (o.band[0] / max * 100) + '%;height:' + ((o.band[1] - o.band[0]) / max * 100) + '%"></div>' : '';
    var every = o.days.length > 14 ? 5 : 1; // thin out labels on the 30-day view
    var labels = o.days.map(function (d, i) { var last = i === o.days.length - 1; return '<span>' + (last || (o.days.length - 1 - i) % every === 0 ? h.shortDay(d.start) : '') + '</span>'; }).join('');
    var legend = o.series.length > 1 ? '<div class="legend">' + o.series.map(function (s) { return '<span><i style="background:var(--' + (s.cls === 'bar--2' ? 'series-2' : 'series-1') + ')"></i>' + s.label + '</span>'; }).join('') + '</div>' : '';
    return '<div class="card chart"><div class="chart__title">' + o.title + '</div><div class="chart__sub">' + o.sub + '</div>' + legend +
      '<div class="bars" role="img" aria-label="' + esc(o.title) + '">' + band + cols + '</div><div class="bars__labels" aria-hidden="true">' + labels + '</div></div>';
  }

  function dayMap(n, now) {
    var d0 = S.startOfDay(now), rows = [];
    var sleeps = S.events({ type: 'sleep', from: d0 - n * DAY });
    var feeds = S.events({ type: 'feed', from: d0 - n * DAY }).filter(function (e) { return e.data.kind !== 'solids'; });
    var t = S.timers();
    if (t.sleep) sleeps = sleeps.concat([{ time: t.sleep.start, end: now }]);
    for (var i = n - 1; i >= 0; i--) {
      var start = S.startOfDay(d0 - i * DAY + 2 * HOUR), end = start + DAY;
      var segs = sleeps.map(function (e) {
        var s = Math.max(e.time, start), en = Math.min(e.end || now, end);
        if (en <= s) return '';
        return '<span class="daymap__sleep" style="left:' + ((s - start) / DAY * 100) + '%;width:' + Math.max(0.4, (en - s) / DAY * 100) + '%" data-tip="Sleep ' + h.fmtTime(e.time) + '–' + h.fmtTime(e.end || now) + ' (' + h.durMs((e.end || now) - e.time) + ')"></span>';
      }).join('');
      var ticks = feeds.filter(function (e) { return e.time >= start && e.time < end; }).map(function (e) {
        return '<span class="daymap__feed" style="left:' + ((e.time - start) / DAY * 100) + '%" data-tip="' + esc(h.describe(e).title + ' at ' + h.fmtTime(e.time)) + '"></span>';
      }).join('');
      rows.push('<div class="daymap__row"><span class="daymap__label">' + h.shortDay(start, now) + '</span><div class="daymap__track">' + segs + ticks + '</div></div>');
    }
    return '<div class="card chart"><div class="chart__title">Daily rhythm</div><div class="chart__sub">Each row is one day, midnight to midnight. Watch night sleep join up over the weeks.</div>' +
      '<div class="legend"><span><i style="background:var(--series-1)"></i>Sleep</span><span><i style="background:var(--series-2)"></i>Feed</span></div>' +
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
        '<path d="' + d + '" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />' +
        pts.map(function (p) { return '<circle cx="' + X(p.t).toFixed(1) + '" cy="' + Y(p.w).toFixed(1) + '" r="4.5" fill="var(--series-1)" stroke="var(--bg-1)" stroke-width="2" tabindex="0" data-tip="' + esc((p.birth ? 'Birth' : h.fmtDate(p.t)) + ': ' + h.weight(p.w)) + '" />'; }).join('') + '</svg>';
    }
    var rowsH = g.slice().reverse().slice(0, 8).map(function (e) {
      return '<tr><td>' + h.fmtDate(e.time) + '</td><td class="num">' + (e.data.weightKg ? h.weight(e.data.weightKg) : '—') + '</td><td class="num">' + (e.data.lengthCm ? h.len(e.data.lengthCm) : '—') + '</td><td class="num">' + (e.data.headCm ? h.len(e.data.headCm) : '—') + '</td></tr>';
    }).join('');
    return '<div class="card chart"><div class="chart__title">Growth</div><div class="chart__sub">Weight' + (b.birthWeightKg ? ' since birth (' + h.weight(b.birthWeightKg) + ')' : '') + '. Your pediatrician plots this on WHO growth charts at check-ups.</div>' + svg +
      (rowsH ? '<table class="tbl"><thead><tr><th>Date</th><th class="num">Weight</th><th class="num">Length</th><th class="num">Head</th></tr></thead><tbody>' + rowsH + '</tbody></table>' : '') +
      '<button class="btn btn--sm" data-action="log" data-type="growth" style="margin-top:10px">＋ Add measurement</button></div>';
  }

  function trends() {
    var now = Date.now(), n = App.ui.trendDays, days = S.ageDays(now), b = S.baby();
    var ds = dayStats(n, now);
    var full = ds.filter(function (d) { return d.hasData && d.start < S.startOfDay(now); });
    var avg = function (f) { return full.length ? full.reduce(function (a, d) { return a + f(d); }, 0) / full.length : null; };
    var sleeps = S.events({ type: 'sleep', from: now - n * DAY }).filter(function (e) { return e.end; });
    var longest = sleeps.reduce(function (m, e) { return Math.max(m, e.end - e.time); }, 0);
    var sl = G.sleepFor(days), feed = G.feedingFor(days, b.feeding);
    var html = '<h1 class="h1">Trends</h1>' +
      '<div class="chips" role="toolbar" aria-label="Range">' + [7, 14, 30].map(function (k) { return '<button class="chip" data-action="trend-range" data-days="' + k + '" aria-pressed="' + (n === k) + '">' + k + ' days</button>'; }).join('') + '</div>';
    var aSleep = avg(function (d) { return d.sleepMs; }), aFeeds = avg(function (d) { return d.feeds; }), aWet = avg(function (d) { return d.wet; });
    html += '<div class="stats">' +
      stat(aSleep != null ? h.hoursStr(aSleep) : '—', 'Avg sleep / day') +
      stat(longest ? h.durMs(longest) : '—', 'Longest stretch') +
      stat(aFeeds != null ? Math.round(aFeeds * 10) / 10 : '—', 'Avg feeds / day') +
      '</div>';
    if (!full.length) html += h.note('info', 'Trends need a full day of logs', 'Averages use complete days only, so they’ll appear from tomorrow. The charts below already include today.');
    if (n <= 14) html += dayMap(n, now);
    html += barChart({ title: 'Sleep per day', sub: 'Green band: typical ' + sl.totalH[0] + '–' + sl.totalH[1] + 'h for ' + sl.label.toLowerCase() + '.', days: ds, series: [{ key: 'sleep', label: 'Sleep' }], value: function (d) { return d.sleepMs / HOUR; }, fmt: function (v) { return (Math.round(v * 10) / 10) + 'h'; }, band: sl.totalH });
    html += barChart({ title: 'Feeds per day', sub: 'Green band: typical ' + feed.perDay[0] + '–' + feed.perDay[1] + ' at ' + feed.label.toLowerCase() + '.', days: ds, series: [{ key: 'feeds', label: 'Feeds' }], value: function (d) { return d.feeds; }, fmt: function (v) { return String(v); }, band: feed.perDay });
    html += barChart({ title: 'Diapers per day', sub: 'Wet and dirty changes (a “both” counts once in each).' + (aWet != null ? ' Average wet: ' + Math.round(aWet * 10) / 10 + '.' : ''), days: ds, series: [{ key: 'wet', label: 'Wet' }, { key: 'dirty', label: 'Dirty', cls: 'bar--2' }], value: function (d, k) { return d[k]; }, fmt: function (v) { return String(v); } });
    if (ds.some(function (d) { return d.bottleMl; })) html += barChart({ title: 'Bottle volume per day', sub: 'Total from logged bottles, in ' + h.volUnit() + '.', days: ds, series: [{ key: 'b', label: 'Bottle' }], value: function (d) { return h.volToDisplay(d.bottleMl); }, fmt: function (v) { return String(Math.round(v)); } });
    if (ds.some(function (d) { return d.pumpMl; })) html += barChart({ title: 'Pumped per day', sub: 'Total pumped, in ' + h.volUnit() + '.', days: ds, series: [{ key: 'p', label: 'Pumped' }], value: function (d) { return h.volToDisplay(d.pumpMl); }, fmt: function (v) { return String(Math.round(v)); } });
    html += growthCard();
    // Table view of the same numbers (accessibility + screen readers).
    html += '<details class="card more"><summary>Show as a table</summary><table class="tbl" style="margin-top:8px"><thead><tr><th>Day</th><th class="num">Feeds</th><th class="num">Wet</th><th class="num">Dirty</th><th class="num">Sleep</th></tr></thead><tbody>' +
      ds.slice().reverse().map(function (d) { return '<tr><td>' + h.dayLabel(d.start, now) + '</td><td class="num">' + d.feeds + '</td><td class="num">' + d.wet + '</td><td class="num">' + d.dirty + '</td><td class="num">' + h.hoursStr(d.sleepMs) + '</td></tr>'; }).join('') +
      '</tbody></table></details>';
    return html;
  }
  function stat(v, k) { return '<div class="stat"><div class="stat__v">' + v + '</div><div class="stat__k">' + k + '</div></div>'; }

  window.BabyViews = { moreActions: moreActions, today: today, history: history, trends: trends, checks: checks, reminderRows: reminderRows, dayStats: dayStats };
})();
