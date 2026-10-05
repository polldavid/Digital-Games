/* =========================================================
   Baby Log — app.js
   Boot, navigation, actions, the reminder/notification loop,
   settings, multiple babies, and backup/import/share.
   ========================================================= */
(function () {
  'use strict';

  var G = window.BabyGuide, S = window.BabyStore, Snd = window.BabySound;
  var App = window.BabyApp, h = App.h, F = window.BabyForms, V = window.BabyViews, Help = window.BabyHelp;
  var Hl = window.BabyHealth, Files = window.BabyFiles, N = window.BabyNative;
  var $ = h.$, $all = h.$all, esc = h.esc, MIN = h.MIN, HOUR = h.HOUR, DAY = h.DAY;
  var swReg = null;

  /* =====================================================
     Render
     ===================================================== */
  // Paint first, write to storage just after: a year of logs takes ~15 ms to
  // save, which a tap shouldn't wait for. Native reminders follow the change.
  // Run a button's action from code (voice logging): data = { side: 'L' } etc.
  App.act = function (name, data) {
    var fn = ACTIONS[name] || App.extraActions[name];
    if (fn) fn({ getAttribute: function (k) { return data && data[k.replace(/^data-/, '')] != null ? String(data[k.replace(/^data-/, '')]) : null; }, disabled: false });
  };
  function commit() { syncAlerts(); render(); if (App.ui.sheet) h.renderSheet(); S.saveSoon(); N.syncReminders(); }
  App.commit = commit;

  function render() {
    var b = S.baby();
    $('#welcome').hidden = !!b;
    $('#app').hidden = !b;
    if (!b) return;
    var days = S.ageDays(Date.now()), many = S.get().babies.length > 1;
    var chip = $('#babychip');
    chip.innerHTML = '<span class="babychip__emoji" aria-hidden="true">' + esc(b.emoji || '👶') + '</span><span class="babychip__text"><span class="babychip__name">' + esc(b.name) + '</span><span class="babychip__age">' + esc(G.ageLabel(days)) + '</span></span>' + (many ? '<span class="babychip__caret" aria-hidden="true">▼</span>' : '');
    chip.setAttribute('aria-label', b.name + ', ' + G.ageLabel(days) + (many ? ' — switch baby' : ' — edit profile'));
    var v = App.ui.view;
    $all('.view').forEach(function (n) { n.hidden = n.id !== 'view-' + v; });
    $all('.tab').forEach(function (t) { var on = t.getAttribute('data-view') === v; t.classList.toggle('tab--active', on); if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    var el = $('#view-' + v);
    // Only the blocks that changed are rebuilt, so focus, open sections and
    // loaded photos survive a refresh. regions() groups them into panes that
    // sit side by side on a tablet.
    var trends = v === 'log' && App.ui.logMode === 'trends';
    el.classList.toggle('view--trends', trends);
    h.patch(el, h.regions(v === 'today' ? V.today() : v === 'log' ? (trends ? V.trends() : V.history()) : v === 'health' ? Hl.view() : v === 'help' ? Help.view() : settingsView()));
    Files.hydrate(el);
    renderBanner();
    if (window.BabyMic) BabyMic.paintButton();
    // Closing a sheet returns focus to the button that opened it, even if that button was rebuilt.
    if (App.ui.returnFocus && !App.ui.sheet) {
      var a = document.activeElement;
      if (!a || a === document.body || !a.isConnected) h.refocus($('#app'), App.ui.returnFocus);
      App.ui.returnFocus = null;
    }
    h.tick();
  }
  App.render = render;

  // Refresh "due in…" states once a minute without fighting the user.
  function softRender() {
    if (App.ui.sheet || !S.baby() || document.hidden) return;
    var a = document.activeElement;
    if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
    if (App.ui.view === 'today' || App.ui.view === 'health' || (App.ui.view === 'log' && App.ui.logMode === 'trends')) {
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
    var el = $('#banner'), a = App.ui.alerts[0], n = App.ui.alerts.length;
    var badge = $('#bell-badge');
    badge.hidden = !n; badge.textContent = n;
    $('#bell').setAttribute('aria-label', n ? 'Reminders — ' + n + ' due' : 'Reminders');
    if (!a) { el.hidden = true; el.innerHTML = ''; el._src = ''; return; }
    var b = S.baby(a.baby), many = S.get().babies.length > 1;
    var act = { feed: ['Log feed', 'log', 'feed'], diaper: ['Log change', 'log', 'diaper'], nap: ['Start sleep', 'sleep-start', ''], med: ['Log dose', 'log', 'med'], vitd: ['Log it', 'log-vitd', ''], tummy: ['Start', 'tummy-start', ''], milk: ['Open', 'milk-open', ''], rx: ['Give dose', 'rx-dose', ''], appt: ['Open', 'appt-edit', ''], vax: ['Checklist', 'vax-open', ''] }[a.kind];
    var actId = a.rxId || a.apptId || a.milkId || '';
    var html = '<span class="banner__icon" aria-hidden="true">' + esc(a.icon) + '</span><div class="banner__text"><div class="banner__title">' + esc(a.title) + (many && b ? ' · ' + esc(b.name) : '') + '</div><div class="banner__sub">' + esc(a.text) + '</div></div>' +
      '<div class="banner__actions">' + (act ? '<button class="btn btn--sm btn--primary" data-action="alert-act" data-key="' + esc(a.key) + '" data-do="' + act[1] + '" data-type="' + act[2] + '" data-id="' + esc(actId) + '">' + act[0] + '</button>' : '') +
      '<button class="btn btn--sm" data-action="snooze" data-key="' + esc(a.key) + '">Snooze 15m</button>' +
      '<button class="btn btn--sm btn--ghost" data-action="alert-dismiss" data-key="' + esc(a.key) + '">Dismiss</button></div>';
    el.hidden = false;
    // role="alert" re-announces whenever its content is rewritten — only rewrite on a real change.
    if (el._src !== html) { el._src = html; el.innerHTML = html; }
  }

  // Ask once, then remember the answer for the Settings screen (native permission checks are async).
  function refreshPermission() { return N.permission().then(function (p) { if (p !== App.ui.notifyPerm) { App.ui.notifyPerm = p; if (App.ui.view === 'settings' && !App.ui.sheet) render(); } return p; }); }
  function requestNotify() {
    N.requestPermission().then(function (p) {
      App.ui.notifyPerm = p;
      if (p === 'unsupported') { h.toast('This browser doesn’t support notifications — in-app alerts and the chime still work.'); return; }
      S.get().settings.notify = p === 'granted';
      commit();
      h.toast(p === 'granted' ? 'Notifications on 🔔' : App.platform.native ? 'Notifications are off — you can allow them in your phone’s Settings for Baby Log.' : 'Notifications blocked — you can allow them in your browser’s site settings.');
      if (p === 'granted' && swReg && !N.nativeReminders()) try { swReg.showNotification('🔔 Baby Log', { body: 'Reminders will show up like this.', tag: 'test', icon: 'icons/icon-192.png' }); } catch (e) {}
    }).catch(function () { h.toast('Couldn’t ask for notification permission. In-app alerts and the chime still work.'); });
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
    var perm = App.ui.notifyPerm || (!('Notification' in window) ? 'unsupported' : Notification.permission);
    var row = function (t, sub, ctrl) { return '<div class="set-row"><div class="set-row__main"><div class="set-row__t">' + t + '</div>' + (sub ? '<div class="set-row__s">' + sub + '</div>' : '') + '</div>' + ctrl + '</div>'; };
    var sel = function (key, opts, cur, label) { return '<select class="input" data-setting="' + key + '" aria-label="' + esc(label) + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; };
    var html = '<h1 class="h1">Settings</h1>';

    // Babies
    html += '<div class="section-title"><h2>Babies</h2></div><div class="card"><div class="rows">' + st.babies.map(function (x) {
      return '<button class="row" data-action="baby-edit" data-id="' + x.id + '"><span class="row__icon">' + esc(x.emoji || '👶') + '</span><div class="row__main"><div class="row__t">' + esc(x.name) + (x.id === st.activeBaby ? ' <span class="status status--ok">Active</span>' : '') + '</div><div class="row__s">' + esc(G.ageLabel(G.ageInDays(x.birth))) + ' · ' + ({ breast: 'Breastfed', formula: 'Formula', mixed: 'Breast + formula' })[x.feeding] + '</div></div><span class="faint">Edit ›</span></button>';
    }).join('') + '</div><button class="btn btn--sm" data-action="baby-add" style="margin-top:8px">＋ Add a baby (twins, siblings)</button></div>';

    // Reminders
    html += '<div class="section-title" id="set-reminders"><h2>Reminders</h2></div><div class="card">' +
      row('Phone notifications', perm === 'granted' && s.notify ? (N.nativeReminders() ? 'On — reminders arrive even when Baby Log is closed.' : 'On — alerts show even when you’re in another app.') : perm === 'denied' ? (App.platform.native ? 'Off in your phone’s Settings → Baby Log → Notifications. In-app alerts still work.' : 'Blocked in browser settings. In-app alerts still work.') : perm === 'unsupported' ? (App.platform.ios && !App.platform.standalone ? 'On iPhone, add Baby Log to your Home Screen first (Share → Add to Home Screen), then open it from there.' : 'Not supported here. In-app alerts and the chime still work.') : 'Get alerts while you’re in another app.',
        perm === 'granted' ? h.sw('notify', s.notify, 'Notifications') : perm === 'default' ? '<button class="btn btn--sm btn--primary" data-action="notify-enable">Turn on</button>' : '') +
      row('Chime', 'A soft two-note sound with each reminder. Never plays while a baby is asleep.', h.sw('chime', s.chime, 'Chime')) +
      row('Quiet at night', '10 pm – 7 am: vibrate and banner only, no sound.', h.sw('quietNight', s.quietNight, 'Quiet at night')) +
      row('🍼 Next feed', 'Counted from the start of the last feed.', h.sw('feedRemind', s.feedRemind, 'Feed reminder')) +
      (s.feedRemind ? row('&nbsp;&nbsp;&nbsp;Every', '', sel('feedIntervalH', [[0, 'Auto (~' + G.fmtHours(autoH) + ')'], [1.5, '1½ hours'], [2, '2 hours'], [2.5, '2½ hours'], [3, '3 hours'], [3.5, '3½ hours'], [4, '4 hours'], [5, '5 hours'], [6, '6 hours']], s.feedIntervalH, 'Feed reminder interval')) : '') +
      row('🧷 Diaper check', 'After the last change.', h.sw('diaperRemind', s.diaperRemind, 'Diaper reminder')) +
      (s.diaperRemind ? row('&nbsp;&nbsp;&nbsp;Every', '', sel('diaperIntervalH', [[2, '2 hours'], [3, '3 hours'], [4, '4 hours']], s.diaperIntervalH, 'Diaper reminder interval')) : '') +
      row('😴 Nap window', 'When baby has been awake for a typical wake window.', h.sw('napRemind', s.napRemind, 'Nap reminder')) +
      row('☀️ Vitamin D drops', 'Daily — skipped if already logged.', h.sw('vitdRemind', s.vitdRemind, 'Vitamin D reminder')) +
      (s.vitdRemind ? row('&nbsp;&nbsp;&nbsp;At', '', '<input class="input" type="time" data-setting="vitdTime" value="' + esc(s.vitdTime) + '" aria-label="Vitamin D time" />') : '') +
      row('🤸 Tummy time', 'Daily nudge if under today’s goal.', h.sw('tummyRemind', s.tummyRemind, 'Tummy reminder')) +
      (s.tummyRemind ? row('&nbsp;&nbsp;&nbsp;At', '', '<input class="input" type="time" data-setting="tummyTime" value="' + esc(s.tummyTime) + '" aria-label="Tummy time reminder time" />') : '') +
      '<div class="section-title" style="margin-top:14px"><h2>Your reminders</h2></div>' + customList() +
      '<button class="btn btn--sm" data-action="custom-add" style="margin-top:8px">＋ New reminder</button>' +
      (N.nativeReminders() ? '' : '<p class="faint" style="margin-top:12px">Reminders fire while Baby Log is open or in the background. Phones may pause web apps that are fully closed, so for night feeds add Baby Log to your Home Screen and leave it open on the nightstand.</p>') + '</div>';

    // Today screen
    html += '<div class="section-title"><h2>Today screen</h2></div><div class="card">' +
      row('Quick log buttons', 'Choose which buttons show on Today, and their order.', '<button class="btn btn--sm" data-action="quick-edit">Edit</button>') +
      (window.BabyMic ? BabyMic.settingsRows(row, sel) : '') + '</div>';

    // Units
    html += '<div class="section-title"><h2>Units</h2></div><div class="card">' +
      row('Volume', '', sel('volume', [['ml', 'ml'], ['oz', 'fl oz']], s.volume, 'Volume unit')) +
      row('Temperature', '', sel('temp', [['C', '°C'], ['F', '°F']], s.temp, 'Temperature unit')) +
      row('Weight & length', '', sel('length', [['cm', 'kg · cm'], ['in', 'lb · in']], s.length, 'Weight and length units')) + '</div>';

    // Partner sync
    if (window.BabyShare) html += BabyShare.settingsSection(row);

    // Data
    html += '<div class="section-title"><h2>Your data</h2></div><div class="card">' +
      row('Share a summary', 'The last 24 hours as text — for a partner, sitter or doctor.', '<button class="btn btn--sm" data-action="handoff">Share</button>') +
      row('Back up / move to another phone', 'Download everything as a file. Import it on the other phone to merge logs.', '<button class="btn btn--sm" data-action="export-json">Export</button>') +
      row('Import a backup', 'Merges entries — nothing is overwritten.', '<button class="btn btn--sm" data-action="import-open">Import</button>') +
      row('Spreadsheet (CSV)', 'For your pediatrician or your own analysis.', '<button class="btn btn--sm" data-action="export-csv">CSV</button>') +
      row('Erase everything', 'Deletes all babies, logs and photos from this device.', '<button class="btn btn--sm btn--danger" data-action="erase">Erase</button>') +
      '<p class="faint" style="margin-top:10px">Private by design: no account, no tracking. Your logs never leave this device unless you export them or turn on sharing (encrypted on the phone).</p></div>';

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
          '<div class="field"><span class="field__label">Sex <span class="faint">(picks the WHO growth chart)</span></span><div class="seg">' + [['f', 'Girl'], ['m', 'Boy'], ['', 'Not set']].map(function (o) { return '<label><input type="radio" name="sex" value="' + o[0] + '"' + ((b && b.sex || '') === o[0] ? ' checked' : '') + ' /><span>' + o[1] + '</span></label>'; }).join('') + '</div></div>' +
          '<label class="field"><span class="field__label">Birth weight (' + h.weightUnit() + ', optional)</span><input class="input" type="number" step="any" min="0" inputmode="decimal" name="bw" value="' + (b && b.birthWeightKg ? h.weightToDisplay(b.birthWeightKg) : '') + '" /></label>' +
          '<div class="field"><span class="field__label" id="icon-label">Icon</span><div class="chips" role="radiogroup" aria-labelledby="icon-label">' + EMOJIS.map(function (e) { return '<label class="chip chip--pick"><input class="chip__input" type="radio" name="emoji" value="' + e + '"' + ((b ? b.emoji : '👶') === e ? ' checked' : '') + ' />' + e + '</label>'; }).join('') + '</div></div>' +
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
          '<div class="field"><span class="field__label" id="icon-label">Icon</span><div class="chips" role="radiogroup" aria-labelledby="icon-label">' + R_ICONS.map(function (e) { return '<label class="chip chip--pick"><input class="chip__input" type="radio" name="icon" value="' + e + '"' + ((r ? r.icon : '🔔') === e ? ' checked' : '') + ' />' + e + '</label>'; }).join('') + '</div></div>' +
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
    N.shareText(text, title).then(function (how) {
      if (how === 'copied') h.toast('Copied to clipboard 📋');
    }, function (e) {
      // Closing the share sheet isn't a failure; anything else falls back to copy-by-hand.
      if (e && (e.name === 'AbortError' || /cancel/i.test(e.message || ''))) return;
      showText(text, title);
    });
  }
  function showText(text, title) {
    h.openSheet({ title: title, html: '<textarea class="input" style="min-height:260px" readonly>' + esc(text) + '</textarea><p class="faint">Select all and copy.</p>' });
  }

  // Browser: a download. App: the share sheet (Save to Files, Drive, email…).
  // Resolves to what happened, or null if it didn't.
  function download(name, text, type) {
    return N.saveFile(name, text, type).catch(function (e) {
      if (e && /cancel/i.test(e.message || '')) return null;
      h.toast('Couldn’t save ' + name + '. Free up some space on the phone and try again.');
      return null;
    });
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result), photos = null;
      try { photos = JSON.parse(text).photos || null; } catch (e) { h.toast('That file isn’t a Baby Log backup.'); return; }
      try {
        var res = S.importJSON(text, 'merge');
        (photos ? Files.importAll(photos) : Promise.resolve()).then(function () {
          commit();
          h.toast('Imported ' + (res.events === 1 ? '1 new entry' : res.events + ' new entries') + (photos ? ' and ' + h.plural(Object.keys(photos).length, 'photo') : '') + ' ✓');
        });
      } catch (e) { h.toast('That file isn’t a Baby Log backup.'); }
    };
    reader.readAsText(file);
  }

  function photoIds() {
    var ids = [];
    Object.keys(S.get().health).forEach(function (bid) {
      var H = S.get().health[bid];
      (H.rx || []).concat(H.docs || []).forEach(function (x) { if (x.photoId && ids.indexOf(x.photoId) < 0) ids.push(x.photoId); });
    });
    return ids;
  }
  // Delete a photo once nothing refers to it any more.
  function dropPhotoIfUnused(id) { if (id && photoIds().indexOf(id) < 0) Files.remove(id).catch(function () {}); }

  /* =====================================================
     Actions
     ===================================================== */
  var ACTIONS = {
    'go': function (n) {
      var v = n.getAttribute('data-view'), f = n.getAttribute('data-focus');
      h.closeSheet();
      h.afterHistory(function () { showView(v, true); });
      if (f) { var t = $('#set-' + f); if (t) t.scrollIntoView({ behavior: h.reducedMotion() ? 'auto' : 'smooth', block: 'start' }); }
    },
    'sheet-close': function () { h.closeSheet(); render(); },

    'log': function (n) {
      var type = n.getAttribute('data-type');
      if (type === 'solids') return F.open('feed', null, { kind: 'solids' });
      F.open(type);
    },
    'log-solids': function () { F.open('feed', null, { kind: 'solids' }); },
    'log-more': function () { h.openSheet({ title: 'Log something else', html: function () { return V.moreActions(S.ageDays(Date.now())); } }); },
    'quick-edit': function () { h.openSheet({ title: 'Today buttons', html: function () { return V.quickEditor(S.ageDays(Date.now())); } }); },
    'quick-move': function (n) {
      var ids = V.quickIds(S.ageDays(Date.now())).main.slice(), id = n.getAttribute('data-id'), i = ids.indexOf(id), j = i + (+n.getAttribute('data-d'));
      if (i < 0 || j < 0 || j >= ids.length) return;
      ids.splice(i, 1); ids.splice(j, 0, id);
      S.get().settings.quickLog = ids; commit();
    },
    'quick-reset': function () { S.get().settings.quickLog = []; commit(); h.toast('Today buttons reset'); },
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

    'sleep-toggle': function () { if (App.ui.sheet) h.closeSheet(); if (S.isAsleep()) sleepStop(); else sleepStart(); },
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
    'bottle-start': function () {
      if (S.isAsleep()) { var t = S.stopTimer('sleep'); if (Date.now() - t.start >= MIN) S.addEvent({ type: 'sleep', time: t.start, end: Date.now(), data: {} }); }
      S.bottleStart(); commit();
      if (!App.ui.sheet) h.toast('Bottle timer running 🍼');
    },
    'bottle-pause': function () { S.bottlePause(); commit(); },
    'bottle-finish': function () { S.bottleFinish(); commit(); if (!App.ui.sheet) F.open('feed'); },
    'bottle-resume': function () { S.bottleResume(); commit(); },
    'bottle-discard': function () { h.ask({ title: 'Discard this bottle timer?', text: 'The timer stops and nothing is saved.', ok: 'Discard', danger: true }, function () { S.stopTimer('bottle'); commit(); }); },
    'pump-side': function (n) { S.pumpSide(n.getAttribute('data-side')); commit(); },
    'pump-both': function () { S.pumpBoth(); commit(); },
    'pump-finish': function () { S.pumpFinish(); commit(); F.open('pump', null, { timer: true }); },
    'pump-discard': function () { h.ask({ title: 'Discard this pumping session?', text: 'The timer stops and nothing is saved.', ok: 'Discard', danger: true }, function () { S.stopTimer('pump'); commit(); }); },
    'breast-discard': function () { h.ask({ title: 'Discard this feed?', text: 'The timer stops and nothing is saved.', ok: 'Discard', danger: true }, function () { S.stopTimer('breast'); commit(); }); },

    'time-set': function (n) {
      var form = n.closest('form') || document, inp = form.querySelector('[name="' + n.getAttribute('data-target') + '"]');
      if (inp) { inp.value = h.toLocalInput(Date.now() - (+n.getAttribute('data-min')) * MIN); inp.dispatchEvent(new Event('change', { bubbles: true })); }
    },
    'step': function (n) {
      var scope = n.closest('form') || n.closest('.sheet__body') || document;
      var inp = scope.querySelector('[name="' + n.getAttribute('data-target') + '"]');
      if (!inp) return;
      var step = parseFloat(n.getAttribute('data-step')), v = parseFloat(inp.value) || 0;
      var dec = Math.abs(step) < 1 || v % 1 ? 1 : 0;
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
        $all('[data-vol]', form).forEach(function (b) {
          var k = b.getAttribute('data-vol'), step = F.volStep(k.replace('-', ''));
          b.setAttribute('data-step', (k.charAt(0) === '-' ? '-' : '') + step);
          if (k === 'big') b.textContent = '+' + step + ' ' + h.volUnit();
        });
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
      else if (App.extraActions[d]) App.extraActions[d](n);
      renderBanner();
    },

    'hist-filter': function (n) { App.ui.historyType = n.getAttribute('data-type'); render(); },
    'hist-more': function () { App.ui.historyDays += 7; render(); },
    'growth-kind': function (n) { App.ui.growthKind = n.getAttribute('data-kind'); render(); },
    'trend-range': function (n) { App.ui.trendDays = +n.getAttribute('data-days'); render(); },

    'baby-switch': function () { if (S.get().babies.length > 1) switcherSheet(); else babySheet(S.get().activeBaby); },
    'baby-select': function (n) { S.get().activeBaby = n.getAttribute('data-id'); App.ui.alerts = App.ui.alerts.slice(); h.closeSheet(); commit(); h.toast('Now tracking ' + S.baby().name); },
    'baby-add': function () { babySheet(null); },
    'baby-edit': function (n) { babySheet(n.getAttribute('data-id')); },
    'baby-delete': function (n) {
      var b = S.baby(n.getAttribute('data-id'));
      if (!b) return;
      h.ask({ title: 'Delete ' + b.name + '?', text: 'All of ' + b.name + '’s logs and health records are removed from this device' + (window.BabyShare && BabyShare.client.on() ? ' and every phone you share with' : '') + '. This can’t be undone.', ok: 'Delete', danger: true }, function () {
        S.removeBaby(b.id); h.closeSheet(); commit();
      });
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
    'export-json': function () {
      Files.exportAll(photoIds()).catch(function () { return {}; }).then(function (photos) {
        var data = JSON.parse(S.exportJSON());
        if (Object.keys(photos).length) data.photos = photos;
        var n = Object.keys(photos).length;
        return download('baby-log-backup-' + h.todayISO() + '.json', JSON.stringify(data), 'application/json').then(function (how) {
          if (how) h.toast((how === 'shared' ? 'Backup ready' : 'Backup downloaded') + (n ? ' (with ' + h.plural(n, 'photo') + ')' : ''));
        });
      });
    },
    'export-csv': function () { download('baby-log-' + (S.baby().name || 'baby').toLowerCase().replace(/\W+/g, '-') + '-' + h.todayISO() + '.csv', S.exportCSV(), 'text/csv'); },
    'import-open': function () { $('#import-file').click(); },
    'erase': function () {
      var sharing = window.BabyShare && BabyShare.client.on();
      h.ask({ title: 'Erase everything?', text: 'All babies, logs and photos are removed from this device. ' + (sharing ? 'Sharing stops on this phone first, so your partner’s log isn’t touched. ' : '') + 'Export a backup first if you might want them back.', ok: 'Erase all', danger: true }, function () {
        if (sharing) BabyShare.client.leave();
        Files.keys().then(function (ks) { (ks || []).forEach(function (k) { Files.remove(k); }); }).catch(function () {});
        S.reset(); S.save(); App.ui.alerts = []; h.closeSheet(); App.ui.view = 'today'; render(); N.syncReminders();
      });
    },

    /* ---------- History: timeline or trends ---------- */
    'hist-mode': function (n) { App.ui.logMode = n.getAttribute('data-mode'); render(); },

    /* ---------- Health ---------- */
    'appt-edit': function (n) { Hl.apptSheet(n.getAttribute('data-id'), n.getAttribute('data-day')); },
    'appt-delete': function (n) {
      var H = S.health(), id = n.getAttribute('data-id');
      h.ask({ title: 'Delete this visit?', text: 'Its reminders are removed too.', ok: 'Delete', danger: true }, function () {
        H.appointments = H.appointments.filter(function (a) { return a.id !== id; });
        h.closeSheet(); commit();
      });
    },
    'appt-next': function (n) {
      var a = S.findIn(S.health().appointments, n.getAttribute('data-id'));
      h.closeSheet(); Hl.apptSheet(null);
      if (a) setTimeout(function () { var f = $('#appt-form'); if (f) { f.elements.doctor.value = a.doctor || ''; f.elements.place.value = a.place || ''; } }, 0);
    },
    'rx-scan': function () { Hl.startScan(); },
    'rx-photo': function (n) { Hl.pickPhoto(!!n.getAttribute('data-capture'), Hl.gotPhoto); },
    'scan-add': function () { Hl.syncScanForm(); Hl.scan().meds.push({}); h.renderSheet(); Files.hydrate(); },
    'scan-retry': function () { Hl.syncScanForm(); Hl.readOnDevice(2); },
    'scan-cancel': function () { h.closeSheet(); render(); },
    'rx-edit': function (n) { Hl.rxSheet(n.getAttribute('data-id')); },
    'rx-dose': function (n) { F.open('med', null, { rxId: n.getAttribute('data-id') }); },
    'rx-stop': function (n) {
      var rx = S.findIn(S.health().rx, n.getAttribute('data-id'));
      if (!rx) return;
      h.ask({ title: 'Stop ' + rx.name + ' now?', text: 'Dose reminders for it end. Doses already given stay in History.', ok: 'Stop medicine', danger: true }, function () {
        rx.stopped = true; rx.stoppedAt = Date.now(); h.closeSheet(); commit(); h.toast(rx.name + ' stopped');
      });
    },
    'rx-delete': function (n) {
      var H = S.health(), rx = S.findIn(H.rx, n.getAttribute('data-id'));
      if (!rx) return;
      h.ask({ title: 'Delete ' + rx.name + '?', text: 'Doses already logged stay in History.', ok: 'Delete', danger: true }, function () {
        H.rx = H.rx.filter(function (x) { return x.id !== rx.id; });
        dropPhotoIfUnused(rx.photoId); h.closeSheet(); commit();
      });
    },
    'vax-open': function () { Hl.vaxSheet(); },
    'vax-schedule': function (n) { S.health().vaccines.schedule = n.getAttribute('data-s'); commit(); },
    'vax-item': function (n) { Hl.vaxItemSheet(n.getAttribute('data-key')); },
    'vax-unmark': function (n) { delete S.health().vaccines.given[n.getAttribute('data-key')]; S.save(); Hl.vaxSheet(); render(); },
    'vax-custom': function (n) { Hl.vaxCustomSheet(n.getAttribute('data-id')); },
    'vaxc-delete': function (n) { var V2 = S.health().vaccines, id = n.getAttribute('data-id'); V2.custom = V2.custom.filter(function (c) { return c.id !== id; }); S.save(); Hl.vaxSheet(); render(); },
    'cal-move': function (n) { var m = new Date(App.ui.calMonth || Hl.monthStart(Date.now())); m.setMonth(m.getMonth() + (+n.getAttribute('data-d'))); App.ui.calMonth = m.getTime(); render(); },
    'cal-day': function (n) { App.ui.calDay = n.getAttribute('data-day'); render(); },
    'profile-edit': function () { Hl.profileSheet(); },
    'emergency': function () {
      var text = Hl.emergencyText();
      h.openSheet({ title: 'Emergency info', html: '<pre class="scantext scantext--big">' + esc(text) + '</pre><div class="btn-row sheet-save"><button class="btn" data-action="profile-edit">Edit details</button><button class="btn btn--primary btn--lg" data-action="share-text" data-what="emergency">📤 Share</button></div>' });
    },
    'visit-summary': function () {
      var text = Hl.visitSummaryText();
      h.openSheet({ title: 'Summary for the doctor', html: '<pre class="scantext">' + esc(text) + '</pre><div class="btn-row sheet-save"><button class="btn btn--primary btn--lg" data-action="share-text" data-what="visit">📤 Share or copy</button></div>' });
    },
    'share-text': function (n) {
      var w = n.getAttribute('data-what');
      share(w === 'emergency' ? Hl.emergencyText() : Hl.visitSummaryText(), w === 'emergency' ? 'Emergency info' : 'Summary for the doctor');
    },
    'doc-edit': function (n) { Hl.docSheet(n.getAttribute('data-id')); },
    'doc-photo': function (n) {
      Hl.pickPhoto(!!n.getAttribute('data-capture'), function (file) {
        Files.compress(file).then(function (blob) {
          var id = 'ph_' + S.uid();
          return Files.put(id, blob).then(function () { return id; });
        }).then(function (id) {
          var form = $('#doc-form'); if (!form) return;
          form.elements.photoId.value = id;
          var wrap = form.querySelector('.photo-wrap');
          if (!wrap) { wrap = document.createElement('div'); wrap.className = 'photo-wrap'; form.insertBefore(wrap, form.firstChild); }
          wrap.innerHTML = '<button type="button" class="photo-btn" data-action="photo-view" data-id="' + id + '" aria-label="View the photo full size"><img class="photo" data-photo="' + id + '" alt="" decoding="async" /></button>';
          Files.hydrate(form);
        }).catch(function (e) { h.toast(e.message || 'Couldn’t save that photo.'); });
      });
    },
    'doc-delete': function (n) {
      var H = S.health(), d = S.findIn(H.docs, n.getAttribute('data-id'));
      if (!d) return;
      h.ask({ title: 'Delete ' + (d.title || 'this document') + '?', text: 'The document and its photo are removed from this device.', ok: 'Delete', danger: true }, function () {
        H.docs = H.docs.filter(function (x) { return x.id !== d.id; });
        dropPhotoIfUnused(d.photoId); h.closeSheet(); commit();
      });
    },
    'photo-view': function (n) { Hl.photoViewer(n.getAttribute('data-id')); }
  };

  /* Tabs and the Back button, like a native bottom bar: from any tab, Back
     returns to Today; from Today it leaves the app. There's never more than
     one tab entry above the root, however many tabs were visited. */
  function isRootEntry() { return !history.state || !!history.state.root; }
  function showView(v, fromTap) {
    var prev = App.ui.view;
    if (fromTap && v !== prev) {
      try {
        if (v === 'today' && !isRootEntry()) { history.back(); return; } // popstate renders Today
        if (v !== 'today') {
          if (isRootEntry()) history.pushState({ babyView: v }, '');
          else history.replaceState({ babyView: v }, '');
        }
      } catch (e) {}
    }
    App.ui.view = v;
    render();
    window.scrollTo(0, 0);
  }
  App.onViewPop = function (v) { if (v !== App.ui.view) { App.ui.view = v; render(); window.scrollTo(0, 0); } };

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
    var fn = ACTIONS[n.getAttribute('data-action')] || App.extraActions[n.getAttribute('data-action')];
    if (fn) { e.preventDefault(); fn(n); }
  }

  function onChange(e) {
    var t = e.target;
    var key = t.getAttribute && t.getAttribute('data-setting');
    if (key) {
      var s = S.get().settings;
      if (t.type === 'checkbox') {
        if (key === 'notify' && t.checked && 'Notification' in window && Notification.permission !== 'granted') { t.checked = false; requestNotify(); return; }
        if (key === 'voice' && t.checked && window.BabyMic) { t.checked = false; BabyMic.enable(); return; }
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
    } else if (ac === 'quick-toggle') {
      var qids = V.quickIds(S.ageDays(Date.now())).main.slice(), qid = t.getAttribute('data-id');
      if (t.checked) { if (qids.indexOf(qid) < 0) qids.push(qid); }
      else {
        if (qids.length <= 1) { t.checked = true; h.toast('Keep at least one button on Today.'); return; }
        qids = qids.filter(function (x) { return x !== qid; });
      }
      S.get().settings.quickLog = qids; commit();
    } else if (ac === 'vax-schedule') {
      S.health().vaccines.schedule = t.value; S.save(); h.renderSheet(); render();
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
    if (/^(appt|rx|scan|vax|vaxc|profile|doc)-form$/.test(f.id)) { e.preventDefault(); saveHealthForm(f); return; }
    if (f.id === 'sheet-form') {
      e.preventDefault();
      var editing = !!f.getAttribute('data-id');
      var ev = F.save(f);
      if (!ev) return;
      h.closeSheet(); commit();
      var d = h.describe(ev), copies = F.lastCopies.slice(), mk = F.lastMilk;
      var milkMsg = !mk || editing ? '' : mk.stored ? ' · ' + G.MILK_WHERE[mk.stored.where].toLowerCase() + ', use by ' + h.fmtTime(G.milkExpiry(mk.stored).at) + (G.milkExpiry(mk.stored).at - Date.now() > DAY ? ' ' + h.fmtDate(G.milkExpiry(mk.stored).at) : '')
        : mk.kind === 'formula' ? ' · throw out the ' + h.vol(mk.ml) + ' of formula left' : mk.leftover ? ' · ' + h.vol(mk.ml) + ' left over: use by ' + h.fmtTime(G.milkExpiry(mk.leftover).at) : '';
      var also = copies.length ? ' (also ' + copies.map(function (c) { return S.baby(c.baby).name; }).join(', ') + ')' : '';
      // One toast: a second one would replace this one and take its Undo with it.
      h.toast((editing ? 'Updated · ' : 'Saved · ') + d.title + also + milkMsg + (d.flag && !editing ? ' · ⚠️ worth a look in History' : ''), editing ? null : { label: 'Undo', fn: function () {
        S.removeEvent(ev.id); copies.forEach(function (c) { S.removeEvent(c.id); });
        // Put the milk back the way it was.
        if (mk) {
          var made = mk.stored || mk.leftover;
          if (made) S.get().milk = S.get().milk.filter(function (m) { return m.id !== made.id; });
          var src = mk.fromId && S.milkItem(mk.fromId);
          if (src) { src.status = 'active'; delete src.doneAt; }
        }
        commit();
      } });
    } else if (f.id === 'welcome-form' || f.id === 'baby-form') {
      e.preventDefault();
      var fd = new FormData(f), name = String(fd.get('name') || '').trim(), birth = String(fd.get('birth') || '');
      if (!name) { h.fieldError(f, 'name', 'Add your baby’s name — a nickname is fine.'); return; }
      if (!birth) { h.fieldError(f, 'birth', 'Add the date of birth — feeding and sleep guidance depend on age.'); return; }
      if (birth > h.todayISO()) { h.fieldError(f, 'birth', 'The birth date can’t be in the future.'); return; }
      var data = { name: name, birth: birth, feeding: String(fd.get('feeding') || 'breast') };
      if (fd.get('emoji')) data.emoji = String(fd.get('emoji'));
      if (fd.has('sex')) data.sex = String(fd.get('sex') || '');
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
      // Check before touching the saved reminder, so a failed edit changes nothing.
      if (String(fd2.get('repeat')) === 'once' && !h.fromLocalInput(String(fd2.get('at')))) { h.fieldError(f, 'at', 'Pick the date and time for this reminder.'); return; }
      var r = rid ? S.get().custom.filter(function (x) { return x.id === rid; })[0] : { id: S.uid(), baby: S.get().activeBaby, created: Date.now() };
      r.label = String(fd2.get('label') || '').trim() || 'Reminder';
      r.note = String(fd2.get('note') || '').trim();
      r.icon = String(fd2.get('icon') || '🔔');
      r.repeat = String(fd2.get('repeat'));
      r.on = true;
      if (r.repeat === 'every') { r.everyH = parseFloat(fd2.get('everyH')) || 3; r.anchor = h.fromLocalInput(String(fd2.get('anchor'))) || Date.now(); }
      if (r.repeat === 'daily') r.time = String(fd2.get('time') || '09:00');
      if (r.repeat === 'once') r.at = h.fromLocalInput(String(fd2.get('at')));
      if (!rid) S.get().custom.push(r);
      h.closeSheet(); commit(); h.toast('Reminder saved 🔔');
    }
  }

  // US visitors get oz / °F / lb by default.
  function saveHealthForm(f) {
    var H = S.health(), id = f.getAttribute('data-id'), fd = function (n) { var el = f.elements[n]; return el ? String(el.value).trim() : ''; };
    if (f.id === 'appt-form') {
      var at = h.fromLocalInput(fd('at'));
      if (!at) { h.fieldError(f, 'at', 'Pick the date and time of the visit.'); return; }
      var a = id ? S.findIn(H.appointments, id) : { id: S.uid() };
      a.at = at; a.type = (f.querySelector('input[name="type"]:checked') || {}).value || 'checkup';
      a.title = fd('title'); a.doctor = fd('doctor'); a.place = fd('place'); a.questions = fd('questions');
      if (f.elements.outcome) a.outcome = fd('outcome');
      if (f.elements.done) a.done = f.elements.done.checked;
      if (!id) H.appointments.push(a);
      if (!H.profile.doctor && a.doctor) H.profile.doctor = a.doctor;
      h.closeSheet(); commit(); h.toast(id ? 'Visit saved' : 'Visit added — you’ll get a reminder the evening before');
    } else if (f.id === 'rx-form') {
      var d = Hl.readRx(f);
      if (!d.name) { h.fieldError(f, 'name', 'What’s the medicine called?'); return; }
      var rx = id ? S.findIn(H.rx, id) : { id: S.uid(), created: Date.now() };
      Object.keys(d).forEach(function (k) { rx[k] = d[k]; });
      rx.prescriber = fd('prescriber');
      if (!id) H.rx.push(rx);
      h.closeSheet(); commit(); h.toast(id ? 'Saved' : rx.name + ' added' + (rx.remind ? ' — reminders on' : ''));
    } else if (f.id === 'scan-form') {
      Hl.syncScanForm();
      var sc = Hl.scan(), added = [];
      sc.meds.forEach(function (m) {
        if (!m.include || !m.name) return;
        var r = { id: S.uid(), created: Date.now(), photoId: sc.photoId, prescriber: sc.doctor || '' };
        ['name', 'strength', 'dose', 'intervalH', 'durationDays', 'timesPerDay', 'prn', 'instructions', 'start', 'remind'].forEach(function (k) { r[k] = m[k]; });
        H.rx.push(r); added.push(r.name);
      });
      if (!added.length) { h.toast('Tick at least one medicine with a name, or Cancel.'); return; }
      H.docs.push({ id: S.uid(), title: 'Prescription' + (sc.doctor ? ' — ' + sc.doctor : ''), date: Date.now(), photoId: sc.photoId, notes: added.join(', ') });
      Hl.setScanSaved(); h.closeSheet(); App.ui.view = 'health'; commit();
      h.toast('Saved ' + added.join(', '));
    } else if (f.id === 'vax-form') {
      var key = f.getAttribute('data-key'), dt = Hl.fromIsoDate(fd('date'));
      if (!dt) { h.fieldError(f, 'date', 'Pick the date it was given.'); return; }
      H.vaccines.given[key] = { date: dt, note: fd('note') };
      S.save(); Hl.vaxSheet(); render(); h.toast('Vaccine recorded ✅');
    } else if (f.id === 'vaxc-form') {
      if (!fd('name')) { h.fieldError(f, 'name', 'Which vaccine was it?'); return; }
      var c = id ? S.findIn(H.vaccines.custom, id) : { id: S.uid() };
      c.name = fd('name'); c.date = Hl.fromIsoDate(fd('date')) || Date.now(); c.note = fd('note');
      if (!id) H.vaccines.custom.push(c);
      S.save(); Hl.vaxSheet(); render();
    } else if (f.id === 'profile-form') {
      ['blood', 'allergies', 'conditions', 'doctor', 'clinic', 'phone', 'insurance', 'notes'].forEach(function (k) { H.profile[k] = fd(k); });
      h.closeSheet(); commit(); h.toast('Health profile saved');
    } else if (f.id === 'doc-form') {
      var doc = id ? S.findIn(H.docs, id) : { id: S.uid() }, oldPhoto = doc.photoId;
      doc.title = fd('title') || 'Document'; doc.date = Hl.fromIsoDate(fd('date')) || Date.now(); doc.notes = fd('notes'); doc.photoId = fd('photoId') || null;
      if (!id) H.docs.push(doc);
      if (oldPhoto && oldPhoto !== doc.photoId) dropPhotoIfUnused(oldPhoto);
      h.closeSheet(); commit(); h.toast('Document saved');
    }
  }

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

  /* ---------- When saving fails ----------
     Storage full or blocked: say so plainly and offer the way out (a backup),
     instead of letting entries vanish on the next launch. */
  function showSaveWarning(on) {
    var el = $('#save-warning');
    if (!el) return;
    if (!on) { el.hidden = true; return; }
    if (!el.hidden) return;
    el.innerHTML = '<span class="banner__icon" aria-hidden="true">⚠️</span><div class="banner__text"><div class="banner__title">Not saved — your phone’s storage is full or blocked</div>' +
      '<div class="banner__sub">New entries will be lost when Baby Log closes. Free up space, or save a backup now.</div></div>' +
      '<div class="banner__actions"><button class="btn btn--sm btn--primary" data-action="export-json">Save a backup</button><button class="btn btn--sm" data-action="save-retry">Try again</button></div>';
    el.hidden = false;
  }
  ACTIONS['save-retry'] = function () { if (S.save()) h.toast('Saved ✓'); };

  // The phone's status bar follows the theme (it's set once in index.html).
  function syncThemeColor() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', (getComputedStyle(document.documentElement).getPropertyValue('--bg-1') || '#0e1424').trim());
  }

  function boot() {
    S.onSaveError = function () { showSaveWarning(true); };
    S.onSaveOk = function () { showSaveWarning(false); };
    S.load();
    h.initTips();
    h.initSheetGestures();
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !App.ui.sheet) return;
      var dlg = $('#confirm'); if (dlg && dlg.open) return; // Escape cancels the dialog, not the sheet under it
      h.closeSheet(); render();
    });
    // Fixing a field clears its error.
    document.addEventListener('input', function (e) { var t = e.target; if (t.getAttribute && t.getAttribute('aria-invalid')) h.clearFieldErrors(t.form); });
    // Anything waiting to be saved goes to storage before the phone can suspend the app.
    window.addEventListener('pagehide', function () { S.flush(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) S.flush(); });
    syncThemeColor();
    if (window.MutationObserver) new MutationObserver(syncThemeColor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    try { history.replaceState({ babyView: 'today', root: true }, ''); } catch (e) {}
    document.addEventListener('pointerdown', function unlock() { Snd.unlock(); document.removeEventListener('pointerdown', unlock); });
    $('#import-file').addEventListener('change', function (e) { var f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; });
    var bf = $('#welcome-form input[name="birth"]'); if (bf) bf.max = h.todayISO();
    if (usesImperial()) { var imp = $('#welcome-form input[value="imperial"]'); if (imp) imp.checked = true; }
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); App.installPrompt = e; if (App.ui.view === 'today') softRender(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { checkReminders(); softRender(); refreshPermission(); } });

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').then(function (r) { swReg = r; }).catch(function () {});
      navigator.serviceWorker.addEventListener && navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'focus') { checkReminders(); softRender(); } });
    }

    N.init(function () { checkReminders(); softRender(); });
    refreshPermission();
    render();
    // In the app shell, bring back a log the WebView lost (e.g. iOS clearing storage).
    N.restoreIfEmpty().then(function (restored) { if (restored) { render(); h.toast('Your log was restored ✓'); } });
    N.syncReminders();
    setInterval(h.tick, 1000);
    setInterval(checkReminders, 15000);
    setInterval(softRender, 60000);
    setTimeout(checkReminders, 1500);
    if (window.BabyShare) BabyShare.init();
    if (window.BabyMic) BabyMic.init();
    runShortcut();
  }

  // Home-screen shortcuts (long-press the app icon): ./?do=sleep|diaper|feed|voice
  function runShortcut() {
    var m = /[?&]do=(\w+)/.exec(location.search);
    if (!m) return;
    try { history.replaceState(history.state, '', location.pathname + location.hash); } catch (e) {}
    if (!S.baby()) return;
    App.ui.view = 'today'; render();
    if (m[1] === 'sleep') ACTIONS['sleep-toggle']();
    else if (m[1] === 'diaper' || m[1] === 'feed') F.open(m[1]);
    else if (m[1] === 'voice' && window.BabyMic) { if (S.get().settings.voice && BabyMic.supported()) BabyMic.listen(); else { showView('settings'); h.toast('Turn on voice logging first (Settings → Today screen).'); } }
  }

  // Exposed for tests / debugging.
  App.handoffText = handoffText;
  App.checkReminders = checkReminders;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
