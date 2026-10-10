/* =========================================================
   Kalinga — rximport.js
   Turns the text of an e-prescription (one string per row, as
   pdf.js gives it) into DRAFT medicines for the caregiver to
   check. No DOM, no PDF code: kalinga/js/rxpdf.js does the
   reading, care.js shows the review screen.

   Rules:
   - It copies what the doctor wrote. Anything it can't read
     with certainty comes back ok:false (never a guess), and
     insulin is always set up by hand (fixed or sliding scale).
   - Clock times come from the elder's routine (breakfast,
     lunch, dinner, bedtime), because "3 times daily" has none.
   - Nothing is saved here; the caregiver confirms every line.

   Built against the Maxicare e-prescription layout:
     <name> [(<brand>)]
     <strength> | "."
     <qty> Take <n> <unit> <how often> [timing] [food] for <n> days | as needed
   ========================================================= */
(function (root) {
  'use strict';

  var DAY = 86400000;
  var MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  var SIG_RE = /^(\d+)\s+((?:take|use|apply|inhale|instill|inject|insert)\b.*)$/i;
  var VERB_RE = /^(take|use|apply|inhale|instill|inject|insert)\b/i;
  var STRENGTH_RE = /^(\.|[\d.,]+\s*(mg|mcg|µg|g|ml|iu|units?|%)\b.*)$/i;
  var STOP_RE = /^(certified by|doctor name|signature|prc no)/i;
  var ROUTINE = { breakfast: '07:00', lunch: '12:00', dinner: '19:00', bedtime: '21:00' };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function day(isoStr) { var p = isoStr.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getTime(); }

  /* ---------- Names ---------- */
  function cleanName(raw, strength) {
    var s = String(raw || '').replace(/\s*\b(tablets?|tabs?|capsules?|caps?|suspension\d*|syrup|oral)\b\.?/gi, ' ')
      .replace(/\s+\d+(\.\d+)?\s*ml\s*$/i, '').replace(/\s+/g, ' ').trim();
    var brand = null, m = /\s*\(([^)]+)\)\s*$/.exec(s);
    if (m) { brand = m[1].trim(); s = s.slice(0, m.index).trim(); }
    if (strength && !/\d/.test(s)) s += ' ' + strength;
    var name = s + (brand ? ' (' + brand + ')' : '');
    if (name.length > 60) name = name.slice(0, 57).replace(/\s+\S*$/, '') + '…';
    return { name: name, brand: brand };
  }

  /* ---------- Directions ---------- */
  var WORD_NUM = { one: 1, two: 2, three: 3, half: 0.5, '½': 0.5 };
  function num(x) {
    if (x == null) return null;
    x = String(x).toLowerCase();
    if (WORD_NUM[x] != null) return WORD_NUM[x];
    var f = /^(\d+)\s*\/\s*(\d+)$/.exec(x);
    if (f) return +f[1] / +f[2];
    var n = parseFloat(x);
    return isFinite(n) ? n : null;
  }
  function unitOf(word) {
    var w = String(word || '').toLowerCase();
    if (/^tab/.test(w)) return 'tablet';
    if (/^cap/.test(w)) return 'capsule';
    if (/^(suspension|syrup|solution|ml)/.test(w)) return 'ml';
    if (/^puff/.test(w)) return 'puff';
    if (/^drop/.test(w)) return 'drop';
    if (/^unit/.test(w)) return 'units';
    if (/^patch/.test(w)) return 'patch';
    if (/^(application|applicat)/.test(w)) return 'application';
    return 'dose';
  }
  var FORM = { tablet: 'tablet', capsule: 'capsule', ml: 'liquid', puff: 'inhaler', drop: 'drops', units: 'insulin-pen', patch: 'patch', application: 'cream', dose: 'other' };

  function readSig(sig, rawName) {
    var s = ' ' + sig.toLowerCase().replace(/\s+/g, ' ') + ' ', out = {};
    var m = /\b(take|use|apply|inhale|instill|inject|insert)\s+(\d+\s*\/\s*\d+|\d+(?:\.\d+)?|½|one|two|three|half)\s*([a-z]+)?/.exec(s);
    out.amount = m ? num(m[2]) : null;
    out.unit = m ? unitOf(m[3]) : (/\bapply\b/.test(s) ? 'application' : 'dose');
    // "Take 1 Suspension" of a "10mL Suspension" = 10 ml
    if (m && /^(suspension|syrup|solution)/.test(m[3] || '')) {
      var ml = /(\d+(?:\.\d+)?)\s*ml\s*(suspension|syrup|solution)/i.exec(rawName || '');
      out.amount = ml ? out.amount * parseFloat(ml[1]) : out.amount;
      if (!ml) out.unit = 'dose';
    }
    var per = /\b(\d+)\s*(x|times)\s*(a\s*day|daily|per\s*day|a\s*day)\b/.exec(s);
    var every = /\bevery\s+(\d+)\s*(hours?|hrs?|h)\b/.exec(s);
    out.everyHours = every ? +every[1] : null;
    out.perDay = per ? +per[1] : /\bonce\b/.test(s) ? 1 : /\btwice\b/.test(s) ? 2 : /\bthrice\b/.test(s) ? 3 : every ? Math.floor(24 / +every[1]) : null;
    out.timing = /\b(bedtime|before sleep|before bed)\b/.test(s) ? 'bedtime' : /\b(night|evening|dinner|supper|pm)\b/.test(s) ? 'night' : /\b(noon|lunch)\b/.test(s) ? 'noon' : /\b(morning|breakfast|am)\b/.test(s) ? 'morning' : null;
    out.food = /\bafter\s+(meals?|eating|food|breakfast|lunch|dinner)\b/.test(s) ? 'after' : /\bbefore\s+(meals?|eating|food|breakfast|lunch|dinner)\b/.test(s) ? 'before' : /\bwith\s+(meals?|food)\b/.test(s) ? 'with' : 'any';
    var d = /\bfor\s+(\d+)\s*(days?|weeks?|months?)\b/.exec(s);
    out.days = d ? +d[1] * (/^week/.test(d[2]) ? 7 : /^month/.test(d[2]) ? 30 : 1) : null;
    out.prn = /\b(as needed|prn|when needed|if needed)\b/.test(s);
    return out;
  }

  /* ---------- parse(lines) -> { patient, date, items } ---------- */
  function parse(lines) {
    lines = (lines || []).map(function (l) { return String(l || '').replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    // The quantity cell can come as its own row ("270") just before the directions: join them.
    var joined = [];
    for (var q = 0; q < lines.length; q++) {
      if (/^\d+$/.test(lines[q]) && q + 1 < lines.length && VERB_RE.test(lines[q + 1])) { joined.push(lines[q] + ' ' + lines[q + 1]); q++; }
      else joined.push(lines[q]);
    }
    lines = joined;
    var out = { patient: null, date: null, items: [] }, i;
    lines.forEach(function (l) {
      var p = /^patient name\s*:\s*(.+?)(\s+contact no\s*:.*)?$/i.exec(l);
      if (p && !out.patient) out.patient = p[1].trim();
      var d = /date\/time\s*:\s*(\d{4})-([a-z]{3})-(\d{1,2})/i.exec(l);
      if (d && !out.date && MONTHS[d[2].toUpperCase()]) out.date = d[1] + '-' + pad(MONTHS[d[2].toUpperCase()]) + '-' + pad(+d[3]);
    });
    var start = 0;
    for (i = 0; i < lines.length; i++) if (/^rx$/i.test(lines[i])) { start = i + 1; break; }
    var buf = [];
    for (i = start; i < lines.length; i++) {
      var line = lines[i];
      if (STOP_RE.test(line)) break;
      var sig = SIG_RE.exec(line);
      if (!sig) { buf.push(line); continue; }
      // The name is the line just before the strength line (page-break noise sits before it).
      var si = -1;
      for (var j = buf.length - 1; j >= 0; j--) if (STRENGTH_RE.test(buf[j])) { si = j; break; }
      var rawName = si > 0 ? buf[si - 1] : si === 0 ? '' : buf[buf.length - 1];
      var strength = si >= 0 && buf[si] !== '.' ? buf[si].replace(/\s+/g, '') : '';
      buf = [];
      if (!rawName) continue;
      var nm = cleanName(rawName, strength), r = readSig(sig[2], rawName);
      var item = {
        name: nm.name, brand: nm.brand, strength: strength, qty: +sig[1], sig: sig[2],
        amount: r.amount, unit: r.unit, form: FORM[r.unit] || 'other', perDay: r.perDay, everyHours: r.everyHours,
        timing: r.timing, food: r.food, days: r.days, prn: r.prn
      };
      item.ok = item.amount != null && item.amount > 0 && (item.perDay || item.prn) && !(item.perDay > 6) &&
        item.unit !== 'units' && !/insulin/i.test(rawName);
      out.items.push(item);
    }
    return out;
  }

  /* ---------- draft(item, routine) -> what the review screen starts from ---------- */
  function minutes(hm) { var p = hm.split(':'); return +p[0] * 60 + +p[1]; }
  function hm(min) { min = ((min % 1440) + 1440) % 1440; return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function draft(item, routine) {
    var R = {}, k;
    for (k in ROUTINE) R[k] = routine && /^\d\d:\d\d$/.test(routine[k] || '') ? routine[k] : ROUTINE[k];
    // Each time is a meal plus an offset ("before breakfast" = breakfast - 30 min), so it
    // can follow the routine later (store.routineShift). times[i] goes with anchors[i].
    var slots = [];
    if (item.ok && !item.prn) {
      var before = item.food === 'before' ? -30 : 0;
      var at = function (meal, off) { slots.push({ t: hm(minutes(R[meal]) + off), a: { meal: meal, offset: off } }); };
      if (item.everyHours) {
        for (var off = 0; off < 1440; off += item.everyHours * 60) at('breakfast', off);
      } else if (item.perDay === 1) {
        if (item.timing === 'bedtime' || item.timing === 'night') at('bedtime', 0);
        else if (item.timing === 'noon') at('lunch', before);
        else at('breakfast', before);
      } else if (item.perDay === 2) { at('breakfast', before); at('dinner', before); }
      else if (item.perDay === 3) { at('breakfast', before); at('lunch', before); at('dinner', before); }
      else if (item.perDay === 4) { at('breakfast', before); at('lunch', before); at('dinner', before); at('bedtime', 0); }
      slots.sort(function (x, y) { return x.t < y.t ? -1 : x.t > y.t ? 1 : 0; });
      slots = slots.filter(function (x, i) { return !i || x.t !== slots[i - 1].t; });
    }
    var times = slots.map(function (x) { return x.t; }), anchors = slots.map(function (x) { return x.a; });
    return {
      name: item.name, purpose: purposeFor(item.name), form: item.form,
      dose: { amount: item.amount, unit: item.unit }, food: item.food, times: times, anchors: anchors, days: item.days,
      prn: item.prn ? { minGapMin: item.everyHours ? item.everyHours * 60 : 0, maxPerDay: item.perDay || 0 } : null,
      count: item.qty
    };
  }

  /* ---------- Purpose suggestions ----------
     General drug classes, shown as a suggestion the caregiver can change. */
  var PURPOSES = [
    [/metformin|gliclazide|glimepiride|glibenclamide|sitagliptin|vildagliptin|linagliptin|saxagliptin|dapagliflozin|empagliflozin|canagliflozin|pioglitazone|acarbose/i, 'para sa sugar', 'for blood sugar'],
    [/losartan|telmisartan|valsartan|irbesartan|candesartan|olmesartan|amlodipine|nifedipine|felodipine|metoprolol|carvedilol|bisoprolol|atenolol|hydrochlorothiazide|indapamide|enalapril|lisinopril|captopril|perindopril|ramipril/i, 'para sa altapresyon', 'for blood pressure'],
    [/atorvastatin|rosuvastatin|simvastatin|pravastatin|ezetimibe|fenofibrate/i, 'para sa kolesterol', 'for cholesterol'],
    [/gabapentin|pregabalin/i, 'para sa pamamanhid / kirot ng ugat', 'for nerve pain or numbness'],
    [/esomeprazole|omeprazole|pantoprazole|lansoprazole|rabeprazole|famotidine|alginate|antacid|aluminum hydroxide|magnesium hydroxide/i, 'para sa sikmura / asido', 'for the stomach (acid)'],
    [/s[yi]l[yi]marin|ursodeoxycholic|ursodiol/i, 'para sa atay', 'for the liver'],
    [/allopurinol|febuxostat|colchicine/i, 'para sa gout / uric acid', 'for gout / uric acid'],
    [/aspirin|clopidogrel|warfarin|apixaban|rivaroxaban/i, 'pampalabnaw ng dugo', 'blood thinner'],
    [/paracetamol|acetaminophen|celecoxib|etoricoxib|diclofenac|ibuprofen|naproxen|tramadol/i, 'para sa sakit / kirot', 'for pain'],
    [/levothyroxine|methimazole|propylthiouracil/i, 'para sa thyroid', 'for the thyroid'],
    [/salbutamol|budesonide|formoterol|fluticasone|tiotropium|montelukast/i, 'para sa paghinga', 'for breathing'],
    [/calcium|vitamin|multivit|ferrous|folic|zinc/i, 'bitamina / suplemento', 'vitamin / supplement']
  ];
  function purposeFor(name) {
    for (var i = 0; i < PURPOSES.length; i++) if (PURPOSES[i][0].test(name || '')) return { tl: PURPOSES[i][1], en: PURPOSES[i][2] };
    return null;
  }

  /* ---------- Course dates ---------- */
  function endDate(startIso, days) { return days ? iso(new Date(day(startIso)).setDate(new Date(day(startIso)).getDate() + days - 1)) : ''; }
  // A prescription from the last 30 days starts on its own date; otherwise (or with no date) today.
  function startDate(rxDate, now) {
    var today = iso(now || Date.now());
    if (!rxDate || rxDate > today) return today;
    return (day(today) - day(rxDate)) / DAY <= 30 ? rxDate : today;
  }

  var api = { parse: parse, draft: draft, purposeFor: purposeFor, endDate: endDate, startDate: startDate, ROUTINE: ROUTINE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KalingaRxImport = api;
})(this);
