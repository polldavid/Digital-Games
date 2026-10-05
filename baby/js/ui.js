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
  // Inside the Capacitor shell (App Store / Play Store builds) the page is already an app.
  var native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  var App = window.BabyApp = {
    platform: {
      ios: /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
      native: native,
      standalone: native || !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches))
    },
    installPrompt: null,
    ui: { view: 'today', historyType: 'all', historyDays: 7, trendDays: 7, sheet: null, alerts: [] },
    commit: null,   // set by app.js: save + re-render
    render: null,
    // Buttons defined by other modules (milk.js…): data-action name -> fn(node). app.js runs them.
    extraActions: {},
    addActions: function (o) { for (var k in o) App.extraActions[k] = o[k]; }
  };

  /* ---------- DOM ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  /* ---------- Time ---------- */
  // toLocale*String builds a new formatter on every call (~50 µs); History
  // formats hundreds of times per render, so reuse one of each.
  function formatter(opts) {
    var f = null;
    try { f = new Intl.DateTimeFormat([], opts); } catch (e) {}
    return function (t) { return f ? f.format(t) : new Date(t).toLocaleString([], opts); };
  }
  var fmtTime = formatter({ hour: 'numeric', minute: '2-digit' });
  var fmtDate = formatter({ weekday: 'short', month: 'short', day: 'numeric' });
  var fmtNarrowDay = formatter({ weekday: 'narrow' });
  function dayLabel(t, now) {
    var d0 = S.startOfDay(now || Date.now()), d = S.startOfDay(t);
    if (d === d0) return 'Today';
    if (d === d0 - DAY || Math.round((d0 - d) / DAY) === 1) return 'Yesterday';
    return fmtDate(t);
  }
  function shortDay(t, now) {
    var d0 = S.startOfDay(now || Date.now()), d = S.startOfDay(t);
    if (d === d0) return 'Today';
    return fmtNarrowDay(t) + new Date(t).getDate();
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
  // WHO percentile for a measurement taken at time t (null without sex, or past 2 years).
  function growthPct(kind, x, t, babyId) {
    var b = S.baby(babyId);
    if (!b || !b.sex || !x) return null;
    return G.growthPercentile(kind, b.sex, G.ageInDays(b.birth, t), x);
  }

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
          out.title = 'Bottle'; out.sub = vol(d.amountMl || 0) + (d.offeredMl ? ' of ' + vol(d.offeredMl) : '') + ' ' + (d.milk === 'formula' ? 'formula' : 'breast milk');
          if (d.durationMs) {
            var pace = G.bottlePace(d.amountMl, d.durationMs);
            out.sub += ' · ' + durMs(d.durationMs) + (pace ? ' (' + (Math.round(pace.rate * 10) / 10) + ' ml/min)' : '');
            if (pace && pace.level !== 'ok') out.flag = true;
          }
          if (d.nipple) out.sub += ' · nipple ' + d.nipple;
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
        var pc = function (kind, x) { var p = growthPct(kind, x, e.time, e.baby); if (p && p.level !== 'ok') out.flag = true; return p ? ' (' + p.label + ')' : ''; };
        out.sub = [d.weightKg && weight(d.weightKg) + pc('wfa', d.weightKg), d.lengthCm && len(d.lengthCm) + pc('lfa', d.lengthCm), d.headCm && 'head ' + len(d.headCm) + pc('hcfa', d.headCm)].filter(Boolean).join(' · ');
        break;
    }
    if (d.note) out.sub = out.sub ? out.sub + ' · ' + d.note : d.note;
    var by = window.BabyShare && window.BabyShare.byline(e);
    if (by) out.sub = out.sub ? out.sub + ' · by ' + by : 'by ' + by;
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
    // Long enough to read — and reach Undo — with a baby in one arm.
    setTimeout(function () { n.style.opacity = '0'; n.style.transition = 'opacity .3s'; }, action ? 8000 : 4200);
    setTimeout(function () { n.remove(); }, action ? 8400 : 4600);
  }

  /* ---------- Field errors ----------
     Mark the field, say what's wrong right under it, and move focus there.
     A toast alone vanishes before a tired parent finds the problem. */
  function fieldError(form, name, msg) {
    clearFieldErrors(form);
    var el = name && form && form.elements[name];
    if (el && el.length && !el.tagName) el = el[0]; // radio group
    if (!el || el.type === 'hidden') { toast(msg); return; }
    var id = 'err-' + name;
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', id);
    var p = document.createElement('p');
    p.className = 'field__error'; p.id = id; p.setAttribute('role', 'alert'); p.textContent = msg;
    // Below the whole control: a stepper row (− value +) or the field around the input.
    var anchor = el.closest('.stepper') || el.closest('.field') || el;
    if (anchor.nextElementSibling && anchor.nextElementSibling.classList.contains('stepper-extra')) anchor = anchor.nextElementSibling;
    anchor.parentNode.insertBefore(p, anchor.nextSibling);
    var det = el.closest('details'); if (det) det.open = true;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    p.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  function clearFieldErrors(form) {
    if (!form) return;
    $all('.field__error', form).forEach(function (n) { n.remove(); });
    $all('[aria-invalid]', form).forEach(function (n) { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
  }
  function reducedMotion() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }

  /* ---------- Confirm ----------
     A styled <dialog> instead of window.confirm(): confirm() blocks the page,
     can't be styled, and shows the site address inside an installed app.
     ask({ title, text, ok, danger }, onYes) */
  function ask(opts, onYes) {
    var dlg = $('#confirm');
    if (!dlg || !dlg.showModal) { if (window.confirm(opts.text || opts.title)) onYes(); return; }
    $('#confirm-title').textContent = opts.title || 'Are you sure?';
    $('#confirm-text').textContent = opts.text || '';
    $('#confirm-text').hidden = !opts.text;
    var ok = $('#confirm-ok');
    ok.textContent = opts.ok || 'OK';
    ok.className = 'btn btn--lg ' + (opts.danger ? 'btn--danger' : 'btn--primary');
    var back = document.activeElement, done = false, form = dlg.querySelector('form');
    // Answer from the click itself (submit/cancel fire synchronously); the
    // `close` event can arrive late when the page is backgrounded.
    function finish(yes) {
      if (done) return;
      done = true;
      form.onsubmit = dlg.oncancel = dlg.onclose = null;
      if (dlg.open) dlg.close();
      if (back && back.isConnected) try { back.focus({ preventScroll: true }); } catch (e) {}
      if (yes) onYes();
    }
    form.onsubmit = function (e) { e.preventDefault(); var s = e.submitter || document.activeElement; finish(!!(s && s.value === 'ok')); };
    dlg.oncancel = function (e) { e.preventDefault(); finish(false); };   // Escape
    dlg.onclose = function () { finish(dlg.returnValue === 'ok'); };    // closed some other way (Back)
    dlg.returnValue = '';
    dlg.showModal();
    $('#confirm-cancel').focus(); // the safe choice has focus
  }

  /* ---------- Rendering that keeps your place ----------
     focusKey() names an element by what it does, so the "same" button can be
     found again after its HTML is rebuilt. */
  var KEY_ATTRS = ['data-action', 'data-view', 'data-type', 'data-id', 'data-key', 'data-side', 'data-days', 'data-mode', 'data-day', 'data-d', 'data-sound', 'data-topic', 'data-setting', 'data-action-change', 'name', 'value', 'id'];
  function focusKey(el) {
    if (!el || el === document.body || !el.tagName) return null;
    var k = el.tagName;
    KEY_ATTRS.forEach(function (a) { var v = el.getAttribute(a); if (v != null) k += '|' + a + '=' + v; });
    return k === el.tagName ? null : k;
  }
  function findByKey(root, key) {
    if (!key) return null;
    var tag = key.split('|')[0], list = root.getElementsByTagName(tag);
    for (var i = 0; i < list.length; i++) if (focusKey(list[i]) === key) return list[i];
    return null;
  }
  function refocus(root, key) {
    var el = findByKey(root, key);
    if (el && !el.disabled) try { el.focus({ preventScroll: true }); } catch (e) {}
    return el;
  }

  /* Replace a container's content, touching only the blocks whose HTML
     changed. Unchanged blocks keep their DOM: focus, open <details>, loaded
     photos and scroll position all survive the once-a-minute refresh.
     Elements with data-region="name" are layout wrappers (panes, groups):
     they are kept and patched inside, one level at a time.
     `src` is an HTML string, a DocumentFragment, or a list of nodes. */
  function patch(container, src) {
    var active = document.activeElement, key = container.contains(active) ? focusKey(active) : null;
    var next = toNodes(src), prev = Array.prototype.slice.call(container.childNodes);
    var ids = next.map(idOf), changed = false, i;
    var same = prev.length === next.length;
    if (same) for (i = 0; i < prev.length; i++) if (prev[i]._id !== ids[i]) { same = false; break; }
    if (same) {
      // Same blocks in the same order: only regions can have changed inside.
      for (i = 0; i < next.length; i++) if (isRegion(next[i]) && syncRegion(prev[i], next[i])) changed = true;
    } else {
      // Reuse old nodes whose source is unchanged, wherever they now sit.
      var pool = {};
      prev.forEach(function (n) { if (n._id != null) (pool[n._id] = pool[n._id] || []).push(n); });
      var frag = document.createDocumentFragment();
      next.forEach(function (n, j) {
        var reuse = pool[ids[j]] && pool[ids[j]].shift();
        if (reuse) { if (isRegion(n)) syncRegion(reuse, n); frag.appendChild(reuse); return; }
        stamp(n, ids[j]);
        frag.appendChild(n);
      });
      container.textContent = '';
      container.appendChild(frag);
      changed = true;
    }
    if (key && !container.contains(document.activeElement)) refocus(container, key);
    return changed;
  }
  function toNodes(src) {
    if (typeof src === 'string') { var tpl = document.createElement('template'); tpl.innerHTML = src; src = tpl.content; }
    return Array.prototype.slice.call(src.childNodes || src).filter(keepNode);
  }
  function isRegion(n) { return n.nodeType === 1 && n.hasAttribute('data-region'); }
  function idOf(n) { return isRegion(n) ? 'region:' + n.getAttribute('data-region') : n.nodeType === 1 ? n.outerHTML : '#' + n.textContent; }
  function stamp(n, id) {
    n._id = id;
    if (isRegion(n)) Array.prototype.slice.call(n.childNodes).forEach(function (c) { if (keepNode(c)) stamp(c, idOf(c)); else n.removeChild(c); });
  }
  function syncRegion(old, n) {
    if (old.className !== n.className) old.className = n.className;
    return patch(old, n.childNodes);
  }
  function keepNode(n) { return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()); }

  /* Group a view's flat list of blocks for wide screens:
       pane--lead    everything before the first section title
       pane--groups  one <section class="group"> per section title + its cards
     followed by anything from the closing disclaimer on. On a phone the panes
     are plain blocks in the same order, so nothing moves. */
  function regions(html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    var nodes = toNodes(tpl.content), lead = [], groups = [], tail = [], cur = null;
    nodes.forEach(function (n) {
      var isTitle = n.nodeType === 1 && n.classList.contains('section-title');
      var isTail = n.nodeType === 1 && n.classList.contains('disclaimer');
      if (tail.length || isTail) { tail.push(n); return; }
      if (isTitle) { cur = { title: n.textContent.trim().split(/\s{2,}|\n/)[0], nodes: [n] }; groups.push(cur); return; }
      if (cur) cur.nodes.push(n); else lead.push(n);
    });
    var frag = document.createDocumentFragment();
    function wrap(tag, cls, region, kids) {
      var w = document.createElement(tag);
      w.className = cls; w.setAttribute('data-region', region);
      kids.forEach(function (k) { w.appendChild(k); });
      return w;
    }
    if (lead.length) frag.appendChild(wrap('div', 'pane pane--lead', 'lead', lead));
    if (groups.length) {
      frag.appendChild(wrap('div', 'pane pane--groups', 'groups', groups.map(function (g) {
        var h2 = g.nodes[0].querySelector('h2');
        return wrap('section', 'group', 'g:' + (h2 ? h2.textContent : g.title), g.nodes);
      })));
    }
    tail.forEach(function (n) { frag.appendChild(n); });
    return frag;
  }

  /* ---------- Bottom sheet ---------- */
  // Each open sheet gets a history entry, so the phone's Back button (or
  // gesture) closes the sheet instead of leaving the app.
  var lastFocus = null, ignorePop = false, afterPop = [];
  // While a sheet is open, everything behind it is inert: Tab stays in the
  // sheet and screen readers don't wander into the page underneath.
  function setBackgroundInert(on) {
    ['#app', '#welcome', '.theme-toggle'].forEach(function (s) {
      var n = $(s); if (!n) return;
      if (on) { n.setAttribute('inert', ''); n.setAttribute('aria-hidden', 'true'); }
      else { n.removeAttribute('inert'); n.removeAttribute('aria-hidden'); }
    });
  }
  function openSheet(spec) {
    // spec: { title, kind, html: fn() | string, mount?: fn(body) }
    App.ui.sheet = spec;
    var sheet = $('#sheet');
    if (sheet.hidden) {
      lastFocus = focusKey(document.activeElement) ? document.activeElement : lastFocus;
      App.ui.returnFocus = focusKey(lastFocus);
      try { if (!(history.state && history.state.babySheet)) history.pushState({ babySheet: 1, babyView: App.ui.view }, ''); } catch (e) {}
    }
    $('.sheet__panel').style.transform = '';
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    document.body.style.overflow = 'hidden';
    setBackgroundInert(true);
    renderSheet();
    var f = $('.sheet__panel [autofocus]') || $('.sheet__panel .iconbtn');
    if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }, 30);
  }
  function renderSheet() {
    var spec = App.ui.sheet;
    if (!spec) return;
    var body = $('#sheet-body');
    var scroll = body.scrollTop;
    var active = document.activeElement, key = body.contains(active) ? focusKey(active) : null;
    $('#sheet-title').textContent = typeof spec.title === 'function' ? spec.title() : spec.title;
    body.innerHTML = typeof spec.html === 'function' ? spec.html() : spec.html;
    body.scrollTop = scroll;
    if (spec.mount) spec.mount(body);
    if (window.BabyFiles) window.BabyFiles.hydrate(body);
    // Pressing "Switch side" rebuilds the sheet — keep focus on that control.
    if (key) refocus(body, key);
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
    setBackgroundInert(false);
    if (spec && spec.onclose) spec.onclose();
    // The opener may be rebuilt by the next render; App.render() refocuses it by key.
    if (lastFocus && lastFocus.isConnected) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
    lastFocus = null;
  }
  // Run fn once any Back that closeSheet() started has landed, so a new
  // history entry isn't pushed on top of the one being popped.
  function afterHistory(fn) { if (ignorePop) afterPop.push(fn); else fn(); }

  function initSheetGestures() {
    window.addEventListener('popstate', function (e) {
      if (ignorePop) {
        ignorePop = false;
        // A new sheet opened before the old one's Back finished: give it its own entry.
        if (App.ui.sheet) try { history.pushState({ babySheet: 1, babyView: App.ui.view }, ''); } catch (x) {}
        var q = afterPop; afterPop = [];
        q.forEach(function (fn) { fn(); });
        return;
      }
      var dlg = $('#confirm');
      if (dlg && dlg.open) {
        // Back answers "Cancel" and leaves whatever is underneath where it was.
        dlg.close('');
        try { history.pushState(App.ui.sheet ? { babySheet: 1, babyView: App.ui.view } : { babyView: App.ui.view }, ''); } catch (x) {}
        return;
      }
      if (App.ui.sheet) { closeSheet(true); if (App.render) App.render(); return; }
      // Back between tabs: Settings → Today, then out of the app.
      var v = (e.state && e.state.babyView) || 'today';
      if (App.onViewPop) App.onViewPop(v);
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
    panel.addEventListener('lostpointercapture', up);
    window.addEventListener('blur', up);
  }

  // "2 min", "1h 5m" — friendlier than a stopwatch for "how long ago / how long awake".
  function since(ms) { return ms < 60000 ? '<1 min' : G.fmtDur(ms / MIN); }

  /* ---------- Live clocks ----------
     [data-ago="ms"]      -> "12 min ago"
     [data-elapsed="ms"]  -> "1:02:33"
     [data-until="ms"]    -> "in 25 min"
     [data-breast="L|R|T"] -> breast timer totals */
  var LIVE = '[data-ago],[data-elapsed],[data-since],[data-until],[data-breast],[data-pump],[data-bottle]';
  function tick() {
    if (document.hidden) return; // nothing to see; visibilitychange re-renders on return
    var now = Date.now(), id = S.get().activeBaby;
    var b = id && S.timers().breast, pm = id && S.timers().pump;
    var tt = b ? S.breastTotals(b, now) : null, pt = pm ? S.pumpTotals(pm, now) : null;
    var nodes = document.querySelectorAll(LIVE);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], v = null, a;
      if ((a = n.getAttribute('data-elapsed')) != null) v = clock(now - +a);
      else if ((a = n.getAttribute('data-ago')) != null) v = ago(+a, now);
      else if ((a = n.getAttribute('data-since')) != null) v = since(now - +a);
      else if ((a = n.getAttribute('data-until')) != null) v = until(+a, now);
      else if ((a = n.getAttribute('data-breast')) != null) { if (tt) v = clock(a === 'L' ? tt.L : a === 'R' ? tt.R : tt.total); }
      else if ((a = n.getAttribute('data-pump')) != null) { if (pt) v = clock(a === 'L' ? pt.L : a === 'R' ? pt.R : pt.total); }
      else if (n.hasAttribute('data-bottle')) { var bt = id && S.timers().bottle; if (bt) v = clock(S.bottleTotal(bt, now)); }
      // Only touch the DOM when the text actually changes ("12 min ago" holds for a minute).
      if (v != null && n.textContent !== v) n.textContent = v;
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
      target.setAttribute('aria-describedby', 'tip');
    }
    function hide() { tip.hidden = true; }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !tip.hidden) hide(); });
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
    weightUnit: weightUnit, weightToDisplay: weightToDisplay, weightFromDisplay: weightFromDisplay, weight: weight, growthPct: growthPct,
    lenUnit: lenUnit, lenToDisplay: lenToDisplay, lenFromDisplay: lenFromDisplay, len: len,
    TYPES: TYPES, REACTIONS: REACTIONS, describe: describe,
    toast: toast, openSheet: openSheet, renderSheet: renderSheet, closeSheet: closeSheet, tick: tick, initTips: initTips, initSheetGestures: initSheetGestures, since: since,
    fieldError: fieldError, clearFieldErrors: clearFieldErrors, ask: ask, patch: patch, regions: regions, focusKey: focusKey, refocus: refocus, afterHistory: afterHistory, reducedMotion: reducedMotion,
    statusPill: statusPill, note: note, sw: sw, timeField: timeField,
    MIN: MIN, HOUR: HOUR, DAY: DAY
  };
})();
