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
  function footer(ev) {
    return '<div class="btn-row">' +
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
      var kind = d.kind || (S.timers().breast ? 'breast' : b.feeding === 'formula' ? 'bottle' : 'breast');
      var time = ev ? ev.time : Date.now();
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
      html += '<div data-panel="bottle" class="form"' + (kind !== 'bottle' ? ' hidden' : '') + '>' +
        '<div class="stepper"><button type="button" class="btn" data-action="step" data-target="amount" data-step="-' + (h.volUnit() === 'oz' ? 0.5 : 10) + '" aria-label="Less">−</button>' +
        '<div class="stepper__v"><input class="stepper__input" name="amount" type="number" inputmode="decimal" step="any" min="0" value="' + amount + '" aria-label="Amount" /><small>' + h.volUnit() + '</small></div>' +
        '<button type="button" class="btn" data-action="step" data-target="amount" data-step="' + (h.volUnit() === 'oz' ? 0.5 : 10) + '" aria-label="More">+</button></div>' +
        '<div class="field"><span class="field__label">What’s in the bottle?</span>' + seg('milk', [['breast', 'Breast milk'], ['formula', 'Formula']], d.milk || (b.feeding === 'breast' ? 'breast' : 'formula')) + '</div>' +
        '<p class="faint">Typical at this age: ' + bottleRange() + ' per feed. Follow baby’s cues — stopping, turning away and relaxed hands mean full.</p>' +
        '</div>';

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
        if (!data.left && !data.right) return { error: 'Add the minutes for at least one side — or use the timer.' };
        end = time + data.left + data.right;
      } else if (kind === 'bottle') {
        data.amountMl = Math.round(h.volFromDisplay(val(form, 'amount')));
        data.milk = radio(form, 'milk');
        if (!data.amountMl) return { error: 'How much did baby drink?' };
      } else {
        data.food = val(form, 'food').trim();
        data.newFood = checked(form, 'newFood');
        data.reaction = radio(form, 'reaction');
        if (!data.food) return { error: 'What did baby eat?' };
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
        form.querySelector('[data-panel-save]').hidden = k === 'breast' && !editing && !manual;
        form.querySelector('[data-panel-common]').hidden = k === 'breast' && !editing && !manual;
      };
      h.$all('input[name="kind"]', form).forEach(function (r) { r.addEventListener('change', sync); });
      var det = form.querySelector('details'); if (det) det.addEventListener('toggle', sync);
      sync();
    }
  };

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
        '<div class="field"><span class="field__label">Texture</span><div class="chips">' +
        G.POOP_TEXTURES.map(function (t) { return '<label class="chip"><input type="radio" name="texture" value="' + t.id + '"' + (d.texture === t.id ? ' checked' : '') + ' style="display:none" />' + esc(t.label) + '</label>'; }).join('') +
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
      if (!t || !e || e <= t) return { error: 'Wake-up time needs to be after falling asleep.' };
      if (e > Date.now() + 5 * MIN) return { error: 'Wake-up time is in the future — use the sleep timer instead.' };
      if (e - t > 16 * HOUR) return { error: 'That’s over 16 hours — double-check the dates.' };
      return { time: t, end: e, data: { note: val(form, 'note').trim() } };
    }
  };

  /* ======================= PUMP ======================= */
  var PUMP = {
    title: function (ev) { return ev ? 'Edit pumping' : 'Pumping session'; },
    html: function (ev) {
      var d = ev ? ev.data : {}, u = h.volUnit();
      return '<div class="field__row">' +
        '<label class="field"><span class="field__label">Left (' + u + ')</span><input class="input" type="number" inputmode="decimal" step="any" min="0" name="left" value="' + (d.leftMl != null ? h.volToDisplay(d.leftMl) : '') + '" /></label>' +
        '<label class="field"><span class="field__label">Right (' + u + ')</span><input class="input" type="number" inputmode="decimal" step="any" min="0" name="right" value="' + (d.rightMl != null ? h.volToDisplay(d.rightMl) : '') + '" /></label></div>' +
        '<label class="field"><span class="field__label">Duration (min)</span><input class="input" type="number" inputmode="numeric" min="0" max="120" name="duration" value="' + (d.durationMin || 15) + '" /></label>' +
        h.timeField('time', ev ? ev.time : Date.now()) + noteField(d.note) +
        '<p class="faint">Freshly pumped milk keeps about 4 hours at room temperature, 4 days in the fridge, and 6–12 months in the freezer (CDC).</p>' + footer(ev);
    },
    parse: function (form) {
      var l = h.volFromDisplay(val(form, 'left') || 0), r = h.volFromDisplay(val(form, 'right') || 0);
      if (!l && !r) return { error: 'Enter how much you pumped.' };
      return { time: h.fromLocalInput(val(form, 'time')), data: { leftMl: Math.round(l), rightMl: Math.round(r), amountMl: Math.round(l + r), durationMin: num(form, 'duration') || 0, note: val(form, 'note').trim() } };
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
      if (!m) return { error: 'How many minutes?' };
      return { time: t, end: t + m * MIN, data: {} };
    }
  };

  /* ======================= MEDICINE ======================= */
  function medKey(medId, name) { return medId === 'custom' ? 'custom:' + (name || '').toLowerCase() : medId; }
  var MED = {
    title: function (ev) { return ev ? 'Edit medicine' : 'Medicine'; },
    html: function (ev) {
      var d = ev ? ev.data : {}, medId = d.medId || 'acetaminophen', p = G.medicine(medId);
      return '<label class="field"><span class="field__label">Medicine</span><select class="input" name="medId">' +
        G.MEDICINES.map(function (m) { return '<option value="' + m.id + '"' + (m.id === medId ? ' selected' : '') + '>' + esc(m.label) + '</option>'; }).join('') + '</select></label>' +
        '<label class="field" data-custom' + (medId === 'custom' ? '' : ' hidden') + '><span class="field__label">Name</span><input class="input" name="name" maxlength="40" value="' + esc(medId === 'custom' ? d.name || '' : '') + '" placeholder="e.g. Amoxicillin" /></label>' +
        '<label class="field"><span class="field__label">Dose given</span><input class="input" name="dose" maxlength="40" value="' + esc(d.dose || '') + '" placeholder="e.g. 2.5 ml — as on the label / prescription" /></label>' +
        '<div class="field__row"><label class="field"><span class="field__label">Hours between doses</span><input class="input" type="number" inputmode="decimal" step="0.5" min="0" max="48" name="intervalH" value="' + (d.intervalH != null ? d.intervalH : p.intervalH) + '" /></label>' +
        '<label class="field"><span class="field__label">Max doses / 24h</span><input class="input" type="number" inputmode="numeric" min="0" max="24" name="maxPerDay" value="' + (d.maxPerDay != null ? d.maxPerDay : p.maxPerDay) + '" /></label></div>' +
        '<label class="check-line"><input type="checkbox" name="remind"' + ((ev ? d.remind : p.intervalH > 0 && p.intervalH < 24) ? ' checked' : '') + ' /> Remind me when the next dose is allowed</label>' +
        '<div id="med-status"></div>' +
        h.timeField('time', ev ? ev.time : Date.now(), 'Given at') + noteField(d.note) +
        '<p class="faint">Baby Log never suggests doses. Dosing for babies is by weight — follow the label or your pediatrician, and use the syringe that came with the medicine.</p>' + footer(ev);
    },
    parse: function (form) {
      var id = val(form, 'medId'), p = G.medicine(id);
      var name = id === 'custom' ? val(form, 'name').trim() : p.label.split(' (')[0];
      if (!name) return { error: 'What medicine was it?' };
      return { time: h.fromLocalInput(val(form, 'time')), data: { medId: id, name: name, dose: val(form, 'dose').trim(), intervalH: num(form, 'intervalH') || 0, maxPerDay: num(form, 'maxPerDay') || 0, remind: checked(form, 'remind'), note: val(form, 'note').trim() } };
    },
    mount: function (body) {
      var form = body.querySelector('form'), editingId = form.getAttribute('data-id');
      var lastId = val(form, 'medId');
      var sync = function (e) {
        var id = val(form, 'medId'), p = G.medicine(id);
        if (id !== lastId) { // preset changed: refill its spacing rules
          form.elements.intervalH.value = p.intervalH; form.elements.maxPerDay.value = p.maxPerDay;
          form.elements.remind.checked = p.intervalH > 0 && p.intervalH < 24; lastId = id;
        }
        form.querySelector('[data-custom]').hidden = id !== 'custom';
        var out = [], now = Date.now(), dd = days();
        if (dd < p.minAgeDays || (id === 'acetaminophen' && dd < 91)) out.push(h.note('urgent', 'Check with a doctor first', p.warn));
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
        '<div class="stepper__v"><input class="stepper__input" name="temp" type="number" inputmode="decimal" step="0.1" value="' + (d.tempC != null ? h.tempToDisplay(d.tempC) : h.tempToDisplay(36.8)) + '" aria-label="Temperature" /><small>' + h.tempUnit() + '</small></div>' +
        '<button type="button" class="btn" data-action="step" data-target="temp" data-step="0.1" aria-label="Higher">+</button></div>' +
        '<div class="field"><span class="field__label">Taken</span>' + seg('method', [['rectal', 'Rectal'], ['armpit', 'Armpit'], ['ear', 'Ear'], ['forehead', 'Forehead']], method) + '</div>' +
        '<div id="temp-feedback"></div>' +
        '<p class="faint">Under 3 months a rectal reading is the most accurate. Armpit readings run lower — if one is 37.5 °C / 99.5 °F or more, confirm rectally. Ear thermometers aren’t reliable under 6 months.</p>' +
        h.timeField('time', ev ? ev.time : Date.now()) + noteField(d.note) + footer(ev);
    },
    parse: function (form) {
      var c = h.tempFromDisplay(val(form, 'temp'));
      if (c == null || c < 30 || c > 45) return { error: 'That temperature doesn’t look right — check the units in Settings.' };
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
  var GROWTH = {
    title: function (ev) { return ev ? 'Edit measurement' : 'Growth'; },
    html: function (ev) {
      var d = ev ? ev.data : {}, b = S.baby();
      var html = '<label class="field"><span class="field__label">Weight (' + h.weightUnit() + ')</span><input class="input" type="number" inputmode="decimal" step="any" min="0" name="weight" value="' + (d.weightKg ? h.weightToDisplay(d.weightKg) : '') + '" placeholder="' + (h.weightUnit() === 'lb' ? 'e.g. 8.25' : 'e.g. 3.75') + '" /></label>' +
        '<div class="field__row"><label class="field"><span class="field__label">Length (' + h.lenUnit() + ')</span><input class="input" type="number" inputmode="decimal" step="any" min="0" name="length" value="' + (d.lengthCm ? h.lenToDisplay(d.lengthCm) : '') + '" /></label>' +
        '<label class="field"><span class="field__label">Head (' + h.lenUnit() + ')</span><input class="input" type="number" inputmode="decimal" step="any" min="0" name="head" value="' + (d.headCm ? h.lenToDisplay(d.headCm) : '') + '" /></label></div>' +
        '<div id="growth-feedback"></div>';
      if (!b.birthWeightKg) html += '<p class="faint">Tip: add the birth weight to ' + esc(b.name) + '’s profile (Settings) to see weight regained since birth.</p>';
      return html + h.timeField('time', ev ? ev.time : Date.now()) + noteField(d.note) + footer(ev);
    },
    parse: function (form) {
      var data = { weightKg: h.weightFromDisplay(val(form, 'weight')), lengthCm: h.lenFromDisplay(val(form, 'length')), headCm: h.lenFromDisplay(val(form, 'head')), note: val(form, 'note').trim() };
      if (!data.weightKg && !data.lengthCm && !data.headCm) return { error: 'Enter at least one measurement.' };
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
          else out = h.note('ok', (Math.round(pct * 10) / 10) + '% above birth weight', 'Gaining since birth — great.');
        }
        form.querySelector('#growth-feedback').innerHTML = out;
      };
      form.addEventListener('input', sync); sync();
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
        if (type !== 'bath' && !data.text) return { error: 'Write something first.' };
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
    h.openSheet({
      kind: 'form', type: type, eventId: ev ? ev.id : null,
      title: function () { return F.title(ev); },
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
    if (r.error) { h.toast(r.error); return null; }
    if (!r.time) { h.toast('Pick a time.'); return null; }
    if (r.time > Date.now() + 5 * MIN) { h.toast('That time is in the future.'); return null; }
    if (ev) return S.updateEvent(id, { time: r.time, end: r.end !== undefined ? r.end : ev.end, data: r.data });
    return S.addEvent({ type: type, time: r.time, end: r.end || null, data: r.data });
  }

  window.BabyForms = { open: open, save: save, FORMS: FORMS, nextSide: nextSide, breastLive: breastLive };
})();
