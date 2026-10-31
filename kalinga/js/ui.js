/* =========================================================
   Kalinga — ui.js
   Shared UI helpers, adapted from Alaga: DOM, escaping, time
   formatting, toasts, the confirm dialog, the bottom sheet
   (with Back-button support), field errors and patch(), which
   re-renders only the blocks that changed.
   Every other UI module hangs off window.KalingaApp.
   ========================================================= */
(function () {
  'use strict';

  var I = window.KalingaI18n, t = I.t;
  var MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  var native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  var App = window.KalingaApp = {
    platform: { native: native },
    ui: { view: 'today', sheet: null },
    store: null,    // set by app.js
    commit: null,   // save + re-render
    render: null,
    actions: {},    // data-action name -> fn(node, event); every module adds its own
    addActions: function (o) { for (var k in o) App.actions[k] = o[k]; }
  };

  /* ---------- DOM ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function attr(name, v) { return v == null || v === false ? '' : ' ' + name + '="' + esc(v === true ? '' : v) + '"'; }

  /* ---------- Time ---------- */
  function formatter(opts) {
    var f = null;
    try { f = new Intl.DateTimeFormat(I.getLang() === 'en' ? 'en-PH' : 'fil-PH', opts); } catch (e) {}
    return function (ms) { return f ? f.format(ms) : new Date(ms).toLocaleString([], opts); };
  }
  var fmt = {};
  function resetFormats() {
    fmt.time = formatter({ hour: 'numeric', minute: '2-digit' });
    fmt.date = formatter({ weekday: 'short', month: 'short', day: 'numeric' });
    fmt.long = formatter({ weekday: 'long', month: 'long', day: 'numeric' });
  }
  resetFormats();
  function fmtTime(ms) { return fmt.time(ms); }
  function fmtDate(ms) { return fmt.date(ms); }
  function fmtLong(ms) { return fmt.long(ms); }
  function startOfDay(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function dayLabel(ms, now) {
    var d0 = startOfDay(now || Date.now()), d = startOfDay(ms);
    if (d === d0) return t('c.today');
    if (Math.round((d0 - d) / DAY) === 1) return t('c.yesterday');
    return fmtDate(ms);
  }
  function dur(ms) {
    var m = Math.max(1, Math.round(Math.abs(ms) / MIN));
    if (m < 60) return m + ' ' + t('c.min');
    var h = Math.floor(m / 60), r = m % 60;
    return h + (I.getLang() === 'en' ? 'h' : ' oras') + (r ? ' ' + r + ' ' + t('c.min') : '');
  }
  function until(ms, now) { return t('c.in', { t: dur(ms - (now || Date.now())) }); }
  function ago(ms, now) { return t('c.ago', { t: dur((now || Date.now()) - ms) }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayISO(ms) { var d = new Date(ms || Date.now()); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hmOf(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  // '08:00' -> "8:00 AM" in the current language.
  function fmtHM(hm) { var p = hm.split(':'), d = new Date(); d.setHours(+p[0], +p[1], 0, 0); return fmtTime(d.getTime()); }
  function num(x) { return Math.round(x * 100) / 100; }

  /* ---------- Toasts ---------- */
  function toast(msg, action) {
    var wrap = $('#toasts');
    wrap.innerHTML = '';
    var n = document.createElement('div');
    n.className = 'toast';
    n.setAttribute('role', 'status');
    n.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button">' + esc(action.label) + '</button>' : '');
    if (action) n.querySelector('button').addEventListener('click', function () { action.fn(); n.remove(); });
    wrap.appendChild(n);
    setTimeout(function () { n.style.opacity = '0'; n.style.transition = 'opacity .3s'; }, action ? 8000 : 4500);
    setTimeout(function () { n.remove(); }, action ? 8400 : 4900);
  }

  /* ---------- Field errors ---------- */
  function fieldError(form, name, msg) {
    clearFieldErrors(form);
    var el = name && form && form.elements[name];
    if (el && el.length && !el.tagName) el = el[0];
    if (!el || el.type === 'hidden') { toast(msg); return; }
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', 'err-' + name);
    var p = document.createElement('p');
    p.className = 'field__error'; p.id = 'err-' + name; p.setAttribute('role', 'alert'); p.textContent = msg;
    var anchor = el.closest('[data-err-anchor]') || el.closest('.field') || el;
    anchor.parentNode.insertBefore(p, anchor.nextSibling);
    try { el.focus({ preventScroll: true }); } catch (e) {}
    p.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  function clearFieldErrors(form) {
    if (!form) return;
    $all('.field__error', form).forEach(function (n) { n.remove(); });
    $all('[aria-invalid]', form).forEach(function (n) { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
  }
  function reducedMotion() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }

  /* ---------- Confirm ----------
     ask({ title, text, ok, danger }, onYes) */
  function ask(opts, onYes) {
    var dlg = $('#confirm');
    if (!dlg || !dlg.showModal) { if (window.confirm(opts.text || opts.title)) onYes(); return; }
    $('#confirm-title').textContent = opts.title || '';
    $('#confirm-text').textContent = opts.text || '';
    $('#confirm-text').hidden = !opts.text;
    var ok = $('#confirm-ok');
    ok.textContent = opts.ok || t('c.yes');
    ok.className = 'btn btn--lg ' + (opts.danger ? 'btn--danger' : 'btn--primary');
    $('#confirm-cancel').textContent = opts.cancel || t('c.cancel');
    var done = false, form = dlg.querySelector('form');
    function finish(yes) {
      if (done) return;
      done = true;
      form.onsubmit = dlg.oncancel = dlg.onclose = null;
      if (dlg.open) dlg.close();
      if (yes) onYes(); else if (opts.onNo) opts.onNo();
    }
    form.onsubmit = function (e) { e.preventDefault(); var s = e.submitter || document.activeElement; finish(!!(s && s.value === 'ok')); };
    dlg.oncancel = function (e) { e.preventDefault(); finish(false); };
    dlg.onclose = function () { finish(dlg.returnValue === 'ok'); };
    dlg.returnValue = '';
    dlg.showModal();
    $('#confirm-cancel').focus();
  }

  /* ---------- patch(): keep focus, photos and open <details> across renders ---------- */
  var KEY_ATTRS = ['data-action', 'data-view', 'data-id', 'data-key', 'data-value', 'name', 'value', 'id'];
  function focusKey(el) {
    if (!el || el === document.body || !el.tagName) return null;
    var k = el.tagName;
    KEY_ATTRS.forEach(function (a) { var v = el.getAttribute(a); if (v != null) k += '|' + a + '=' + v; });
    return k === el.tagName ? null : k;
  }
  function refocus(root, key) {
    if (!key) return;
    var tag = key.split('|')[0], list = root.getElementsByTagName(tag);
    for (var i = 0; i < list.length; i++) if (focusKey(list[i]) === key) { try { list[i].focus({ preventScroll: true }); } catch (e) {} return; }
  }
  function keepNode(n) { return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()); }
  function patch(container, html) {
    var active = document.activeElement, key = container.contains(active) ? focusKey(active) : null;
    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    var next = Array.prototype.slice.call(tpl.content.childNodes).filter(keepNode);
    var prev = Array.prototype.slice.call(container.childNodes);
    var pool = {};
    prev.forEach(function (n) { if (n._src != null) (pool[n._src] = pool[n._src] || []).push(n); });
    // Pick each block: the old node when its HTML is unchanged, else the new one.
    var out = next.map(function (n) {
      var src = n.nodeType === 1 ? n.outerHTML : n.textContent;
      var reuse = pool[src] && pool[src].shift();
      if (reuse) return reuse;
      n._src = src;
      return n;
    });
    var changed = out.length !== prev.length || out.some(function (n, i) { return n !== prev[i]; });
    if (!changed) return false; // nothing moved: leave the DOM exactly as it is
    var frag = document.createDocumentFragment();
    out.forEach(function (n) { frag.appendChild(n); });
    container.textContent = '';
    container.appendChild(frag);
    if (window.KalingaFiles) window.KalingaFiles.hydrate(container);
    if (key && !container.contains(document.activeElement)) refocus(container, key);
    return true;
  }

  /* ---------- Bottom sheet ----------
     openSheet({ title, html: fn|string, mount?: fn(body), onclose?: fn, wide?: bool })
     An open sheet owns one history entry ({ kOpen: 1 }) so Android Back
     closes it. Closing it any other way marks that entry closed with
     replaceState instead of calling history.back(): a back() still in flight
     when the next sheet opens would otherwise arrive later as a stray Back. */
  function setInert(on) {
    ['#app', '#welcome', '#elder'].forEach(function (s) {
      var n = $(s); if (!n) return;
      if (on) { n.setAttribute('inert', ''); n.setAttribute('aria-hidden', 'true'); }
      else { n.removeAttribute('inert'); n.removeAttribute('aria-hidden'); }
    });
  }
  function openSheet(spec) {
    var wasOpen = !!App.ui.sheet;
    App.ui.sheet = spec;
    var sheet = $('#sheet');
    if (!wasOpen) {
      try {
        var s = history.state;
        if (s && 'kOpen' in s) history.replaceState({ kOpen: 1 }, ''); else history.pushState({ kOpen: 1 }, '');
      } catch (e) {}
    }
    sheet.hidden = false;
    sheet.classList.toggle('sheet--elder', !!spec.elder);
    document.body.classList.add('sheet-open');
    setInert(true);
    renderSheet();
    var f = $('#sheet-body [autofocus]');
    setTimeout(function () { try { (f || $('#sheet-close')).focus({ preventScroll: true }); } catch (e) {} }, 40);
  }
  function renderSheet() {
    var spec = App.ui.sheet;
    if (!spec) return;
    var body = $('#sheet-body'), scroll = body.scrollTop;
    $('#sheet-title').textContent = typeof spec.title === 'function' ? spec.title() : spec.title;
    body.innerHTML = typeof spec.html === 'function' ? spec.html() : spec.html;
    body.scrollTop = scroll;
    if (spec.mount) spec.mount(body);
    if (window.KalingaFiles) window.KalingaFiles.hydrate(body);
  }
  function closeSheet(fromBack) {
    var spec = App.ui.sheet;
    if (!spec) return;
    App.ui.sheet = null;
    if (fromBack !== true) try { if (history.state && history.state.kOpen) history.replaceState({ kOpen: 0 }, ''); } catch (e) {}
    $('#sheet').hidden = true;
    $('#sheet-body').innerHTML = '';
    document.body.classList.remove('sheet-open');
    setInert(false);
    if (spec.onclose) spec.onclose();
  }
  function initBack(onPop) {
    window.addEventListener('popstate', function () {
      var dlg = $('#confirm');
      if (dlg && dlg.open) { dlg.close(''); return; }
      if (App.ui.sheet) { closeSheet(true); if (App.render) App.render(); return; }
      if (onPop) onPop();
    });
  }

  /* ---------- Small builders ---------- */
  function field(label, control, hint, extraClass) {
    return '<label class="field' + (extraClass ? ' ' + extraClass : '') + '"><span class="field__label">' + label + '</span>' + control + (hint ? '<span class="field__hint">' + hint + '</span>' : '') + '</label>';
  }
  function select(name, options, value, extra) {
    return '<select class="input" name="' + name + '"' + (extra || '') + '>' + options.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }
  function seg(name, options, value) {
    return '<div class="seg" role="radiogroup">' + options.map(function (o) {
      return '<label><input type="radio" name="' + name + '" value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? ' checked' : '') + ' /><span>' + esc(o[1]) + '</span></label>';
    }).join('') + '</div>';
  }
  function photo(id, cls, alt) {
    return id ? '<img class="' + (cls || 'thumb') + '" data-photo="' + esc(id) + '" alt="' + esc(alt || '') + '" />' : '';
  }

  App.h = {
    $: $, $all: $all, esc: esc, attr: attr,
    fmtTime: fmtTime, fmtDate: fmtDate, fmtLong: fmtLong, fmtHM: fmtHM, dayLabel: dayLabel, dur: dur, until: until, ago: ago,
    startOfDay: startOfDay, todayISO: todayISO, hmOf: hmOf, pad: pad, num: num, resetFormats: resetFormats,
    toast: toast, fieldError: fieldError, clearFieldErrors: clearFieldErrors, ask: ask, reducedMotion: reducedMotion,
    patch: patch, openSheet: openSheet, renderSheet: renderSheet, closeSheet: closeSheet, initBack: initBack,
    field: field, select: select, seg: seg, photo: photo,
    MIN: MIN, HOUR: HOUR, DAY: DAY
  };
})();
