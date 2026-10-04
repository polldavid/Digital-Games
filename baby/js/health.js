/* =========================================================
   Baby Log — health.js
   The Health tab: doctor visits on a calendar, prescriptions
   (scanned from a photo, always confirmed by the parent),
   doses given, a vaccine checklist, the health profile,
   documents, and summaries to share with the doctor or a
   sitter.
   ========================================================= */
(function () {
  'use strict';

  var G = window.BabyGuide, S = window.BabyStore, Rx = window.BabyRx, Files = window.BabyFiles;
  var App = window.BabyApp, h = App.h;
  var esc = h.esc, MIN = h.MIN, HOUR = h.HOUR, DAY = h.DAY;

  function hl() { return S.health(); }
  function name() { return esc(S.baby().name); }
  function dateOnly(t) { return new Date(t).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: new Date(t).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }); }
  function when(t) { return dateOnly(t) + ', ' + h.fmtTime(t); }
  function isoDate(t) { var d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function fromIsoDate(v) { var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(v || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() : null; }
  function val(form, n) { var e = form.elements[n]; return e ? String(e.value).trim() : ''; }
  function num(form, n) { var v = parseFloat(val(form, n)); return isNaN(v) ? null : v; }
  function photo(id, cls) { return id ? '<img class="' + (cls || 'thumb') + '" data-photo="' + esc(id) + '" alt="Photo" data-action="photo-view" data-id="' + esc(id) + '" />' : ''; }
  function sticky(btns) { return '<div class="btn-row sheet-save">' + btns + '</div>'; }

  var VISIT_TYPES = [['checkup', '🩺 Check-up'], ['vaccine', '💉 Vaccines'], ['sick', '🤒 Sick visit'], ['other', '📋 Other']];
  function visitIcon(t) { return { checkup: '🩺', vaccine: '💉', sick: '🤒', other: '📋' }[t] || '🩺'; }

  /* =====================================================
     Health tab
     ===================================================== */
  function view() {
    var now = Date.now(), H = hl(), b = S.baby();
    var html = '<h1 class="h1">Health</h1>' +
      '<div class="btn-row"><button class="btn" data-action="rx-scan">📷 Scan prescription</button><button class="btn" data-action="appt-edit">＋ Visit</button></div>';

    // Next visit
    var upcoming = H.appointments.filter(function (a) { return !a.done && a.at >= now - 3 * HOUR; }).sort(function (a, b) { return a.at - b.at; });
    var past = H.appointments.filter(function (a) { return a.done || a.at < now - 3 * HOUR; }).sort(function (a, b) { return b.at - a.at; });
    html += '<div class="section-title">Next visit</div><div class="card">';
    if (upcoming.length) {
      var a = upcoming[0];
      html += '<button class="row" data-action="appt-edit" data-id="' + a.id + '"><span class="row__icon">' + visitIcon(a.type) + '</span><div class="row__main"><div class="row__t">' + esc(a.title || 'Doctor’s visit') + '</div><div class="row__s">' + esc(when(a.at)) + (a.place ? ' · ' + esc(a.place) : '') + '</div></div><div class="row__time"><strong data-until="' + a.at + '">' + h.until(a.at, now) + '</strong></div></button>' +
        (a.questions ? '<p class="small muted" style="margin-top:6px"><strong>Questions:</strong> ' + esc(a.questions) + '</p>' : '') +
        '<div class="btn-row" style="margin-top:8px"><button class="btn btn--sm" data-action="visit-summary">📤 Summary for the doctor</button></div>';
      if (upcoming.length > 1) html += '<p class="faint" style="margin-top:8px">+ ' + h.plural(upcoming.length - 1, 'more visit') + ' scheduled — see the calendar.</p>';
    } else {
      html += '<div class="empty"><span class="empty__icon">🗓️</span>No visits scheduled.<br><button class="btn btn--sm" data-action="appt-edit" style="margin-top:8px">Add a visit</button></div>';
    }
    html += '</div>';

    // Medicines
    var active = H.rx.filter(function (rx) { return S.rxStatus(rx, now).active; });
    var ended = H.rx.filter(function (rx) { return !S.rxStatus(rx, now).active; });
    html += '<div class="section-title">Medicines <button class="btn--link" data-action="rx-edit">＋ Add</button></div><div class="card">';
    if (active.length) html += '<div class="rows">' + active.map(function (rx) { return rxRow(rx, now); }).join('') + '</div>';
    else html += '<div class="empty"><span class="empty__icon">💊</span>No medicines right now.<br><span class="small">Scan a prescription or add one by hand.</span></div>';
    if (ended.length) html += '<details class="more"><summary>Past medicines (' + ended.length + ')</summary><div class="rows">' + ended.sort(function (a, b) { return b.start - a.start; }).map(function (rx) { return rxRow(rx, now); }).join('') + '</div></details>';
    html += '</div>';

    // Vaccines
    html += '<div class="section-title">Vaccines <button class="btn--link" data-action="vax-open">Checklist</button></div><div class="card">' + vaxSummary(now) + '</div>';

    // Calendar
    html += '<div class="section-title">Calendar</div><div class="card">' + calendar(now) + '</div>';

    // Records
    var P = H.profile;
    html += '<div class="section-title">Records</div><div class="card"><div class="rows">' +
      '<button class="row" data-action="profile-edit"><span class="row__icon">🪪</span><div class="row__main"><div class="row__t">Health profile</div><div class="row__s">' + esc([P.blood && 'Blood type ' + P.blood, P.allergies ? 'Allergies: ' + P.allergies : 'No allergies noted', P.doctor && 'Dr. ' + P.doctor.replace(/^dr\.?\s*/i, '')].filter(Boolean).join(' · ')) + '</div></div><span class="faint">Edit ›</span></button>' +
      '<button class="row" data-action="emergency"><span class="row__icon">🆘</span><div class="row__main"><div class="row__t">Emergency info</div><div class="row__s">For a sitter, grandparent or the ER — share or show</div></div><span class="faint">›</span></button>' +
      '<button class="row" data-action="visit-summary"><span class="row__icon">📤</span><div class="row__main"><div class="row__t">Summary for the doctor</div><div class="row__s">Last 7 days of feeds, diapers, sleep, meds, fevers, growth</div></div><span class="faint">›</span></button>' +
      '</div></div>';

    html += '<div class="section-title">Documents <button class="btn--link" data-action="doc-edit">＋ Add</button></div><div class="card">';
    if (H.docs.length) html += '<div class="docs">' + H.docs.slice().sort(function (a, b) { return b.date - a.date; }).map(function (d) {
      return '<button class="doc" data-action="doc-edit" data-id="' + d.id + '">' + (d.photoId ? '<img class="doc__img" data-photo="' + esc(d.photoId) + '" alt="" />' : '<span class="doc__img doc__img--none">📄</span>') + '<span class="doc__t">' + esc(d.title || 'Document') + '</span><span class="doc__s">' + esc(dateOnly(d.date)) + '</span></button>';
    }).join('') + '</div>';
    else html += '<div class="empty"><span class="empty__icon">🗂️</span>Keep photos of lab results, the vaccine card, or the birth certificate here.</div>';
    html += '</div>';

    if (past.length) html += '<div class="section-title">Past visits</div><div class="card"><div class="rows">' + past.slice(0, 10).map(function (a) {
      return '<button class="row" data-action="appt-edit" data-id="' + a.id + '"><span class="row__icon">' + visitIcon(a.type) + '</span><div class="row__main"><div class="row__t">' + esc(a.title || 'Doctor’s visit') + '</div><div class="row__s">' + esc(a.outcome || a.place || '') + '</div></div><div class="row__time"><strong>' + esc(dateOnly(a.at)) + '</strong></div></button>';
    }).join('') + '</div></div>';

    html += '<p class="disclaimer">Keep using your pediatrician’s instructions and the medicine label as the final word on doses.</p>';
    return html;
  }

  function rxRow(rx, now) {
    var rs = S.rxStatus(rx, now);
    var line = [rx.dose, rx.prn ? 'as needed' : rx.intervalH ? (rx.intervalH >= 24 ? 'once a day' : 'every ' + rx.intervalH + 'h') : '', rs.expected ? rs.doses + ' of ' + rs.expected + ' doses' : rs.doses ? h.plural(rs.doses, 'dose') + ' given' : ''].filter(Boolean).join(' · ');
    var state = !rs.active ? (rx.stopped ? 'Stopped' : 'Finished') + (rs.end ? ' ' + new Date(Math.min(rs.end, rx.stoppedAt || rs.end)).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '')
      : [rs.nextAt ? (rs.nextAt <= now ? '<strong class="due">Due now</strong>' : 'Next ' + h.fmtTime(rs.nextAt)) : '', rs.end ? 'until ' + new Date(rs.end).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''].filter(Boolean).join(' · ');
    return '<div class="row rxrow"><button class="rxrow__main" data-action="rx-edit" data-id="' + rx.id + '"><span class="row__icon">💊</span><div class="row__main"><div class="row__t">' + esc(rx.name) + (rx.strength ? ' <span class="faint">' + esc(rx.strength) + '</span>' : '') + '</div><div class="row__s">' + esc(line) + '</div>' + (state ? '<div class="row__s">' + state + '</div>' : '') + '</div></button>' +
      (rs.active ? '<button class="btn btn--sm btn--primary" data-action="rx-dose" data-id="' + rx.id + '">Give dose</button>' : '') + '</div>';
  }

  /* ---------- Vaccines ---------- */
  function plan(now) { var H = hl(), b = S.baby(); return H.vaccines.schedule ? G.vaccinePlan(H.vaccines.schedule, b.birth, H.vaccines.given, now) : []; }

  function vaxSummary(now) {
    var H = hl();
    if (!H.vaccines.schedule) return '<p class="muted">Pick a schedule to get a checklist with due dates from ' + name() + '’s birthday.</p><div class="btn-row" style="margin-top:8px"><button class="btn btn--sm" data-action="vax-schedule" data-s="ph">🇵🇭 Philippines</button><button class="btn btn--sm" data-action="vax-schedule" data-s="us">🇺🇸 United States</button></div>';
    var p = plan(now), given = p.filter(function (v) { return v.status === 'given'; }).length;
    var overdue = p.filter(function (v) { return v.status === 'overdue'; }), due = p.filter(function (v) { return v.status === 'due'; });
    var next = p.filter(function (v) { return v.status === 'upcoming'; })[0];
    var html = '<div class="vaxbar" role="img" aria-label="' + given + ' of ' + p.length + ' vaccines given"><i style="width:' + (p.length ? given / p.length * 100 : 0) + '%"></i></div><p class="small muted">' + given + ' of ' + p.length + ' given · ' + esc(G.VACCINES[H.vaccines.schedule].label) + '</p>';
    if (overdue.length) html += '<div class="note note--warn" style="margin-top:8px"><div class="note__t">' + h.plural(overdue.length, 'vaccine') + ' past the usual age</div><div>' + esc(overdue.slice(0, 4).map(function (v) { return v.name; }).join(', ')) + (overdue.length > 4 ? '…' : '') + '. Already done? Tick them off in the checklist. If not, ask your pediatrician about catching up.</div></div>';
    if (due.length) html += '<div class="note note--ok" style="margin-top:8px"><div class="note__t">Due ' + (due[0].due <= now ? 'now' : 'on ' + dateOnly(due[0].due)) + '</div><div>' + esc(due.map(function (v) { return v.name; }).join(', ')) + '</div></div>';
    else if (next) html += '<p class="small" style="margin-top:8px">Next: <strong>' + esc(next.name) + '</strong> around ' + esc(dateOnly(next.due)) + '.</p>';
    return html;
  }

  function vaxSheet() {
    h.openSheet({
      title: 'Vaccines',
      html: function () {
        var H = hl(), now = Date.now(), sch = H.vaccines.schedule;
        var html = '<div class="seg" role="radiogroup">' + [['ph', '🇵🇭 Philippines'], ['us', '🇺🇸 US (CDC)']].map(function (o) {
          return '<label><input type="radio" name="vaxsch" value="' + o[0] + '" data-action-change="vax-schedule"' + (sch === o[0] ? ' checked' : '') + ' /><span>' + o[1] + '</span></label>';
        }).join('') + '</div>';
        if (!sch) return html + '<p class="muted">Pick the schedule your pediatrician follows.</p>';
        if (sch === 'ph') html += '<p class="faint"><strong>NIP</strong> = free at health centers (DOH). <strong>PPS</strong> = extra vaccines the Philippine Pediatric Society recommends, usually given privately.</p>';
        html += '<p class="faint">Due dates count from the birthday. Your pediatrician may use different brands or timing — tap a vaccine to record the actual date.</p>';
        var groups = {}, order = [];
        plan(now).forEach(function (v) { var k = v.at; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(v); });
        order.forEach(function (k) {
          var list = groups[k], label = +k === 0 ? 'At birth' : +k < 120 ? Math.round(k / 7) + ' weeks' : Math.round(k / 30.4) + ' months';
          html += '<div class="vaxgroup"><div class="vaxgroup__h"><span>' + label + '</span><span class="faint">' + esc(dateOnly(list[0].due)) + '</span></div>' + list.map(function (v) {
            var pill = v.status === 'given' ? h.statusPill('ok', 'Given ' + new Date(v.given.date).toLocaleDateString([], { month: 'short', day: 'numeric' })) : v.status === 'overdue' ? h.statusPill('warn', 'Past due') : v.status === 'due' ? h.statusPill('info', 'Due soon') : '';
            return '<button class="row" data-action="vax-item" data-key="' + v.key + '"><span class="row__icon">' + (v.status === 'given' ? '✅' : '💉') + '</span><div class="row__main"><div class="row__t">' + esc(v.name) + (v.program ? ' <span class="tag">' + esc(v.program) + '</span>' : '') + '</div><div class="row__s">' + esc(v.note || '') + '</div></div>' + pill + '</button>';
          }).join('') + '</div>';
        });
        var custom = H.vaccines.custom;
        if (custom.length) html += '<div class="vaxgroup"><div class="vaxgroup__h"><span>Other vaccines</span></div>' + custom.map(function (c) {
          return '<button class="row" data-action="vax-custom" data-id="' + c.id + '"><span class="row__icon">✅</span><div class="row__main"><div class="row__t">' + esc(c.name) + '</div><div class="row__s">' + esc(dateOnly(c.date) + (c.note ? ' · ' + c.note : '')) + '</div></div></button>';
        }).join('') + '</div>';
        html += '<button class="btn btn--block" data-action="vax-custom">＋ Record another vaccine</button>';
        return html;
      }
    });
  }

  function vaxItemSheet(key) {
    var H = hl(), v = plan(Date.now()).filter(function (x) { return x.key === key; })[0];
    if (!v) return;
    var g = H.vaccines.given[key] || {};
    h.openSheet({
      title: v.name,
      html: function () {
        return '<form class="form" id="vax-form" data-key="' + esc(key) + '">' +
          '<p class="muted">Usual age: ' + (v.at === 0 ? 'at birth' : v.at < 120 ? Math.round(v.at / 7) + ' weeks' : Math.round(v.at / 30.4) + ' months') + ' · due around ' + esc(dateOnly(v.due)) + (v.note ? '. ' + esc(v.note) : '') + '</p>' +
          '<label class="field"><span class="field__label">Date given</span><input class="input" type="date" name="date" max="' + h.todayISO() + '" value="' + (g.date ? isoDate(g.date) : h.todayISO()) + '" required /></label>' +
          '<label class="field"><span class="field__label">Where / brand / lot (optional)</span><input class="input" name="note" maxlength="80" value="' + esc(g.note || '') + '" placeholder="e.g. Barangay health center" /></label>' +
          sticky((g.date ? '<button type="button" class="btn btn--danger" data-action="vax-unmark" data-key="' + esc(key) + '">Not given</button>' : '') + '<button type="submit" class="btn btn--primary btn--lg">' + (g.date ? 'Save' : 'Mark as given') + '</button>') + '</form>';
      }
    });
  }

  function vaxCustomSheet(id) {
    var H = hl(), c = id ? S.findIn(H.vaccines.custom, id) : null;
    h.openSheet({
      title: c ? 'Edit vaccine' : 'Record a vaccine',
      html: function () {
        return '<form class="form" id="vaxc-form"' + (c ? ' data-id="' + c.id + '"' : '') + '>' +
          '<label class="field"><span class="field__label">Vaccine</span><input class="input" name="name" required maxlength="60" value="' + esc(c ? c.name : '') + '" placeholder="e.g. Influenza (yearly)" autofocus /></label>' +
          '<label class="field"><span class="field__label">Date given</span><input class="input" type="date" name="date" max="' + h.todayISO() + '" value="' + (c ? isoDate(c.date) : h.todayISO()) + '" required /></label>' +
          '<label class="field"><span class="field__label">Notes (optional)</span><input class="input" name="note" maxlength="80" value="' + esc(c ? c.note || '' : '') + '" /></label>' +
          sticky((c ? '<button type="button" class="btn btn--danger" data-action="vaxc-delete" data-id="' + c.id + '">Delete</button>' : '') + '<button type="submit" class="btn btn--primary btn--lg">Save</button>') + '</form>';
      }
    });
  }

  /* ---------- Calendar ---------- */
  function monthStart(t) { var d = new Date(t); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); }

  function calendarMarks(from, to, now) {
    var H = hl(), marks = {};
    var add = function (t, kind, label) { var k = isoDate(t); (marks[k] = marks[k] || []).push({ kind: kind, label: label, t: t }); };
    H.appointments.forEach(function (a) { if (a.at >= from && a.at < to) add(a.at, 'visit', visitIcon(a.type) + ' ' + (a.title || 'Doctor’s visit') + ' · ' + h.fmtTime(a.at)); });
    plan(now).forEach(function (v) {
      if (v.status === 'given') { if (v.given.date >= from && v.given.date < to) add(v.given.date, 'vaxdone', '✅ ' + v.name + ' given'); }
      else if (v.due >= from && v.due < to) add(v.due, 'vax', '💉 ' + v.name + ' due');
    });
    H.vaccines.custom.forEach(function (c) { if (c.date >= from && c.date < to) add(c.date, 'vaxdone', '✅ ' + c.name + ' given'); });
    H.rx.forEach(function (rx) {
      var rs = S.rxStatus(rx, now), end = rs.end || (rx.stopped ? rx.stoppedAt : Math.max(now, rx.start + DAY));
      for (var t = Math.max(S.startOfDay(rx.start), from); t < Math.min(end, to); t = S.startOfDay(t + 26 * HOUR)) add(t, 'rx', '💊 ' + rx.name);
    });
    return marks;
  }

  function calendar(now) {
    var m0 = App.ui.calMonth || monthStart(now);
    var first = new Date(m0), y = first.getFullYear(), mo = first.getMonth();
    var next = new Date(y, mo + 1, 1).getTime(), days = Math.round((next - m0) / DAY);
    var marks = calendarMarks(m0, next, now), today = isoDate(now), sel = App.ui.calDay || today;
    var head = '<div class="cal__nav"><button class="iconbtn" data-action="cal-move" data-d="-1" aria-label="Previous month">‹</button><strong>' + first.toLocaleDateString([], { month: 'long', year: 'numeric' }) + '</strong><button class="iconbtn" data-action="cal-move" data-d="1" aria-label="Next month">›</button></div>';
    var wk = []; for (var i = 0; i < 7; i++) wk.push('<span>' + new Date(2026, 1, 1 + i).toLocaleDateString([], { weekday: 'narrow' }) + '</span>'); // Feb 1 2026 is a Sunday
    var cells = '';
    for (var b = 0; b < first.getDay(); b++) cells += '<span class="cal__pad"></span>';
    for (var d = 1; d <= days; d++) {
      var key = isoDate(new Date(y, mo, d, 12).getTime()), mk = marks[key] || [];
      var kinds = {}; mk.forEach(function (x) { kinds[x.kind] = 1; });
      cells += '<button class="cal__day' + (key === today ? ' cal__day--today' : '') + (key === sel ? ' cal__day--sel' : '') + '" data-action="cal-day" data-day="' + key + '" aria-label="' + esc(new Date(y, mo, d).toLocaleDateString([], { month: 'long', day: 'numeric' }) + (mk.length ? ': ' + mk.map(function (x) { return x.label; }).join(', ') : '')) + '">' + d +
        '<span class="cal__dots">' + ['visit', 'vax', 'vaxdone', 'rx'].filter(function (k) { return kinds[k]; }).map(function (k) { return '<i class="cal__dot cal__dot--' + k + '"></i>'; }).join('') + '</span></button>';
    }
    var selMarks = (calendarMarks(fromIsoDate(sel) - 12 * HOUR, fromIsoDate(sel) + 12 * HOUR, now)[sel]) || [];
    var list = '<div class="cal__list"><div class="cal__list-h">' + esc(dateOnly(fromIsoDate(sel))) + '</div>' + (selMarks.length ? selMarks.map(function (x) { return '<div class="small">' + esc(x.label) + '</div>'; }).join('') : '<div class="small faint">Nothing scheduled.</div>') +
      '<button class="btn btn--sm" data-action="appt-edit" data-day="' + sel + '" style="margin-top:6px">＋ Visit on this day</button></div>';
    return head + '<div class="cal__wk" aria-hidden="true">' + wk.join('') + '</div><div class="cal__grid">' + cells + '</div>' +
      '<div class="legend" style="margin-top:8px"><span><i class="cal__dot cal__dot--visit"></i>Visit</span><span><i class="cal__dot cal__dot--vax"></i>Vaccine due</span><span><i class="cal__dot cal__dot--vaxdone"></i>Vaccine given</span><span><i class="cal__dot cal__dot--rx"></i>Medicine</span></div>' + list;
  }

  /* ---------- Appointments ---------- */
  function apptSheet(id, day) {
    var a = id ? S.findIn(hl().appointments, id) : null;
    var at = a ? a.at : day ? fromIsoDate(day) - 12 * HOUR + 9 * HOUR : (function () { var d = new Date(Date.now() + DAY); d.setHours(9, 0, 0, 0); return d.getTime(); })();
    h.openSheet({
      title: a ? 'Visit' : 'New visit',
      html: function () {
        var past = a && a.at < Date.now();
        return '<form class="form" id="appt-form"' + (a ? ' data-id="' + a.id + '"' : '') + '>' +
          '<div class="seg seg--wrap" role="radiogroup">' + VISIT_TYPES.map(function (o) { return '<label><input type="radio" name="type" value="' + o[0] + '"' + ((a ? a.type : 'checkup') === o[0] ? ' checked' : '') + ' /><span>' + o[1] + '</span></label>'; }).join('') + '</div>' +
          '<label class="field"><span class="field__label">When</span><input class="input" type="datetime-local" name="at" value="' + h.toLocalInput(at) + '" required /></label>' +
          '<label class="field"><span class="field__label">What for (optional)</span><input class="input" name="title" maxlength="60" value="' + esc(a ? a.title || '' : '') + '" placeholder="e.g. 2-month check-up and shots" /></label>' +
          '<div class="field__row"><label class="field"><span class="field__label">Doctor</span><input class="input" name="doctor" maxlength="50" value="' + esc(a ? a.doctor || '' : hl().profile.doctor || '') + '" /></label>' +
          '<label class="field"><span class="field__label">Clinic / place</span><input class="input" name="place" maxlength="60" value="' + esc(a ? a.place || '' : hl().profile.clinic || '') + '" /></label></div>' +
          '<label class="field"><span class="field__label">Questions to ask</span><textarea class="input" name="questions" maxlength="600" placeholder="e.g. Is the rash normal? When can she start solids?">' + esc(a ? a.questions || '' : '') + '</textarea></label>' +
          (a ? '<label class="field"><span class="field__label">What the doctor said</span><textarea class="input" name="outcome" maxlength="800" placeholder="Advice, diagnosis, next steps">' + esc(a.outcome || '') + '</textarea></label>' +
            '<label class="check-line"><input type="checkbox" name="done"' + (a.done || past ? ' checked' : '') + ' /> Visit done</label>' +
            '<div class="btn-row"><button type="button" class="btn btn--sm" data-action="log" data-type="growth">📏 Log measurements</button><button type="button" class="btn btn--sm" data-action="vax-open">💉 Vaccines given</button><button type="button" class="btn btn--sm" data-action="appt-next" data-id="' + a.id + '">🗓️ Book next visit</button></div>' : '') +
          sticky((a ? '<button type="button" class="btn btn--danger" data-action="appt-delete" data-id="' + a.id + '">Delete</button>' : '') + '<button type="submit" class="btn btn--primary btn--lg">Save</button>') + '</form>';
      }
    });
  }

  /* ---------- Prescriptions ---------- */
  function rxFields(m, i) {
    var p = i == null ? '' : i + ':';
    var start = m.start || Date.now();
    return '<label class="field"><span class="field__label">Medicine</span><input class="input" name="' + p + 'name" maxlength="60" value="' + esc(m.name || '') + '" placeholder="e.g. Amoxicillin" /></label>' +
      '<div class="field__row"><label class="field"><span class="field__label">Strength</span><input class="input" name="' + p + 'strength" maxlength="30" value="' + esc(m.strength || '') + '" placeholder="250mg/5ml" /></label>' +
      '<label class="field"><span class="field__label">Dose</span><input class="input" name="' + p + 'dose" maxlength="30" value="' + esc(m.dose || '') + '" placeholder="2.5 ml" /></label></div>' +
      '<div class="field__row"><label class="field"><span class="field__label">Every (hours)</span><input class="input" type="number" inputmode="decimal" min="0" max="72" step="0.5" name="' + p + 'intervalH" value="' + (m.intervalH || '') + '" placeholder="8" /></label>' +
      '<label class="field"><span class="field__label">For (days)</span><input class="input" type="number" inputmode="numeric" min="0" max="365" name="' + p + 'durationDays" value="' + (m.durationDays || '') + '" placeholder="7" /></label></div>' +
      '<label class="check-line"><input type="checkbox" name="' + p + 'prn"' + (m.prn ? ' checked' : '') + ' /> Only as needed (e.g. for fever)</label>' +
      '<label class="field"><span class="field__label">Instructions</span><input class="input" name="' + p + 'instructions" maxlength="160" value="' + esc(m.instructions || '') + '" placeholder="e.g. after feeds, shake well" /></label>' +
      '<label class="field"><span class="field__label">First dose</span><input class="input" type="datetime-local" name="' + p + 'start" value="' + h.toLocalInput(start) + '" /></label>' +
      '<label class="check-line"><input type="checkbox" name="' + p + 'remind"' + (m.remind !== false && !m.prn ? ' checked' : '') + ' /> Remind me for each dose</label>';
  }
  function readRx(form, i) {
    var p = i == null ? '' : i + ':';
    var d = {
      name: val(form, p + 'name'), strength: val(form, p + 'strength'), dose: val(form, p + 'dose'),
      intervalH: num(form, p + 'intervalH') || 0, durationDays: num(form, p + 'durationDays') || 0,
      prn: !!(form.elements[p + 'prn'] && form.elements[p + 'prn'].checked), instructions: val(form, p + 'instructions'),
      start: h.fromLocalInput(val(form, p + 'start')) || Date.now(), remind: !!(form.elements[p + 'remind'] && form.elements[p + 'remind'].checked)
    };
    d.timesPerDay = d.intervalH ? Math.max(1, Math.round(24 / d.intervalH)) : 0;
    if (d.prn) d.remind = false;
    return d;
  }

  function rxSheet(id) {
    var rx = id ? S.findIn(hl().rx, id) : null;
    h.openSheet({
      title: rx ? rx.name : 'Add a medicine',
      html: function () {
        var cur = rx ? S.findIn(hl().rx, rx.id) : null, rs = cur ? S.rxStatus(cur) : null;
        return '<form class="form" id="rx-form"' + (cur ? ' data-id="' + cur.id + '"' : '') + '>' +
          (cur && cur.photoId ? '<div class="photo-wrap">' + photo(cur.photoId, 'photo') + '</div>' : '') +
          (rs ? '<p class="muted">' + (rs.active ? 'Active' : cur.stopped ? 'Stopped' : 'Finished') + ' · ' + h.plural(rs.doses, 'dose') + ' given' + (rs.expected ? ' of ' + rs.expected : '') + (rs.lastDose ? ' · last ' + h.ago(rs.lastDose.time) : '') + '</p>' : '') +
          rxFields(cur || {}) +
          '<label class="field"><span class="field__label">Prescribed by (optional)</span><input class="input" name="prescriber" maxlength="60" value="' + esc(cur ? cur.prescriber || '' : hl().profile.doctor || '') + '" /></label>' +
          (cur && rs.active ? '<button type="button" class="btn btn--block" data-action="rx-stop" data-id="' + cur.id + '">⏹ Stop this medicine now</button>' : '') +
          sticky((cur ? '<button type="button" class="btn btn--danger" data-action="rx-delete" data-id="' + cur.id + '">Delete</button>' : '') + '<button type="submit" class="btn btn--primary btn--lg">Save</button>') + '</form>';
      }
    });
  }

  /* ---------- Scanning a prescription ----------
     Photo -> stored on the phone -> cleaned up (grayscale,
     contrast, enlarged) -> text read on the phone with the free
     Tesseract OCR engine -> draft entries the parent checks and
     edits -> saved. Nothing is saved without that confirmation,
     and nothing leaves the phone. */
  var scan = null; // { photoId, text, meds, status, progress, error, via }

  function pickPhoto(capture, cb) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    if (capture) inp.setAttribute('capture', 'environment');
    inp.addEventListener('change', function () { if (inp.files && inp.files[0]) cb(inp.files[0]); });
    inp.click();
  }

  function startScan() {
    h.openSheet({
      title: 'Scan a prescription',
      html: '<p class="muted">Take a clear photo of the prescription in good light, flat on a table. You’ll check everything before it’s saved.</p>' +
        '<button class="btn btn--primary btn--lg btn--block" data-action="rx-photo" data-capture="1">📷 Take a photo</button>' +
        '<button class="btn btn--block" data-action="rx-photo">🖼️ Choose from gallery</button>' +
        '<p class="faint">Free and private: the photo stays on this phone and the text is read on the phone itself. Printed prescriptions read best; for handwriting you may need to type some lines.</p>'
    });
  }

  function gotPhoto(file) {
    scan = { status: 'saving', meds: [], text: '' };
    showScan();
    Files.compress(file).then(function (blob) {
      scan.blob = blob;
      scan.photoId = 'ph_' + S.uid();
      return Files.put(scan.photoId, blob);
    }).then(function () {
      scan.status = 'ready'; h.renderSheet(); Files.hydrate();
      readOnDevice(1);
    }).catch(function (e) { scan.status = 'error'; scan.error = e.message; h.renderSheet(); });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('Couldn’t load the text reader — are you online?')); };
      document.head.appendChild(s);
    });
  }

  // Prepare the photo for OCR: grayscale, stretch the contrast, and make
  // small print bigger. Pass 2 also turns it pure black-and-white, which
  // helps with faint ink, shadows and coloured paper.
  function enhance(blob, pass) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob), img = new Image();
      img.onload = function () {
        var long = Math.max(img.naturalWidth, img.naturalHeight), scale = Math.max(1, Math.min(2.5, 2200 / long));
        var c = document.createElement('canvas'), w = c.width = Math.round(img.naturalWidth * scale), hgt = c.height = Math.round(img.naturalHeight * scale);
        var ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, hgt);
        URL.revokeObjectURL(url);
        var data = ctx.getImageData(0, 0, w, hgt), px = data.data, n = px.length / 4, hist = new Uint32Array(256), i, g;
        for (i = 0; i < px.length; i += 4) { g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0; px[i] = g; hist[g]++; }
        // Contrast stretch between the 2nd and 98th percentiles.
        var lo = 0, hi = 255, acc = 0;
        for (i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.02) { lo = i; break; } }
        for (acc = 0, i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.02) { hi = i; break; } }
        var range = Math.max(1, hi - lo);
        // Otsu threshold for the black-and-white pass.
        var thr = 128;
        if (pass === 2) {
          var sum = 0, sumB = 0, wB = 0, best = 0;
          for (i = 0; i < 256; i++) sum += i * hist[i];
          for (i = 0; i < 256; i++) {
            wB += hist[i]; if (!wB) continue;
            var wF = n - wB; if (!wF) break;
            sumB += i * hist[i];
            var mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) * (mB - mF);
            if (between > best) { best = between; thr = i; }
          }
        }
        for (i = 0; i < px.length; i += 4) {
          g = pass === 2 ? (px[i] > thr ? 255 : 0) : Math.max(0, Math.min(255, ((px[i] - lo) * 255 / range) | 0));
          px[i] = px[i + 1] = px[i + 2] = g;
        }
        ctx.putImageData(data, 0, 0);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('Couldn’t prepare the photo.')); }, 'image/png');
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Couldn’t open the photo.')); };
      img.src = url;
    });
  }

  function readOnDevice(pass) {
    pass = pass || 1;
    scan.status = 'reading'; scan.pass = pass; scan.progress = 0; scan.error = ''; scan.empty = false; h.renderSheet();
    var ready = window.Tesseract ? Promise.resolve() : loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js');
    var img, worker;
    ready.then(function () { return enhance(scan.blob, pass); }).then(function (i) {
      img = i;
      return window.Tesseract.createWorker('eng', 1, {
        logger: function (m) { if (m.status === 'recognizing text') { scan.progress = Math.round(m.progress * 100); var el = document.getElementById('scan-progress'); if (el) el.textContent = scan.progress + '%'; } }
      });
    }).then(function (w) {
      worker = w;
      // Pass 2 reads the page as one block of text, which suits short prescriptions.
      return pass === 2 ? worker.setParameters({ tessedit_pageseg_mode: '6' }) : null;
    }).then(function () { return worker.recognize(img); }).then(function (res) {
      worker.terminate();
      scan.text = (res && res.data && res.data.text) || '';
      scan.meds = Rx.parse(scan.text); scan.empty = false;
      scan.status = 'review'; h.renderSheet(); Files.hydrate();
    }).catch(function (e) { if (worker) worker.terminate(); scan.status = 'review'; scan.error = e.message || String(e); h.renderSheet(); Files.hydrate(); });
  }

  function showScan() {
    h.openSheet({
      title: 'Check the prescription',
      kind: 'scan',
      html: function () {
        if (!scan) return '';
        var html = scan.photoId ? '<div class="photo-wrap">' + photo(scan.photoId, 'photo') + '</div>' : '';
        if (scan.status === 'saving' || scan.status === 'ready') return html + '<p class="muted">Saving the photo…</p>';
        if (scan.status === 'reading') return html + '<div class="note"><div class="note__t">Reading the text' + (scan.pass === 2 ? ' (second try)' : '') + '… <span id="scan-progress">' + (scan.progress || 0) + '%</span></div><div>The first scan downloads the free reader (about 5 MB), then it works faster.</div></div>';
        if (scan.status === 'error') return html + h.note('urgent', 'That didn’t work', scan.error || '');
        if (scan.error) html += h.note('warn', 'Couldn’t read it automatically', scan.error);
        if (!scan.meds.length) { scan.meds = [{}]; scan.empty = true; }
        if (scan.empty) {
          html += h.note('info', 'No medicines found', 'Handwriting is hard to read automatically. Type them in below — the photo is attached either way.');
        } else {
          html += h.note('warn', 'Check every line against the paper', 'Found ' + h.plural(scan.meds.length, 'medicine') + '. Fix anything that’s wrong before saving — you know best.');
        }
        html += '<form class="form" id="scan-form">';
        scan.meds.forEach(function (m, i) {
          html += '<fieldset class="card card--flat scanmed"><label class="check-line"><input type="checkbox" name="' + i + ':include" checked /> <span><strong>' + esc(m.name || 'Medicine ' + (i + 1)) + '</strong>' + (Rx.describe(m) ? '<br><span class="faint">' + esc(Rx.describe(m)) + '</span>' : '') + '</span></label>' + rxFields(m, i) + '</fieldset>';
        });
        html += '<button type="button" class="btn btn--block" data-action="scan-add">＋ Add another medicine</button>' +
          '<label class="field"><span class="field__label">Prescribed by (optional)</span><input class="input" name="prescriber" maxlength="60" value="' + esc(scan.doctor || hl().profile.doctor || '') + '" /></label>';
        if (scan.text) html += '<details class="more"><summary>What was read from the photo</summary><pre class="scantext">' + esc(scan.text) + '</pre></details>';
        if (scan.pass !== 2) html += '<button type="button" class="btn btn--block" data-action="scan-retry">🔁 Missed something? Try reading it another way</button>';
        html += '<p class="faint">Tip: lay the paper flat in bright, even light and fill the frame. Handwriting is hard for any free reader — type in what it couldn’t read.</p>';
        html += sticky('<button type="button" class="btn" data-action="scan-cancel">Cancel</button><button type="submit" class="btn btn--primary btn--lg">Save to records</button>') + '</form>';
        return html;
      },
      onclose: function () { if (scan && scan.status !== 'saved' && scan.photoId && !scan.keepPhoto) Files.remove(scan.photoId).catch(function () {}); scan = null; }
    });
  }

  // Copy what's typed in the review form back into the draft (so adding a row keeps edits).
  function syncScanForm() {
    var form = document.getElementById('scan-form');
    if (!form || !scan) return;
    scan.meds = scan.meds.map(function (m, i) { var d = readRx(form, i); d.include = form.elements[i + ':include'].checked; return d; });
    scan.doctor = val(form, 'prescriber');
  }

  /* ---------- Health profile & documents ---------- */
  var BLOOD = ['', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−', 'Unknown'];
  function profileSheet() {
    var P = hl().profile;
    h.openSheet({
      title: 'Health profile',
      html: function () {
        return '<form class="form" id="profile-form">' +
          '<div class="field__row"><label class="field"><span class="field__label">Blood type</span><select class="input" name="blood">' + BLOOD.map(function (b) { return '<option value="' + b + '"' + (P.blood === b ? ' selected' : '') + '>' + (b || '—') + '</option>'; }).join('') + '</select></label>' +
          '<label class="field"><span class="field__label">Birth weight</span><input class="input" readonly value="' + esc(S.baby().birthWeightKg ? h.weight(S.baby().birthWeightKg) : 'Add in Settings') + '" /></label></div>' +
          '<label class="field"><span class="field__label">Allergies</span><input class="input" name="allergies" maxlength="120" value="' + esc(P.allergies || '') + '" placeholder="Medicines, foods — or “none known”" /></label>' +
          '<label class="field"><span class="field__label">Conditions</span><input class="input" name="conditions" maxlength="160" value="' + esc(P.conditions || '') + '" placeholder="e.g. reflux, eczema, born at 35 weeks" /></label>' +
          '<div class="field__row"><label class="field"><span class="field__label">Pediatrician</span><input class="input" name="doctor" maxlength="60" value="' + esc(P.doctor || '') + '" /></label>' +
          '<label class="field"><span class="field__label">Clinic / hospital</span><input class="input" name="clinic" maxlength="60" value="' + esc(P.clinic || '') + '" /></label></div>' +
          '<label class="field"><span class="field__label">Doctor’s phone</span><input class="input" type="tel" name="phone" maxlength="30" value="' + esc(P.phone || '') + '" /></label>' +
          '<label class="field"><span class="field__label">Health insurance / PhilHealth no. (optional)</span><input class="input" name="insurance" maxlength="40" value="' + esc(P.insurance || '') + '" /></label>' +
          '<label class="field"><span class="field__label">Other notes</span><textarea class="input" name="notes" maxlength="400">' + esc(P.notes || '') + '</textarea></label>' +
          sticky('<button type="submit" class="btn btn--primary btn--lg">Save</button>') + '</form>';
      }
    });
  }

  function docSheet(id) {
    var d = id ? S.findIn(hl().docs, id) : null;
    var draft = { photoId: d ? d.photoId : null };
    h.openSheet({
      title: d ? (d.title || 'Document') : 'Add a document',
      html: function () {
        return '<form class="form" id="doc-form"' + (d ? ' data-id="' + d.id + '"' : '') + '>' +
          (draft.photoId ? '<div class="photo-wrap">' + photo(draft.photoId, 'photo') + '</div>' : '') +
          '<div class="btn-row"><button type="button" class="btn btn--sm" data-action="doc-photo" data-capture="1">📷 ' + (draft.photoId ? 'Retake' : 'Take photo') + '</button><button type="button" class="btn btn--sm" data-action="doc-photo">🖼️ ' + (draft.photoId ? 'Replace' : 'From gallery') + '</button></div>' +
          '<input type="hidden" name="photoId" value="' + esc(draft.photoId || '') + '" />' +
          '<label class="field"><span class="field__label">Title</span><input class="input" name="title" maxlength="60" required value="' + esc(d ? d.title : '') + '" placeholder="e.g. CBC result, vaccine card" /></label>' +
          '<label class="field"><span class="field__label">Date</span><input class="input" type="date" name="date" value="' + (d ? isoDate(d.date) : h.todayISO()) + '" /></label>' +
          '<label class="field"><span class="field__label">Notes</span><textarea class="input" name="notes" maxlength="400">' + esc(d ? d.notes || '' : '') + '</textarea></label>' +
          sticky((d ? '<button type="button" class="btn btn--danger" data-action="doc-delete" data-id="' + d.id + '">Delete</button>' : '') + '<button type="submit" class="btn btn--primary btn--lg">Save</button>') + '</form>';
      }
    });
    return draft;
  }

  function photoViewer(id) {
    h.openSheet({ title: 'Photo', html: '<div class="photo-full"><img data-photo="' + esc(id) + '" alt="Saved photo" /></div><p class="faint">Pinch to zoom.</p>' });
  }

  /* ---------- Summaries to share ---------- */
  function emergencyText() {
    var b = S.baby(), H = hl(), P = H.profile, now = Date.now();
    var meds = H.rx.filter(function (rx) { return S.rxStatus(rx, now).active; });
    var lw = S.last('growth', function (e) { return e.data.weightKg; });
    var lines = ['EMERGENCY INFO — ' + b.name, 'Born ' + dateOnly(new Date(b.birth + 'T12:00').getTime()) + ' (' + G.ageLabel(S.ageDays(now)) + ')'];
    if (lw) lines.push('Weight: ' + h.weight(lw.data.weightKg) + ' (' + dateOnly(lw.time) + ')');
    lines.push('Blood type: ' + (P.blood || 'not recorded'));
    lines.push('Allergies: ' + (P.allergies || 'none recorded'));
    if (P.conditions) lines.push('Conditions: ' + P.conditions);
    lines.push('Current medicines: ' + (meds.length ? meds.map(function (rx) { return rx.name + (rx.dose ? ' ' + rx.dose : '') + (rx.intervalH ? ' every ' + rx.intervalH + 'h' : '') + (rx.prn ? ' as needed' : ''); }).join('; ') : 'none'));
    if (P.doctor || P.phone) lines.push('Pediatrician: ' + [P.doctor, P.clinic, P.phone].filter(Boolean).join(' · '));
    if (P.insurance) lines.push('Insurance / PhilHealth: ' + P.insurance);
    if (P.notes) lines.push('Notes: ' + P.notes);
    lines.push('— from Baby Log');
    return lines.join('\n');
  }

  function visitSummaryText() {
    var b = S.baby(), H = hl(), now = Date.now(), days = S.ageDays(now);
    var stats = window.BabyViews.dayStats(8, now).filter(function (d) { return d.start < S.startOfDay(now) && d.hasData; });
    var avg = function (f) { return stats.length ? Math.round(stats.reduce(function (a, d) { return a + f(d); }, 0) / stats.length * 10) / 10 : null; };
    var lines = [b.name + ' — ' + G.ageLabel(days) + ' (born ' + b.birth + ')', 'Summary for the doctor · ' + dateOnly(now), ''];
    if (stats.length) {
      lines.push('Daily averages over the last ' + h.plural(stats.length, 'day') + ':');
      lines.push('• Feeds: ' + avg(function (d) { return d.feeds; }) + ' a day' + (avg(function (d) { return d.bottleMl; }) ? ' · bottles ' + h.vol(avg(function (d) { return d.bottleMl; })) + ' a day' : ''));
      lines.push('• Wet diapers: ' + avg(function (d) { return d.wet; }) + ' · dirty: ' + avg(function (d) { return d.dirty; }));
      lines.push('• Sleep: ' + avg(function (d) { return d.sleepMs / HOUR; }) + ' hours');
    }
    var g = S.events({ type: 'growth' }).filter(function (e) { return e.data.weightKg; });
    if (g.length) {
      var lw = g[g.length - 1];
      lines.push('• Weight: ' + h.weight(lw.data.weightKg) + ' on ' + dateOnly(lw.time) + (b.birthWeightKg ? ' (birth ' + h.weight(b.birthWeightKg) + ')' : ''));
    }
    var fevers = S.events({ type: 'temp', from: now - 14 * DAY }).filter(function (e) { return e.data.tempC >= 38; });
    if (fevers.length) lines.push('• Fevers (14 days): ' + fevers.map(function (e) { return h.temp(e.data.tempC) + ' ' + dateOnly(e.time); }).join(', '));
    var flagged = S.events({ type: 'diaper', from: now - 14 * DAY }).filter(function (e) { return h.describe(e).flag; });
    if (flagged.length) lines.push('• Diapers worth mentioning: ' + flagged.map(function (e) { return h.describe(e).sub + ' (' + dateOnly(e.time) + ')'; }).join('; '));
    var meds = S.events({ type: 'med', from: now - 14 * DAY });
    if (meds.length) {
      var byName = {}; meds.forEach(function (e) { byName[e.data.name] = (byName[e.data.name] || 0) + 1; });
      lines.push('• Medicines given (14 days): ' + Object.keys(byName).map(function (k) { return k + ' ×' + byName[k]; }).join(', '));
    }
    var vp = plan(now);
    if (vp.length) {
      var due = vp.filter(function (v) { return v.status === 'due' || v.status === 'overdue'; });
      lines.push('• Vaccines: ' + vp.filter(function (v) { return v.status === 'given'; }).length + ' of ' + vp.length + ' recorded' + (due.length ? '; due: ' + due.map(function (v) { return v.name; }).join(', ') : ''));
    }
    if (H.profile.allergies) lines.push('• Allergies: ' + H.profile.allergies);
    var notes = S.events({ type: 'note', from: now - 14 * DAY });
    if (notes.length) { lines.push('', 'Notes:'); notes.forEach(function (e) { lines.push('• ' + e.data.text); }); }
    var next = H.appointments.filter(function (a) { return !a.done && a.at > now - 3 * HOUR; }).sort(function (x, y) { return x.at - y.at; })[0];
    if (next && next.questions) { lines.push('', 'Questions:'); next.questions.split(/\n+/).forEach(function (q) { if (q.trim()) lines.push('• ' + q.trim()); }); }
    lines.push('', '— from Baby Log');
    return lines.join('\n');
  }

  window.BabyHealth = {
    view: view, vaxSheet: vaxSheet, vaxItemSheet: vaxItemSheet, vaxCustomSheet: vaxCustomSheet,
    apptSheet: apptSheet, rxSheet: rxSheet, readRx: readRx, startScan: startScan, pickPhoto: pickPhoto, gotPhoto: gotPhoto,
    readOnDevice: readOnDevice, syncScanForm: syncScanForm, scan: function () { return scan; }, setScanSaved: function () { if (scan) scan.status = 'saved'; },
    profileSheet: profileSheet, docSheet: docSheet, photoViewer: photoViewer,
    emergencyText: emergencyText, visitSummaryText: visitSummaryText, monthStart: monthStart, isoDate: isoDate, fromIsoDate: fromIsoDate, plan: plan
  };
})();
