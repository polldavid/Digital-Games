/* =========================================================
   Kalinga — elder.js
   The elder's screens. Big, calm, photo first, and every
   screen can be read aloud (🔊).
   - Home: greeting, at most 3 tiles in Phase 1 (next/now
     medicine, measure, medicine-when-needed), today's list.
   - Dose card (#dose): the alarm. Pill photos and plain
     amounts; tap a pill you did NOT take; Nainom ko na /
     Mamaya / Hindi ko iinumin. Sliding-scale insulin asks for
     a sugar reading and shows the caregiver's chart row — it
     never calculates a dose (KalingaScale.lookup only).
   - Reading flow (elder sheet): voice -> read-back "185 — tama
     ba?" -> ✓ saves / ✗ retries (keypad after two ✗), BP pairs,
     faces for symptoms, then the verdict or a danger card.
   - Medicine when needed: limits from the label (prnAllowed).
   ========================================================= */
(function () {
  'use strict';

  var App = window.KalingaApp, h = App.h, k = App.k, I = window.KalingaI18n, t = I.t;
  var Sch = window.KalingaSchedule, Sc = window.KalingaScale, V = window.KalingaVitals, N = window.KalingaSpeech;
  var Voice = window.KalingaVoice, R = window.KalingaReminders, F = window.KalingaFiles;
  var esc = h.esc, MIN = h.MIN, DAY = h.DAY;

  function S() { return App.store; }
  function elder() { var d = S().get().device; return d.elderId ? S().find('elders', d.elderId) : null; }
  function by() { var e = elder(); return e ? e.name : ''; }

  /* ================= HOME ================= */
  function dayInfo(el, now) {
    var day = h.startOfDay(now);
    var slots = S().timeline(el.id, day, day + DAY, now).filter(function (s) { return !s.orphan; });
    var open = slots.filter(function (s) { return s.items.some(function (it) { return (it.status === 'due' || it.status === 'unconfirmed') && !it.takenEarlier; }); });
    var next = slots.filter(function (s) { return s.status === 'upcoming'; })[0] || null;
    return { slots: slots, open: open, next: next };
  }
  function medsOf(slot) { return slot.items.map(function (it) { return S().find('meds', it.medId); }).filter(Boolean); }
  function pics(slot) { return '<div class="el-pics">' + medsOf(slot).slice(0, 5).map(function (m) { return k.medPic(m); }).join('') + '</div>'; }
  function slotWhen(slot) { return h.fmtTime(slot.at) + ' — ' + t('pod.' + Sch.partOfDay(slot.at)); }

  function home() {
    var el = elder();
    if (!el) return '';
    var now = Date.now(), info = dayInfo(el, now), part = Sch.partOfDay(now), out = [];
    out.push('<div class="el-top"><div class="el-hello"><h1>' + esc(t('el.hello.' + part, { name: el.name })) + '</h1><div class="el-date">' + esc(h.fmtLong(now)) + '</div></div>' +
      '<button class="speakbtn" data-action="el-speak" aria-label="' + esc(t('c.speak')) + '">🔊</button></div>');
    // Tile 1: medicine
    if (info.open.length) {
      var o = info.open[0];
      out.push('<button class="el-tile el-tile--due" data-action="dose-open" data-key="' + esc(o.slotKey) + '"><span class="el-tile__icon" aria-hidden="true">⏰</span><span><span class="el-tile__label">' + esc(t('el.nowDue')) + '</span><span class="el-tile__sub">' + esc(slotWhen(o)) + '</span>' + pics(o) + '</span></button>');
    } else if (info.next) {
      out.push('<button class="el-tile" data-action="dose-open" data-key="' + esc(info.next.slotKey) + '"><span class="el-tile__icon" aria-hidden="true">💊</span><span><span class="el-tile__label">' + esc(t('el.next')) + '</span><span class="el-tile__sub">' + esc(slotWhen(info.next)) + ' · ' + esc(h.until(info.next.at, now)) + '</span>' + pics(info.next) + '</span></button>');
    } else {
      out.push('<div class="el-tile el-tile--done"><span class="el-tile__icon" aria-hidden="true">✅</span><span class="el-tile__label">' + esc(info.slots.length ? t('el.allDone') : t('el.noMeds')) + '</span></div>');
    }
    // Tile 2: measure
    var types = S().list('vitalTypes', function (v) { return v.elderId === el.id; });
    if (types.length) {
      var due = R.measuresDue(el, now);
      out.push('<button class="el-tile' + (due.length ? ' el-tile--due' : '') + '" data-action="measure-open"><span class="el-tile__icon" aria-hidden="true">' + (types.length === 1 ? k.vitalIcon(types[0]) : '🩺') + '</span><span><span class="el-tile__label">' + esc(t('el.measure')) + '</span><span class="el-tile__sub">' +
        esc(due.length ? t('el.measureDue', { what: due.map(function (d) { return k.vitalName(d.type); }).join(', ') }) : types.map(k.vitalName).join(' · ')) + '</span></span></button>');
    }
    // Tile 3: medicine when needed
    var prn = S().list('meds', function (m) { return m.elderId === el.id && m.active !== false && m.prn && isPrnOnly(m); });
    if (prn.length) {
      out.push('<button class="el-tile" data-action="prn-open"><span class="el-tile__icon" aria-hidden="true">🤲</span><span><span class="el-tile__label">' + esc(t('el.prn')) + '</span><span class="el-tile__sub">' + esc(prn.map(function (m) { return m.name; }).join(' · ')) + '</span></span></button>');
    }
    // Today's list
    if (info.slots.length) {
      out.push('<h2 class="el-h2">' + esc(t('el.today')) + '</h2><div class="el-list">' + info.slots.map(function (s) {
        var mark = s.status === 'done' ? (s.items.every(function (it) { return it.status === 'skipped'; }) ? '✖️' : '✅') : s.status === 'due' || s.status === 'unconfirmed' ? '⏰' : '🕒';
        return '<div class="el-row' + (s.status === 'done' ? ' el-row--taken' : '') + '"><span class="el-row__time">' + esc(h.fmtTime(s.at)) + '</span><span class="el-row__what">' + esc(medsOf(s).map(function (m) { return m.name; }).join(', ')) + '</span><span class="el-row__mark" aria-label="' + esc(t('st.' + (s.status === 'done' ? 'taken' : s.status))) + '">' + mark + '</span></div>';
      }).join('') + '</div>');
    }
    out.push('<button class="btn btn--ghost el-caregiver" data-action="pin-open">⚙ ' + esc(t('el.caregiver')) + '</button>');
    return out.join('');
  }
  function isPrnOnly(m) { return !S().list('schedules', function (s) { return s.medId === m.id && s.rule && !s.rule.prn; }).length; }

  function homeSpeech() {
    var el = elder(); if (!el) return '';
    var now = Date.now(), info = dayInfo(el, now), parts = [t('el.hello.' + Sch.partOfDay(now), { name: el.name })];
    if (info.open.length) parts.push(t('el.nowDue') + '.');
    else if (info.next) parts.push(t('el.next') + ': ' + slotWhen(info.next) + ', ' + h.until(info.next.at, now) + '.');
    else if (info.slots.length) parts.push(t('el.allDone'));
    return parts.join(' ');
  }

  /* ================= DOSE CARD ================= */
  var dose = null; // { slotKey, at, items: [{ medId, scheduleId, dose, on, earlier, units, reading, look }], phase, ringing }

  function openDose(slotKey, ringing) {
    var el = elder();
    if (!el) return;
    var at = slotTimeOf(slotKey);
    var slot = S().timeline(el.id, h.startOfDay(at), h.startOfDay(at) + DAY, Date.now()).filter(function (s) { return s.slotKey === slotKey; })[0];
    if (!slot) return;
    var items = slot.items.filter(function (it) { return it.status !== 'taken' && it.status !== 'skipped'; }).map(function (it) {
      var m = S().find('meds', it.medId);
      return { medId: it.medId, scheduleId: it.scheduleId, dose: it.dose, on: !it.takenEarlier && !k.isScale(m), earlier: !!it.takenEarlier, units: null, reading: null, look: null };
    });
    if (!items.length) return;
    dose = { slotKey: slotKey, at: slot.at, items: items, phase: 'ask', ringing: !!ringing };
    items.forEach(function (it) { if (k.isScale(S().find('meds', it.medId))) useRecentSugar(it); });
    $dose().hidden = false;
    document.body.classList.add('sheet-open');
    renderDose();
    if (ringing) R.alarm(function (done) { speakDose(done); });
    setTimeout(function () { var b = h.$('#dose [data-action="dose-take"]'); if (b) try { b.focus({ preventScroll: true }); } catch (e) {} }, 50);
  }
  function slotTimeOf(key) { var m = /@(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(key); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : Date.now(); }
  function $dose() { return h.$('#dose'); }
  function closeDose() {
    R.stopAlarm();
    dose = null;
    $dose().hidden = true;
    $dose().innerHTML = '';
    if (!App.ui.sheet) document.body.classList.remove('sheet-open');
    App.render();
  }

  function itemUnits(it, med) {
    if (k.isScale(med)) return it.units;
    return it.dose && it.dose.amount != null ? it.dose.amount : med.dose.amount;
  }

  function doseHtml() {
    if (!dose) return '';
    if (dose.phase === 'done') return '<div class="dose__inner"><div class="dose__done" role="status"><span aria-hidden="true">👏</span>' + esc(dose.doneText) + '</div></div>';
    var meds = dose.items.map(function (it) {
      var m = S().find('meds', it.medId); if (!m) return '';
      if (it.earlier) {
        return '<div class="dmed dmed--earlier">' + k.medPic(m, 'dmed__pic') + '<div><div class="dmed__name">' + esc(m.name) + '</div><div class="dmed__note">✓ ' + esc(t('dose.earlier')) + '</div></div></div>';
      }
      var scale = k.isScale(m), u = itemUnits(it, m);
      var head = '<button class="dmed' + (it.on ? '' : ' dmed--off') + '" data-action="dose-toggle" data-id="' + esc(it.medId) + '" aria-pressed="' + (it.on ? 'true' : 'false') + '">' +
        k.medPic(m, 'dmed__pic') + '<span><span class="dmed__amount">' + esc(u != null ? k.amountText(m, u) : '? ' + t('unit.units')) + '</span><span class="dmed__name" style="display:block">' + esc(m.name) + '</span>' +
        (m.purpose ? '<span class="dmed__purpose" style="display:block">' + esc(m.purpose) + '</span>' : '') +
        (it.on ? '' : '<span class="dmed__note" style="display:block;color:var(--text-dim)">' + esc(t('dose.notTaking')) + '</span>') + '</span>' +
        '<span class="dmed__tick" aria-hidden="true">' + (it.on ? '✓' : '✕') + '</span></button>';
      return scale ? '<div class="dose__meds">' + head + scaleHtml(it, m) + '</div>' : head;
    }).join('');
    var anyOn = dose.items.some(function (it) { return it.on && !it.earlier; });
    var pending = dose.items.filter(function (it) { return !it.earlier; }).length;
    var applyOnly = dose.items.every(function (it) { var m = S().find('meds', it.medId); return m && k.APPLY_FORMS[m.form]; });
    return '<div class="dose__inner">' +
      '<div class="dose__head"><h2 id="dose-title">' + esc(t('dose.title', { time: h.fmtTime(dose.at), part: t('pod.' + Sch.partOfDay(dose.at)) })) + '</h2>' +
      '<button class="speakbtn" data-action="dose-speak" aria-label="' + esc(t('c.speak')) + '">🔊</button></div>' +
      (pending > 1 ? '<p class="dose__hint">' + esc(t('dose.tapToUncheck')) + '</p>' : '') +
      '<div class="dose__meds">' + meds + '</div>' +
      '<div class="dose__actions">' +
      (pending ? '<button class="btn btn--primary el-btn el-btn--huge" data-action="dose-take"' + (anyOn ? '' : ' disabled') + '>✓ ' + esc(applyOnly ? t('dose.applied') : t('dose.takeAll')) + '</button>' +
        '<div class="btn-row"><button class="btn el-btn" data-action="dose-later">⏰ ' + esc(t('dose.later')) + '</button><button class="btn el-btn" data-action="dose-skip">' + esc(t('dose.skip')) + '</button></div>'
        : '<button class="btn btn--primary el-btn el-btn--huge" data-action="dose-close">' + esc(t('c.close')) + '</button>') +
      '</div></div>';
  }

  // Sliding scale: needs a sugar reading, then shows the caregiver's chart row.
  function scaleHtml(it, m) {
    var out = '<div class="dmed__scale">';
    if (!it.reading) {
      return out + '<div style="font-weight:800">🩸 ' + esc(t('ins.needReading')) + '</div><button class="btn btn--primary" data-action="dose-sugar" data-id="' + esc(m.id) + '">' + esc(t('el.measure')) + '</button></div>';
    }
    var sugarType = sugarTypeOf();
    var shown = sugarType ? k.valueText(sugarType, it.reading.value) : it.reading.value + ' mg/dL';
    var look = it.look;
    if (look.row) {
      out += '<div class="scale-row">' + esc(t('ins.lookupTitle')) + ':<br>' + esc(shown) + ' → <b>' + esc(t('ins.unitsDone', { u: look.row.units })) + '</b></div>';
    } else {
      out += '<div class="note note--bad" style="font-size:inherit;font-weight:750">' + esc(look.noChart ? t('ins.noChart') : t('ins.outside', { v: shown })) + '</div>';
    }
    out += '<button class="btn" data-action="dose-units" data-id="' + esc(m.id) + '">' + esc(t('ins.adjust')) + '</button>';
    return out + '</div>';
  }
  function sugarTypeOf() { var el = elder(); return el ? S().list('vitalTypes', function (v) { return v.elderId === el.id && v.key === 'sugar'; })[0] || null : null; }
  // A sugar reading from the last 30 minutes counts.
  function useRecentSugar(it) {
    var st = sugarTypeOf(); if (!st) return;
    var recent = S().list('readings', function (r) { return r.vitalTypeId === st.id && r.at >= Date.now() - 30 * MIN; }).sort(function (a, b) { return b.at - a.at; })[0];
    if (recent) applyReading(it, recent);
  }
  function applyReading(it, reading) {
    var m = S().find('meds', it.medId);
    it.reading = reading;
    it.look = Sc.lookup(m.insulin.charts, reading.value, reading.context);
    if (it.look.row) { it.units = it.look.row.units; it.on = it.look.row.units > 0; } else { it.units = null; it.on = false; }
  }

  function renderDose() { if (dose) { $dose().innerHTML = doseHtml(); F.hydrate($dose()); } }

  function speakDose(done) {
    if (!dose) { if (done) done(); return; }
    var el = elder(), list = dose.items.filter(function (it) { return !it.earlier; }).map(function (it) {
      var m = S().find('meds', it.medId), u = itemUnits(it, m);
      return t('dose.speechItem', { amount: u != null ? k.amountText(m, u) : 'insulin', med: m.name, purpose: m.purpose || '' }).replace(/, \.$/, '.');
    }).join(' ');
    var text = t('dose.speech', { name: el ? el.name : '', list: list });
    var clip = dose.items.map(function (it) { var m = S().find('meds', it.medId); return m && m.voiceId; }).filter(Boolean)[0];
    if (clip) Voice.play(clip, { onend: function () { Voice.say(list, { onend: done }); } }).catch(function () { Voice.say(text, { onend: done }); });
    else Voice.say(text, { onend: done });
  }

  function finishDose(text) {
    R.stopAlarm();
    R.clearSnooze(dose.slotKey);
    App.commit();
    dose.phase = 'done'; dose.doneText = text;
    renderDose();
    Voice.say(text);
    setTimeout(function () { if (dose && dose.phase === 'done') closeDose(); }, 2600);
  }

  function takeDose() {
    if (!dose) return;
    var el = elder(), missing = null;
    dose.items.forEach(function (it) {
      if (it.earlier || !it.on) return;
      var m = S().find('meds', it.medId);
      if (k.isScale(m) && it.units == null) missing = it;
    });
    if (missing) { h.toast(t('ins.needReading')); return; }
    dose.items.forEach(function (it) {
      if (it.earlier) return;
      var m = S().find('meds', it.medId);
      S().recordDose({ elderId: el.id, medId: it.medId, scheduleId: it.scheduleId, slotKey: dose.slotKey, dueAt: dose.at, status: it.on ? 'taken' : 'skipped', units: it.on ? itemUnits(it, m) : null, by: by() });
    });
    finishDose(t('dose.saidTaken'));
  }
  function laterDose() {
    if (!dose) return;
    var el = elder();
    dose.items.forEach(function (it) { if (!it.earlier) S().recordDose({ elderId: el.id, medId: it.medId, scheduleId: it.scheduleId, slotKey: dose.slotKey, dueAt: dose.at, status: 'snoozed', by: by() }); });
    R.snooze(dose.slotKey, 10);
    App.commit();
    var msg = t('dose.snoozed');
    closeDose();
    h.toast(msg); Voice.say(msg);
  }
  function skipDose() {
    h.ask({ title: t('dose.skip') + '?', text: t('dose.skipAsk'), ok: t('dose.skip'), danger: true }, function () {
      if (!dose) return;
      var el = elder();
      dose.items.forEach(function (it) { if (!it.earlier) S().recordDose({ elderId: el.id, medId: it.medId, scheduleId: it.scheduleId, slotKey: dose.slotKey, dueAt: dose.at, status: 'skipped', by: by() }); });
      finishDose(t('dose.skipped'));
    });
  }

  /* ================= READING FLOW ================= */
  var rd = null; // { typeId, phase, value, keys, step, wrongs, heard, msg, listening, context, photoId, onDone, verdict }

  function openMeasure() {
    var el = elder(); if (!el) return;
    var types = S().list('vitalTypes', function (v) { return v.elderId === el.id; });
    if (types.length === 1) { startReading(types[0].id); return; }
    var due = R.measuresDue(el, Date.now()).map(function (d) { return d.type.id; });
    types.sort(function (a, b) { return (due.indexOf(b.id) >= 0) - (due.indexOf(a.id) >= 0); });
    h.openSheet({ elder: true, title: t('el.measureWhat'), html: '<div class="el-choices">' + types.map(function (v) {
      return '<button class="el-choice" data-action="rd-start" data-id="' + esc(v.id) + '"><span class="el-choice__icon" aria-hidden="true">' + k.vitalIcon(v) + '</span><span>' + esc(k.vitalName(v)) + (due.indexOf(v.id) >= 0 ? ' ⏰' : '') + '</span></button>';
    }).join('') + '</div>' });
  }

  function startReading(typeId, onDone) {
    var type = S().find('vitalTypes', typeId); if (!type) return;
    rd = { typeId: typeId, phase: type.kind === 'face' ? 'faces' : (Voice.canHear() ? 'voice' : 'keypad'), value: null, keys: '', step: 'sys', pair: {}, wrongs: 0, heard: '', msg: Voice.canHear() || type.kind === 'face' ? '' : t('rd.noMic'), context: V.guessContext(type, Date.now()), photoId: null, onDone: onDone || null };
    h.openSheet({ elder: true, title: k.vitalIcon(type) + ' ' + k.vitalName(type), html: readingHtml, onclose: function () { Voice.stopHearing(); Voice.stop(); rd = null; } });
    if (type.kind === 'face') Voice.say(t('rd.how', { what: k.vitalName(type) }));
  }
  function rType() { return rd && S().find('vitalTypes', rd.typeId); }

  function readingHtml() {
    var type = rType(); if (!type) return '';
    if (rd.phase === 'voice') {
      return '<div class="mic">' + (rd.msg ? '<p class="note note--due" role="alert" style="font-size:inherit">' + esc(rd.msg) + '</p>' : '') +
        '<button class="mic__orb' + (rd.listening ? ' mic__orb--on' : '') + '" data-action="rd-listen" aria-label="' + esc(t('rd.say')) + '">🎤</button>' +
        '<p class="mic__hint">' + esc(rd.listening ? t('rd.listening') : type.kind === 'pair' ? t('rd.sayBp') : t('rd.say')) + '</p>' +
        (rd.heard ? '<p class="mic__heard">' + esc(t('rd.heard', { t: rd.heard })) + '</p>' : '') +
        '<button class="btn el-btn btn--block" data-action="rd-keypad">⌨️ ' + esc(t('rd.type')) + '</button></div>';
    }
    if (rd.phase === 'keypad') {
      var label = type.kind === 'pair' ? t(rd.step === 'sys' ? 'rd.sys' : rd.step === 'dia' ? 'rd.dia' : 'rd.pulse') : t('rd.typeOnly') + ' (' + k.unitOf(type) + ')';
      var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', type.kind === 'number' && (type.key !== 'sugar' || k.sugarUnit() === 'mmol/L') ? '.' : '', '0', '⌫'];
      return (rd.msg ? '<p class="note note--due" role="alert" style="font-size:inherit">' + esc(rd.msg) + '</p>' : '') +
        '<div class="keypad"><div class="keypad__label">' + esc(label) + '</div><div class="keypad__display" aria-live="polite">' + esc(rd.keys || '—') + '</div>' +
        keys.map(function (c) { return c ? '<button data-action="rd-key" data-value="' + esc(c) + '" aria-label="' + esc(c === '⌫' ? 'Delete' : c) + '">' + esc(c) + '</button>' : '<span></span>'; }).join('') +
        '</div><div class="btn-row" style="margin-top:14px">' +
        (rd.step === 'pulse' ? '<button class="btn el-btn" data-action="rd-key-skip">' + esc(t('c.optional')) + ' ➜</button>' : '') +
        '<button class="btn btn--primary el-btn" data-action="rd-key-ok"' + (rd.keys ? '' : ' disabled') + '>✓ OK</button></div>';
    }
    if (rd.phase === 'confirm') {
      return '<div class="readback"><div class="readback__num">' + esc(k.valueText(type, rd.value, false)) + '</div><div class="readback__unit">' + esc(type.kind === 'face' ? '' : k.unitOf(type)) + '</div>' +
        '<p style="margin:0;font-weight:800">' + esc(t('rd.isItRight', { v: k.valueText(type, rd.value, false) })) + '</p>' +
        contextChips(type) +
        '<div class="btn-row"><button class="btn el-btn" data-action="rd-wrong">✗ ' + esc(t('rd.wrong')) + '</button><button class="btn btn--primary el-btn" data-action="rd-right">✓ ' + esc(t('rd.right')) + '</button></div></div>';
    }
    if (rd.phase === 'faces') {
      return '<p style="margin:0 0 12px;font-weight:800">' + esc(t('rd.how', { what: k.vitalName(type) })) + '</p><div class="faces">' + k.FACES.map(function (f, i) {
        return '<button class="face' + (rd.value === i + 1 ? ' face--on' : '') + '" data-action="rd-face" data-value="' + (i + 1) + '" aria-pressed="' + (rd.value === i + 1) + '"><span aria-hidden="true">' + f + '</span>' + esc(t('face.' + (i + 1))) + '</button>';
      }).join('') + '</div>' +
        '<div style="margin-top:16px;display:grid;gap:10px">' + (rd.photoId ? '<img class="thumb" style="width:120px;height:120px" data-photo="' + esc(rd.photoId) + '" alt="" />' : '') +
        '<label class="btn el-btn">📷 ' + esc(t('rd.addPhoto')) + '<input type="file" accept="image/*" capture="environment" data-action-change="rd-photo" hidden /></label>' +
        '<button class="btn btn--primary el-btn" data-action="rd-face-save"' + (rd.value ? '' : ' disabled') + '>✓ ' + esc(t('c.save')) + '</button></div>';
    }
    if (rd.phase === 'result') {
      var vd = rd.verdict, card = vd.danger ? '<div class="danger-card" role="alert"><h3>⚠️ ' + esc(t('v.danger')) + '</h3>' + esc(t('card.' + vd.danger.card)) + '</div>' + callButtons() : '';
      return '<div style="display:grid;gap:16px">' + card +
        '<div class="verdict verdict--' + esc(vd.level) + '" role="status"><div class="verdict__val">' + esc(k.valueText(type, rd.value)) + '</div><div class="verdict__word">' + esc(k.verdictWord(type, vd)) + '</div></div>' +
        '<button class="btn btn--primary el-btn el-btn--huge" data-action="rd-done">' + esc(t('c.done')) + '</button></div>';
    }
    return '';
  }
  function contextChips(type) {
    var c = type.contexts || [];
    if (c.length < 2) return '';
    return '<div><div class="field__label" style="font-size:inherit;margin-bottom:8px">' + esc(t('rd.when')) + '</div><div class="chips" style="justify-content:center">' + c.map(function (x) {
      return '<button class="chip' + (rd.context === x ? ' chip--on' : '') + '" data-action="rd-ctx" data-value="' + esc(x) + '" aria-pressed="' + (rd.context === x) + '">' + esc(t('ctx.' + x)) + '</button>';
    }).join('') + '</div></div>';
  }
  function callButtons() {
    var el = elder(), cs = parseContacts(el && el.contacts);
    if (!cs.length) return '';
    return '<div class="btn-row">' + cs.slice(0, 3).map(function (c) { return '<a class="btn btn--danger el-btn" href="tel:' + esc(c.number.replace(/[^\d+]/g, '')) + '">📞 ' + esc(t('card.call', { name: c.name })) + '</a>'; }).join('') + '</div>';
  }
  function parseContacts(list) {
    return (Array.isArray(list) ? list : String(list || '').split('\n')).map(function (line) {
      if (line && typeof line === 'object') return line;
      var m = /^\s*(.+?)\s*[—–-]\s*([+\d][\d\s()-]{5,})\s*$/.exec(line || '');
      return m ? { name: m[1], number: m[2] } : null;
    }).filter(Boolean);
  }

  function listen() {
    var type = rType(); if (!type) return;
    if (rd.listening) { Voice.stopHearing(); rd.listening = false; h.renderSheet(); return; }
    rd.listening = true; rd.msg = ''; rd.heard = '';
    h.renderSheet();
    Voice.hear({
      onPartial: function (txt) { if (!rd) return; rd.heard = txt; var p = h.$('.mic__heard'); if (p) p.textContent = t('rd.heard', { t: txt }); else h.renderSheet(); },
      onResult: function (alts) {
        if (!rd) return;
        rd.listening = false; rd.heard = alts[0] || '';
        var kind = type.kind === 'pair' ? 'pair' : 'number', found = null, implaus = null;
        for (var i = 0; i < alts.length; i++) {
          var v = N.parse(alts[i], kind);
          if (v == null) continue;
          var canon = kind === 'number' ? k.fromShown(type, v) : v;
          if (V.plausible(type, canon)) { found = canon; break; }
          if (implaus == null) implaus = v;
        }
        if (found != null) { toConfirm(found); return; }
        rd.msg = implaus != null ? t('rd.implausible', { v: kind === 'pair' ? implaus.sys + '/' + implaus.dia : implaus }) : t('rd.notUnderstood');
        h.renderSheet(); Voice.say(rd.msg);
      },
      onError: function (code) {
        if (!rd) return;
        rd.listening = false;
        rd.msg = code === 'blocked' ? t('rd.micBlocked') : code === 'unsupported' ? t('rd.noMic') : t('rd.notUnderstood');
        if (code === 'blocked' || code === 'unsupported') { rd.phase = 'keypad'; }
        h.renderSheet();
      }
    });
  }
  function toConfirm(value) {
    var type = rType();
    rd.value = value; rd.phase = 'confirm'; rd.msg = '';
    h.renderSheet();
    Voice.say(t('rd.isItRight', { v: k.valueText(type, value, false) + (type.kind === 'pair' ? '' : ' ' + k.unitOf(type)) }));
  }
  function key(c) {
    if (c === '⌫') rd.keys = rd.keys.slice(0, -1);
    else if (c === '.' && rd.keys.indexOf('.') >= 0) return;
    else if (rd.keys.length < 6) rd.keys += c;
    h.renderSheet();
  }
  function keyOk(skip) {
    var type = rType(), n = skip ? null : parseFloat(rd.keys);
    if (!skip && !(n >= 0)) return;
    if (type.kind === 'pair') {
      if (rd.step === 'sys') { rd.pair.sys = n; rd.step = 'dia'; rd.keys = ''; h.renderSheet(); return; }
      if (rd.step === 'dia') { rd.pair.dia = n; rd.step = 'pulse'; rd.keys = ''; h.renderSheet(); return; }
      var v = { sys: rd.pair.sys, dia: rd.pair.dia }; if (n != null) v.pulse = n;
      rd.pair = {}; rd.step = 'sys'; rd.keys = '';
      if (!V.plausible(type, v)) { rd.msg = t('rd.implausible', { v: v.sys + '/' + v.dia }); h.renderSheet(); return; }
      toConfirm(v); return;
    }
    var canon = k.fromShown(type, n);
    rd.keys = '';
    if (!V.plausible(type, canon)) { rd.msg = t('rd.implausible', { v: n }); h.renderSheet(); return; }
    toConfirm(canon);
  }
  function wrong() {
    rd.wrongs++;
    rd.value = null;
    rd.phase = rd.wrongs >= 2 || !Voice.canHear() ? 'keypad' : 'voice';
    rd.msg = ''; rd.keys = ''; rd.step = 'sys'; rd.pair = {};
    h.renderSheet();
  }
  function saveReading(source) {
    var type = rType(), el = elder();
    var rec = S().logReading({ elderId: el.id, vitalTypeId: type.id, value: rd.value, context: rd.context || '', source: source, photoId: rd.photoId, by: by() });
    App.commit();
    rd.verdict = V.verdict(type, rd.value);
    rd.phase = 'result';
    var done = rd.onDone;
    if (done) { rd.onDone = null; h.closeSheet(); done(rec); return; }
    h.renderSheet();
    var words = k.valueText(type, rd.value) + '. ' + k.verdictWord(type, rd.verdict) + (rd.verdict.danger ? '. ' + t('card.' + rd.verdict.danger.card) : '');
    Voice.say(words);
  }

  /* ================= MEDICINE WHEN NEEDED ================= */
  function openPrn() {
    var el = elder(); if (!el) return;
    h.openSheet({ elder: true, title: t('prn.title'), html: prnHtml });
  }
  function prnHtml() {
    var el = elder(), now = Date.now();
    var meds = S().list('meds', function (m) { return m.elderId === el.id && m.active !== false && m.prn && isPrnOnly(m); });
    return '<div class="el-choices">' + meds.map(function (m) {
      var taken = S().prnTaken(m.id), last = taken.length ? Math.max.apply(null, taken) : null, ok = Sch.prnAllowed(m, taken, now);
      return '<div class="card" style="display:grid;gap:12px"><div style="display:flex;gap:14px;align-items:center">' + k.medPic(m, 'dmed__pic') +
        '<div><div class="dmed__amount">' + esc(k.amountText(m)) + '</div><div class="dmed__name">' + esc(m.name) + '</div>' + (m.purpose ? '<div class="dmed__purpose">' + esc(m.purpose) + '</div>' : '') + '</div></div>' +
        (last ? '<div class="dim">' + esc(t('prn.last', { t: h.ago(last, now) })) + '</div>' : '') +
        (ok.ok ? '<button class="btn btn--primary el-btn" data-action="prn-take" data-id="' + esc(m.id) + '">✓ ' + esc(t('prn.take')) + '</button>'
          : '<div class="note note--due" style="font-size:inherit;font-weight:700">' + esc(t(ok.reason === 'gap' ? 'prn.wait' : 'prn.max', { time: h.fmtTime(ok.nextAt) })) + '</div>') + '</div>';
    }).join('') + '</div>';
  }
  function takePrn(id) {
    var m = S().find('meds', id), now = Date.now();
    if (!m) return;
    var ok = Sch.prnAllowed(m, S().prnTaken(id), now);
    if (!ok.ok) { h.renderSheet(); return; }
    S().recordDose({ elderId: m.elderId, medId: id, status: 'taken', by: by() });
    App.commit();
    h.closeSheet();
    h.toast(t('dose.saidTaken')); Voice.say(t('dose.saidTaken'));
  }

  /* ================= Actions ================= */
  App.addActions({
    'el-speak': function () { Voice.say(homeSpeech()); },
    'dose-open': function (n) { openDose(n.getAttribute('data-key'), false); },
    'dose-toggle': function (n) {
      var it = dose && dose.items.filter(function (x) { return x.medId === n.getAttribute('data-id'); })[0];
      if (!it || it.earlier) return;
      var m = S().find('meds', it.medId);
      if (k.isScale(m) && it.units == null) { h.toast(t('ins.needReading')); return; }
      it.on = !it.on; renderDose();
    },
    'dose-take': takeDose,
    'dose-later': laterDose,
    'dose-skip': skipDose,
    'dose-close': closeDose,
    'dose-speak': function () { R.stopAlarm(); speakDose(); },
    'dose-sugar': function (n) {
      var it = dose.items.filter(function (x) { return x.medId === n.getAttribute('data-id'); })[0], st = sugarTypeOf();
      R.stopAlarm();
      if (!st) { h.toast(t('ins.noChart')); return; }
      startReading(st.id, function (rec) { if (it && rec) applyReading(it, rec); renderDose(); });
    },
    'dose-units': function (n) {
      var it = dose.items.filter(function (x) { return x.medId === n.getAttribute('data-id'); })[0];
      R.stopAlarm();
      var v = window.prompt(t('ins.units'), it.units != null ? it.units : '');
      if (v == null) return;
      var u = parseFloat(v);
      if (u >= 0 && u <= 100 && (u * 2) % 1 === 0) { it.units = u; it.on = u > 0; renderDose(); }
    },
    'measure-open': openMeasure,
    'rd-start': function (n) { startReading(n.getAttribute('data-id')); },
    'rd-listen': listen,
    'rd-keypad': function () { Voice.stopHearing(); rd.listening = false; rd.phase = 'keypad'; rd.msg = ''; h.renderSheet(); },
    'rd-key': function (n) { key(n.getAttribute('data-value')); },
    'rd-key-ok': function () { keyOk(false); },
    'rd-key-skip': function () { keyOk(true); },
    'rd-right': function () { saveReading(rd.wrongs >= 2 || !Voice.canHear() ? 'keypad' : 'voice'); },
    'rd-wrong': wrong,
    'rd-ctx': function (n) { rd.context = n.getAttribute('data-value'); h.renderSheet(); },
    'rd-face': function (n) { rd.value = +n.getAttribute('data-value'); h.renderSheet(); Voice.say(t('face.' + rd.value)); },
    'rd-face-save': function () { if (rd.value) saveReading('tap'); },
    'rd-done': function () { h.closeSheet(); App.render(); },
    'prn-open': openPrn,
    'prn-take': function (n) { takePrn(n.getAttribute('data-id')); }
  });
  App.changeActions = App.changeActions || {};
  App.changeActions['rd-photo'] = function (input) {
    var file = input.files && input.files[0]; if (!file || !rd) return;
    F.compress(file).then(function (blob) { var id = 'ph-' + Date.now().toString(36); return F.put(id, blob); }).then(function (id) { if (rd) { rd.photoId = id; h.renderSheet(); } }).catch(function (e) { h.toast(e.message); });
  };

  window.KalingaElder = {
    home: home, openDose: openDose, closeDose: closeDose, renderDose: renderDose, isDoseOpen: function () { return !!dose; },
    openMeasure: openMeasure, startReading: startReading, parseContacts: parseContacts
  };
})();
