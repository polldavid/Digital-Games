/* =========================================================
   Flip 7 — rules & scoring engine
   Pure functions, no DOM. Everything the scorer needs to
   know about the deck and how a hand is worth points lives
   here, so the maths is in one auditable place.
   ========================================================= */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------
     The deck: 94 cards.
       • Number cards — card N appears N times, except 0 (one).
       • Modifiers    — one each of +2 +4 +6 +8 +10 and x2.
       • Actions      — three each of Freeze / Flip Three /
                        Second Chance.
     --------------------------------------------------------- */
  var NUMBERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  function numberCopies(n) { return n === 0 ? 1 : n; }

  var MODIFIERS = [
    { key: 'p2',  label: '+2',  type: 'add',  value: 2,  copies: 1 },
    { key: 'p4',  label: '+4',  type: 'add',  value: 4,  copies: 1 },
    { key: 'p6',  label: '+6',  type: 'add',  value: 6,  copies: 1 },
    { key: 'p8',  label: '+8',  type: 'add',  value: 8,  copies: 1 },
    { key: 'p10', label: '+10', type: 'add',  value: 10, copies: 1 },
    { key: 'x2',  label: '×2', type: 'mult', value: 2, copies: 1 }
  ];

  var ACTIONS = [
    { key: 'freeze', label: 'Freeze',        emoji: '❄️', copies: 3,
      blurb: 'The player you give it to banks their points and sits out the rest of the round.' },
    { key: 'flip3',  label: 'Flip Three',    emoji: '↻', copies: 3,
      blurb: 'The player you give it to must flip three more cards — busting stops them early.' },
    { key: 'second', label: 'Second Chance', emoji: '♻️', copies: 3,
      blurb: 'Cancels one duplicate number. Discard both cards and carry on flipping.' }
  ];

  var MOD_BY_KEY = {};
  MODIFIERS.forEach(function (m) { MOD_BY_KEY[m.key] = m; });

  var FLIP7_COUNT = 7;      // unique number cards needed
  var DEFAULT_BONUS = 15;   // points for hitting Flip 7
  var DEFAULT_TARGET = 200; // points that end the game

  function deckSize() {
    var n = 0;
    NUMBERS.forEach(function (v) { n += numberCopies(v); });
    MODIFIERS.forEach(function (m) { n += m.copies; });
    ACTIONS.forEach(function (a) { n += a.copies; });
    return n; // 79 + 6 + 9 = 94
  }

  /* How many copies of a given card the deck holds. */
  function copiesOf(card) {
    if (card.kind === 'number') return numberCopies(card.value);
    var m = MOD_BY_KEY[card.key];
    return m ? m.copies : 0;
  }

  /* ---------------------------------------------------------
     Scoring a single player's round.

     entry = { mode: 'cards', numbers: [int], mods: [key], busted: bool }
           | { mode: 'manual', total: int, busted: bool }

     Bust  -> 0, no matter what else is on the table.
     Else  -> (sum of number cards x 2 if x2 was flipped)
              + the + modifiers
              + the Flip 7 bonus, if seven unique numbers.
     --------------------------------------------------------- */
  function scoreEntry(entry, opts) {
    var bonusValue = (opts && opts.flip7Bonus != null) ? opts.flip7Bonus : DEFAULT_BONUS;
    var out = {
      busted: false, flip7: false, numberSum: 0, doubled: false,
      addBonus: 0, flip7Bonus: 0, cardCount: 0, total: 0, manual: false
    };
    if (!entry) return out;

    if (entry.mode === 'manual') {
      out.manual = true;
      out.busted = !!entry.busted;
      out.total = out.busted ? 0 : Math.max(0, entry.total || 0);
      return out;
    }

    var numbers = entry.numbers || [];
    var mods = entry.mods || [];
    out.cardCount = numbers.length;
    out.busted = !!entry.busted;
    out.flip7 = numbers.length >= FLIP7_COUNT;

    numbers.forEach(function (n) { out.numberSum += n; });
    mods.forEach(function (key) {
      var m = MOD_BY_KEY[key];
      if (!m) return;
      if (m.type === 'mult') out.doubled = true;
      else out.addBonus += m.value;
    });

    if (out.busted) { out.total = 0; return out; }

    out.flip7Bonus = out.flip7 ? bonusValue : 0;
    out.total = out.numberSum * (out.doubled ? 2 : 1) + out.addBonus + out.flip7Bonus;
    return out;
  }

  /* A short human-readable sum, e.g. "5+9+10 = 24 x2 +4 +15". */
  function describe(entry, opts) {
    var s = scoreEntry(entry, opts);
    if (s.busted) return 'Busted — 0 points';
    if (s.manual) return 'Entered by hand';
    if (!s.cardCount && !s.addBonus) return 'No cards';

    var parts = [];
    var numbers = (entry.numbers || []).slice().sort(function (a, b) { return a - b; });
    if (numbers.length) parts.push(numbers.join('+'));
    if (s.doubled) parts.push('×2');
    if (s.addBonus) parts.push('+' + s.addBonus);
    if (s.flip7Bonus) parts.push('+' + s.flip7Bonus);
    return parts.join(' ') + ' = ' + s.total;
  }

  /* Has this entry actually been filled in? */
  function isEntered(entry) {
    if (!entry) return false;
    if (entry.mode === 'manual') return entry.busted || entry.total != null;
    return !!entry.busted || (entry.numbers && entry.numbers.length > 0) || (entry.mods && entry.mods.length > 0);
  }

  /* ---------------------------------------------------------
     Deck awareness: how many copies of each card are already
     claimed by the other players this round. Used to warn when
     a round is physically impossible (only one 0 exists, only
     one x2, and so on).
     --------------------------------------------------------- */
  function cardsClaimed(entries, exceptPlayerId) {
    var used = { numbers: {}, mods: {} };
    Object.keys(entries || {}).forEach(function (pid) {
      if (String(pid) === String(exceptPlayerId)) return;
      var e = entries[pid];
      if (!e || e.mode === 'manual') return;
      (e.numbers || []).forEach(function (n) { used.numbers[n] = (used.numbers[n] || 0) + 1; });
      (e.mods || []).forEach(function (k) { used.mods[k] = (used.mods[k] || 0) + 1; });
    });
    return used;
  }

  function numberOverdrawn(value, claimed) {
    return ((claimed.numbers[value] || 0) + 1) > numberCopies(value);
  }
  function modOverdrawn(key, claimed) {
    var m = MOD_BY_KEY[key];
    return !!m && ((claimed.mods[key] || 0) + 1) > m.copies;
  }

  root.Flip7Rules = {
    NUMBERS: NUMBERS,
    MODIFIERS: MODIFIERS,
    ACTIONS: ACTIONS,
    FLIP7_COUNT: FLIP7_COUNT,
    DEFAULT_BONUS: DEFAULT_BONUS,
    DEFAULT_TARGET: DEFAULT_TARGET,
    numberCopies: numberCopies,
    copiesOf: copiesOf,
    deckSize: deckSize,
    scoreEntry: scoreEntry,
    describe: describe,
    isEntered: isEntered,
    cardsClaimed: cardsClaimed,
    numberOverdrawn: numberOverdrawn,
    modOverdrawn: modOverdrawn
  };
})(typeof window !== 'undefined' ? window : globalThis);
