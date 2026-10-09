/* =========================================================
   Kalinga — speechnum.js
   Turns what an elder said into a reading: "185", "one
   eighty-five", "isang daan walumpu't lima", "130 over 80",
   "seven point two". Pure: no DOM, no speech API. The app always
   reads the result back ("185 — tama ba?") before saving, and
   vitals.plausible() rejects impossible values.

   parse(text, 'number') -> number | null       exactly one number
   parse(text, 'pair')   -> { sys, dia, pulse? } | null   two or three numbers
   numbers(text)         -> every number heard, in order
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
  // Joining words inside one spoken number ("one hundred AND five", "walumpu'T lima", "apat NA raan").
  var LINK = { and: 1, at: 1, t: 1, ng: 1, na: 1, a: 1 };
  var POINT = { point: 1, punto: 1 };

  // Tagalog words glued to a linker: isang, dalawang, walumpung, walumput…
  function base(w) {
    if (ONES[w] != null || TEENS[w] != null || TENS[w] != null || HUNDRED[w]) return w;
    if (/ng$/.test(w)) { var a = w.slice(0, -2); if (ONES[a] != null || TEENS[a] != null || TENS[a] != null) return a; }
    if (/t$/.test(w)) { var b = w.slice(0, -1); if (TENS[b] != null || ONES[b] != null) return b; }
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
      .replace(/[-,.!?;:](?!\d)/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function numbers(text) {
    var toks = norm(text).split(' '), out = [];
    var cur = 0, last = null, hundred = false, active = false, dec = null;
    function flush() {
      if (active) out.push(dec ? cur + parseFloat('0.' + dec) : cur);
      cur = 0; last = null; hundred = false; active = false; dec = null;
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
        if (!active || last === 'hundred') { if (!active) start(n, 'ones'); else { cur += n; last = 'ones'; } }
        else if (last === 'tens' && cur % 10 === 0) { cur += n; last = 'ones'; }
        else start(n, 'ones');
        return;
      }
      if (w === null || (w && TEENS[w] != null)) {
        if (w) n = TEENS[w];
        if (active && last === 'ones' && !hundred && cur < 10) { cur = cur * 100 + n; last = 'teen'; }   // "one fifteen" = 115
        else if (!active) start(n, 'teen');
        else if (last === 'hundred') { cur += n; last = 'teen'; }
        else start(n, 'teen');
        return;
      }
      if (TENS[w] != null) {
        n = TENS[w];
        if (active && last === 'ones' && !hundred && cur < 10) { cur = cur * 100 + n; last = 'tens'; hundred = true; } // "one eighty" = 180
        else if (!active) start(n, 'tens');
        else if (last === 'hundred') { cur += n; last = 'tens'; }
        else start(n, 'tens');
        return;
      }
      if (HUNDRED[w]) {
        if (!active) { start(100, 'hundred'); hundred = true; }
        else if (last === 'ones' && !hundred) { cur = cur * 100; last = 'hundred'; hundred = true; }
        else { start(100, 'hundred'); hundred = true; }
        return;
      }
      if (LINK[w] || w === 'oh') return;
      flush(); // any other word ends the number
    });
    flush();
    return out;
  }

  function parse(text, kind) {
    var n = numbers(text);
    if (kind === 'pair') {
      if (n.length !== 2 && n.length !== 3) return null;
      var p = { sys: n[0], dia: n[1] };
      if (n.length === 3) p.pulse = n[2];
      return p;
    }
    return n.length === 1 ? n[0] : null;
  }

  var api = { parse: parse, numbers: numbers, norm: norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KalingaSpeech = api;
})(this);
