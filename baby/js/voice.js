/* =========================================================
   Alaga — voice.js
   Turns what a parent said ("bottle 120 ml formula", "wet
   diaper 20 minutes ago", "tulog na si Ava") into a draft entry
   or a timer action. Pure: no DOM, no speech API — mic.js does
   the listening and asks the parent to confirm.

   parse(text, ctx) -> one of
     { kind: 'entry',  type, time, end, data, baby }
     { kind: 'action', action, side, baby }      timers
     { kind: 'form',   type, preset, baby }      medicine: always opens the form
     { kind: 'unknown', heard, suggest: [types] }

   ctx: { now, volume: 'ml'|'oz', temp: 'C'|'F', weight: 'kg'|'lb',
          babies: [{ id, name }], activeBaby, feeding, rx: [{ id, name }],
          timers: { sleep, breast: { side } | null, pump, tummy } }

   English plus common Tagalog / Taglish words. Never guesses a
   dose; anything unclear comes back 'unknown' with suggestions.
   ========================================================= */
(function (root) {
  'use strict';

  var MIN = 60000, HOUR = 60 * MIN, OZ = 29.5735, LB = 0.45359237;

  var NUMS = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    // Tagalog
    isa: 1, dalawa: 2, tatlo: 3, apat: 4, lima: 5, anim: 6, pito: 7, walo: 8, siyam: 9, sampu: 10, sampung: 10
  };

  // Spelled-out numbers -> digits ("one hundred twenty" -> "120", "two and a half" -> "2.5").
  function digits(s) {
    s = s.replace(/\b(\d+)\s*(?:and a half|and half|½)\b/g, function (m, n) { return (+n + 0.5) + ''; });
    s = s.replace(/\b(?:a half|half an?|kalahating)\s+(hour|oras)/g, '0.5 $1');
    s = s.replace(/\ban? (hour|oras)\b/g, '1 $1');
    s = s.replace(/\b(\d+(?:\.\d+)?) (hours?|oras) and (?:a )?half\b/g, function (m, n, u) { return (+n + 0.5) + ' ' + u; });
    var words = Object.keys(NUMS).join('|');
    var re = new RegExp('\\b((?:(?:' + words + '|hundred|and)\\s*)+)\\b', 'g');
    return s.replace(re, function (m) {
      var parts = m.trim().split(/\s+/), total = 0, cur = 0, any = false;
      parts.forEach(function (p) {
        if (p === 'and') return;
        if (p === 'hundred') { cur = (cur || 1) * 100; any = true; return; }
        if (NUMS[p] != null) { cur += NUMS[p]; any = true; }
      });
      total += cur;
      if (!any || (parts.length === 1 && parts[0] === 'and')) return m;
      return ' ' + total + ' ';
    }).replace(/\s+/g, ' ').trim();
  }

  function norm(text) {
    var s = String(text || '').toLowerCase()
      .replace(/[’']/g, '')
      .replace(/(\d),(\d{3})/g, '$1$2')
      .replace(/(\d),(\d)/g, '$1.$2')        // "37,5" -> 37.5
      .replace(/(\d) point (\d)/g, '$1.$2')
      .replace(/[.,!?;:]+(\s|$)/g, ' ')
      .replace(/\bmilliliters?|millilitres?|mls?\b|\bm\.l\b|\bcc\b/g, ' ml ')
      .replace(/\bounces?|\bonzas?\b/g, ' oz ')
      .replace(/(\d)(ml|oz|kg|lbs?|cm|min|mins|h|hrs?)\b/g, '$1 $2')
      .replace(/\s+/g, ' ').trim();
    s = digits(s);
    s = s.replace(/\b(\d+(?:\.\d+)?) point (\d+)\b/g, '$1.$2');
    return s;
  }

  function has(s, re) { return re.test(s); }
  function num(s, re) { var m = s.match(re); return m ? parseFloat(m[1]) : null; }

  /* ---------- When ---------- */
  // Pulls "20 minutes ago", "an hour ago", "at 2:30 pm", "kanina pang 3" out of the text.
  function when(s, now) {
    var t = now, m;
    if ((m = s.match(/\b(\d+(?:\.\d+)?) ?(minutes?|mins?|m|hours?|hrs?|h|oras|minuto) (ago|na ang nakalipas|nakaraan)\b/))) {
      t = now - parseFloat(m[1]) * (/^(h|hour|hours|hr|hrs|oras)$/.test(m[2]) ? HOUR : MIN);
      s = s.replace(m[0], ' ');
    } else if ((m = s.match(/\b(?:at|around|bandang|kaninang|nung) (\d{1,2})(?:[: ](\d{2}))? ?(am|pm|a m|p m|ng umaga|ng hapon|ng gabi)?\b/))) {
      var hh = +m[1], mm = m[2] ? +m[2] : 0, ap = (m[3] || '').replace(/ /g, '');
      if (hh <= 24 && mm < 60) {
        if (/pm|hapon|gabi/.test(ap) && hh < 12) hh += 12;
        if (/am|umaga/.test(ap) && hh === 12) hh = 0;
        var d = new Date(now); d.setHours(hh, mm, 0, 0);
        // No am/pm: the most recent time that fits.
        if (!ap && hh <= 12) { var alt = new Date(d.getTime() + 12 * HOUR); if (alt.getTime() <= now + 5 * MIN && alt.getTime() > d.getTime()) d = alt; }
        if (d.getTime() > now + 5 * MIN) d = new Date(d.getTime() - 24 * HOUR);
        t = d.getTime();
        s = s.replace(m[0], ' ');
      }
    }
    return { t: t, s: s.replace(/\s+/g, ' ').trim() };
  }

  // A duration like "15 minutes", "1.5 hours", "1 hour 20 minutes" (not "... ago").
  function duration(s) {
    var h = s.match(/\b(\d+(?:\.\d+)?) ?(?:hours?|hrs?|h|oras)\b/), m = s.match(/\b(\d+) ?(?:minutes?|mins?|minuto|m)\b/);
    var ms = (h ? parseFloat(h[1]) * HOUR : 0) + (m ? +m[1] * MIN : 0);
    return ms || null;
  }

  /* ---------- Words ---------- */
  var W = {
    asleep: /\b(fell asleep|is asleep|asleep|sleeping|start(?:ed|ing)? (?:the )?(?:sleep|nap)|nap(?:ping)? now|went down|going down for|down for a nap|tulog na|natulog|nakatulog|matutulog)\b/,
    awake: /\b(woke(?: up)?|awake|is up|wake up|gising na|nagising|gumising)\b/,
    slept: /\b(slept|napped|nap(?:ped)? for|sleep for|natulog ng)\b/,
    breast: /\b(breast(?:fe(?:e)?d(?:ing)?)?|nurs(?:e|ed|ing)|latch(?:ed)?|dumede|dede|nagdede|suso|pinasuso|left side|right side)\b/,
    bottle: /\b(bottle|bote|formula|gatas|breast ?milk|expressed|drank|ininom|uminom)\b/,
    pump: /\b(pump(?:ed|ing)?|nag ?pump)\b/,
    tummy: /\b(tummy time|tummy|dapa|nakadapa)\b/,
    diaper: /\b(diaper|nappy|lampin|pampers|wet|pee+d?|peeing|wee|ihi|umihi|naihi|poo+p?(?:ed|y|ie)?|poo|dirty|soiled|bm|tae|tumae|nag ?tae|jebs|dumi)\b/,
    wet: /\b(wet|pee+d?|peeing|wee|ihi|umihi|naihi|basa)\b/,
    dirty: /\b(poo+p?(?:ed|y|ie)?|poo|dirty|soiled|bm|tae|tumae|nag ?tae|jebs|dumi|stool)\b/,
    both: /\b(both|wet and (?:dirty|poop)|pee and poop|ihi at tae)\b/,
    temp: /\b(temp(?:erature)?|fever|lagnat|thermometer|degrees?)\b/,
    med: /\b(gave|give|given|medicine|meds?|dose|gamot|pinainom|tylenol|paracetamol|acetaminophen|calpol|tempra|biogesic|ibuprofen|motrin|advil|nurofen|vitamin d|vit d|drops|simethicone|gas drops|antibiotic|amoxicillin)\b/,
    bath: /\b(bath|bathed|ligo|naligo|pinaliguan)\b/,
    weight: /\b(weighs|weight|weighed|timbang|kg|kilos?|pounds?|lbs?)\b/,
    note: /^(?:note|notes|add a note|remember|tandaan)\b ?(.*)$/,
    start: /\b(start(?:ed|ing)?|begin|on|simula|simulan)\b/,
    stop: /\b(stop(?:ped)?|end(?:ed)?|done|finish(?:ed)?|tapos(?: na)?|off)\b/,
    switchSide: /\b(switch(?:ed)?|change sides?|other side|lipat)\b/,
    left: /\b(left|kaliwa)\b/,
    right: /\b(right|kanan)\b/
  };
  var COLORS = [['yellow', /\b(yellow|mustard|dilaw)\b/], ['green', /\b(green|berde)\b/], ['brown', /\b(brown|tan|kayumanggi)\b/], ['orange', /\b(orange)\b/], ['black', /\b(black|itim|meconium)\b/], ['red', /\b(red|blood|bloody|pula|dugo)\b/], ['white', /\b(white|gr[ae]y|chalky|puti)\b/]];
  var TEXTURES = [['seedy', /\b(seedy|loose)\b/], ['soft', /\b(soft|pasty|mushy|malambot)\b/], ['watery', /\b(watery|runny|diarrh?ea|matubig)\b/], ['mucus', /\b(mucus|mucous|slimy|sipon)\b/], ['hard', /\b(hard|pellets?|constipated|matigas)\b/]];
  var MEDS = [['acetaminophen', /\b(tylenol|paracetamol|acetaminophen|calpol|tempra|biogesic|panadol)\b/], ['ibuprofen', /\b(ibuprofen|motrin|advil|nurofen|dolan)\b/], ['vitd', /\b(vitamin d|vit d|d drops)\b/], ['gas', /\b(simethicone|gas drops|mylicon|restime)\b/]];

  function pick(list, s) { for (var i = 0; i < list.length; i++) if (list[i][1].test(s)) return list[i][0]; return null; }
  function side(s) { var l = W.left.test(s), r = W.right.test(s); return l && !r ? 'L' : r && !l ? 'R' : null; }

  // Amount in ml; "120", "120 ml", "4 oz" — unit words win over the setting.
  function amountMl(s, unit) {
    var m = s.match(/\b(\d+(?:\.\d+)?) ?(ml|oz)\b/);
    if (m) return Math.round(m[2] === 'oz' ? parseFloat(m[1]) * OZ : parseFloat(m[1]));
    var n = s.match(/\b(\d+(?:\.\d+)?)\b/);
    if (!n) return null;
    var v = parseFloat(n[1]);
    return Math.round(unit === 'oz' ? v * OZ : v);
  }

  /* ---------- Parse ---------- */
  function parse(text, ctx) {
    ctx = ctx || {};
    var now = ctx.now || Date.now(), raw = String(text || '').trim();
    var s = norm(raw);
    if (!s) return { kind: 'unknown', heard: raw, suggest: [] };

    // Which baby, if there's more than one and a name was said.
    var baby = ctx.activeBaby || null;
    (ctx.babies || []).forEach(function (b) {
      var n = String(b.name || '').toLowerCase().trim();
      if (n && new RegExp('\\b' + n.replace(/[^a-z0-9 ]/g, '') + '\\b').test(s)) { baby = b.id; s = s.replace(new RegExp('\\b(si |ni )?' + n.replace(/[^a-z0-9 ]/g, '') + '(s)?\\b', 'g'), ' ').replace(/\s+/g, ' ').trim(); }
    });
    var T = ctx.timers || {};
    var w = when(s, now), t = w.t;
    s = w.s;
    var out = function (o) { o.baby = baby; return o; };

    // Notes first: "note: she was fussy" keeps its words as they are.
    var nm = s.match(W.note);
    if (nm && nm[1]) return out({ kind: 'entry', type: 'note', time: t, end: null, data: { text: raw.replace(/^\s*(note|notes|add a note|remember|tandaan)\s*:?\s*/i, '') } });

    // Medicine: never logged straight from voice — the form checks spacing and age.
    if (has(s, W.med) && !has(s, /\b(bottle|formula)\b/)) {
      var medId = pick(MEDS, s), rxId = null;
      (ctx.rx || []).forEach(function (r) { var n = String(r.name || '').toLowerCase().split(/\s+/)[0]; if (n && n.length > 3 && s.indexOf(n) >= 0) rxId = r.id; });
      var dm = s.match(/\b(\d+(?:\.\d+)?) ?(ml|drops?|mg|tabs?|tablets?)\b/);
      return out({ kind: 'form', type: 'med', preset: { medId: rxId ? null : medId, rxId: rxId, dose: dm ? dm[1] + ' ' + dm[2].replace(/^drop$/, 'drops') : '', time: t } });
    }

    // Temperature: "temp 37.8", "fever 100.4"
    if (has(s, W.temp)) {
      var v = num(s, /\b(\d{2,3}(?:\.\d+)?)\b/);
      if (v != null) {
        var c = v > 50 || (ctx.temp === 'F' && v > 45) ? (v - 32) * 5 / 9 : v;
        if (c >= 30 && c <= 45) return out({ kind: 'entry', type: 'temp', time: t, end: null, data: { tempC: Math.round(c * 100) / 100, method: /\b(armpit|kilikili|axillary)\b/.test(s) ? 'armpit' : /\b(ear)\b/.test(s) ? 'ear' : /\b(forehead|noo)\b/.test(s) ? 'forehead' : /\b(rectal|bottom)\b/.test(s) ? 'rectal' : '', note: '' } });
      }
    }

    // Weight: "weighs 5.2 kg", "12 pounds 4 ounces"
    if (has(s, W.weight) && !has(s, W.bottle)) {
      var kg = num(s, /\b(\d+(?:\.\d+)?) ?(?:kg|kilos?)\b/), lb = num(s, /\b(\d+(?:\.\d+)?) ?(?:pounds?|lbs?)\b/), oz = num(s, /\b(\d+(?:\.\d+)?) ?oz\b/);
      if (kg == null && lb == null) { var bare = num(s, /\b(\d+(?:\.\d+)?)\b/); if (bare != null) { if (ctx.weight === 'lb') lb = bare; else kg = bare; } }
      var wkg = kg != null ? kg : lb != null ? lb * LB + (oz || 0) * 0.028349523 : null;
      if (wkg && wkg > 0.5 && wkg < 30) return out({ kind: 'entry', type: 'growth', time: t, end: null, data: { weightKg: Math.round(wkg * 1000) / 1000, note: '' } });
    }

    // Pumping: start/stop the timer, or log an amount.
    if (has(s, W.pump)) {
      var pl = num(s, /\bleft (\d+(?:\.\d+)?)/) , pr = num(s, /\bright (\d+(?:\.\d+)?)/);
      var pa = amountMl(s, ctx.volume);
      if (pl != null || pr != null || (pa && /\b(ml|oz)\b/.test(s)) || (pa && /\bpumped\b/.test(s))) {
        var toMl = function (x) { return x == null ? 0 : Math.round(/\boz\b/.test(s) || ctx.volume === 'oz' ? x * OZ : x); };
        var L = toMl(pl), R = toMl(pr);
        if (!L && !R) { L = Math.round(pa / 2); R = pa - L; }
        return out({ kind: 'entry', type: 'pump', time: t, end: null, data: { leftMl: L, rightMl: R, amountMl: L + R, durationMin: 0, note: '' } });
      }
      if (has(s, W.stop)) return out({ kind: 'action', action: 'pump-finish' });
      var ps = side(s);
      return out({ kind: 'action', action: ps ? 'pump-side' : 'pump-both', side: ps });
    }

    // Tummy time
    if (has(s, W.tummy)) {
      var td = duration(s);
      if (td && !has(s, W.start)) return out({ kind: 'entry', type: 'tummy', time: t - td, end: t, data: {} });
      if (has(s, W.stop) || (T.tummy && !has(s, W.start))) return out({ kind: 'action', action: 'tummy-stop' });
      return out({ kind: 'action', action: 'tummy-start' });
    }

    var amt = amountMl(s, ctx.volume);
    // Bottle timer: "start bottle"; while it runs, "done, 15 ml" finishes and saves it.
    if (T.bottle && !has(s, W.diaper) && (has(s, W.stop) || has(s, /\b(finished|ubos|naubos|drank|ininom)\b/) || (amt && /\b(ml|oz)\b/.test(s)))) {
      return out({ kind: 'action', action: 'bottle-done', amountMl: amt && amt <= 400 ? amt : null });
    }
    if (/\b(bottle|bote)\b/.test(s) && has(s, W.start) && !(amt && /\b(ml|oz)\b/.test(s))) return out({ kind: 'action', action: 'bottle-start' });

    // Bottle: "bottle 120 ml formula", "drank 4 oz", "dede 90"
    if ((has(s, W.bottle) || /\b(ml|oz)\b/.test(s)) && amt && !has(s, W.diaper)) {
      var milk = /\b(formula|gatas ng lata)\b/.test(s) ? 'formula' : /\b(breast ?milk|expressed|pumped|gatas ng ina)\b/.test(s) ? 'breast' : (ctx.feeding === 'formula' || ctx.feeding === 'mixed' ? 'formula' : 'breast');
      if (amt > 0 && amt <= 400) return out({ kind: 'entry', type: 'feed', time: t, end: null, data: { kind: 'bottle', amountMl: amt, milk: milk, note: '' } });
    }

    // Breastfeeding: timer, or "fed left 15 minutes right 10"
    if (has(s, W.breast) || (/\b(fe(?:e)?d(?:ing)?|feed)\b/.test(s) && (W.left.test(s) || W.right.test(s) || T.breast))) {
      var lm = num(s, /\bleft (?:side )?(?:for )?(\d+)/) || num(s, /\bkaliwa (\d+)/), rm = num(s, /\bright (?:side )?(?:for )?(\d+)/) || num(s, /\bkanan (\d+)/);
      var bs = side(s), bd = duration(s);
      if (lm || rm || (bd && bs)) {
        if (!lm && !rm) { if (bs === 'L') lm = bd / MIN; else rm = bd / MIN; }
        var Lms = (lm || 0) * MIN, Rms = (rm || 0) * MIN;
        return out({ kind: 'entry', type: 'feed', time: t - Lms - Rms, end: t, data: { kind: 'breast', left: Lms, right: Rms, startSide: lm ? 'L' : 'R', note: '' } });
      }
      if (T.breast) {
        if (has(s, W.stop)) return out({ kind: 'action', action: 'breast-finish' });
        if (has(s, /\b(pause|wait|sandali)\b/)) return out({ kind: 'action', action: 'breast-pause' });
        if (bs || has(s, W.switchSide)) return out({ kind: 'action', action: 'breast-side', side: bs || (T.breast.side === 'L' ? 'R' : 'L') });
      }
      if (has(s, W.stop)) return out({ kind: 'unknown', heard: raw, suggest: ['feed'] });
      return out({ kind: 'action', action: 'breast-side', side: bs || ctx.nextSide || 'L' });
    }
    if (T.breast && has(s, W.switchSide)) return out({ kind: 'action', action: 'breast-side', side: T.breast.side === 'L' ? 'R' : 'L' });

    // Diapers
    if (has(s, W.diaper)) {
      var wet = has(s, W.wet), dirty = has(s, W.dirty);
      if (has(s, W.both)) { wet = true; dirty = true; }
      if (!wet && !dirty) wet = true; // "changed a diaper"
      var data = { wet: wet, dirty: dirty, rash: /\b(rash|redness|pantal|singaw)\b/.test(s), note: '' };
      if (dirty) { data.color = pick(COLORS, s); data.texture = pick(TEXTURES, s); }
      return out({ kind: 'entry', type: 'diaper', time: t, end: null, data: data });
    }

    // Sleep: "slept 2 hours" (past), "asleep" / "woke up" (timer)
    if (has(s, W.slept)) {
      var sd = duration(s);
      if (sd && sd <= 16 * HOUR) return out({ kind: 'entry', type: 'sleep', time: t - sd, end: t, data: { note: '' } });
    }
    if (has(s, W.awake) && !/\b(not|hindi)\b/.test(s)) {
      if (T.sleep) return out({ kind: 'action', action: 'sleep-stop' });
      return out({ kind: 'unknown', heard: raw, suggest: ['sleep'], why: 'The sleep timer isn’t running.' });
    }
    if (has(s, W.asleep) || (/\b(sleep|nap|idlip)\b/.test(s) && has(s, W.start))) {
      if (T.sleep) return out({ kind: 'unknown', heard: raw, suggest: ['sleep'], why: 'The sleep timer is already running.' });
      return out({ kind: 'action', action: 'sleep-start', time: t });
    }

    if (has(s, W.bath)) return out({ kind: 'entry', type: 'bath', time: t, end: null, data: { note: '' } });

    // Not sure: offer the closest buttons.
    var sug = [];
    if (/\b(feed|fed|ate|eat|milk|kain|dede)\b/.test(s)) sug.push('feed');
    if (/\b(sleep|nap|tulog)\b/.test(s)) sug.push('sleep');
    if (/\b(change|changed|palit)\b/.test(s)) sug.push('diaper');
    if (amt && !sug.length) sug.push('feed');
    return { kind: 'unknown', heard: raw, suggest: sug.length ? sug : ['feed', 'diaper', 'sleep'], baby: baby };
  }

  var api = { parse: parse, norm: norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BabyVoice = api;
})(this);
