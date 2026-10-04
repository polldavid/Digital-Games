/* =========================================================
   Baby Log — app.js
   Boot, navigation, actions, the reminder/notification loop,
   settings, multiple babies, and backup/import/share.
   ========================================================= */
(function () {
  'use strict';

  var G = window.BabyGuide, S = window.BabyStore, Snd = window.BabySound;
  var App = window.BabyApp, h = App.h, F = window.BabyForms, V = window.BabyViews, Help = window.BabyHelp;
  var $ = h.$, $all = h.$all, esc = h.esc, MIN = h.MIN, HOUR = h.HOUR, DAY = h.DAY;
  var swReg = null;

  /* =====================================================
     Render
     ===================================================== */
  function commit() { S.save(); syncAlerts(); render(); if (App.ui.sheet) h.renderSheet(); }
  App.commit = commit;

  function render() {
    var b = S.baby();
    $('#welcome').hidden = !!b;
    $('#app').hidden = !b;
    if (!b) return;
    var days = S.ageDays(Date.now());
    $('#babychip').innerHTML = '<span class="babychip__emoji">' + esc(b.emoji || '👶') + '</span><span class="babychip__text"><span class="babychip__name">' + esc(b.name) + '</span><span class="babychip__age">' + esc(G.ageLabel(days)) + '</span></span>' + (S.get().babies.length > 1 ? '<span class="babychip__caret">▼</span>' : '');
    var v = App.ui.view;
    $all('.view').forEach(function (n) { n.hidden = n.id !== 'view-' + v; });
    $all('.tab').forEach(function (t) { var on = t.getAttribute('data-view') === v; t.classList.toggle('tab--active', on); if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    var el = $('#view-' + v);
    el.innerHTML = v === 'today' ? V.today() : v === 'log' ? V.history() : v === 'trends' ? V.trends() : v === 'help' ? Help.view() : settingsView();
    renderBanner();
    h.tick();
  }
  App.render = render;

  // Refresh "x min ago"-style text without fighting the user's input.
  function softRender() {
    if (App.ui.sheet || !S.baby()) return;
    var a = document.activeElement;
    if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
    if (App.ui.view === 'today' || App.ui.view === 'trends') {
      var y = window.scrollY; render(); window.scrollTo(0, y);
    }
  }

  /* =====================================================
     Reminders & notifications
     ===================================================== */
  function checkReminders() {
    var st = S.get(), now = Date.now(), changed = false;
    st.babies.forEach(function (b) {
      S.due(now, b.id).forEach(function (r) {
        S.markFired(r); changed = true;
        r.baby = b.id;
        if (now - r.at < 6 * HOUR) raiseAlert(r, b); // don't nag about things long past
      });
    });
    if (changed) { S.save(); renderBanner(); if (App.ui.view === 'today' && !App.ui.sheet) softRender(); }
  }

  // No sounds while any baby is asleep, or at night if the parent asked for quiet.
  function quietNow() {
    var st = S.get(), hr = new Date().getHours();
    if (st.babies.some(function (b) { return S.isAsleep(b.id); })) return true;
    return !!st.settings.quietNight && (hr >= 22 || hr < 7);
  }

  function raiseAlert(r, b) {
    var st = S.get().settings, many = S.get().babies.length > 1, quiet = quietNow();
    var title = r.icon + ' ' + r.title + (many ? ' · ' + b.name : '');
    if (st.notify && 'Notification' in window && Notification.permission === 'granted') {
      var opts = { body: r.text, tag: r.key, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', renotify: true, silent: quiet, vibrate: [200, 100, 200], data: { url: location.href } };
      try {
        if (swReg && swReg.showNotification) swReg.showNotification(title, opts);
        else new Notification(title, opts);
      } catch (e) { /* some browsers only allow SW notifications */ }
    }
    if (st.chime && !quiet) Snd.chime();
    if (navigator.vibrate) try { navigator.vibrate([200, 100, 200]); } catch (e) {}
    App.ui.alerts = App.ui.alerts.filter(function (a) { return a.key !== r.key; });
    App.ui.alerts.unshift(r);
  }

  // Drop alerts that no longer apply (e.g. a feed was logged, so "feed due" is gone).
  function syncAlerts() {
    var now = Date.now();
    App.ui.alerts = App.ui.alerts.filter(function (a) {
      if (!S.baby(a.baby)) return false;
      var cur = S.reminders(now, a.baby).filter(function (r) { return r.key === a.key; })[0];
      return cur && cur.at <= now;
    });
  }

  function renderBanner() {
    var el = $('#banner'), a = App.ui.alerts[0];
    var badge = $('#bell-badge');
    badge.hidden = !App.ui.alerts.length; badge.textContent = App.ui.alerts.length;
    if (!a) { el.hidden = true; el.innerHTML = ''; return; }
    var b = S.baby(a.baby), many = S.get().babies.length > 1;
    var act = { feed: ['Log feed', 'log', 'feed'], diaper: ['Log change', 'log', 'diaper'], nap: ['Start sleep', 'sleep-start', ''], med: ['Log dose', 'log', 'med'], vitd: ['Log it', 'log-vitd', ''], tummy: ['Start', 'tummy-start', ''] }[a.kind];
    el.hidden = false;
    el.innerHTML = '<span class="banner__icon">' + a.icon + '</span><div class="banner__text"><div class="banner__title">' + esc(a.title) + (many && b ? ' · ' + esc(b.name) : '') + '</div><div class="banner__sub">' + esc(a.text) + '</div></div>' +
      '<div class="banner__actions">' + (act ? '<button class="btn btn--sm btn--primary" data-action="alert-act" data-key="' + esc(a.key) + '" data-do="' + act[1] + '" data-type="' + act[2] + '">' + act[0] + '</button>' : '') +
      '<button class="btn btn--sm" data-action="snooze" data-key="' + esc(a.key) + '">Snooze 15m</button>' +
      '<button class="btn btn--sm btn--ghost" data-action="alert-dismiss" data-key="' + esc(a.key) + '">Dismiss</button></div>';
  }

  function requestNotify() {
    if (!('Notification' in window)) { h.toast('This browser doesn’t support notifications — in-app alerts and the chime still work.'); return; }
    Notification.requestPermission().then(function (p) {
      S.get().settings.notify = p === 'granted';
      commit();
      h.toast(p === 'granted' ? 'Notifications on 🔔' : 'Notifications blocked — you can allow them in your browser’s site settings.');
      if (p === 'granted' && swReg) try { swReg.showNotification('🔔 Baby Log', { body: 'Reminders will show up like this.', tag: 'test', icon: 'icons/icon-192.png' }); } catch (e) {}
    });
  }

  /* =====================================================
     Timers
     ===================================================== */
  function sleepStart() {
    if (S.isAsleep()) return;
    if (S.timers().tummy) tummyStop(true);
    S.startTimer('sleep');
    commit();
    h.toast('Sleep timer started 🌙', { label: 'Undo', fn: function () { S.stopTimer('sleep'); commit(); } });
  }
  function sleepStop() {
    var t = S.stopTimer('sleep');
    if (!t) return;
    var now = Date.now();
    if (now - t.start < MIN) { commit(); h.toast('Under a minute — not saved.'); return; }
    var e = S.addEvent({ type: 'sleep', time: t.start, end: now, data: {} });
    commit();
    h.toast('Slept ' + h.durMs(now - t.start) + ' ☀️', { label: 'Undo', fn: function () { S.removeEvent(e.id); S.timers().sleep = t; commit(); } });
  }
  function tummyStart() { if (S.isAsleep()) { h.toast('Baby is asleep — wake-time only for tummy time.'); return; } S.startTimer('tummy'); commit(); }
  function tummyStop(quiet) {
    var t = S.stopTimer('tummy');
    if (!t) return;
    var now = Date.now();
    if (now - t.start >= 30000) S.addEvent({ type: 'tummy', time: t.start, end: now, data: {} });
    if (!quiet) { commit(); h.toast('Tummy time: ' + h.durMs(now - t.start) + ' 💪'); }
  }
  function breastFinish() {
    var b = S.timers().breast;
    if (!b) return;
    var now = Date.now(), tt = S.breastTotals(b, now);
    S.stopTimer('breast');
    if (tt.total < 30000) { commit(); h.closeSheet(); h.toast('Under 30 seconds — not saved.'); return; }
    var e = S.addEvent({ type: 'feed', time: b.start, end: now, data: { kind: 'breast', left: tt.L, right: tt.R, startSide: b.firstSide || b.side } });
    h.closeSheet();
    commit();
    h.toast('Feed saved · ' + h.durMs(tt.total), { label: 'Undo', fn: function () { S.removeEvent(e.id); S.timers().breast = b; commit(); } });
  }

  /* =====================================================
     Settings view
     ===================================================== */
  function settingsView() {
    var st = S.get(), s = st.settings, b = S.baby(), days = S.ageDays(Date.now());
    var autoH = G.feedingFor(days, b.feeding).intervalH + (b.feeding === 'formula' && days >= 7 ? 0.5 : 0);
    var perm = !('Notification' in window) ? 'unsupported' : Notification.permission;
    var row = function (t, sub, ctrl) { return '<div class="set-row"><div class="set-row__main"><div class="set-row__t">' + t + '</div>' + (sub ? '<div class="set-row__s">' + sub + '</div>' : '') + '</div>' + ctrl + '</div>'; };
    var sel = function (key, opts, cur) { return '<select class="input" data-setting="' + key + '" aria-label="' + key + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; };
    var html = '<h1 class="h1">Settings</h1>';

    // Babies
    html += '<div class="section-title">Babies</div><div class="card"><div class="rows">' + st.babies.map(function (x) {
      return '<button class="row" data-action="baby-edit" data-id="' + x.id + '"><span class="row__icon">' + esc(x.emoji || '👶') + '</span><div class="row__main"><div class="row__t">' + esc(x.name) + (x.id === st.activeBaby ? ' <span class="status status--ok">Active</span>' : '') + '</div><div class="row__s">' + esc(G.ageLabel(G.ageInDays(x.birth))) + ' · ' + ({ breast: 'Breastfed', formula: 'Formula', mixed: 'Breast + formula' })[x.feeding] + '</div></div><span class="faint">Edit ›</span></button>';
    }).join('') + '</div><button class="btn btn--sm" data-action="baby-add" style="margin-top:8px">＋ Add a baby (twins, siblings)</button></div>';

    // Reminders
    html += '<div class="section-title" id="set-reminders">Reminders</div><div class="card">' +
      row('Phone notifications', perm === 'granted' && s.notify ? 'On — alerts show even when you’re in another app.' : perm === 'denied' ? 'Blocked in browser settings. In-app alerts still work.' : perm === 'unsupported' ? (App.platform.ios && !App.platform.standalone ? 'On iPhone, add Baby Log to your Home Screen first (Share → Add to Home Screen), then open it from there.' : 'Not supported here. In-app alerts and the chime still work.') : 'Get alerts while you’re in another app.',
        perm === 'granted' ? h.sw('notify', s.notify, 'Notifications') : perm === 'default' ? '<button class="btn btn--sm btn--primary" data-action="notify-enable">Turn on</button>' : '') +
      row('Chime', 'A soft two-note sound with each reminder. Never plays while a baby is asleep.', h.sw('chime', s.chime, 'Chime')) +
      row('Quiet at night', '10 pm – 7 am: vibrate and banner only, no sound.', h.sw('quietNight', s.quietNight, 'Quiet at night')) +
      row('🍼 Next feed', 'Counted from the start of the last feed.', h.sw('feedRemind', s.feedRemind, 'Feed reminder')) +
      (s.feedRemind ? row('&nbsp;&nbsp;&nbsp;Every', '', sel('feedIntervalH', [[0, 'Auto (~' + G.fmtHours(autoH) + ')'], [1.5, '1½ hours'], [2, '2 hours'], [2.5, '2½ hours'], [3, '3 hours'], [3.5, '3½ hours'], [4, '4 hours'], [5, '5 hours'], [6, '6 hours']], s.feedIntervalH)) : '') +
      row('🧷 Diaper check', 'After the last change.', h.sw('diaperRemind', s.diaperRemind, 'Diaper reminder')) +
      (s.diaperRemind ? row('&nbsp;&nbsp;&nbsp;Every', '', sel('diaperIntervalH', [[2, '2 hours'], [3, '3 hours'], [4, '4 hours']], s.diaperIntervalH)) : '') +
      row('😴 Nap window', 'When baby has been awake for a typical wake window.', h.sw('napRemind', s.napRemind, 'Nap reminder')) +
      row('☀️ Vitamin D drops', 'Daily — skipped if already logged.', h.sw('vitdRemind', s.vitdRemind, 'Vitamin D reminder')) +
      (s.vitdRemind ? row('&nbsp;&nbsp;&nbsp;At', '', '<input class="input" type="time" data-setting="vitdTime" value="' + esc(s.vitdTime) + '" aria-label="Vitamin D time" />') : '') +
      row('🤸 Tummy time', 'Daily nudge if under today’s goal.', h.sw('tummyRemind', s.tummyRemind, 'Tummy reminder')) +
      (s.tummyRemind ? row('&nbsp;&nbsp;&nbsp;At', '', '<input class="input" type="time" data-setting="tummyTime" value="' + esc(s.tummyTime) + '" aria-label="Tummy time reminder time" />') : '') +
      '<div class="section-title" style="margin-top:14px">Your reminders</div>' + customList() +
      '<button class="btn btn--sm" data-action="custom-add" style="margin-top:8px">＋ New reminder</button>' +
      '<p class="faint" style="margin-top:12px">Reminders fire while Baby Log is open or in the background. Phones may pause web apps that are fully closed, so for night feeds add Baby Log to your Home Screen and leave it open on the nightstand.</p></div>';

    // Units
    html += '<div class="section-title">Units</div><div class="card">' +
      row('Volume', '', sel('volume', [['ml', 'ml'], ['oz', 'fl oz']], s.volume)) +
      row('Temperature', '', sel('temp', [['C', '°C'], ['F', '°F']], s.temp)) +
      row('Weight & length', '', sel('length', [['cm', 'kg · cm'], ['in', 'lb · in']], s.length)) + '</div>';

    // Data
    html += '<div class="section-title">Your data</div><div class="card">' +
      row('Share a summary', 'The last 24 hours as text — for a partner, sitter or doctor.', '<button class="btn btn--sm" data-action="handoff">Share</button>') +
      row('Back up / move to another phone', 'Download everything as a file. Import it on the other phone to merge logs.', '<button class="btn btn--sm" data-action="export-json">Export</button>') +
      row('Import a backup', 'Merges entries — nothing is overwritten.', '<button class="btn btn--sm" data-action="import-open">Import</button>') +
      row('Spreadsheet (CSV)', 'For your pediatrician or your own analysis.', '<button class="btn btn--sm" data-action="export-csv">CSV</button>') +
      row('Erase everything', 'Deletes all babies and logs from this device.', '<button class="btn btn--sm btn--danger" data-action="erase">Erase</button>') +
      '<p class="faint" style="margin-top:10px">Private by design: no account, no tracking, no server. Your logs never leave this device unless you export them.</p></div>';

    html += '<p class="disclaimer">Baby Log gives general information from AAP, CDC, WHO and NHS guidance — it is not medical advice. Always call your pediatrician if you’re worried.<br><a href="../">← All games &amp; tools</a></p>';
    return html;
  }

  function customList() {
    var list = S.get().custom.filter(function (r) { return r.baby === S.get().activeBaby; });
    if (!list.length) return '<p class="faint">e.g. “Give antibiotic” every 8 hours, “Call pediatrician” at 9:00, or “Sterilise bottles” daily.</p>';
    var now = Date.now(), rem = S.reminders(now);
    return '<div class="rows">' + list.map(function (r) {
      var next = rem.filter(function (x) { return x.customId === r.id; })[0];
      var when = r.repeat === 'daily' ? 'Daily at ' + r.time : r.repeat === 'every' ? 'Every ' + r.everyH + 'h' : 'Once · ' + h.fmtDate(r.at) + ' ' + h.fmtTime(r.at);
      return '<button class="row" data-action="custom-edit" data-id="' + r.id + '"><span class="row__icon">' + esc(r.icon || '🔔') + '</span><div class="row__main"><div class="row__t">' + esc(r.label) + '</div><div class="row__s">' + esc(when) + (next && !next.done ? ' · next ' + h.fmtTime(next.at) : next && next.done ? ' · done' : '') + '</div></div><span class="faint">Edit ›</span></button>';
    }).join('') + '</div>';
  }

  /* ---------- Baby profile sheet ---------- */
  var EMOJIS = ['👶', '🍼', '🐣', '🧸', '🌸', '⭐', '🐻', '🦁', '🐰', '🌈'];
  function babySheet(id) {
    var b = id ? S.baby(id) : null;
    h.openSheet({
      title: b ? 'Edit ' + b.name : 'Add a baby',
      html: function () {
        return '<form class="form" id="baby-form"' + (b ? ' data-id="' + b.id + '"' : '') + ' autocomplete="off">' +
          '<label class="field"><span class="field__label">Name</span><input class="input" name="name" required maxlength="30" value="' + esc(b ? b.name : '') + '" /></label>' +
          '<label class="field"><span class="field__label">Date of birth</span><input class="input" type="date" name="birth" required max="' + h.todayISO() + '" value="' + esc(b ? b.birth : '') + '" /></label>' +
          '<div class="field"><span class="field__label">Feeding</span><div class="seg">' + [['breast', 'Breast'], ['formula', 'Formula'], ['mixed', 'Both']].map(function (o) { return '<label><input type="radio" name="feeding" value="' + o[0] + '"' + ((b ? b.feeding : 'breast') === o[0] ? ' checked' : '') + ' /><span>' + o[1] + '</span></label>'; }).join('') + '</div></div>' +
          '<label class="field"><span class="field__label">Birth weight (' + h.weightUnit() + ', optional)</span><input class="input" type="number" step="any" min="0" inputmode="decimal" name="bw" value="' + (b && b.birthWeightKg ? h.weightToDisplay(b.birthWeightKg) : '') + '" /></label>' +
          '<div class="field"><span class="field__label">Icon</span><div class="chips">' + EMOJIS.map(function (e) { return '<label class="chip"><input type="radio" name="emoji" value="' + e + '"' + ((b ? b.emoji : '👶') === e ? ' checked' : '') + ' style="display:none" />' + e + '</label>'; }).join('') + '</div></div>' +
          '<div class="btn-row sheet-save">' + (b ? '<button type="button" class="btn btn--danger" data-action="baby-delete" data-id="' + b.id + '">Delete</button>' : '') + '<button class="btn btn--primary btn--lg" type="submit">' + (b ? 'Save' : 'Add baby') + '</button></div></form>';
      },
      mount: function (body) {
        var form = body.querySelector('form');
        var sync = function () { $all('label.chip', form).forEach(function (l) { l.classList.toggle('chip--on', l.querySelector('input').checked); }); };
        form.addEventListener('change', sync); sync();
      }
    });
  }

  function switcherSheet() {
    var st = S.get();
    h.openSheet({
      title: 'Babies',
      html: function () {
        return '<div class="rows">' + st.babies.map(function (x) {
          return '<button class="row" data-action="baby-select" data-id="' + x.id + '"><span class="row__icon">' + esc(x.emoji || '👶') + '</span><div class="row__main"><div class="row__t">' + esc(x.name) + '</div><div class="row__s">' + esc(G.ageLabel(G.ageInDays(x.birth))) + '</div></div>' + (x.id === st.activeBaby ? '<span class="status status--ok">✓ Active</span>' : '') + '</button>';
        }).join('') + '</div><button class="btn btn--block" data-action="baby-add">＋ Add a baby</button>';
      }
    });
  }

  /* ---------- Custom reminder sheet ---------- */
  var R_ICONS = ['🔔', '💊', '🍼', '🧴', '🛁', '🩺', '📞', '☀️', '🧺', '💧'];
  function customSheet(id) {
    var r = id ? S.get().custom.filter(function (x) { return x.id === id; })[0] : null;
    var rep = r ? r.repeat : 'every';
    h.openSheet({
      title: r ? 'Edit reminder' : 'New reminder',
      html: function () {
        return '<form class="form" id="custom-form"' + (r ? ' data-id="' + r.id + '"' : '') + ' autocomplete="off">' +
          '<label class="field"><span class="field__label">What</span><input class="input" name="label" required maxlength="40" value="' + esc(r ? r.label : '') + '" placeholder="e.g. Antibiotic dose" autofocus /></label>' +
          '<label class="field"><span class="field__label">Details (optional)</span><input class="input" name="note" maxlength="80" value="' + esc(r ? r.note || '' : '') + '" placeholder="e.g. 5 ml with food" /></label>' +
          '<div class="field"><span class="field__label">Icon</span><div class="chips">' + R_ICONS.map(function (e) { return '<label class="chip"><input type="radio" name="icon" value="' + e + '"' + ((r ? r.icon : '🔔') === e ? ' checked' : '') + ' style="display:none" />' + e + '</label>'; }).join('') + '</div></div>' +
          '<div class="field"><span class="field__label">Repeat</span><div class="seg">' + [['every', 'Every few hours'], ['daily', 'Daily'], ['once', 'Once']].map(function (o) { return '<label><input type="radio" name="repeat" value="' + o[0] + '"' + (rep === o[0] ? ' checked' : '') + ' /><span>' + o[1] + '</span></label>'; }).join('') + '</div></div>' +
          '<div data-rep="every" class="form"><div class="field__row"><label class="field"><span class="field__label">Every (hours)</span><input class="input" type="number" min="0.5" max="48" step="0.5" name="everyH" value="' + (r && r.everyH ? r.everyH : 8) + '" /></label></div>' +
          h.timeField('anchor', r && r.anchor ? r.anchor : Date.now(), 'Starting from (last time it was done)') + '</div>' +
          '<div data-rep="daily"><label class="field"><span class="field__label">At</span><input class="input" type="time" name="time" value="' + esc(r && r.time ? r.time : '09:00') + '" /></label></div>' +
          '<div data-rep="once"><label class="field"><span class="field__label">At</span><input class="input" type="datetime-local" name="at" value="' + h.toLocalInput(r && r.at ? r.at : Date.now() + HOUR) + '" /></label></div>' +
          '<div class="btn-row sheet-save">' + (r ? '<button type="button" class="btn btn--danger" data-action="custom-delete" data-id="' + r.id + '">Delete</button>' : '') + '<button class="btn btn--primary btn--lg" type="submit">Save</button></div></form>';
      },
      mount: function (body) {
        var form = body.querySelector('form');
        var sync = function () {
          var v = form.querySelector('input[name="repeat"]:checked').value;
          $all('[data-rep]', form).forEach(function (n) { n.hidden = n.getAttribute('data-rep') !== v; });
          $all('label.chip', form).forEach(function (l) { l.classList.toggle('chip--on', l.querySelector('input').checked); });
        };
        form.addEventListener('change', sync); sync();
      }
    });
  }

  /* =====================================================
     Sharing & data
     ===================================================== */
  function handoffText() {
    var now = Date.now(), b = S.baby(), days = S.ageDays(now), s = S.last24(now);
    var lf = S.lastFeedAnchor(), ld = S.last('diaper'), lt = S.last('temp');
    var sleeps = S.events({ type: 'sleep', from: now - DAY }).filter(function (e) { return e.end; });
    var longest = sleeps.reduce(function (m, e) { return Math.max(m, e.end - e.time); }, 0);
    var lines = [b.name + ' (' + G.ageLabel(days) + ') — last 24 hours, as of ' + h.fmtTime(now)];
    var feedLine = '🍼 Feeds: ' + s.feeds;
    if (lf && !lf.live) feedLine += ' · last ' + h.ago(lf.time, now) + ' (' + h.describe(lf.event).sub + ')' + ' · next due ~' + h.fmtTime(lf.time + S.feedIntervalH(now) * HOUR);
    if (lf && lf.live) feedLine += ' · feeding right now';
    if (s.bottleMl) feedLine += ' · bottles total ' + h.vol(s.bottleMl);
    lines.push(feedLine);
    var ns = F.nextSide(); if (ns && b.feeding !== 'formula') lines.push('🤱 Next breast: start on the ' + (ns === 'L' ? 'left' : 'right'));
    lines.push('🧷 Diapers: ' + s.wet + ' wet, ' + s.dirty + ' dirty' + (ld ? ' · last change ' + h.ago(ld.time, now) : ''));
    var sl = '😴 Sleep: ' + h.hoursStr(s.sleepMs) + (longest ? ' · longest ' + h.durMs(longest) : '');
    if (S.isAsleep()) sl += ' · asleep since ' + h.fmtTime(S.timers().sleep.start);
    else if (S.awakeSince(now)) sl += ' · awake since ' + h.fmtTime(S.awakeSince(now));
    lines.push(sl);
    S.events({ type: 'med', from: now - DAY }).forEach(function (e) {
      lines.push('💊 ' + e.data.name + (e.data.dose ? ' ' + e.data.dose : '') + ' at ' + h.fmtTime(e.time) + (e.data.intervalH ? ' · next allowed ' + h.fmtTime(e.time + e.data.intervalH * HOUR) : ''));
    });
    if (lt && now - lt.time < DAY) lines.push('🌡️ Temp: ' + h.temp(lt.data.tempC) + ' at ' + h.fmtTime(lt.time));
    S.events({ type: 'note', from: now - DAY }).forEach(function (e) { lines.push('📝 ' + e.data.text); });
    lines.push('— sent from Baby Log');
    return lines.join('\n');
  }

  function share(text, title) {
    if (navigator.share) { navigator.share({ title: title, text: text }).catch(function () {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { h.toast('Copied to clipboard 📋'); }, function () { showText(text, title); }); return; }
    showText(text, title);
  }
  function showText(text, title) {
    h.openSheet({ title: title, html: '<textarea class="input" style="min-height:260px" readonly>' + esc(text) + '</textarea><p class="faint">Select all and copy.</p>' });
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var res = S.importJSON(String(reader.result), 'merge');
        commit();
        h.toast('Imported ' + h.plural(res.events, 'new entry').replace('entrys', 'entries') + ' ✓');
      } catch (e) { h.toast('That file isn’t a Baby Log backup.'); }
    };
    reader.readAsText(file);
  }

  /* =====================================================
     Actions
     ===================================================== */
  var ACTIONS = {
    'go': function (n) {
      App.ui.view = n.getAttribute('data-view');
      h.closeSheet();
      render();
      var f = n.getAttribute('data-focus');
      if (f) { var t = $('#set-' + f); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else window.scrollTo(0, 0);
    },
    'sheet-close': function () { h.closeSheet(); render(); },

    'log': function (n) {
      var type = n.getAttribute('data-type');
      if (type === 'solids') return F.open('feed', null, { kind: 'solids' });
      F.open(type);
    },
    'log-solids': function () { F.open('feed', null, { kind: 'solids' }); },
    'log-more': function () { h.openSheet({ title: 'Log something else', html: function () { return V.moreActions(S.ageDays(Date.now())); } }); },
    'log-vitd': function () {
      var e = S.addEvent({ type: 'med', time: Date.now(), data: { medId: 'vitd', name: 'Vitamin D drops', dose: '', intervalH: 24, maxPerDay: 1, remind: false } });
      commit(); h.toast('Vitamin D logged ☀️', { label: 'Undo', fn: function () { S.removeEvent(e.id); commit(); } });
    },
    'edit': function (n) { var e = S.findEvent(n.getAttribute('data-id')); if (e) F.open(e.type, e); },
    'event-delete': function (n) {
      var e = S.findEvent(n.getAttribute('data-id'));
      if (!e) return;
      S.removeEvent(e.id); h.closeSheet(); commit();
      h.toast('Deleted', { label: 'Undo', fn: function () { S.addEvent(e); commit(); } });
    },
    'add-past': function () {
      h.openSheet({
        title: 'Add a past entry',
        html: '<div class="qa-grid">' + Object.keys(h.TYPES).map(function (k) { return '<button class="qa" data-action="log" data-type="' + k + '"><span class="qa__icon">' + h.TYPES[k].icon + '</span><span class="qa__label">' + h.TYPES[k].label + '</span></button>'; }).join('') + '</div><p class="faint">Every form lets you set the time — use the −15m / −1h chips or pick a date.</p>'
      });
    },

    'sleep-toggle': function () { if (S.isAsleep()) sleepStop(); else sleepStart(); },
    'sleep-start': function () { sleepStart(); if (App.ui.sheet && App.ui.sheet.type === 'sleep') h.closeSheet(); dismissKind('nap'); },
    'sleep-stop': function () { sleepStop(); if (App.ui.sheet && App.ui.sheet.type === 'sleep') h.closeSheet(); },
    'tummy-toggle': function () { if (App.ui.sheet) h.closeSheet(); if (S.timers().tummy) tummyStop(); else tummyStart(); },
    'tummy-start': function () { tummyStart(); dismissKind('tummy'); },
    'tummy-stop': function () { tummyStop(); if (App.ui.sheet && App.ui.sheet.type === 'tummy') h.closeSheet(); },

    'breast-side': function (n) {
      var side = n.getAttribute('data-side'), was = S.timers().breast;
      if (S.isAsleep()) { var t = S.stopTimer('sleep'); if (Date.now() - t.start >= MIN) S.addEvent({ type: 'sleep', time: t.start, end: Date.now(), data: {} }); }
      S.breastSwitch(side);
      commit();
      if (!was) h.toast('Feeding on the ' + (side === 'L' ? 'left' : 'right') + ' — timer running');
    },
    'breast-pause': function () { S.breastPause(); commit(); },
    'breast-finish': breastFinish,
    'pump-side': function (n) { S.pumpSide(n.getAttribute('data-side')); commit(); },
    'pump-both': function () { S.pumpBoth(); commit(); },
    'pump-finish': function () { S.pumpFinish(); commit(); F.open('pump', null, { timer: true }); },
    'pump-discard': function () { if (confirm('Discard this pumping session without saving?')) { S.stopTimer('pump'); commit(); } },
    'breast-discard': function () { if (confirm('Discard this feeding timer without saving?')) { S.stopTimer('breast'); commit(); } },

    'time-set': function (n) {
      var form = n.closest('form') || document, inp = form.querySelector('[name="' + n.getAttribute('data-target') + '"]');
      if (inp) { inp.value = h.toLocalInput(Date.now() - (+n.getAttribute('data-min')) * MIN); inp.dispatchEvent(new Event('change', { bubbles: true })); }
    },
    'step': function (n) {
      var scope = n.closest('form') || n.closest('.sheet__body') || document;
      var inp = scope.querySelector('[name="' + n.getAttribute('data-target') + '"]');
      if (!inp) return;
      var step = parseFloat(n.getAttribute('data-step')), v = parseFloat(inp.value) || 0;
      var dec = Math.abs(step) < 1 ? 1 : 0;
      inp.value = Math.max(0, Math.round((v + step) * Math.pow(10, dec)) / Math.pow(10, dec));
      inp.dispatchEvent(new Event('stepped', { bubbles: true }));
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    },
    'unit-toggle': function (n) {
      var kind = n.getAttribute('data-unit'), form = n.closest('form') || n.closest('.sheet__body');
      var inp = form && form.querySelector('[name="' + n.getAttribute('data-target') + '"]'), st = S.get().settings;
      if (kind === 'volume') {
        var ml = inp ? h.volFromDisplay(inp.value) : 0;
        st.volume = st.volume === 'oz' ? 'ml' : 'oz';
        if (inp && ml) inp.value = h.volToDisplay(ml);
        $all('[data-step][data-target="' + inp.name + '"]', form).forEach(function (b) { var sgn = parseFloat(b.getAttribute('data-step')) < 0 ? '-' : ''; b.setAttribute('data-step', sgn + (st.volume === 'oz' ? 0.5 : 10)); });
        n.textContent = h.volUnit();
      } else {
        var c = inp ? h.tempFromDisplay(inp.value) : null;
        st.temp = st.temp === 'F' ? 'C' : 'F';
        if (inp && c != null) inp.value = h.tempToDisplay(c);
        n.textContent = h.tempUnit();
        if (inp) inp.dispatchEvent(new Event('stepped', { bubbles: true }));
      }
      S.save();
      h.toast('Units: ' + (kind === 'volume' ? h.volUnit() : h.tempUnit()) + ' — change all units in Settings');
    },
    'poop-color': function (n) {
      var form = n.closest('form'), c = n.getAttribute('data-color'), inp = form.elements.color;
      inp.value = inp.value === c ? '' : c;
      $all('.swatch', form).forEach(function (s) { s.setAttribute('aria-pressed', s.getAttribute('data-color') === inp.value); });
      form.dispatchEvent(new Event('poopcolor'));
    },

    'help': function (n) { Help.open(n.getAttribute('data-topic')); },
    'help-sounds': function () { h.openSheet({ title: 'Sleep sounds', html: function () { return Help.soundPlayer(); } }); },
    'sound': function (n) {
      var k = n.getAttribute('data-sound');
      if (Snd.playing() === k) Snd.stop();
      else { Snd.volume(App.ui.soundVol || 0.5); Snd.play(k, App.ui.soundMin || 0); }
      refreshSound();
    },
    'sound-stop': function () { Snd.stop(); refreshSound(); },

    'snooze': function (n) {
      var key = n.getAttribute('data-key');
      S.snooze(key, Date.now() + 15 * MIN);
      App.ui.alerts = App.ui.alerts.filter(function (a) { return a.key !== key; });
      commit(); h.toast('Snoozed for 15 minutes');
    },
    'alert-dismiss': function (n) { var key = n.getAttribute('data-key'); App.ui.alerts = App.ui.alerts.filter(function (a) { return a.key !== key; }); renderBanner(); },
    'alert-act': function (n) {
      var key = n.getAttribute('data-key'), a = App.ui.alerts.filter(function (x) { return x.key === key; })[0];
      if (a && a.baby && a.baby !== S.get().activeBaby) { S.get().activeBaby = a.baby; commit(); }
      App.ui.alerts = App.ui.alerts.filter(function (x) { return x.key !== key; });
      var d = n.getAttribute('data-do');
      if (d === 'log') F.open(n.getAttribute('data-type'));
      else if (ACTIONS[d]) ACTIONS[d](n);
      renderBanner();
    },

    'hist-filter': function (n) { App.ui.historyType = n.getAttribute('data-type'); render(); },
    'hist-more': function () { App.ui.historyDays += 7; render(); },
    'trend-range': function (n) { App.ui.trendDays = +n.getAttribute('data-days'); render(); },

    'baby-switch': function () { if (S.get().babies.length > 1) switcherSheet(); else babySheet(S.get().activeBaby); },
    'baby-select': function (n) { S.get().activeBaby = n.getAttribute('data-id'); App.ui.alerts = App.ui.alerts.slice(); h.closeSheet(); commit(); h.toast('Now tracking ' + S.baby().name); },
    'baby-add': function () { babySheet(null); },
    'baby-edit': function (n) { babySheet(n.getAttribute('data-id')); },
    'baby-delete': function (n) {
      var b = S.baby(n.getAttribute('data-id'));
      if (!b || !confirm('Delete ' + b.name + ' and all of their logs from this device? This can’t be undone.')) return;
      S.removeBaby(b.id); h.closeSheet(); commit();
    },

    'notify-enable': requestNotify,
    'install-dismiss': function () { S.get().settings.installTipDismissed = true; commit(); },
    'install-prompt': function () {
      var ev = App.installPrompt; if (!ev) return;
      ev.prompt();
      (ev.userChoice || Promise.resolve()).then(function () { App.installPrompt = null; S.get().settings.installTipDismissed = true; commit(); });
    },
    'custom-add': function () { customSheet(null); },
    'custom-edit': function (n) { customSheet(n.getAttribute('data-id')); },
    'custom-delete': function (n) { var id = n.getAttribute('data-id'); S.get().custom = S.get().custom.filter(function (r) { return r.id !== id; }); h.closeSheet(); commit(); },

    'handoff': function () { share(handoffText(), 'Baby Log summary'); },
    'export-json': function () { download('baby-log-backup-' + h.todayISO() + '.json', S.exportJSON(), 'application/json'); h.toast('Backup downloaded'); },
    'export-csv': function () { download('baby-log-' + (S.baby().name || 'baby').toLowerCase().replace(/\W+/g, '-') + '-' + h.todayISO() + '.csv', S.exportCSV(), 'text/csv'); },
    'import-open': function () { $('#import-file').click(); },
    'erase': function () {
      if (!confirm('Erase all babies and logs from this device? Export a backup first if you might want them back.')) return;
      S.reset(); S.save(); App.ui.alerts = []; h.closeSheet(); App.ui.view = 'today'; render();
    }
  };

  function dismissKind(kind) { App.ui.alerts = App.ui.alerts.filter(function (a) { return a.kind !== kind; }); renderBanner(); }
  function refreshSound() {
    if (App.ui.sheet) h.renderSheet();
    if (App.ui.view === 'help' || App.ui.view === 'today') render();
  }
  Snd.onchange = refreshSound;

  /* =====================================================
     Wiring
     ===================================================== */
  function onClick(e) {
    var n = e.target.closest('[data-action]');
    if (!n || n.disabled) return;
    var fn = ACTIONS[n.getAttribute('data-action')];
    if (fn) { e.preventDefault(); fn(n); }
  }

  function onChange(e) {
    var t = e.target;
    var key = t.getAttribute && t.getAttribute('data-setting');
    if (key) {
      var s = S.get().settings;
      if (t.type === 'checkbox') {
        if (key === 'notify' && t.checked && 'Notification' in window && Notification.permission !== 'granted') { t.checked = false; requestNotify(); return; }
        s[key] = t.checked;
      } else s[key] = /^\d+(\.\d+)?$/.test(t.value) ? parseFloat(t.value) : t.value;
      commit();
      return;
    }
    var ac = t.getAttribute && t.getAttribute('data-action-change');
    if (ac === 'sleep-adjust') {
      var v = h.fromLocalInput(t.value), sl = S.timers().sleep;
      if (sl && v && v < Date.now()) { sl.start = v; commit(); h.toast('Sleep start updated'); }
    } else if (ac === 'ms-toggle') {
      var b = S.baby(), k = t.getAttribute('data-key');
      b.milestones = b.milestones || {};
      if (t.checked) {
        var parts = k.split(':'), g = G.MILESTONES.filter(function (x) { return String(x.months) === parts[0]; })[0];
        var ev = S.addEvent({ type: 'milestone', time: Date.now(), data: { text: g.items[+parts[1]] } });
        b.milestones[k] = ev.id;
        h.toast('⭐ Milestone saved to history');
      } else {
        if (b.milestones[k] && b.milestones[k] !== true) S.removeEvent(b.milestones[k]);
        delete b.milestones[k];
      }
      S.save(); render();
    } else if (t.id === 'sound-timer') {
      App.ui.soundMin = +t.value;
      if (Snd.playing()) { Snd.play(Snd.playing(), App.ui.soundMin); refreshSound(); }
    }
  }

  function onInput(e) {
    if (e.target.id === 'sound-vol') { App.ui.soundVol = +e.target.value; Snd.volume(App.ui.soundVol); }
  }

  function onSubmit(e) {
    var f = e.target;
    if (f.id === 'sheet-form') {
      e.preventDefault();
      var editing = !!f.getAttribute('data-id');
      var ev = F.save(f);
      if (!ev) return;
      h.closeSheet(); commit();
      var d = h.describe(ev), copies = F.lastCopies.slice();
      var also = copies.length ? ' (also ' + copies.map(function (c) { return S.baby(c.baby).name; }).join(', ') + ')' : '';
      h.toast((editing ? 'Updated · ' : 'Saved · ') + d.title + also, editing ? null : { label: 'Undo', fn: function () { S.removeEvent(ev.id); copies.forEach(function (c) { S.removeEvent(c.id); }); commit(); } });
      if (d.flag && !editing) setTimeout(function () { h.toast('⚠️ Worth a look — open it in History for details'); }, 600);
    } else if (f.id === 'welcome-form' || f.id === 'baby-form') {
      e.preventDefault();
      var fd = new FormData(f), name = String(fd.get('name') || '').trim(), birth = String(fd.get('birth') || '');
      if (!name || !birth) { h.toast('Add a name and birth date.'); return; }
      if (birth > h.todayISO()) { h.toast('The birth date can’t be in the future.'); return; }
      var data = { name: name, birth: birth, feeding: String(fd.get('feeding') || 'breast') };
      if (fd.get('emoji')) data.emoji = String(fd.get('emoji'));
      var bw = h.weightFromDisplay(fd.get('bw'));
      if (bw) data.birthWeightKg = bw;
      var id = f.getAttribute('data-id');
      if (id) S.updateBaby(id, data);
      else {
        if (!S.get().babies.length) applyUnits(String(fd.get('units') || 'metric'));
        S.addBaby(data);
      }
      h.closeSheet(); App.ui.view = App.ui.view || 'today'; commit();
      if (f.id === 'welcome-form') { window.scrollTo(0, 0); h.toast('Welcome, ' + name + ' 💛'); }
    } else if (f.id === 'custom-form') {
      e.preventDefault();
      var fd2 = new FormData(f), rid = f.getAttribute('data-id');
      var r = rid ? S.get().custom.filter(function (x) { return x.id === rid; })[0] : { id: S.uid(), baby: S.get().activeBaby, created: Date.now() };
      r.label = String(fd2.get('label') || '').trim() || 'Reminder';
      r.note = String(fd2.get('note') || '').trim();
      r.icon = String(fd2.get('icon') || '🔔');
      r.repeat = String(fd2.get('repeat'));
      r.on = true;
      if (r.repeat === 'every') { r.everyH = parseFloat(fd2.get('everyH')) || 3; r.anchor = h.fromLocalInput(String(fd2.get('anchor'))) || Date.now(); }
      if (r.repeat === 'daily') r.time = String(fd2.get('time') || '09:00');
      if (r.repeat === 'once') { r.at = h.fromLocalInput(String(fd2.get('at'))); if (!r.at) { h.toast('Pick a time'); return; } }
      if (!rid) S.get().custom.push(r);
      h.closeSheet(); commit(); h.toast('Reminder saved 🔔');
    }
  }

  // US visitors get oz / °F / lb by default.
  // Guess units from where the phone is, not its language: plenty of phones
  // outside the US (the Philippines, for one) run in US English.
  function usesImperial() {
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    if (tz) return /^(America\/(New_York|Chicago|Denver|Phoenix|Los_Angeles|Anchorage|Detroit|Boise|Juneau|Sitka|Nome|Adak|Metlakatla|Yakutat|Menominee|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+)|Pacific\/Honolulu|US\/.+)$/.test(tz);
    return /^en-us$/i.test(navigator.language || '');
  }
  function applyUnits(system) {
    var s = S.get().settings, imp = system === 'imperial';
    s.volume = imp ? 'oz' : 'ml'; s.temp = imp ? 'F' : 'C'; s.length = imp ? 'in' : 'cm';
  }

  function boot() {
    S.load();
    h.initTips();
    h.initSheetGestures();
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && App.ui.sheet) { h.closeSheet(); render(); } });
    document.addEventListener('pointerdown', function unlock() { Snd.unlock(); document.removeEventListener('pointerdown', unlock); });
    $('#import-file').addEventListener('change', function (e) { var f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; });
    var bf = $('#welcome-form input[name="birth"]'); if (bf) bf.max = h.todayISO();
    if (usesImperial()) { var imp = $('#welcome-form input[value="imperial"]'); if (imp) imp.checked = true; }
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); App.installPrompt = e; if (App.ui.view === 'today') softRender(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { checkReminders(); softRender(); } });

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').then(function (r) { swReg = r; }).catch(function () {});
      navigator.serviceWorker.addEventListener && navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'focus') { checkReminders(); softRender(); } });
    }

    render();
    setInterval(h.tick, 1000);
    setInterval(checkReminders, 15000);
    setInterval(softRender, 60000);
    setTimeout(checkReminders, 1500);
  }

  // Exposed for tests / debugging.
  App.handoffText = handoffText;
  App.checkReminders = checkReminders;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
