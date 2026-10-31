/* =========================================================
   Kalinga — speechnum.js
   Turns what an elder said into a reading: "185", "one
   eighty-five", "isang daan walumpu't lima", "130 over 80",
   "seven point two". Pure: no DOM, no speech API. The app always
   reads the result back ("185 — tama ba?") before saving, and
   vitals.plausible() rejects impossible values.

   parse(text, 'number') -> number | null       exactly one number
   parse(text, 'pair')   -> { sys, dia, pulse? } | null
                            "<sys> over <dia>" (or "/"); a third number only after "pulse"
   numbers(text)         -> every number heard, in order
   Anything that sounds like a number word we could not read (e.g. a
   misheard "...daan") makes parse() refuse rather than drop it: dropping
   "isandaan" from "isandaan walumpu't lima" would turn 185 into 85.
   ========================================================= */
(function (root) {
  'use strict';

  var ONES = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    isa: 1, dalawa: 2, tatlo: 3, apat: 4, lima: 5, anim: 6, pito: 7, walo: 8, siyam: 9
  };
  var TEENS = {
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    sampu: 10
  };
  var TENS = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    dalawampu: 20, tatlumpu: 30, apatnapu: 40, limampu: 50, animnapu: 60, pitumpu: 70, walumpu: 80, siyamnapu: 90
  };
  var HUNDRED = { hundred: 1, daan: 1, raan: 1 };
  var THOUSAND = { thousand: 1, libo: 1 };
  // Joining words inside one spoken number ("one hundred AND five", "walumpu'T lima", "apat NA raan").
  var LINK = { and: 1, at: 1, t: 1, ng: 1, na: 1, a: 1 };
  var POINT = { point: 1, punto: 1 };

  // Tagalog words glued to a linker: isang, dalawang, walumpung, walumput…
  function base(w) {
    if (ONES[w] != null || TEENS[w] != null || TENS[w] != null || HUNDRED[w] || THOUSAND[w]) return w;
    if (/ng$/.test(w)) { var a = w.slice(0, -2); if (ONES[a] != null || TEENS[a] != null || TENS[a] != null || HUNDRED[a] || THOUSAND[a]) return a; }
    if (/t$/.test(w)) { var b = w.slice(0, -1); if (TENS[b] != null || ONES[b] != null) return b; }
    if (/ng$/.test(w)) { var c = w.slice(0, -1); if (HUNDRED[c]) return c; } // daang, raang
    return w;
  }

  function norm(text) {
    return String(text || '').toLowerCase()
      .replace(/[’'`]/g, ' ')
      .replace(/(\d),(\d{3})\b/g, '$1$2')     // 1,850 -> 1850
      .replace(/(\d),(\d)/g, '$1.$2')          // 7,2 -> 7.2
      .replace(/(\d)\s*(?:point|punto)\s*(\d)/g, '$1.$2')
      .replace(/\//g, ' over ')
      .replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2')
      // Tagalog teens: labing-isa, labindalawa, labimpito… -> #11..#19
      .replace(/\blabi[nm]g?[\s-]*(isa|dalawa|tatlo|apat|lima|anim|pito|walo|siyam)\b/g, function (m, w) { return ' #' + (10 + ONES[w]) + ' '; })
      .replace(/\bsandaan\b/g, ' isa daan ')
      // run together: isandaan, dalawandaan, tatlongdaan… -> "isa daan"
      .replace(/\b(isa|dalawa|tatlo|apat|lima|anim|pito|walo|siyam)n?g?(daan|raan)\b/g, ' $1 daan ')
      .replace(/[-,.!?;:](?!\d)/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  // -> { nums: [number], unsure: bool }  unsure = a number-like word was not understood
  function scan(text) {
    var toks = norm(text).split(' '), out = [], unsure = false;
    var cur = 0, big = 0, last = null, hundred = false, active = false, dec = null;
    function flush() {
      if (active) out.push(big + (dec ? cur + parseFloat('0.' + dec) : cur));
      cur = 0; big = 0; last = null; hundred = false; active = false; dec = null;
    }
    function start(v, type) { flush(); cur = v; last = type; active = true; }
    toks.forEach(function (raw) {
      if (!raw) return;
      if (/^\d+(\.\d+)?$/.test(raw)) { flush(); out.push(parseFloat(raw)); return; }
      var w = base(raw), n;
      if (dec != null) {
        if (ONES[w] != null) { dec += String(ONES[w]); return; }
        if (w === 'oh') { dec += '0'; return; }
        flush();
      }
      if (POINT[w]) { if (active) dec = ''; return; }
      if (raw.charAt(0) === '#') { n = +raw.slice(1); w = null; }
      if (w && ONES[w] != null) {
        n = ONES[w];
        if (!active || last === 'hundred' || last === 'thousand') { if (!active) start(n, 'ones'); else { cur += n; last = 'ones'; } }
        else if (last === 'tens' && cur % 10 === 0) { cur += n; last = 'ones'; }
        else start(n, 'ones');
        return;
      }
      if (w === null || (w && TEENS[w] != null)) {
        if (w) n = TEENS[w];
        if (active && last === 'ones' && !hundred && cur < 10) { cur = cur * 100 + n; last = 'teen'; }   // "one fifteen" = 115
        else if (!active) start(n, 'teen');
        else if (last === 'hundred' || last === 'thousand') { cur += n; last = 'teen'; }
        else start(n, 'teen');
        return;
      }
      if (TENS[w] != null) {
        n = TENS[w];
        if (active && last === 'ones' && !hundred && cur < 10) { cur = cur * 100 + n; last = 'tens'; hundred = true; } // "one eighty" = 180
        else if (!active) start(n, 'tens');
        else if (last === 'hundred' || last === 'thousand') { cur += n; last = 'tens'; }
        else start(n, 'tens');
        return;
      }
      if (HUNDRED[w]) {
        if (!active) { start(100, 'hundred'); hundred = true; }
        else if (last === 'ones' && !hundred) { cur = cur * 100; last = 'hundred'; hundred = true; }
        else { start(100, 'hundred'); hundred = true; }
        return;
      }
      if (THOUSAND[w]) {
        if (active && last !== 'thousand' && !big) { big = (cur || 1) * 1000; cur = 0; hundred = false; last = 'thousand'; }
        else { start(0, 'thousand'); big = 1000; }
        return;
      }
      if (LINK[w] || w === 'oh') return;
      if (raw.length >= 5 && /(?:da|ra)a?n$|libo/.test(raw)) unsure = true;
      flush(); // any other word ends the number
    });
    flush();
    return { nums: out, unsure: unsure };
  }

  function numbers(text) { return scan(text).nums; }

  function parse(text, kind) {
    if (kind === 'pair') {
      var parts = norm(text).split(/\bover\b/);
      if (parts.length !== 2) return null;
      var L = scan(parts[0]), R = scan(parts[1]);
      if (L.unsure || R.unsure || L.nums.length !== 1) return null;
      var p = { sys: L.nums[0], dia: R.nums[0] };
      if (R.nums.length === 1) return p;
      if (R.nums.length === 2 && /\b(pulse|pulso|heart rate|hr)\b/.test(parts[1])) { p.pulse = R.nums[1]; return p; }
      return null;
    }
    var r = scan(text);
    return !r.unsure && r.nums.length === 1 ? r.nums[0] : null;
  }

  var api = { parse: parse, numbers: numbers, norm: norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KalingaSpeech = api;
})(this);
