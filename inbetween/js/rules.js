/* =========================================================
   In-Between — rules engine.
   Pure functions only: the deck, how two "posts" are read,
   how the third card is judged, the odds from the cards still
   in the deck, and how the computer players bet. No DOM here,
   so it can be loaded (and tested) under Node as well.

   Cards are compact strings: rank + suit key, e.g. "10h", "As".
   ========================================================= */
(function (root) {
  'use strict';

  var SUITS = {
    s: { sym: '♠', name: 'spades',   red: false },
    h: { sym: '♥', name: 'hearts',   red: true },
    d: { sym: '♦', name: 'diamonds', red: true },
    c: { sym: '♣', name: 'clubs',    red: false }
  };
  var SUIT_KEYS = ['s', 'h', 'd', 'c'];
  var RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  var RANK_NAMES = { J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' };

  /* ---------- Cards ---------- */
  function rankOf(card) { return card.slice(0, -1); }
  function suitOf(card) { return SUITS[card.slice(-1)]; }
  /** Natural value, aces high: 2..14. */
  function value(rank) { return RANKS.indexOf(rank) + 2; }
  function cardName(card) {
    var r = rankOf(card);
    return (RANK_NAMES[r] || r) + ' of ' + suitOf(card).name;
  }
  // U+FE0E asks for the text glyph, so ♥ doesn't turn into an emoji heart.
  function cardShort(card) { return rankOf(card) + suitOf(card).sym + '\uFE0E'; }

  function newDeck() {
    var d = [];
    SUIT_KEYS.forEach(function (s) { RANKS.forEach(function (r) { d.push(r + s); }); });
    return d;
  }

  /** Unbiased random integer in [0, n). Uses crypto when available. */
  function randInt(n) {
    var c = root.crypto;
    if (c && c.getRandomValues) {
      var buf = new Uint32Array(1);
      var limit = Math.floor(0x100000000 / n) * n;
      do { c.getRandomValues(buf); } while (buf[0] >= limit);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  /** Fisher–Yates, in place. */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ---------- Reading the posts ----------
     The first post may be an Ace the player called low (1) or
     high (14). A second Ace is always high. */
  function postValues(a, b, aceLow) {
    var va = rankOf(a) === 'A' ? (aceLow ? 1 : 14) : value(rankOf(a));
    var vb = value(rankOf(b));
    return [va, vb];
  }

  /**
   * What kind of hand two posts make:
   *  - 'spread'      at least one rank sits strictly between them
   *  - 'consecutive' touching ranks (7–8): nothing can land between
   *  - 'pair'        same value: bet higher or lower instead
   */
  function classify(a, b, aceLow) {
    var v = postValues(a, b, aceLow);
    var lo = Math.min(v[0], v[1]), hi = Math.max(v[0], v[1]);
    if (lo === hi) return { type: 'pair', lo: lo, hi: hi, gap: 0 };
    var gap = hi - lo - 1;
    return { type: gap === 0 ? 'consecutive' : 'spread', lo: lo, hi: hi, gap: gap };
  }

  /**
   * Judge the third card. Returns 'win', 'lose' or 'post'.
   * Matching the rank of either post is always "hitting the post"
   * (on a pair, that's three of a kind). Otherwise an Ace counts high.
   * `call` is 'higher' | 'lower' for pairs, ignored for spreads.
   */
  function judge(a, b, aceLow, third, call) {
    var info = classify(a, b, aceLow);
    var r = rankOf(third);
    if (r === rankOf(a) || r === rankOf(b)) return 'post';
    var v = value(r);
    if (info.type === 'pair') {
      return (call === 'higher' ? v > info.hi : v < info.lo) ? 'win' : 'lose';
    }
    return (v > info.lo && v < info.hi) ? 'win' : 'lose';
  }

  /** Count outcomes over the cards still in the deck. */
  function odds(a, b, aceLow, remaining, call) {
    var o = { win: 0, lose: 0, post: 0, total: remaining.length };
    remaining.forEach(function (c) { o[judge(a, b, aceLow, c, call)]++; });
    return o;
  }

  /** How many bets a post costs. A pair's three-of-a-kind costs one more. */
  function postMultiplier(info, rules) {
    return info.type === 'pair' ? rules.postMult + 1 : rules.postMult;
  }

  /**
   * Chips moving for the player (positive = from the pot to them).
   * A loss is capped at what the player actually has.
   */
  function settle(outcome, bet, info, rules, chips) {
    if (outcome === 'win') return bet;
    if (outcome === 'lose') return -Math.min(bet, chips);
    return -Math.min(bet * postMultiplier(info, rules), chips);
  }

  /* ---------- Computer players ----------
     Expected value per chip bet, from the live deck:
       edge = P(win) − P(lose) − mult × P(post)
     Bigger edge → bigger bet. A dash of randomness keeps them human. */
  function botDecision(a, b, aceLow, remaining, rules, maxBet, chips, rnd) {
    rnd = rnd || Math.random;
    var info = classify(a, b, aceLow);
    var mult = postMultiplier(info, rules);
    var calls = info.type === 'pair' ? ['higher', 'lower'] : [null];
    var best = null;
    calls.forEach(function (call) {
      var o = odds(a, b, aceLow, remaining, call);
      var edge = o.total ? (o.win - o.lose - mult * o.post) / o.total : -1;
      if (!best || edge > best.edge) best = { call: call, edge: edge };
    });

    var frac;
    if (best.edge > 0.55) frac = 1;
    else if (best.edge > 0.35) frac = 0.6;
    else if (best.edge > 0.15) frac = 0.3;
    else if (best.edge > 0.02) frac = 0.12;
    // Like real players, they'll sometimes take a small punt on a so-so spread.
    else if (best.edge > -0.25 && rnd() < 0.5) frac = 0.05;
    else frac = 0;
    frac *= 0.8 + rnd() * 0.4;

    var bet = Math.round(maxBet * frac);
    // Don't stake most of the stack on anything short of a near-lock.
    if (best.edge < 0.55) bet = Math.min(bet, Math.ceil(chips * 0.4));
    bet = Math.max(0, Math.min(maxBet, bet));
    if (frac > 0 && bet < 1) bet = 1;
    if (bet === 0 && !rules.allowPass) bet = 1;
    return { bet: Math.min(bet, maxBet), call: best.call || null };
  }

  var api = {
    SUITS: SUITS, RANKS: RANKS,
    rankOf: rankOf, suitOf: suitOf, value: value,
    cardName: cardName, cardShort: cardShort,
    newDeck: newDeck, shuffle: shuffle,
    postValues: postValues, classify: classify, judge: judge, odds: odds,
    postMultiplier: postMultiplier, settle: settle, botDecision: botDecision
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InBetween = api;
})(typeof window !== 'undefined' ? window : globalThis);
