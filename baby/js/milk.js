/* =========================================================
   Alaga — milk.js
   Milk on hand: pumped breast milk, prepared formula and
   leftovers, each with a use-by worked out from where it has
   been kept (rules in guide.js, from CDC guidance). Move it
   between room, fridge, freezer and cooler bag; thaw it; feed
   from it (starts the bottle timer with the amount filled in);
   or throw it out. Shared with a partner like everything else.
   ========================================================= */
(function () {
  'use strict';

  var G = window.BabyGuide, S = window.BabyStore, App = window.BabyApp, h = App.h, F = window.BabyForms;
  var esc = h.esc, MIN = h.MIN, HOUR = h.HOUR, DAY = h.DAY;
  var ICON = { room: '🏠', fridge: '🧊', freezer: '❄️', cooler: '🎒' };
  var MOVE = { room: '🏠 Take out / warm it', fridge: '🧊 Into the fridge', freezer: '❄️ Freeze it', cooler: '🎒 Into a cooler bag', thawFridge: '🧊 Thaw in the fridge', thawRoom: '💧 Thaw now (warm water)' };

  function what(m) { return (m.ml ? h.vol(m.ml) + ' ' : '') + (m.kind === 'formula' ? 'formula' : 'breast milk') + (m.leftoverAt ? ' · leftover' : m.thawedAt ? ' · thawed' : ''); }
  function useBy(at, now) {
    var d = new Date(at), today = S.startOfDay(now);
    var day = at < today + DAY ? '' : at < today + 2 * DAY ? 'tomorrow ' : h.fmtDate(at) + ' ';
    return day + h.fmtTime(at);
  }
  // ok / soon / gone, and the words for it.
  function status(m, now) {
    var x = G.milkExpiry(m), left = x.at - now, span = Math.max(HOUR, x.at - (m.since || m.madeAt));
    if (left <= 0) return { x: x, level: 'urgent', text: m.kind === 'formula' && m.leftoverAt ? 'Throw out' : 'Expired — throw out' };
    if (left < Math.min(HOUR, span / 4) || (span > 2 * DAY && left < 12 * HOUR)) return { x: x, level: 'warn', text: 'Use by ' + useBy(x.at, now) };
    if (x.best && now > x.best) return { x: x, level: 'warn', text: 'Past best (6 months) · OK until ' + useBy(x.at, now) };
    return { x: x, level: 'ok', text: 'Use by ' + useBy(x.at, now) };
  }

  /* ---------- Today ---------- */
  function todayCard(now) {
    var list = S.milkActive();
    if (!list.length) return '';
    var rows = list.slice(0, 6).map(function (m) {
      var st = status(m, now);
      return '<button class="row" data-action="milk-open" data-id="' + m.id + '"><span class="row__icon" aria-hidden="true">' + (m.leftoverAt ? '🍼' : ICON[m.where] || '🍼') + '</span><div class="row__main"><div class="row__t">' + esc(what(m)) + '</div>' +
        '<div class="row__s">' + esc((G.MILK_WHERE[m.where] || m.where) + (m.label ? ' · ' + m.label : '') + ' · use by ' + useBy(st.x.at, now)) + '</div></div>' +
        '<span class="status status--' + (st.level === 'ok' ? 'ok' : st.level) + '">' + esc(st.level === 'urgent' ? 'Throw out' : st.level === 'warn' ? 'Use soon' : h.until(st.x.at, now).replace(/^in /, '') + ' left') + '</span></button>';
    }).join('');
    return '<div class="section-title"><h2>Milk</h2><button class="btn btn--link" data-action="milk-add">＋ Add</button></div><div class="card"><div class="rows">' + rows + '</div>' +
      (list.length > 6 ? '<button class="btn btn--sm" data-action="milk-list" style="margin-top:8px">All ' + list.length + '</button>' : '') + '</div>';
  }

  /* ---------- One item ---------- */
  function itemSheet(id) {
    h.openSheet({
      title: function () { var m = S.milkItem(id); return m ? what(m).replace(/^./, function (c) { return c.toUpperCase(); }) : 'Milk'; },
      html: function () {
        var m = S.milkItem(id), now = Date.now();
        if (!m || m.status !== 'active') return '<p>This milk has been used or thrown out.</p>';
        var st = status(m, now), x = st.x;
        var gone = x.at <= now;
        var html = h.note(st.level === 'ok' ? 'ok' : st.level, gone ? st.text : 'Use by ' + useBy(x.at, now) + ' · in ' + h.until(x.at, now).replace(/^in /, ''), x.rule) +
          '<p class="faint">' + esc((m.kind === 'formula' ? 'Prepared ' : m.leftoverAt ? 'From a feed that ended ' : 'Pumped ') + h.fmtDate(m.leftoverAt || m.madeAt) + ' ' + h.fmtTime(m.leftoverAt || m.madeAt)) +
          ' · now in the ' + esc((G.MILK_WHERE[m.where] || m.where).toLowerCase()) + (m.since ? ' since ' + h.fmtTime(m.since) : '') + '.</p>';
        if (!gone) {
          html += '<button class="btn btn--go btn--block btn--lg" data-action="milk-feed" data-id="' + m.id + '">🍼 Feed this now</button>';
          var moves = G.milkMoves(m);
          if (moves.length) html += '<div class="milk-moves">' + moves.map(function (w) { return '<button class="btn btn--block" data-action="milk-move" data-id="' + m.id + '" data-to="' + w + '">' + MOVE[w] + '</button>'; }).join('') + '</div>';
          if (m.thawedAt) html += '<p class="faint">Thawed milk can’t go back in the freezer.</p>';
          if (m.kind === 'formula' && m.where === 'room' && !m.chilled && now - m.madeAt > 2 * HOUR) html += '<p class="faint">Too late for the fridge: formula has to be chilled within 2 hours of making it.</p>';
        }
        html += '<div class="btn-row" style="margin-top:10px"><button class="btn ' + (gone ? 'btn--primary' : 'btn--danger') + ' btn--lg" data-action="milk-toss" data-id="' + m.id + '">🗑 Thrown out</button>' +
          (gone ? '' : '<button class="btn btn--lg" data-action="milk-used" data-id="' + m.id + '">✓ Already used</button>') + '</div>';
        return html;
      }
    });
  }

  function listSheet() {
    h.openSheet({ title: 'Milk', html: function () { return todayCard(Date.now()).replace(/^<div class="section-title">[\s\S]*?<\/div>/, '') + '<button class="btn btn--block" data-action="milk-add">＋ Add milk</button>'; } });
  }

  /* ---------- Add ---------- */
  function seg(name, opts, cur) { return '<div class="seg" role="radiogroup">' + opts.map(function (o) { return '<label><input type="radio" name="' + name + '" value="' + o[0] + '"' + (o[0] === cur ? ' checked' : '') + ' /><span>' + o[1] + '</span></label>'; }).join('') + '</div>'; }
  function addSheet() {
    var b = S.baby(), kind0 = b && b.feeding === 'formula' ? 'formula' : 'breast';
    h.openSheet({
      title: 'Add milk',
      html: '<form class="form" id="milk-form" autocomplete="off">' +
        '<div class="field"><span class="field__label">What</span>' + seg('kind', [['breast', 'Breast milk'], ['formula', 'Formula (made up)']], kind0) + '</div>' +
        '<label class="field"><span class="field__label">Amount (' + h.volUnit() + ')</span><input class="input" type="number" inputmode="decimal" step="any" min="0" name="ml" required /></label>' +
        '<div class="field"><span class="field__label">Where is it now?</span>' + seg('where', [['fridge', 'Fridge'], ['freezer', 'Freezer'], ['room', 'Room'], ['cooler', 'Cooler bag']], kind0 === 'formula' ? 'room' : 'fridge') + '</div>' +
        '<label class="check-line" data-breast-only><input type="checkbox" name="thawed" /> It was frozen and is already thawed</label>' +
        h.timeField('madeAt', Date.now(), kind0 === 'formula' ? 'Made at' : 'Pumped at') +
        '<label class="field"><span class="field__label">Label (optional)</span><input class="input" name="label" maxlength="30" placeholder="e.g. bag 3, top shelf" /></label>' +
        '<div id="milk-preview"></div>' +
        '<div class="btn-row sheet-save"><button class="btn btn--primary btn--lg" type="submit">Add</button></div></form>',
      mount: function (body) {
        var f = body.querySelector('form');
        var lastKind = kind0;
        var sync = function () {
          var kind = f.querySelector('input[name="kind"]:checked').value;
          // Switching what it is resets where it usually starts: formula is made up at room temperature.
          if (kind !== lastKind) { f.querySelector('input[name="where"][value="' + (kind === 'formula' ? 'room' : 'fridge') + '"]').checked = true; lastKind = kind; }
          f.querySelector('[data-breast-only]').hidden = kind === 'formula';
          // Formula is never frozen or kept in a cooler here.
          f.querySelectorAll('input[name="where"]').forEach(function (r) { var no = kind === 'formula' && (r.value === 'freezer' || r.value === 'cooler'); r.disabled = no; r.parentNode.hidden = no; if (no && r.checked) f.querySelector('input[name="where"][value="room"]').checked = true; });
          var lab = f.querySelector('[name="madeAt"]').closest('.field');
          if (lab) { var l = lab.querySelector('.field__label'); if (l) l.textContent = kind === 'formula' ? 'Made at' : 'Pumped at'; }
          var m = draft(f);
          var p = f.querySelector('#milk-preview');
          if (p) p.innerHTML = m ? h.note(G.milkExpiry(m).at > Date.now() ? 'ok' : 'urgent', 'Use by ' + useBy(G.milkExpiry(m).at, Date.now()), G.milkExpiry(m).rule) : '';
        };
        f.addEventListener('change', sync); f.addEventListener('input', sync); sync();
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          var m = draft(f);
          if (!m || !m.ml) { h.fieldError(f, 'ml', 'How much milk?'); return; }
          if (m.madeAt > Date.now() + 5 * MIN) { h.fieldError(f, 'madeAt', 'That time is in the future.'); return; }
          var it = S.milkAdd({ kind: m.kind, ml: m.ml, where: m.where, madeAt: m.madeAt, thawed: m.thawed, label: f.elements.label.value.trim() });
          h.closeSheet(); App.commit();
          h.toast('Added · ' + what(it) + ' · use by ' + useBy(G.milkExpiry(it).at, Date.now()));
        });
      }
    });
  }
  function draft(f) {
    var kind = f.querySelector('input[name="kind"]:checked').value, where = f.querySelector('input[name="where"]:checked').value;
    var ml = h.volFromDisplay(f.elements.ml.value), made = h.fromLocalInput(f.elements.madeAt.value) || Date.now(), now = Date.now();
    var thawed = kind === 'breast' && f.elements.thawed.checked && where !== 'freezer';
    return { kind: kind, ml: Math.round(ml || 0), where: where, madeAt: made, since: now, chilled: where !== 'room' || thawed, thawedAt: thawed ? now : null };
  }

  /* ---------- Actions ---------- */
  App.addActions({
    'milk-open': function (n) { itemSheet(n.getAttribute('data-id')); },
    'milk-list': listSheet,
    'milk-add': addSheet,
    'milk-move': function (n) {
      var id = n.getAttribute('data-id'), to = n.getAttribute('data-to');
      if (!S.milkMove(id, to)) { h.toast('That milk can’t go there.'); return; }
      App.commit();
      var m = S.milkItem(id);
      h.toast(MOVE[to].replace(/^\S+ /, '') + ' · use by ' + useBy(G.milkExpiry(m).at, Date.now()));
    },
    'milk-feed': function (n) {
      var id = n.getAttribute('data-id');
      if (S.timers().bottle) { h.toast('A bottle timer is already running — finish it first.'); return; }
      var m = S.milkItem(id);
      if (m && m.where === 'freezer') { h.toast('Thaw it first.'); return; }
      if (S.isAsleep()) App.act('sleep-stop');
      S.bottleStart(Date.now(), id);
      h.closeSheet(); App.commit();
      h.toast('Bottle timer running 🍼 — tap ✓ Finished when baby’s done');
    },
    'milk-toss': function (n) { S.milkDone(n.getAttribute('data-id'), 'discarded'); h.closeSheet(); App.commit(); h.toast('Marked as thrown out'); },
    'milk-used': function (n) { S.milkDone(n.getAttribute('data-id'), 'used'); h.closeSheet(); App.commit(); }
  });

  window.BabyMilk = { todayCard: todayCard, itemSheet: itemSheet, addSheet: addSheet, status: status };
})();
