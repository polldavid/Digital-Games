/* Alaga — full-size photo viewer.
   Opens on top of whatever sheet is showing (prescription review, document,
   visit) instead of replacing it, so ✕ / Back / Escape / swipe-down return to
   the form with everything typed still there. Pinch, drag and double-tap zoom
   are done here with pointer events: the Android WebView has no page zoom. */
(function () {
  'use strict';
  var MAX = 5, TAP_MS = 300, TAP_PX = 24;
  var el, stage, img, opener = null, open = false, poppingSelf = false;
  var s = 1, x = 0, y = 0;                 // zoom and pan (stage pixels)
  var pts = {}, pinch = null, pan = null, lastTap = null, swipe = null;

  function build() {
    el = document.createElement('div');
    el.className = 'viewer'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Photo, full size');
    el.innerHTML = '<div class="viewer__stage"><img class="viewer__img" alt="Saved photo, full size" draggable="false" /></div>' +
      '<button type="button" class="iconbtn viewer__close" data-viewer-close aria-label="Close photo">✕</button>' +
      '<p class="viewer__hint">Pinch or double-tap to zoom</p>';
    document.body.appendChild(el);
    stage = el.querySelector('.viewer__stage'); img = el.querySelector('.viewer__img');
    el.querySelector('[data-viewer-close]').addEventListener('click', function () { close(); });
    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY); apply(); }, { passive: false });
    // Escape closes the photo before the app's own handler closes the sheet under it.
    window.addEventListener('keydown', function (e) { if (open && e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); close(); } }, true);
  }

  function apply() {
    var r = stage.getBoundingClientRect();
    if (s <= 1) { s = 1; x = 0; y = 0; }
    x = Math.min(0, Math.max(r.width - r.width * s, x));
    y = Math.min(0, Math.max(r.height - r.height * s, y));
    img.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
    el.classList.toggle('viewer--zoomed', s > 1);
  }
  // Zoom to ns keeping the point under (cx, cy) still.
  function zoomAt(ns, cx, cy) {
    var r = stage.getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
    ns = Math.max(1, Math.min(MAX, ns));
    x = px - (px - x) * (ns / s); y = py - (py - y) * (ns / s); s = ns;
  }
  function two() { var k = Object.keys(pts); return k.length >= 2 ? [pts[k[0]], pts[k[1]]] : null; }
  function dist(p) { return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }

  function down(e) {
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    try { stage.setPointerCapture(e.pointerId); } catch (x2) {}
    var p = two();
    if (p) { pinch = { d: dist(p), s: s }; pan = null; swipe = null; lastTap = null; return; }
    pan = { x: e.clientX, y: e.clientY, ox: x, oy: y, t: Date.now(), moved: false };
    swipe = s === 1 ? { y: e.clientY } : null;
  }
  function move(e) {
    if (!pts[e.pointerId]) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var p = two();
    if (p && pinch) {
      zoomAt(pinch.s * dist(p) / pinch.d, (p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
      apply(); return;
    }
    if (!pan) return;
    var dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) pan.moved = true;
    if (s > 1) { x = pan.ox + dx; y = pan.oy + dy; apply(); }
    else if (swipe) { img.style.transform = 'translateY(' + Math.max(0, dy) + 'px)'; el.style.opacity = String(Math.max(0.4, 1 - Math.max(0, dy) / 400)); }
  }
  function up(e) {
    if (!pts[e.pointerId]) return;
    delete pts[e.pointerId];
    if (pinch) { if (!two()) pinch = null; pan = null; return; }
    if (!pan) return;
    var dy = e.clientY - pan.y, tap = !pan.moved && Date.now() - pan.t < TAP_MS;
    if (swipe) { el.style.opacity = ''; if (dy > 120) { pan = null; swipe = null; close(); return; } apply(); }
    pan = null; swipe = null;
    if (!tap) { lastTap = null; return; }
    var now = Date.now();
    if (lastTap && now - lastTap.t < TAP_MS && Math.abs(e.clientX - lastTap.x) < TAP_PX && Math.abs(e.clientY - lastTap.y) < TAP_PX) {
      lastTap = null;
      if (s > 1) s = 1; else zoomAt(2.5, e.clientX, e.clientY);
      apply();
    } else lastTap = { t: now, x: e.clientX, y: e.clientY };
  }

  function show(id) {
    if (!el) build();
    s = 1; x = 0; y = 0; pts = {}; pinch = pan = swipe = lastTap = null;
    img.removeAttribute('src'); img.style.transform = ''; el.style.opacity = '';
    img.setAttribute('data-photo', id);
    opener = document.activeElement;
    var sheet = document.getElementById('sheet'); if (sheet) sheet.setAttribute('inert', '');
    el.hidden = false; open = true; apply();
    try { history.pushState({ babyPhoto: 1, babySheet: history.state && history.state.babySheet, babyView: history.state && history.state.babyView }, ''); } catch (e) {}
    if (window.BabyFiles) window.BabyFiles.hydrate(el);
    setTimeout(function () { var c = el.querySelector('[data-viewer-close]'); try { c.focus({ preventScroll: true }); } catch (e) { c.focus(); } }, 30);
  }
  function hide() {
    if (!open) return;
    open = false; el.hidden = true; pts = {};
    var sheet = document.getElementById('sheet'); if (sheet) sheet.removeAttribute('inert');
    if (opener && opener.isConnected) try { opener.focus({ preventScroll: true }); } catch (e) {}
    opener = null;
  }
  // ✕ / Escape / swipe: hide, then drop the viewer's own history entry.
  function close() {
    if (!open) return;
    hide();
    try { if (history.state && history.state.babyPhoto) { poppingSelf = true; history.back(); } } catch (e) {}
  }
  // Called first by the app's popstate handler; true = handled here.
  function onPop() {
    if (poppingSelf) { poppingSelf = false; return true; }
    if (open) { hide(); return true; }
    return false;
  }

  window.BabyViewer = { open: show, close: close, onPop: onPop, isOpen: function () { return open; } };
})();
