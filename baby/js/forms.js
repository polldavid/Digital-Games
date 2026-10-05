/* =========================================================
   Baby Log — forms.js
   The logging sheets: one form per event type, used both to
   add new entries and to edit old ones. Each form has
   html(ev) and parse(form, ev) -> { time, end, data }.
   ========================================================= */
(function () {
  'use strict';

  var G = window.BabyGuide, S = window.BabyStore, App = window.BabyApp, h = App.h;
  var esc = h.esc, MIN = h.MIN, HOUR = h.HOUR;

  function val(form, name) { var n = form.elements[name]; return n ? n.value : ''; }
  function radio(form, name) { var n = form.querySelector('input[name="' + name + '"]:checked'); return n ? n.value : ''; }
  function checked(form, name) { var n = form.elements[name]; return !!(n && n.checked); }
  function num(form, name) { var v = parseFloat(val(form, name)); return isNaN(v) ? null : v; }
  function seg(name, options, current) {
    return '<div class="seg" role="radiogroup">' + options.map(function (o) {
      return '<label><input type="radio" name="' + name + '" value="' + o[0] + '"' + (o[0] === current ? ' checked' : '') + ' /><span>' + o[1] + '</span></label>';
    }).join('') + '</div>';
  }
  function noteField(v) {
    return '<label class="field"><span class="field__label">Note (optional)</span><input class="input" name="note" maxlength="140" value="' + esc(v || '') + '" placeholder="Anything worth remembering" /></label>';
  }
  // Twins: offer to log the same entry for the other baby (or babies).
  var TWIN_TYPES = { feed: 1, diaper: 1, sleep: 1, tummy: 1, bath: 1, note: 1 };
  var currentType = null;
  function alsoFor(ev) {
    var st = S.get();
    if (ev || !TWIN_TYPES[currentType] || st.babies.length < 2) return '';
    return '<div class="field">' + st.babies.filter(function (b) { return b.id !== st.activeBaby; }).map(function (b) {
      return '<label class="check-line"><input type="checkbox" name="alsoFor" value="' + b.id + '" /> Also log for ' + esc(b.name) + '</label>';
    }).join('') + '</div>';
  }
  // The Save row sticks to the bottom of the sheet, so it's always one tap away.
  function footer(ev) {
    return alsoFor(ev) + '<div class="btn-row sheet-save">' +
      (ev ? '<button type="button" class="btn btn--danger" data-action="event-delete" data-id="' + ev.id + '">Delete</button>' : '') +
      '<button type="submit" class="btn btn--primary btn--lg">' + (ev ? 'Save changes' : 'Save') + '</button></div>';
  }
  function days() { return S.ageDays(Date.now()); }

  /* ======================= FEED ======================= */
  function nextSide() {
    var lb = S.last('feed', function (e) { return e.data.kind === 'breast'; });
    if (!lb) return null;
    var start = lb.data.startSide || (lb.data.left >= lb.data.right ? 'L' : 'R');
    return start === 'L' ? 'R' : 'L';
  }

  function breastLive() {
    var b = S.timers().breast, ns = nextSide();
    var side = function (k, label) {
      var on = b && b.side === k && !b.paused;
      var hint = on ? '● Feeding' : (!b && ns === k ? 'Start here' : (b ? 'Tap to switch' : 'Tap to start'));
      return '<button type="button" class="side' + (on ? ' side--on' : '') + (!b && ns === k ? ' side--next' : '') + '" data-action="breast-side" data-side="' + k + '" aria-pressed="' + on + '">' +
        '<span class="side__k">' + label + '</span><span class="side__v" data-breast="' + k + '">0:00</span><span class="side__hint">' + hint + '</span></button>';
    };
    var html = '<div class="sides">' + side('L', 'Left') + side('R', 'Right') + '</div>';
    if (b) {
      html += '<p class="faint" style="text-align:center">Total <strong data-breast="T">0:00</strong> · started ' + h.fmtTime(b.start) + (b.paused ? ' · <strong>paused</strong>' : '') + '</p>' +
        '<div class="btn-row"><button type="button" class="btn" data-action="breast-pause">' + (b.paused ? '▶ Resume' : '⏸ Pause') + '</button>' +
        '<button type="button" class="btn btn--primary" data-action="breast-finish">✓ Done — save feed</button></div>' +
        '<button type="button" class="btn btn--link" data-action="breast-discard">Discard this timer</button>';
    } else {
      html += ns ? '<p class="faint" style="text-align:center">Last feed started on the ' + (ns === 'L' ? 'right' : 'left') + ' — start on the <strong>' + (ns === 'L' ? 'left' : 'right') + '</strong> this time.</p>' : '<p class="faint" style="text-align:center">Tap a side to start the timer. Switch sides any time — it keeps running when you close this or lock your phone.</p>';
    }
    return html;
  }

  var FEED = {
    title: function (ev) { return ev ? 'Edit feed' : 'Log a feed'; },
    html: function (ev) {
      var b = S.baby(), d = ev ? ev.data : {};
      var bt = S.timers().bottle;
      var kind = d.kind || (S.timers().breast ? 'breast' : bt ? 'bottle' : b.feeding === 'formula' ? 'bottle' : 'breast');
      var time = ev ? ev.time : bt && bt.done ? bt.start : Date.now();
      var bMin = d.durationMs ? Math.round(d.durationMs / MIN * 10) / 10 : !ev && bt && bt.done ? Math.max(1, Math.round(bt.acc / MIN)) : '';
      var amount = d.amountMl != null ? h.volToDisplay(d.amountMl) : h.volToDisplay(lastBottleMl() || G.feedingFor(days(), b.feeding).ml[0] || 60);
      var html = seg('kind', [['breast', '🤱 Breast'], ['bottle', '🍼 Bottle'], ['solids', '🥣 Solids']], kind);

      // Breast
      html += '<div data-panel="breast"' + (kind !== 'breast' ? ' hidden' : '') + '>';
      if (!ev) html += breastLive() + '<details class="more"><summary>Or enter minutes manually</summary><div class="form" style="margin-top:8px">';
      else html += '<div class="form">';
      html += '<div class="field__row"><label class="field"><span class="field__label">Left (min)</span><input class="input" type="number" inputmode="numeric" min="0" max="180" name="left" value="' + (d.left ? Math.round(d.left / MIN) : '') + '" /></label>' +
        '<label class="field"><span class="field__label">Right (min)</span><input class="input" type="number" inputmode="numeric" min="0" max="180" name="right" value="' + (d.right ? Math.round(d.right / MIN) : '') + '" /></label></div>' +
        '<div class="field"><span class="field__label">Started on</span>' + seg('startSide', [['L', 'Left'], ['R', 'Right']], d.startSide || nextSide() || 'L') + '</div>' +
        '</div>' + (!ev ? '</details>' : '') + '</div>';

      // Bottle
      html += '<div data-panel="bottle" class="form"' + (kind !== 'bottle' ? ' hidden' : '') + '>' + (ev ? '' : bottleLive()) +
        '<div data-bottle-fields' + (!ev && bt && !bt.done ? ' hidden' : '') + ' class="form">' +
        '<span class="field__label">Baby finished</span>' +
        // ± nudge by 1 ml / 0.1 oz; the separate button jumps by 5 ml / 0.5 oz.
        '<div class="stepper"><button type="button" class="btn" data-action="step" data-target="amount" data-vol="-fine" data-step="-' + volStep('fine') + '" aria-label="Less">−</button>' +
        '<div class="stepper__v"><input class="stepper__input" name="amount" type="number" inputmode="decimal" step="any" min="0" value="' + amount + '" aria-label="Amount" /><button type="button" class="unit-btn" data-action="unit-toggle" data-unit="volume" data-target="amount" aria-label="Switch between ml and oz">' + h.volUnit() + '</button></div>' +
        '<button type="button" class="btn" data-action="step" data-target="amount" data-vol="fine" data-step="' + volStep('fine') + '" aria-label="More">+</button></div>' +
        '<div class="stepper-extra"><button type="button" class="btn btn--sm" data-action="step" data-target="amount" data-vol="big" data-step="' + volStep('big') + '">+' + volStep('big') + ' ' + h.volUnit() + '</button></div>' +
        '<div class="field"><span class="field__label">What’s in the bottle?</span>' + seg('milk', [['breast', 'Breast milk'], ['formula', 'Formula']], d.milk || (b.feeding === 'breast' ? 'breast' : 'formula')) + '</div>' +
        '<div class="field__row"><label class="field"><span class="field__label">Offered (' + h.volUnit() + ', optional)</span><input class="input" type="number" inputmode="decimal" step="any" min="0" name="offered" value="' + (d.offeredMl ? h.volToDisplay(d.offeredMl) : '') + '" /></label>' +
        '<label class="field"><span class="field__label">Took (min, optional)</span><input class="input" type="number" inputmode="decimal" step="any" min="0" max="180" name="bottleMin" value="' + bMin + '" /></label></div>' +
        '<label class="field"><span class="field__label">Nipple / flow size (optional)</span><input class="input" name="nipple" maxlength="20" list="nipples" value="' + esc(ev ? d.nipple || '' : lastNipple()) + '" placeholder="e.g. SS, S, M, Level 1" autocomplete="off" /></label>' +
        '<datalist id="nipples">' + nipplesUsed().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' +
        '<div id="bottle-feedback"></div>' +
        '<p class="faint">Typical at this age: ' + bottleRange() + ' per feed. Follow baby’s cues — stopping, turning away and relaxed hands mean full.</p>' +
        '</div></div>';

      // Solids
      html += '<div data-panel="solids" class="form"' + (kind !== 'solids' ? ' hidden' : '') + '>' +
        '<label class="field"><span class="field__label">What did they eat?</span><input class="input" name="food" maxlength="60" value="' + esc(d.food || '') + '" placeholder="e.g. mashed avocado" list="foods" /></label>' +
        '<datalist id="foods">' + foodsTried().map(function (f) { return '<option value="' + esc(f) + '">'; }).join('') + '</datalist>' +
        '<label class="check-line"><input type="checkbox" name="newFood"' + (d.newFood ? ' checked' : '') + ' /> First time trying this food</label>' +
        '<div class="field"><span class="field__label">How did it go?</span><div class="seg" role="radiogroup">' +
        Object.keys(h.REACTIONS).map(function (k) { return '<label><input type="radio" name="reaction" value="' + k + '"' + ((d.reaction || 'ok') === k ? ' checked' : '') + ' /><span>' + h.REACTIONS[k].split(' ')[0] + '</span></label>'; }).join('') +
        '</div></div>' +
        (days() < 120 ? h.note('warn', 'A bit early for solids', 'Most babies are ready around 6 months — sitting with support, good head control, and interest in food. Check with your pediatrician first.') : '<p class="faint">Offer one new food at a time so you can spot a reaction. Common allergens (egg, peanut) can be introduced early — ask your pediatrician how.</p>') +
        '</div>';

      html += '<div data-panel-common>' + h.timeField('time', time, 'Started') + noteField(d.note) + '</div>';
      html += '<div data-panel-save' + (kind === 'breast' && !ev ? ' hidden' : '') + '>' + footer(ev) + '</div>';
      return html;
    },
    parse: function (form) {
      var kind = radio(form, 'kind'), time = h.fromLocalInput(val(form, 'time')), data = { kind: kind, note: val(form, 'note').trim() };
      var end = null;
      if (kind === 'breast') {
        data.left = (num(form, 'left') || 0) * MIN; data.right = (num(form, 'right') || 0) * MIN;
        data.startSide = radio(form, 'startSide') || 'L';
        if (!data.left && !data.right) return { field: 'left', error: 'Add the minutes for at least one side — or use the timer.' };
        end = time + data.left + data.right;
      } else if (kind === 'bottle') {
        data.amountMl = Math.round(h.volFromDisplay(val(form, 'amount')));
        data.milk = radio(form, 'milk');
        if (!data.amountMl) return { field: 'amount', error: 'How much did baby drink?' };
        var off = h.volFromDisplay(val(form, 'offered')), bmin = num(form, 'bottleMin'), nip = val(form, 'nipple').trim(), btm = S.timers().bottle;
        if (off) data.offeredMl = Math.round(off);
        if (data.offeredMl && data.amountMl > data.offeredMl) return { field: 'offered', error: 'Finished is more than offered — check the two amounts.' };
        if (nip) data.nipple = nip;
        if (val(form, 'fromBottleTimer') && btm && btm.done) { time = btm.start; data.durationMs = bmin ? Math.round(bmin * MIN) : btm.acc; }
        else if (bmin) data.durationMs = Math.round(bmin * MIN);
        if (data.durationMs) end = time + data.durationMs;
      } else {
        data.food = val(form, 'food').trim();
        data.newFood = checked(form, 'newFood');
        data.reaction = radio(form, 'reaction');
        if (!data.food) return { field: 'food', error: 'What did baby eat?' };
      }
      return { time: time, end: end, data: data };
    },
    mount: function (body) {
      // Show the panel for the chosen feed kind; the timer view needs no Save button.
      var form = body.querySelector('form');
      var sync = function () {
        var k = radio(form, 'kind'), editing = !!form.getAttribute('data-id');
        h.$all('[data-panel]', form).forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== k; });
        var details = form.querySelector('[data-panel="breast"] details');
        var manual = details && details.open;
        var timing = k === 'bottle' && !editing && S.timers().bottle && !S.timers().bottle.done;
        form.querySelector('[data-panel-save]').hidden = (k === 'breast' && !editing && !manual) || timing;
        form.querySelector('[data-panel-common]').hidden = (k === 'breast' && !editing && !manual) || timing;
        var fb = form.querySelector('#bottle-feedback');
        if (fb) fb.innerHTML = k === 'bottle' ? bottleFeedback(form) : '';
      };
      form.addEventListener('input', sync); form.addEventListener('stepped', sync);
      h.$all('input[name="kind"]', form).forEach(function (r) { r.addEventListener('change', sync); });
      var det = form.querySelector('details'); if (det) det.addEventListener('toggle', sync);
      sync();
    }
  };

  function volStep(kind) { var oz = h.volUnit() === 'oz'; return kind === 'big' ? (oz ? 0.5 : 5) : (oz ? 0.1 : 1); }
  // Bottle timer, shown at the top of the Bottle panel (like the breast timer).
  function bottleLive() {
    var b = S.timers().bottle;
    if (!b) return '<button type="button" class="btn btn--primary btn--block btn--lg" data-action="bottle-start">▶ Start bottle timer</button>' +
      '<p class="faint" style="text-align:center">Times the feed, so you can see whether the nipple flow suits baby. Or just enter the amount below.</p>';
    if (!b.done) return '<p class="bottle-clock"><span data-bottle>' + h.clock(S.bottleTotal(b)) + '</span></p>' +
      '<p class="faint" style="text-align:center">Started ' + h.fmtTime(b.start) + (b.paused ? ' · <strong>paused</strong>' : '') + '</p>' +
      '<div class="btn-row"><button type="button" class="btn" data-action="bottle-pause">' + (b.paused ? '▶ Resume' : '⏸ Pause (burping)') + '</button>' +
      '<button type="button" class="btn btn--primary" data-action="bottle-finish">✓ Finished</button></div>' +
      '<button type="button" class="btn btn--link" data-action="bottle-discard">Discard this timer</button>';
    return '<input type="hidden" name="fromBottleTimer" value="1" />' + h.note('ok', 'Took ' + h.durMs(b.acc), 'Started ' + h.fmtTime(b.start) + '. Now enter how much baby finished.') +
      '<button type="button" class="btn btn--link" data-action="bottle-resume">Not finished — keep timing</button>';
  }
  function lastNipple() { var e = S.last('feed', function (x) { return x.data.kind === 'bottle' && x.data.nipple; }); return e ? e.data.nipple : ''; }
  function nipplesUsed() {
    var seen = {};
    S.events({ type: 'feed' }).forEach(function (e) { if (e.data.nipple) seen[e.data.nipple] = 1; });
    ['SS', 'S', 'M', 'L', 'LL', 'Y-cut', 'Slow flow', 'Level 1', 'Level 2', 'Size 1', 'Size 2'].forEach(function (n) { seen[n] = 1; });
    return Object.keys(seen);
  }
  // Pace check for what's typed in, compared with earlier feeds on the same nipple.
  function bottleFeedback(form) {
    var ml = h.volFromDisplay(val(form, 'amount')), mins = num(form, 'bottleMin'), nip = val(form, 'nipple').trim();
    var p = G.bottlePace(ml, mins ? mins * MIN : 0);
    if (!p) return '';
    var rate = Math.round(p.rate * 10) / 10, head = h.vol(ml) + ' in ' + Math.round(p.min) + ' min · ' + rate + ' ml/min';
    var same = nip ? S.events({ type: 'feed' }).filter(function (e) { return e.id !== form.getAttribute('data-id') && e.data.kind === 'bottle' && e.data.nipple === nip && e.data.durationMs; }) : [];
    var hist = same.length >= 2 ? ' Earlier on “' + nip + '”: ' + (Math.round(same.reduce(function (a, e) { return a + e.data.amountMl / (e.data.durationMs / MIN); }, 0) / same.length * 10) / 10) + ' ml/min over ' + same.length + ' feeds.' : '';
    if (p.level === 'slow') return h.note('warn', 'Slow feed: ' + head, 'Bottle feeds usually take about 10–20 minutes. Much longer often means the nipple flow is too slow — try the next flow size up, check the nipple isn’t collapsing flat, and keep its tip full of milk. If baby tires, sweats or falls asleep before finishing at most feeds, tell your pediatrician.' + hist);
    if (p.level === 'fast') return h.note('warn', 'Fast feed: ' + head, 'A full bottle in a few minutes can mean the flow is too fast — watch for gulping, coughing or milk spilling from the mouth. Try a slower nipple and paced feeding: baby more upright, bottle closer to flat, pauses to burp.' + hist);
    return h.note('ok', head, 'Within the usual pace for a bottle (about 10–20 minutes).' + hist);
  }
  function lastBottleMl() { var e = S.last('feed', function (x) { return x.data.kind === 'bottle'; }); return e ? e.data.amountMl : 0; }
  function bottleRange() { var r = G.feedingFor(days(), S.baby().feeding).ml; return r[1] ? h.volToDisplay(r[0]) + '–' + h.vol(r[1]) : 'varies'; }
  function foodsTried() {
    var seen = {};
    S.events({ type: 'feed' }).forEach(function (e) { if (e.data.kind === 'solids' && e.data.food) seen[e.data.food.toLowerCase()] = e.data.food; });
    return Object.keys(seen).map(function (k) { return seen[k]; });
  }

  /* ======================= DIAPER ======================= */
  var DIAPER = {
    title: function (ev) { return ev ? 'Edit diaper' : 'Diaper change'; },
    html: function (ev) {
      var d = ev ? ev.data : {};
      var what = ev ? (d.wet && d.dirty ? 'both' : d.dirty ? 'dirty' : d.wet ? 'wet' : 'dry') : 'wet';
      var html = seg('what', [['wet', '💧 Wet'], ['dirty', '💩 Dirty'], ['both', 'Both'], ['dry', 'Dry']], what);
      html += '<div data-poop' + (what === 'dirty' || what === 'both' ? '' : ' hidden') + ' class="form">' +
        '<div class="field"><span class="field__label">Color</span><div class="swatches">' +
        G.POOP_COLORS.map(function (c) { return '<button type="button" class="swatch" data-action="poop-color" data-color="' + c.id + '" aria-pressed="' + (d.color === c.id) + '"><span class="swatch__dot" style="background:' + c.hex + '"></span>' + esc(c.label) + '</button>'; }).join('') +
        '</div><input type="hidden" name="color" value="' + esc(d.color || '') + '" /></div>' +
        '<div id="poop-feedback"></div>' +
        '<div class="field"><span class="field__label" id="texture-label">Texture</span><div class="chips" role="radiogroup" aria-labelledby="texture-label">' +
        G.POOP_TEXTURES.map(function (t) { return '<label class="chip chip--pick"><input class="chip__input" type="radio" name="texture" value="' + t.id + '"' + (d.texture === t.id ? ' checked' : '') + ' />' + esc(t.label) + '</label>'; }).join('') +
        '</div></div><div id="texture-feedback"></div></div>';
      html += '<label class="check-line"><input type="checkbox" name="rash"' + (d.rash ? ' checked' : '') + ' /> Diaper rash</label>';
      html += h.timeField('time', ev ? ev.time : Date.now()) + noteField(d.note) + footer(ev);
      return html;
    },
    parse: function (form) {
      var what = radio(form, 'what');
      var data = { wet: what === 'wet' || what === 'both', dirty: what === 'dirty' || what === 'both', rash: checked(form, 'rash'), note: val(form, 'note').trim() };
      if (data.dirty) { data.color = val(form, 'color') || null; data.texture = radio(form, 'texture') || null; }
      return { time: h.fromLocalInput(val(form, 'time')), data: data };
    },
    mount: function (body) {
      var form = body.querySelector('form');
      var sync = function () {
        var w = radio(form, 'what');
        form.querySelector('[data-poop]').hidden = !(w === 'dirty' || w === 'both');
        var c = val(form, 'color'), fb = form.querySelector('#poop-feedback');
        var chk = c ? G.poopCheck(c, days()) : null;
        fb.innerHTML = chk ? h.note(chk.level === 'info' ? 'info' : chk.level, chk.level === 'ok' ? 'Normal' : chk.level === 'urgent' ? 'Call your pediatrician' : 'Worth a call', chk.text) : '';
        var t = radio(form, 'texture'), tx = G.POOP_TEXTURES.filter(function (x) { return x.id === t; })[0];
        form.querySelector('#texture-feedback').innerHTML = tx && tx.hint ? h.note('warn', '', tx.hint) : '';
        h.$all('.chips .chip', form).forEach(function (l) { var i = l.querySelector('input'); if (i) l.classList.toggle('chip--on', i.checked); });
      };
      form.addEventListener('change', sync);
      form.addEventListener('poopcolor', sync);
      sync();
    }
  };

  /* ======================= SLEEP ======================= */
  var SLEEP = {
    title: function (ev) { return ev ? 'Edit sleep' : 'Sleep'; },
    html: function (ev) {
      var t = S.timers().sleep, html = '';
      if (!ev && t) {
        html += '<div class="card card--flat live live--sleep"><div class="live__head"><span class="live__icon">😴</span><div><div class="live__label"><span class="pulse"></span>Asleep</div><div class="live__sub">since ' + h.fmtTime(t.start) + '</div></div><span class="live__clock" data-elapsed="' + t.start + '">0:00</span></div>' +
          '<button type="button" class="btn btn--primary btn--lg btn--block" data-action="sleep-stop">☀️ Baby woke up</button></div>';
        html += '<p class="faint">Fell asleep earlier than you started the timer? Fix it here:</p>' +
          '<div class="field"><span class="field__label">Fell asleep at</span><input class="input" type="datetime-local" name="liveStart" value="' + h.toLocalInput(t.start) + '" data-action-change="sleep-adjust" /></div>';
        return html;
      }
      if (!ev) {
        html += '<button type="button" class="btn btn--primary btn--lg btn--block" data-action="sleep-start">🌙 Start sleep timer now</button>' +
          '<p class="faint" style="text-align:center">— or log a sleep that already happened —</p>';
      }
      var start = ev ? ev.time : Date.now() - HOUR, end = ev ? (ev.end || Date.now()) : Date.now();
      html += h.timeField('time', start, 'Fell asleep') + h.timeField('end', end, 'Woke up') + noteField(ev && ev.data.note) + footer(ev);
      return html;
    },
    parse: function (form) {
      var t = h.fromLocalInput(val(form, 'time')), e = h.fromLocalInput(val(form, 'end'));
      if (!t || !e || e <= t) return { field: 'end', error: 'Wake-up time needs to be after falling asleep.' };
      if (e > Date.now() + 5 * MIN) return { field: 'end', error: 'Wake-up time is in the future — use the sleep timer instead.' };
      if (e - t > 16 * HOUR) return { field: 'time', error: 'That’s over 16 hours — double-check the dates.' };
      return { time: t, end: e, data: { note: val(form, 'note').trim() } };
    }
  };

  /* ======================= PUMP ======================= */
  function pumpLive() {
    var p = S.timers().pump, tt = p ? S.pumpTotals(p) : null;
    var side = function (k, label) {
      var on = p && p[k].on;
      var hint = on ? '● Pumping' : p && tt[k] ? 'Tap to resume' : 'Tap to start';
      return '<button type="button" class="side' + (on ? ' side--on' : '') + '" data-action="pump-side" data-side="' + k + '" aria-pressed="' + !!on + '">' +
        '<span class="side__k">' + label + '</span><span class="side__v" data-pump="' + k + '">' + h.clock(tt ? tt[k] : 0) + '</span><span class="side__hint">' + hint + '</span></button>';
    };
    var html = '<div class="sides">' + side('L', 'Left') + side('R', 'Right') + '</div>';
    var both = p && p.L.on && p.R.on;
    html += '<button type="button" class="btn btn--block" data-action="pump-both">' + (both ? '⏸ Pause both' : '▶▶ ' + (p ? 'Run both sides' : 'Start both sides')) + '</button>';
    if (p) {
      html += '<p class="faint" style="text-align:center">Session <strong data-pump="T">' + h.clock(tt.total) + '</strong> · started ' + h.fmtTime(p.start) + (p.done ? ' · <strong>finished</strong>' : '') + '</p>' +
        '<button type="button" class="btn btn--primary btn--lg btn--block" data-action="pump-finish">✓ Done — enter amounts</button>' +
        '<button type="button" class="btn btn--link" data-action="pump-discard">Discard this session</button>';
    } else {
      html += '<p class="faint" style="text-align:center">Double pump? Tap <strong>Start both sides</strong>. One side at a time? Tap Left or Right — each side has its own timer.</p>';
    }
    return html;
  }

  function pumpFields(d, u) {
    return '<div class="field__row">' +
      '<label class="field"><span class="field__label">Left (' + u + ')</span><input class="input" type="number" inputmode="decimal" step="any" min="0" name="left" value="' + (d.leftMl != null ? h.volToDisplay(d.leftMl) : '') + '" /></label>' +
      '<label class="field"><span class="field__label">Right (' + u + ')</span><input class="input" type="number" inputmode="decimal" step="any" min="0" name="right" value="' + (d.rightMl != null ? h.volToDisplay(d.rightMl) : '') + '" /></label></div>' +
      '<p class="faint" id="pump-total" aria-live="polite"></p>';
  }

  var PUMP = {
    title: function (ev, preset) { return ev ? 'Edit pumping' : preset && preset.timer ? 'How much did you pump?' : 'Pumping'; },
    html: function (ev, preset) {
      var d = ev ? ev.data : {}, u = h.volUnit(), p = S.timers().pump;
      var tip = '<p class="faint">Freshly pumped milk keeps about 4 hours at room temperature, 4 days in the fridge, and 6–12 months in the freezer (CDC).</p>';
      // Step 2 of a timed session: amounts for each side.
      if (!ev && preset && preset.timer && p) {
        var tt = S.pumpTotals(p);
        return '<input type="hidden" name="fromTimer" value="1" /><input type="hidden" name="leftMs" value="' + tt.L + '" /><input type="hidden" name="rightMs" value="' + tt.R + '" />' +
          '<div class="note note--ok"><div class="note__t">Session: ' + h.since(tt.total) + '</div><div>Left ' + (tt.L ? h.since(tt.L) : '—') + ' · Right ' + (tt.R ? h.since(tt.R) : '—') + ' · started ' + h.fmtTime(p.start) + '</div></div>' +
          pumpFields({}, u).replace('name="left" value=""', 'name="left" value="" autofocus') +
          '<label class="field"><span class="field__label">Duration (min)</span><input class="input" type="number" inputmode="numeric" min="0" max="180" name="duration" value="' + Math.max(1, Math.round(tt.total / MIN)) + '" /></label>' +
          '<input type="hidden" name="time" value="' + h.toLocalInput(p.start) + '" />' + noteField('') + tip + footer(null);
      }
      var manual = pumpFields(d, u) +
        '<label class="field"><span class="field__label">Duration (min)</span><input class="input" type="number" inputmode="numeric" min="0" max="180" name="duration" value="' + (d.durationMin || 15) + '" /></label>' +
        h.timeField('time', ev ? ev.time : Date.now()) + noteField(d.note) + tip;
      if (ev) return manual + footer(ev);
      return pumpLive() +
        '<details class="more"><summary>Or log a session without the timer</summary><div class="form" style="margin-top:8px">' + manual + '</div></details>' +
        '<div data-panel-save hidden>' + footer(null) + '</div>';
    },
    parse: function (form) {
      var l = h.volFromDisplay(val(form, 'left') || 0), r = h.volFromDisplay(val(form, 'right') || 0);
      if (!l && !r) return { field: 'left', error: 'Enter how much you pumped from at least one side.' };
      var data = { leftMl: Math.round(l), rightMl: Math.round(r), amountMl: Math.round(l + r), durationMin: num(form, 'duration') || 0, note: val(form, 'note').trim() };
      if (val(form, 'fromTimer')) { data.leftMs = +val(form, 'leftMs') || 0; data.rightMs = +val(form, 'rightMs') || 0; }
      return { time: h.fromLocalInput(val(form, 'time')), data: data };
    },
    mount: function (body) {
      var form = body.querySelector('form');
      var total = function () {
        var out = form.querySelector('#pump-total'); if (!out) return;
        var l = parseFloat(val(form, 'left')) || 0, r = parseFloat(val(form, 'right')) || 0;
        out.innerHTML = l || r ? 'Total: <strong>' + (Math.round((l + r) * 10) / 10) + ' ' + h.volUnit() + '</strong>' : '';
      };
      form.addEventListener('input', total); total();
      var det = form.querySelector('details'), save = form.querySelector('[data-panel-save]');
      if (det && save) det.addEventListener('toggle', function () { save.hidden = !det.open; });
    }
  };

  /* ======================= TUMMY TIME ======================= */
  var TUMMY = {
    title: function (ev) { return ev ? 'Edit tummy time' : 'Tummy time'; },
    html: function (ev) {
      var t = S.timers().tummy, html = '';
      var goal = G.tummyGoalMin(days()), done = Math.round(S.daySummary(S.startOfDay(Date.now())).tummyMs / MIN);
      if (!ev) {
        if (t) html += '<div class="card card--flat live"><div class="live__head"><span class="live__icon">🤸</span><div><div class="live__label"><span class="pulse"></span>Tummy time</div><div class="live__sub">since ' + h.fmtTime(t.start) + '</div></div><span class="live__clock" data-elapsed="' + t.start + '">0:00</span></div><button type="button" class="btn btn--primary btn--block" data-action="tummy-stop">✓ Done</button></div>';
        else html += '<button type="button" class="btn btn--primary btn--lg btn--block" data-action="tummy-start">▶ Start tummy-time timer</button>';
        if (goal) html += '<p class="faint">Today: <strong>' + done + ' of ' + goal + ' min</strong>. Short bursts count — a few minutes after each diaper change adds up. Always awake and supervised.</p>';
        html += '<p class="faint" style="text-align:center">— or log minutes —</p>';
      }
      var mins = ev && ev.end ? Math.round((ev.end - ev.time) / MIN) : 5;
      html += '<label class="field"><span class="field__label">Minutes</span><input class="input" type="number" inputmode="numeric" min="1" max="120" name="minutes" value="' + mins + '" /></label>' +
        h.timeField('time', ev ? ev.time : Date.now() - mins * MIN, 'Started') + footer(ev);
      return html;
    },
    parse: function (form) {
      var m = num(form, 'minutes'), t = h.fromLocalInput(val(form, 'time'));
      if (!m) return { field: 'minutes', error: 'How many minutes?' };
      return { time: t, end: t + m * MIN, data: {} };
    }
  };

  /* ======================= MEDICINE ======================= */
  function medKey(medId, name) {
    if (/^rx:/.test(medId)) return medId;
    return medId === 'custom' ? 'custom:' + (name || '').toLowerCase() : medId;
  }
  function activeRx() { return S.health().rx.filter(function (rx) { return S.rxStatus(rx).active; }); }
  // A select value is a preset id, "custom", or "rx:<prescription id>".
  function medInfo(sel) {
    if (/^rx:/.test(sel)) {
      var rx = S.findIn(S.health().rx, sel.slice(3));
      if (rx) return { id: 'rx', rx: rx, label: rx.name, intervalH: rx.prn ? 0 : rx.intervalH || 0, maxPerDay: rx.timesPerDay || 0, minAgeDays: 0, warn: rx.instructions ? 'Prescribed: ' + rx.instructions : 'As prescribed.' };
    }
    return G.medicine(sel);
  }
  var MED = {
    title: function (ev) { return ev ? 'Edit medicine' : 'Medicine'; },
    html: function (ev, preset) {
      // Start on the medicine last given; for young babies, vitamin D (the everyday one).
      var lastMed = S.last('med'), rxs = activeRx();
      var d = ev ? ev.data : {};
      var medId = preset && preset.rxId ? 'rx:' + preset.rxId : preset && preset.medId ? preset.medId : d.rxId ? 'rx:' + d.rxId : d.medId || (rxs.length ? 'rx:' + rxs[0].id : lastMed ? (lastMed.data.rxId ? 'rx:' + lastMed.data.rxId : lastMed.data.medId) : days() < 91 ? 'vitd' : 'acetaminophen');
      var p = medInfo(medId);
      if (p.id === 'custom' && /^rx:/.test(medId)) medId = 'custom';
      var dose0 = d.dose || (preset && preset.dose) || (p.rx ? p.rx.dose || '' : '');
      return '<label class="field"><span class="field__label">Medicine</span><select class="input" name="medId">' +
        (rxs.length ? '<optgroup label="Prescribed">' + rxs.map(function (rx) { return '<option value="rx:' + rx.id + '"' + ('rx:' + rx.id === medId ? ' selected' : '') + '>💊 ' + esc(rx.name + (rx.strength ? ' ' + rx.strength : '')) + '</option>'; }).join('') + '</optgroup><optgroup label="Other">' : '') +
        G.MEDICINES.map(function (m) { return '<option value="' + m.id + '"' + (m.id === medId ? ' selected' : '') + '>' + esc(m.label) + '</option>'; }).join('') + (rxs.length ? '</optgroup>' : '') + '</select></label>' +
        '<label class="field" data-custom' + (medId === 'custom' ? '' : ' hidden') + '><span class="field__label">Name</span><input class="input" name="name" maxlength="40" value="' + esc(medId === 'custom' ? d.name || '' : '') + '" placeholder="e.g. Amoxicillin" /></label>' +
        '<label class="field"><span class="field__label">Dose given</span><input class="input" name="dose" maxlength="40" value="' + esc(dose0) + '" placeholder="e.g. 2.5 ml — as on the label / prescription" /></label>' +
        '<div class="field__row"><label class="field"><span class="field__label">Hours between doses</span><input class="input" type="number" inputmode="decimal" step="0.5" min="0" max="48" name="intervalH" value="' + (d.intervalH != null ? d.intervalH : p.intervalH) + '" /></label>' +
        '<label class="field"><span class="field__label">Max doses / 24h</span><input class="input" type="number" inputmode="numeric" min="0" max="24" name="maxPerDay" value="' + (d.maxPerDay != null ? d.maxPerDay : p.maxPerDay) + '" /></label></div>' +
        '<label class="check-line"><input type="checkbox" name="remind"' + ((ev ? d.remind : p.intervalH > 0 && p.intervalH < 24 && !p.rx) ? ' checked' : '') + ' /> Remind me when the next dose is allowed' + '</label>' +
        '<div id="med-status"></div>' +
        h.timeField('time', ev ? ev.time : preset && preset.time || Date.now(), 'Given at') + noteField(d.note) +
        '<p class="faint">Baby Log never suggests doses. Dosing for babies is by weight — follow the label or your pediatrician, and use the syringe that came with the medicine.</p>' + footer(ev);
    },
    parse: function (form) {
      var sel = val(form, 'medId'), p = medInfo(sel);
      var name = sel === 'custom' ? val(form, 'name').trim() : p.rx ? p.rx.name : p.label.split(' (')[0];
      if (!name) return { field: 'name', error: 'What medicine was it?' };
      var data = { medId: p.rx ? 'rx' : sel, name: name, dose: val(form, 'dose').trim(), intervalH: num(form, 'intervalH') || 0, maxPerDay: num(form, 'maxPerDay') || 0, remind: checked(form, 'remind'), note: val(form, 'note').trim() };
      if (p.rx) data.rxId = p.rx.id;
      return { time: h.fromLocalInput(val(form, 'time')), data: data };
    },
    mount: function (body) {
      var form = body.querySelector('form'), editingId = form.getAttribute('data-id');
      var lastId = val(form, 'medId');
      var sync = function (e) {
        var id = val(form, 'medId'), p = medInfo(id);
        if (id !== lastId) { // preset changed: refill its spacing rules
          form.elements.intervalH.value = p.intervalH; form.elements.maxPerDay.value = p.maxPerDay;
          form.elements.remind.checked = p.intervalH > 0 && p.intervalH < 24 && !p.rx; lastId = id;
          if (p.rx) form.elements.dose.value = p.rx.dose || '';
        }
        form.querySelector('[data-custom]').hidden = id !== 'custom';
        var out = [], now = Date.now(), dd = days();
        if (dd < p.minAgeDays || (id === 'acetaminophen' && dd < 91)) out.push(h.note('warn', 'Check with a doctor first', p.warn));
        else if (p.warn) out.push('<p class="faint">' + esc(p.warn) + '</p>');
        var ms = editingId ? null : S.medStatus(medKey(id, val(form, 'name')), now);
        if (ms) {
          var line = 'Last dose ' + h.ago(ms.last.time, now) + ' (' + h.fmtTime(ms.last.time) + ') · ' + ms.count24 + (ms.max ? ' of ' + ms.max : '') + ' in the last 24h.';
          if (ms.nextAt && ms.nextAt > now) out.push(h.note('warn', 'Too soon for the next dose', line + ' Next dose allowed at ' + h.fmtTime(ms.nextAt) + '.'));
          else if (ms.max && ms.count24 >= ms.max) out.push(h.note('urgent', 'Daily maximum reached', line + ' Speak to your pediatrician or pharmacist before giving more.'));
          else out.push(h.note('ok', 'OK to give', line));
        }
        form.querySelector('#med-status').innerHTML = out.join('');
      };
      form.addEventListener('change', sync); form.addEventListener('input', function (e) { if (e.target.name === 'name') sync(); });
      sync();
    }
  };

  /* ======================= TEMPERATURE ======================= */
  var TEMP = {
    title: function (ev) { return ev ? 'Edit temperature' : 'Temperature'; },
    html: function (ev) {
      var d = ev ? ev.data : {};
      var method = d.method || (days() < 91 ? 'rectal' : 'armpit');
      return '<div class="stepper"><button type="button" class="btn" data-action="step" data-target="temp" data-step="-0.1" aria-label="Lower">−</button>' +
        '<div class="stepper__v"><input class="stepper__input" name="temp" type="number" inputmode="decimal" step="0.1" value="' + (d.tempC != null ? h.tempToDisplay(d.tempC) : h.tempToDisplay(36.8)) + '" aria-label="Temperature" /><button type="button" class="unit-btn" data-action="unit-toggle" data-unit="temp" data-target="temp" aria-label="Switch between °C and °F">' + h.tempUnit() + '</button></div>' +
        '<button type="button" class="btn" data-action="step" data-target="temp" data-step="0.1" aria-label="Higher">+</button></div>' +
        '<div class="field"><span class="field__label">Taken</span>' + seg('method', [['rectal', 'Rectal'], ['armpit', 'Armpit'], ['ear', 'Ear'], ['forehead', 'Forehead']], method) + '</div>' +
        '<div id="temp-feedback"></div>' +
        '<p class="faint">Under 3 months a rectal reading is the most accurate. Armpit readings run lower — if one is 37.5 °C / 99.5 °F or more, confirm rectally. Ear thermometers aren’t reliable under 6 months.</p>' +
        h.timeField('time', ev ? ev.time : Date.now()) + noteField(d.note) + footer(ev);
    },
    parse: function (form) {
      var c = h.tempFromDisplay(val(form, 'temp'));
      if (c == null || c < 30 || c > 45) return { field: 'temp', error: 'That temperature doesn’t look right — check the units in Settings.' };
      return { time: h.fromLocalInput(val(form, 'time')), data: { tempC: Math.round(c * 100) / 100, method: radio(form, 'method'), note: val(form, 'note').trim() } };
    },
    mount: function (body) {
      var form = body.querySelector('form');
      var sync = function () {
        var f = G.feverCheck(h.tempFromDisplay(val(form, 'temp')), days());
        form.querySelector('#temp-feedback').innerHTML = f ? h.note(f.level, f.title, f.text) : '';
      };
      form.addEventListener('input', sync); form.addEventListener('change', sync); form.addEventListener('stepped', sync);
      sync();
    }
  };

  /* ======================= GROWTH ======================= */
  // WHO percentiles for what's typed in, compared with the last measurement.
  // Calm by default: one number is never a diagnosis, the trend is what matters.
  var GROWTH_KINDS = [['wfa', 'Weight', 'weight', 'weightKg'], ['lfa', 'Length', 'length', 'lengthCm'], ['hcfa', 'Head', 'head', 'headCm']];
  function percentiles(form, b) {
    var t = h.fromLocalInput(val(form, 'time')) || Date.now(), id = form.getAttribute('data-id');
    if (!b.sex) return weightDrop(form, b, t, id);
    var parts = [], outside = [], crossed = [];
    GROWTH_KINDS.forEach(function (k) {
      var x = k[0] === 'wfa' ? h.weightFromDisplay(val(form, k[2])) : h.lenFromDisplay(val(form, k[2]));
      var p = h.growthPct(k[0], x, t, b.id);
      if (!p) return;
      parts.push(k[1] + ' ' + p.label);
      if (p.level !== 'ok') outside.push(k[1].toLowerCase() + ' (' + p.label + ')');
      // Weight dips in the first two weeks are normal, so only compare from then on.
      var prev = S.events({ type: 'growth', baby: b.id }).filter(function (e) { return e.id !== id && e.time < t && e.data[k[3]] && G.ageInDays(b.birth, e.time) >= 14; }).pop();
      var pp = prev && h.growthPct(k[0], prev.data[k[3]], prev.time, b.id);
      if (pp && p.pct < pp.pct && G.linesCrossed(pp.pct, p.pct) >= 2) crossed.push(k[1].toLowerCase() + ' went from the ' + pp.label + ' to the ' + p.label + ' since ' + h.fmtDate(prev.time));
    });
    var drop = weightDrop(form, b, t, id);
    if (drop) return drop;
    if (!parts.length) return '';
    var chart = 'WHO growth standard for ' + (b.sex === 'f' ? 'girls' : 'boys') + '.';
    if (crossed.length) return h.note('warn', 'Crossed two percentile lines', cap(crossed.join('; ')) + '. Worth mentioning to your pediatrician — they look at the trend over several visits. ' + chart);
    if (outside.length) return h.note('warn', parts.join(' · '), 'Outside the 3rd–97th range: ' + outside.join(', ') + '. Plenty of healthy babies sit here (size runs in families), so show your pediatrician rather than worry. ' + chart);
    return h.note('ok', parts.join(' · '), 'Percentile = how many babies of the same age and sex measure less (50th is the middle). Anywhere from the 3rd to the 97th is typical; steady tracking matters more than the number. ' + chart);
  }
  // Past the newborn dip, babies should keep gaining: a lower weight than last time is worth a call.
  function weightDrop(form, b, t, id) {
    var w = h.weightFromDisplay(val(form, 'weight'));
    if (!w || G.ageInDays(b.birth, t) < 14) return '';
    var prev = S.events({ type: 'growth', baby: b.id }).filter(function (e) { return e.id !== id && e.time < t && e.data.weightKg; }).pop();
    if (!prev || w >= prev.data.weightKg - 0.03) return '';
    return h.note('warn', 'Lower than last time', h.weight(prev.data.weightKg) + ' on ' + h.fmtDate(prev.time) + ', ' + h.weight(w) + ' now. Babies this age should keep gaining, so call your pediatrician — and double-check the scale (same scale, no clothes or diaper) if it’s a surprise.');
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  var GROWTH = {
    title: function (ev) { return ev ? 'Edit measurement' : 'Growth'; },
    html: function (ev) {
      var d = ev ? ev.data : {}, b = S.baby();
      var html = '<label class="field"><span class="field__label">Weight (' + h.weightUnit() + ')</span><input class="input" type="number" inputmode="decimal" step="any" min="0" name="weight" value="' + (d.weightKg ? h.weightToDisplay(d.weightKg) : '') + '" placeholder="' + (h.weightUnit() === 'lb' ? 'e.g. 8.25' : 'e.g. 3.75') + '" /></label>' +
        '<div class="field__row"><label class="field"><span class="field__label">Length (' + h.lenUnit() + ')</span><input class="input" type="number" inputmode="decimal" step="any" min="0" name="length" value="' + (d.lengthCm ? h.lenToDisplay(d.lengthCm) : '') + '" /></label>' +
        '<label class="field"><span class="field__label">Head (' + h.lenUnit() + ')</span><input class="input" type="number" inputmode="decimal" step="any" min="0" name="head" value="' + (d.headCm ? h.lenToDisplay(d.headCm) : '') + '" /></label></div>' +
        '<div id="growth-feedback"></div>';
      if (!b.birthWeightKg) html += '<p class="faint">Tip: add the birth weight to ' + esc(b.name) + '’s profile (Settings) to see weight regained since birth.</p>';
      if (!b.sex) html += '<p class="faint">Set ' + esc(b.name) + '’s sex in Settings → Babies to see WHO growth percentiles.</p>';
      return html + h.timeField('time', ev ? ev.time : Date.now()) + noteField(d.note) + footer(ev);
    },
    parse: function (form) {
      var data = { weightKg: h.weightFromDisplay(val(form, 'weight')), lengthCm: h.lenFromDisplay(val(form, 'length')), headCm: h.lenFromDisplay(val(form, 'head')), note: val(form, 'note').trim() };
      if (!data.weightKg && !data.lengthCm && !data.headCm) return { field: 'weight', error: 'Enter at least one measurement.' };
      return { time: h.fromLocalInput(val(form, 'time')), data: data };
    },
    mount: function (body) {
      var form = body.querySelector('form'), b = S.baby();
      var sync = function () {
        var w = h.weightFromDisplay(val(form, 'weight')), out = '';
        if (w && b.birthWeightKg) {
          var pct = (w - b.birthWeightKg) / b.birthWeightKg * 100, dd = days();
          if (pct < -10) out = h.note('urgent', Math.abs(Math.round(pct)) + '% below birth weight', 'Losing more than 10% of birth weight is more than expected — contact your pediatrician or lactation consultant.');
          else if (pct < 0 && dd > 14) out = h.note('warn', 'Still under birth weight', 'Most babies are back to birth weight by 10–14 days. Mention this at your next check — sooner if feeds or wet diapers have dropped.');
          else if (pct < 0) out = h.note('ok', Math.abs(Math.round(pct * 10) / 10) + '% below birth weight', 'Babies normally lose up to 7–10% in the first days and regain it by 10–14 days.');
          else if (dd <= 30) out = h.note('ok', (Math.round(pct * 10) / 10) + '% above birth weight', 'Gaining since birth — great.');
        }
        out += percentiles(form, b);
        form.querySelector('#growth-feedback').innerHTML = out;
      };
      form.addEventListener('input', sync); form.addEventListener('change', sync); sync();
    }
  };

  /* ======================= SIMPLE (bath / note / milestone) ======================= */
  function simple(type, label, placeholder) {
    return {
      title: function (ev) { return (ev ? 'Edit ' : '') + label; },
      html: function (ev) {
        var d = ev ? ev.data : {};
        return (type === 'bath' ? '' : '<label class="field"><span class="field__label">' + (type === 'milestone' ? 'What happened?' : 'Note') + '</span><textarea class="input" name="text" maxlength="400" placeholder="' + esc(placeholder) + '" autofocus>' + esc(d.text || '') + '</textarea></label>') +
          h.timeField('time', ev ? ev.time : Date.now()) + (type === 'bath' ? noteField(d.note) : '') + footer(ev);
      },
      parse: function (form) {
        var data = type === 'bath' ? { note: val(form, 'note').trim() } : { text: val(form, 'text').trim() };
        if (type !== 'bath' && !data.text) return { field: 'text', error: 'Write something first.' };
        return { time: h.fromLocalInput(val(form, 'time')), data: data };
      }
    };
  }

  var FORMS = {
    feed: FEED, diaper: DIAPER, sleep: SLEEP, pump: PUMP, tummy: TUMMY, med: MED, temp: TEMP, growth: GROWTH,
    bath: simple('bath', 'Bath', ''),
    note: simple('note', 'Note', 'e.g. Pediatrician said… / Questions for next visit…'),
    milestone: simple('milestone', 'Milestone', 'e.g. First real smile! 😊')
  };

  // Open the sheet for `type` (new) or for an existing event.
  function open(type, ev, preset) {
    var F = FORMS[type];
    if (!F) return;
    currentType = type;
    h.openSheet({
      kind: 'form', type: type, eventId: ev ? ev.id : null,
      title: function () { return F.title(ev, preset); },
      html: function () {
        var cur = ev ? S.findEvent(ev.id) : null;
        return '<form class="form" id="sheet-form" data-type="' + type + '"' + (cur ? ' data-id="' + cur.id + '"' : '') + ' novalidate>' + F.html(cur, preset) + '</form>';
      },
      mount: function (body) {
        if (F.mount) F.mount(body);
        if (preset && preset.kind) { var r = body.querySelector('input[name="kind"][value="' + preset.kind + '"]'); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } }
      }
    });
  }

  // Called on submit; returns the saved event (or null after showing an error).
  function save(form) {
    var type = form.getAttribute('data-type'), id = form.getAttribute('data-id'), F = FORMS[type];
    var ev = id ? S.findEvent(id) : null;
    var r = F.parse(form, ev);
    if (r.error) { h.fieldError(form, r.field, r.error); return null; }
    if (!r.time) { h.fieldError(form, 'time', 'Pick a time.'); return null; }
    if (r.time > Date.now() + 5 * MIN) { h.fieldError(form, 'time', 'That time is in the future — use Now or pick an earlier time.'); return null; }
    api.lastCopies = [];
    if (ev) return S.updateEvent(id, { time: r.time, end: r.end !== undefined ? r.end : ev.end, data: r.data });
    var saved = S.addEvent({ type: type, time: r.time, end: r.end || null, data: r.data });
    if (type === 'pump' && val(form, 'fromTimer')) S.stopTimer('pump'); // the timed session is now logged
    if (type === 'feed' && r.data.kind === 'bottle' && val(form, 'fromBottleTimer')) S.stopTimer('bottle');
    h.$all('input[name="alsoFor"]:checked', form).forEach(function (c) {
      api.lastCopies.push(S.addEvent({ baby: c.value, type: type, time: r.time, end: r.end || null, data: JSON.parse(JSON.stringify(r.data)) }));
    });
    return saved;
  }

  var api = window.BabyForms = { volStep: volStep, open: open, save: save, FORMS: FORMS, nextSide: nextSide, breastLive: breastLive, pumpLive: pumpLive, lastCopies: [] };
})();
