/* =========================================================
   Kalinga — app.js
   Boot and wiring:
   - first run (who are we caring for?) -> caregiver mode with
     the profile/conditions sheet open;
   - render(): welcome, caregiver app (4 tabs) or elder mode;
   - the PIN: set before handing the phone to the elder, asked
     to come back to the caregiver screens;
   - reminders -> the dose card (elder mode), notifications;
   - settings: language, sugar unit, theme, test alarm,
     backup / restore / erase;
   - one click and one change delegate for every data-action.
   ========================================================= */
(function () {
  'use strict';

  var App = window.KalingaApp, h = App.h, I = window.KalingaI18n, t = I.t, K = window.KalingaStore;
  var R = window.KalingaReminders, Voice = window.KalingaVoice, F = window.KalingaFiles, E = window.KalingaElder, CARE = window.KalingaCare;
  var esc = h.esc;

  var S = App.store = K.create();
  S.load();
  App.changeActions = App.changeActions || {};

  function st() { return S.get(); }
  function dev() { return st().device; }
  function elder() { return dev().elderId ? S.find('elders', dev().elderId) : null; }

  /* ---------- Saving ---------- */
  S.onSaveError = function () { var b = h.$('#save-warning'); b.textContent = t('app.notSaved'); b.hidden = false; };
  /* Another copy of the app saved since this one loaded. With nothing open,
     just reload (the elder never sees it); otherwise say so, in either mode. */
  S.onConflict = function () {
    if (!App.ui.sheet && !E.isDoseOpen()) { location.reload(); return; }
    var b = h.$('#save-warning');
    b.innerHTML = esc(t('app.otherCopy')) + ' <button class="btn btn--sm" data-action="reload">' + esc(t('app.reload')) + '</button>';
    b.hidden = false;
  };
  App.commit = function () { S.save(); render(); };

  /* ---------- Words ---------- */
  function applyLang() {
    I.setLang(st().settings.lang);
    h.resetFormats();
    document.documentElement.lang = I.getLang() === 'en' ? 'en' : 'fil';
    h.$all('[data-t]').forEach(function (n) { n.textContent = t(n.getAttribute('data-t')); });
    h.$all('[data-ph]').forEach(function (n) { n.placeholder = t(n.getAttribute('data-ph')); });
    h.$('#sheet-close').setAttribute('aria-label', t('c.close'));
  }

  /* ---------- Screen colours ----------
     'light' (Alaga's day palette), 'dark' (night mode) or 'auto' (follow the
     phone). Saved per phone in localStorage['kalinga-theme']; the inline script
     in <head> applies it before the first paint. */
  var darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function themeChoice() { try { return localStorage.getItem('kalinga-theme') || 'light'; } catch (e) { return 'light'; } }
  function applyTheme() {
    var c = themeChoice(), th = c === 'auto' ? (darkQuery && darkQuery.matches ? 'dark' : 'light') : c;
    document.documentElement.setAttribute('data-theme', th);
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', th === 'dark' ? '#0e1424' : '#f6f4fb');
    var b = h.$('#theme-btn');
    if (b) { b.textContent = th === 'dark' ? '☀️' : '🌙'; b.setAttribute('aria-label', th === 'dark' ? t('theme.light') : t('theme.dark')); }
  }
  function setTheme(c) { try { localStorage.setItem('kalinga-theme', c); } catch (e) {} applyTheme(); }
  App.themeChoice = themeChoice;
  if (darkQuery) { var onScheme = function () { if (themeChoice() === 'auto') applyTheme(); }; if (darkQuery.addEventListener) darkQuery.addEventListener('change', onScheme); else if (darkQuery.addListener) darkQuery.addListener(onScheme); }

  /* ---------- Render ---------- */
  var VIEWS = { today: 'today', meds: 'meds', vitals: 'vitals', more: 'more' };
  function render() {
    var el = elder();
    if (!el && S.list('elders').length) { dev().elderId = S.list('elders')[0].id; el = elder(); }
    var mode = !el ? 'welcome' : dev().mode === 'elder' ? 'elder' : 'care';
    h.$('#welcome').hidden = mode !== 'welcome';
    h.$('#app').hidden = mode !== 'care';
    h.$('#elder').hidden = mode !== 'elder';
    document.body.classList.toggle('mode-elder', mode === 'elder');
    var ts = dev().textSize || 'normal';
    document.body.classList.toggle('tx-large', ts === 'large');
    document.body.classList.toggle('tx-xlarge', ts === 'xlarge');
    if (mode === 'elder') { h.patch(h.$('#elder-view'), E.home()); return; }
    if (mode !== 'care') return;
    var chip = h.$('#elderchip'), chipHtml = window.KalingaApp.k.elderFace(el) + '<span class="elderchip__name">' + esc(el.name) + '</span>' + (S.list('elders').length > 1 ? ' ▾' : '');
    if (chip._html !== chipHtml) { chip.innerHTML = chipHtml; chip._html = chipHtml; F.hydrate(chip); }
    h.$('#handover-btn').textContent = '🤲 ' + t('top.hand', { name: el.name });
    var view = VIEWS[App.ui.view] || 'today';
    h.$all('.tab').forEach(function (b) { if (b.getAttribute('data-view') === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    h.patch(h.$('#view'), CARE[view]());
  }
  App.render = render;

  function go(view) {
    App.ui.view = view;
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- First run ---------- */
  h.$('#welcome-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = e.target.elements.name.value.trim();
    if (!name) { h.fieldError(e.target, 'name', t('err.no-name')); return; }
    var el = S.addElder({ name: name }, '');
    dev().mode = 'caregiver';
    dev().elderId = el.id;
    App.commit();
    CARE.openProfile(false);
  });

  /* ---------- PIN ---------- */
  function hashPin(pin) {
    var s = 'kalinga-pin:' + pin, h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  var pin = null; // { mode: 'check'|'set'|'repeat', entry, first, msg, then }
  function pinHtml() {
    var title = pin.mode === 'check' ? t('pin.title') : pin.mode === 'set' ? t('pin.new') : t('pin.again');
    var dots = '<div class="keypad__display" aria-live="polite" style="letter-spacing:.4em">' + ('●●●●'.slice(0, pin.entry.length) + '○○○○'.slice(pin.entry.length)) + '</div>';
    return '<div class="keypad"><div class="keypad__label">' + esc(title) + '</div>' + dots +
      (pin.msg ? '<p class="field__error" role="alert" style="grid-column:1/-1;text-align:center;margin:0">' + esc(pin.msg) + '</p>' : '') +
      (pin.mode === 'set' ? '<p class="fineprint" style="grid-column:1/-1;text-align:center">' + esc(t('pin.newHint', { name: (elder() || {}).name || '' })) + '</p>' : '') +
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(function (c) { return c ? '<button data-action="pin-key" data-value="' + c + '" aria-label="' + (c === '⌫' ? 'Delete' : c) + '">' + c + '</button>' : '<span></span>'; }).join('') + '</div>';
  }
  function openPin(mode, then) {
    pin = { mode: mode, entry: '', first: '', msg: '', then: then };
    h.openSheet({ title: '🔒', html: pinHtml, elder: mode === 'check', onclose: function () { pin = null; } });
  }
  function pinKey(c) {
    if (!pin) return;
    if (c === '⌫') { pin.entry = pin.entry.slice(0, -1); h.renderSheet(); return; }
    if (pin.entry.length >= 4) return;
    pin.entry += c; pin.msg = '';
    if (pin.entry.length < 4) { h.renderSheet(); return; }
    var entry = pin.entry, then = pin.then;
    if (pin.mode === 'check') {
      if (hashPin(entry) === dev().pin) { h.closeSheet(); then(); }
      else { pin.entry = ''; pin.msg = t('pin.wrong'); h.renderSheet(); }
      return;
    }
    if (pin.mode === 'set') { pin.first = entry; pin.entry = ''; pin.mode = 'repeat'; h.renderSheet(); return; }
    if (entry !== pin.first) { pin.entry = ''; pin.first = ''; pin.mode = 'set'; pin.msg = t('pin.mismatch'); h.renderSheet(); return; }
    dev().pin = hashPin(entry);
    S.save();
    h.closeSheet();
    if (then) then();
  }
  function toElderMode() {
    dev().mode = 'elder';
    App.ui.view = 'today';
    App.commit();
    window.scrollTo(0, 0);
    R.tick();
  }

  /* ---------- Backup ---------- */
  function fileIds() {
    var ids = [];
    S.get().elders.forEach(function (e) { if (e.photoId) ids.push(e.photoId); Object.keys(e.voice || {}).forEach(function (p) { if (e.voice[p]) ids.push(e.voice[p]); }); });
    S.get().meds.forEach(function (m) { if (m.photoId) ids.push(m.photoId); if (m.voiceId) ids.push(m.voiceId); });
    S.get().readings.forEach(function (r) { if (r.photoId) ids.push(r.photoId); });
    return ids;
  }
  function backup() {
    F.exportAll(fileIds()).then(function (files) {
      var data = JSON.stringify({ app: 'kalinga', v: 1, at: Date.now(), state: S.get(), files: files });
      var a = document.createElement('a'), url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      a.href = url; a.download = 'kalinga-backup-' + h.todayISO() + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    }).catch(function (e) { h.toast(e.message); });
  }
  h.$('#restore-file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var rd = new FileReader();
    rd.onload = function () {
      var data = null;
      try { data = JSON.parse(rd.result); } catch (x) {}
      if (!data || data.app !== 'kalinga' || !data.state) { h.toast(t('more.badBackup')); return; }
      h.ask({ title: t('more.restoreAsk'), ok: t('more.restore'), danger: true }, function () {
        var keepDevice = S.get().device;
        F.importAll(data.files || {}).then(function () {
          S.set(data.state);
          S.get().device = Object.assign({}, data.state.device || {}, { id: keepDevice.id });
          if (!S.get().device.mode) S.get().device.mode = 'caregiver';
          App.commit(); applyLang(); render();
          h.toast(t('more.restored'));
        }).catch(function (x) { h.toast(x.message); });
      });
    };
    rd.readAsText(file);
  });
  function erase() {
    h.ask({ title: t('more.erase') + '?', text: t('more.eraseAsk'), ok: t('c.delete'), danger: true }, function () {
      S.set(K.defaults());
      S.save();
      R.reset();
      App.ui.view = 'today';
      render();
      F.destroy();
    });
  }

  /* ---------- Test alarm ---------- */
  function testRing() {
    var text = I.getLang() === 'en' ? 'This is a Kalinga test reminder. The medicine reminders will sound like this.' : 'Ito ay test ng paalala ng Kalinga. Ganito tutunog ang mga paalala sa gamot.';
    R.alarm(function (done) { Voice.say(text, { onend: done }); });
    var el0 = elder();
    if (el0) { S.update('elders', el0.id, { setup: Object.assign({}, el0.setup || {}, { test: true }) }, ''); S.save(); }
    R.notify('Kalinga 🔔', text, 'test');
    h.openSheet({ title: '🔔 Test', elder: dev().mode === 'elder', html: '<div class="dose__done"><span class="dose__done-icon" aria-hidden="true">🔔</span><p>' + esc(text) + '</p></div><button class="btn btn--primary el-btn el-btn--huge btn--block" data-action="sheet-close">' + esc(t('c.done')) + '</button>', onclose: R.stopAlarm });
  }

  /* ---------- Actions ---------- */
  App.addActions({
    'go': function (n) { go(n.getAttribute('data-view')); },
    'sheet-close': function () { h.closeSheet(); render(); },
    'reload': function () { location.reload(); },
    'lang-toggle': function () { st().settings.lang = I.getLang() === 'en' ? 'tl' : 'en'; S.save(); applyLang(); },
    'handover': function () {
      var el = elder(); if (!el) return;
      h.ask({ title: t('dash.handOver', { name: el.name }), text: t('dash.handOverSub', { name: el.name }), ok: '🤲 OK' }, function () {
        if (!dev().pin) openPin('set', toElderMode); else toElderMode();
      });
    },
    'pin-open': function () {
      if (!dev().pin) { dev().mode = 'caregiver'; App.commit(); return; }
      openPin('check', function () { dev().mode = 'caregiver'; App.commit(); });
    },
    'pin-set': function () { openPin('set', function () { h.toast(t('c.saved')); render(); }); },
    'pin-key': function (n) { pinKey(n.getAttribute('data-value')); },
    'notify-ask': function () { R.askNotify().then(function () { render(); }); },
    'test-alarm': function () { R.setTest(60000); h.toast(t('more.testSet')); },
    'backup': backup,
    'restore-open': function () { h.$('#restore-file').click(); },
    'erase': erase,
    'theme-toggle': function () { setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); render(); }
  });
  App.changeActions['set-lang'] = function (n) { st().settings.lang = n.value; S.save(); applyLang(); render(); };
  App.changeActions['set-textsize'] = function (n) { dev().textSize = n.value; App.commit(); };
  App.changeActions['set-sugar'] = function (n) { st().settings.sugarUnit = n.value; App.commit(); };
  App.changeActions['set-theme'] = function (n) { setTheme(n.value); render(); };

  document.addEventListener('click', function (e) {
    var n = e.target.closest && e.target.closest('[data-action]');
    if (!n || n.disabled) return;
    var fn = App.actions[n.getAttribute('data-action')];
    if (!fn) return;
    if (n.tagName === 'A' && n.getAttribute('href')) return;
    e.preventDefault();
    fn(n, e);
  });
  document.addEventListener('change', function (e) {
    var n = e.target.closest && e.target.closest('[data-action-change]');
    if (!n) return;
    var fn = App.changeActions[n.getAttribute('data-action-change')];
    if (fn) fn(n, e);
  });
  h.initBack(function () { if (dev().mode !== 'elder' && App.ui.view !== 'today') go('today'); });

  /* ---------- Reminders ---------- */
  R.start({
    // Returns false when it could not ring now (another slot's card is open), so it rings later.
    ring: function (slot) {
      var names = slot.items.map(function (it) { var m = S.find('meds', it.medId); return m ? m.name : ''; }).filter(Boolean).join(', ');
      if (E.isDoseOpen()) {
        if (E.doseSlot() !== slot.slotKey) return false;
        E.realarm(); // the card is still up: a re-ring sounds again
      } else {
        if (App.ui.sheet) h.closeSheet();
        E.openDose(slot.slotKey, true);
      }
      R.notify('⏰ ' + t('el.nowDue'), h.fmtTime(slot.at) + ' — ' + names, slot.slotKey);
      return true;
    },
    measure: function (list) {
      var what = list.map(function (m) { return App.k.vitalName(m.type); }).join(', ');
      R.chime();
      R.notify('🩺 ' + t('el.measure'), t('el.measureDue', { what: what }), 'measure');
      h.toast(t('el.measureDue', { what: what }));
      render();
    },
    test: testRing
  });
  // Keep "in 2 hours" and the tiles fresh.
  setInterval(function () { if (!document.hidden && !App.ui.sheet && !E.isDoseOpen()) render(); }, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
    navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'focus') R.tick(); });
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  applyLang();
  applyTheme();
  render();
})();
