/* =========================================================
   Baby Log — ui.js
   Shared UI helpers: DOM, formatting, units, event
   descriptions, the bottom sheet, toasts and tooltips.
   Every other UI module hangs off window.BabyApp.
   ========================================================= */
(function () {
  'use strict';

  var G = window.BabyGuide, S = window.BabyStore;
  var MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  var ua = navigator.userAgent || '';
  var App = window.BabyApp = {
    platform: {
      ios: /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
      standalone: !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches))
    },
    installPrompt: null,
    ui: { view: 'today', historyType: 'all', historyDays: 7, trendDays: 7, sheet: null, alerts: [] },
    commit: null,   // set by app.js: save + re-render
    render: null
  };

  /* ---------- DOM ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  /* ---------- Time ---------- */
  function fmtTime(t) { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function fmtDate(t) { return new Date(t).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); }
  function dayLabel(t, now) {
    var d0 = S.startOfDay(now || Date.now()), d = S.startOfDay(t);
    if (d === d0) return 'Today';
    if (d === d0 - DAY || Math.round((d0 - d) / DAY) === 1) return 'Yesterday';
    return fmtDate(t);
  }
  function shortDay(t, now) {
    var d0 = S.startOfDay(now || Date.now()), d = S.startOfDay(t);
    if (d === d0) return 'Today';
    return new Date(t).toLocaleDateString([], { weekday: 'narrow' }) + new Date(t).getDate();
  }
  function ago(t, now) {
    var m = ((now || Date.now()) - t) / MIN;
    return m < 1 ? 'just now' : G.fmtDur(m) + ' ago';
  }
  function until(t, now) {
    var m = (t - (now || Date.now())) / MIN;
    if (m <= 0) return m > -1 ? 'now' : G.fmtDur(-m) + ' ago';
    return 'in ' + G.fmtDur(m);
  }
  // 1:05:09 or 12:04
  function clock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return h ? h + ':' + p(m) + ':' + p(ss) : m + ':' + p(ss);
  }
  function durMs(ms) { return G.fmtDur(ms / MIN); }
  function hoursStr(ms) { var h = ms / HOUR; return (Math.round(h * 10) / 10) + 'h'; }

  function toLocalInput(ms) {
    var d = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fromLocalInput(v) {
    if (!v) return null;
    var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(v);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null;
  }
  function todayISO() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

  /* ---------- Units (stored: ml, °C, kg, cm) ---------- */
  var OZ = 29.5735, LB = 0.45359237, IN = 2.54;
  function st() { return S.get().settings; }
  function volUnit() { return st().volume === 'oz' ? 'oz' : 'ml'; }
  function volToDisplay(ml) { return st().volume === 'oz' ? Math.round((ml / OZ) * 10) / 10 : Math.round(ml); }
  function volFromDisplay(v) { v = parseFloat(v); if (isNaN(v)) return 0; return st().volume === 'oz' ? v * OZ : v; }
  function vol(ml) { return volToDisplay(ml) + ' ' + volUnit(); }
  function tempUnit() { return st().temp === 'F' ? '°F' : '°C'; }
  function tempToDisplay(c) { return st().temp === 'F' ? Math.round((c * 9 / 5 + 32) * 10) / 10 : Math.round(c * 10) / 10; }
  function tempFromDisplay(v) { v = parseFloat(v); if (isNaN(v)) return null; return st().temp === 'F' ? (v - 32) * 5 / 9 : v; }
  function temp(c) { return tempToDisplay(c) + ' ' + tempUnit(); }
  function imperial() { return st().length === 'in'; }
  function weightUnit() { return imperial() ? 'lb' : 'kg'; }
  function weightToDisplay(kg) { return imperial() ? Math.round((kg / LB) * 100) / 100 : Math.round(kg * 1000) / 1000; }
  function weightFromDisplay(v) { v = parseFloat(v); if (isNaN(v)) return null; return imperial() ? v * LB : v; }
  function weight(kg) {
    if (!imperial()) return (Math.round(kg * 100) / 100) + ' kg';
    var oz = Math.round(kg / LB * 16), lb = Math.floor(oz / 16);
    return lb + ' lb ' + (oz % 16) + ' oz';
  }
  function lenUnit() { return imperial() ? 'in' : 'cm'; }
  function lenToDisplay(cm) { return imperial() ? Math.round((cm / IN) * 10) / 10 : Math.round(cm * 10) / 10; }
  function lenFromDisplay(v) { v = parseFloat(v); if (isNaN(v)) return null; return imperial() ? v * IN : v; }
  function len(cm) { return lenToDisplay(cm) + ' ' + lenUnit(); }

  /* ---------- Event types ---------- */
  var TYPES = {
    feed:      { icon: '🍼', label: 'Feed' },
    diaper:    { icon: '🧷', label: 'Diaper' },
    sleep:     { icon: '😴', label: 'Sleep' },
    pump:      { icon: '🧴', label: 'Pump' },
    tummy:     { icon: '🤸', label: 'Tummy time' },
    med:       { icon: '💊', label: 'Medicine' },
    temp:      { icon: '🌡️', label: 'Temperature' },
    growth:    { icon: '📏', label: 'Growth' },
    bath:      { icon: '🛁', label: 'Bath' },
    milestone: { icon: '⭐', label: 'Milestone' },
    note:      { icon: '📝', label: 'Note' }
  };

  function describe(e, now) {
    var d = e.data || {}, days = S.ageDays(e.time, e.baby);
    var out = { icon: (TYPES[e.type] || {}).icon || '•', title: (TYPES[e.type] || {}).label || e.type, sub: '', flag: false };
    switch (e.type) {
      case 'feed':
        if (d.kind === 'breast') {
          out.icon = '🤱'; out.title = 'Breastfeed';
          var parts = [];
          if (d.left) parts.push('L ' + durMs(d.left));
          if (d.right) parts.push('R ' + durMs(d.right));
          out.sub = parts.join(' · ') + (d.startSide ? ' · started ' + d.startSide : '');
        } else if (d.kind === 'bottle') {
          out.title = 'Bottle'; out.sub = vol(d.amountMl || 0) + ' ' + (d.milk === 'formula' ? 'formula' : 'breast milk');
        } else if (d.kind === 'solids') {
          out.icon = '🥣'; out.title = 'Solids';
          out.sub = (d.food || 'Food') + (d.newFood ? ' · first try' : '') + (d.reaction ? ' · ' + REACTIONS[d.reaction] : '');
          out.flag = d.reaction === 'reaction';
        }
        break;
      case 'diaper':
        out.title = d.wet && d.dirty ? 'Wet + dirty' : d.dirty ? 'Dirty' : d.wet ? 'Wet' : 'Dry';
        out.icon = d.dirty ? '💩' : d.wet ? '💧' : '🧷';
        var c = d.color ? G.poopColor(d.color) : null;
        var tx = d.texture ? G.POOP_TEXTURES.filter(function (t) { return t.id === d.texture; })[0] : null;
        out.sub = [c && c.label, tx && tx.label, d.rash && 'rash'].filter(Boolean).join(' · ');
        var pc = d.color ? G.poopCheck(d.color, days) : null;
        out.flag = !!(pc && pc.level !== 'ok' && pc.level !== 'info') || d.texture === 'hard';
        break;
      case 'sleep':
        out.sub = e.end ? durMs(e.end - e.time) + ' · ' + fmtTime(e.time) + '–' + fmtTime(e.end) : 'Asleep';
        break;
      case 'pump':
        out.sub = vol(d.amountMl || 0) + (d.leftMl && d.rightMl ? ' (L ' + volToDisplay(d.leftMl) + ' · R ' + volToDisplay(d.rightMl) + ')' : d.leftMl ? ' · left' : d.rightMl ? ' · right' : '') + (d.durationMin ? ' · ' + d.durationMin + ' min' : '');
        break;
      case 'tummy':
        out.sub = e.end ? durMs(e.end - e.time) : '';
        break;
      case 'med':
        out.title = d.name || 'Medicine';
        out.sub = d.dose || '';
        break;
      case 'temp':
        out.sub = (d.tempC != null ? temp(d.tempC) : '') + (d.method ? ' · ' + d.method : '');
        var f = G.feverCheck(d.tempC, days);
        out.flag = !!(f && f.level !== 'ok');
        break;
      case 'growth':
        out.sub = [d.weightKg && weight(d.weightKg), d.lengthCm && len(d.lengthCm), d.headCm && 'head ' + len(d.headCm)].filter(Boolean).join(' · ');
        break;
    }
    if (d.note) out.sub = out.sub ? out.sub + ' · ' + d.note : d.note;
    return out;
  }

  var REACTIONS = { loved: '😋 loved it', ok: '😐 okay', refused: '🙅 refused', reaction: '⚠️ reaction' };

  /* ---------- Toasts ---------- */
  function toast(msg, action) {
    var wrap = $('#toasts');
    // One at a time — a stack of toasts would cover the form underneath.
    wrap.innerHTML = '';
    var n = document.createElement('div');
    n.className = 'toast';
    n.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button">' + esc(action.label) + '</button>' : '');
    if (action) n.querySelector('button').addEventListener('click', function () { action.fn(); n.remove(); });
    wrap.appendChild(n);
    setTimeout(function () { n.style.opacity = '0'; n.style.transition = 'opacity .3s'; }, action ? 5200 : 2600);
    setTimeout(function () { n.remove(); }, action ? 5600 : 3000);
  }

  /* ---------- Bottom sheet ---------- */
  // Each open sheet gets a history entry, so the phone's Back button (or
  // gesture) closes the sheet instead of leaving the app.
  var lastFocus = null, ignorePop = false;
  function openSheet(spec) {
    // spec: { title, kind, html: fn() | string, mount?: fn(body) }
    App.ui.sheet = spec;
    var sheet = $('#sheet');
    if (sheet.hidden) {
      lastFocus = document.activeElement;
      try { if (!(history.state && history.state.babySheet)) history.pushState({ babySheet: 1 }, ''); } catch (e) {}
    }
    $('.sheet__panel').style.transform = '';
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    document.body.style.overflow = 'hidden';
    renderSheet();
    var f = $('.sheet__panel [autofocus]') || $('.sheet__panel .iconbtn');
    if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }, 30);
  }
  function renderSheet() {
    var spec = App.ui.sheet;
    if (!spec) return;
    var body = $('#sheet-body');
    var scroll = body.scrollTop;
    $('#sheet-title').textContent = typeof spec.title === 'function' ? spec.title() : spec.title;
    body.innerHTML = typeof spec.html === 'function' ? spec.html() : spec.html;
    body.scrollTop = scroll;
    if (spec.mount) spec.mount(body);
    if (window.BabyFiles) window.BabyFiles.hydrate(body);
    tick();
  }
  function closeSheet(fromBack) {
    var spec = App.ui.sheet;
    if (!spec && $('#sheet').hidden) return;
    App.ui.sheet = null;
    if (fromBack !== true) try { if (history.state && history.state.babySheet) { ignorePop = true; history.back(); } } catch (e) {}
    $('#sheet').hidden = true;
    document.body.classList.remove('sheet-open');
    $('#sheet-body').innerHTML = '';
    document.body.style.overflow = '';
    if (spec && spec.onclose) spec.onclose();
    if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
  }

  function initSheetGestures() {
    window.addEventListener('popstate', function () {
      if (ignorePop) {
        ignorePop = false;
        // A new sheet opened before the old one's Back finished: give it its own entry.
        if (App.ui.sheet) try { history.pushState({ babySheet: 1 }, ''); } catch (e) {}
        return;
      }
      if (App.ui.sheet) { closeSheet(true); if (App.render) App.render(); }
    });
    // Swipe the sheet's handle or title bar down to close it.
    var panel = $('.sheet__panel'), startY = null, dy = 0;
    function down(e) {
      if (!e.target.closest('.sheet__grab, .sheet__head') || e.target.closest('button')) return;
      startY = e.clientY; dy = 0; panel.style.transition = 'none';
      try { panel.setPointerCapture(e.pointerId); } catch (x) {}
    }
    function move(e) {
      if (startY == null) return;
      dy = Math.max(0, e.clientY - startY);
      panel.style.transform = 'translateY(' + dy + 'px)';
    }
    function up() {
      if (startY == null) return;
      startY = null; panel.style.transition = '';
      if (dy > 90) { closeSheet(); if (App.render) App.render(); }
      else panel.style.transform = '';
    }
    panel.addEventListener('pointerdown', down);
    panel.addEventListener('pointermove', move);
    panel.addEventListener('pointerup', up);
    panel.addEventListener('pointercancel', up);
  }

  // "2 min", "1h 5m" — friendlier than a stopwatch for "how long ago / how long awake".
  function since(ms) { return ms < 60000 ? '<1 min' : G.fmtDur(ms / MIN); }

  /* ---------- Live clocks ----------
     [data-ago="ms"]      -> "12 min ago"
     [data-elapsed="ms"]  -> "1:02:33"
     [data-until="ms"]    -> "in 25 min"
     [data-breast="L|R|T"] -> breast timer totals */
  function tick() {
    var now = Date.now();
    $all('[data-ago]').forEach(function (n) { n.textContent = ago(+n.getAttribute('data-ago'), now); });
    $all('[data-elapsed]').forEach(function (n) { n.textContent = clock(now - +n.getAttribute('data-elapsed')); });
    $all('[data-since]').forEach(function (n) { n.textContent = since(now - +n.getAttribute('data-since')); });
    $all('[data-until]').forEach(function (n) { n.textContent = until(+n.getAttribute('data-until'), now); });
    var b = S.get().activeBaby && S.timers().breast;
    if (b) {
      var tt = S.breastTotals(b, now);
      $all('[data-breast]').forEach(function (n) { var k = n.getAttribute('data-breast'); n.textContent = clock(k === 'L' ? tt.L : k === 'R' ? tt.R : tt.total); });
    }
    var pm = S.get().activeBaby && S.timers().pump;
    if (pm) {
      var pt = S.pumpTotals(pm, now);
      $all('[data-pump]').forEach(function (n) { var k = n.getAttribute('data-pump'); n.textContent = clock(k === 'L' ? pt.L : k === 'R' ? pt.R : pt.total); });
    }
  }

  /* ---------- Tooltip (hover, focus or tap on [data-tip]) ---------- */
  function initTips() {
    var tip = $('#tip');
    function show(target) {
      tip.textContent = target.getAttribute('data-tip');
      tip.hidden = false;
      var r = target.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      var x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
      var y = r.top - h - 8; if (y < 8) y = r.bottom + 8;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    }
    function hide() { tip.hidden = true; }
    document.addEventListener('pointerover', function (e) { var t = e.target.closest && e.target.closest('[data-tip]'); if (t) show(t); else hide(); });
    document.addEventListener('focusin', function (e) { var t = e.target.closest && e.target.closest('[data-tip]'); if (t) show(t); });
    document.addEventListener('focusout', hide);
    document.addEventListener('scroll', hide, true);
  }

  /* ---------- Small HTML builders ---------- */
  function statusPill(level, text) {
    var icon = level === 'ok' ? '✓' : level === 'urgent' ? '⚠' : level === 'warn' ? '!' : 'i';
    return '<span class="status status--' + level + '">' + icon + ' ' + esc(text) + '</span>';
  }
  function note(level, title, text) {
    return '<div class="note note--' + (level || 'info') + '">' + (title ? '<div class="note__t">' + esc(title) + '</div>' : '') + '<div>' + esc(text) + '</div></div>';
  }
  function sw(setting, on, label) {
    return '<label class="switch"><input type="checkbox" data-setting="' + setting + '"' + (on ? ' checked' : '') + ' aria-label="' + esc(label || setting) + '" /><span></span></label>';
  }

  // "When" field: datetime-local + quick chips.
  function timeField(name, ms, label) {
    return '<div class="field"><span class="field__label">' + esc(label || 'When') + '</span>' +
      '<div class="time-row"><input class="input" type="datetime-local" name="' + name + '" value="' + toLocalInput(ms) + '" required />' +
      '<div class="chips">' +
      '<button type="button" class="chip" data-action="time-set" data-target="' + name + '" data-min="0">Now</button>' +
      '<button type="button" class="chip" data-action="time-set" data-target="' + name + '" data-min="15">−15m</button>' +
      '<button type="button" class="chip" data-action="time-set" data-target="' + name + '" data-min="30">−30m</button>' +
      '<button type="button" class="chip" data-action="time-set" data-target="' + name + '" data-min="60">−1h</button>' +
      '</div></div></div>';
  }

  App.h = {
    $: $, $all: $all, esc: esc, plural: plural,
    fmtTime: fmtTime, fmtDate: fmtDate, dayLabel: dayLabel, shortDay: shortDay, ago: ago, until: until, clock: clock, durMs: durMs, hoursStr: hoursStr,
    toLocalInput: toLocalInput, fromLocalInput: fromLocalInput, todayISO: todayISO,
    volUnit: volUnit, volToDisplay: volToDisplay, volFromDisplay: volFromDisplay, vol: vol,
    tempUnit: tempUnit, tempToDisplay: tempToDisplay, tempFromDisplay: tempFromDisplay, temp: temp,
    weightUnit: weightUnit, weightToDisplay: weightToDisplay, weightFromDisplay: weightFromDisplay, weight: weight,
    lenUnit: lenUnit, lenToDisplay: lenToDisplay, lenFromDisplay: lenFromDisplay, len: len,
    TYPES: TYPES, REACTIONS: REACTIONS, describe: describe,
    toast: toast, openSheet: openSheet, renderSheet: renderSheet, closeSheet: closeSheet, tick: tick, initTips: initTips, initSheetGestures: initSheetGestures, since: since,
    statusPill: statusPill, note: note, sw: sw, timeField: timeField,
    MIN: MIN, HOUR: HOUR, DAY: DAY
  };
})();
