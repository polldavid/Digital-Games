/* =========================================================
   In-Between — game engine.
   The whole table as plain data plus the moves that change it:
   antes, dealing, Ace calls, bets, the next turn, knock-outs.
   No DOM and no clock, so the very same code runs the game in
   the browser (same-device play) and on the server (online
   rooms, where the server owns the deck so nobody can peek).

     ace?  →  bet  →  done  →  next player
      │        │
      │        └─ consecutive posts / pair-pass skip straight to done
      └─ only when the first post is an Ace and players call Aces
   ========================================================= */
(function (root) {
  'use strict';

  var R = (typeof module !== 'undefined' && module.exports) ? require('./rules.js') : root.InBetween;

  var DEFAULT_RULES = {
    startChips: 100, ante: 2, postMult: 2, pairs: 'hilo',
    aceChoice: true, firstLapCap: true, allowPass: true, showOdds: true,
    lapAnte: false, turnTimer: 60
  };
  /** Allowed values for every rule — the server only accepts these. */
  var RULE_VALUES = {
    startChips: [50, 100, 250], ante: [1, 2, 5], postMult: [2, 1],
    pairs: ['hilo', 'pass'], turnTimer: [0, 30, 60, 90],
    aceChoice: [true, false], firstLapCap: [true, false], allowPass: [true, false],
    showOdds: [true, false], lapAnte: [true, false]
  };
  var CPU_NAMES = ['Lucky Lou', 'Card Shark', 'Dealer Dee', 'Big Stack', 'Sly Sal', 'Robo Rita', 'Chip Chase', 'Lady Luck'];

  /** Online pacing (ms after the last change). Shared by server and clients. */
  var TIMING = { bot: 1400, botDone: 2600, done: 5000 };

  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n); }

  function sanitizeRules(input) {
    var out = copy(DEFAULT_RULES);
    Object.keys(RULE_VALUES).forEach(function (k) {
      if (input && RULE_VALUES[k].indexOf(input[k]) !== -1) out[k] = input[k];
    });
    return out;
  }

  function active(s) { return s.players.filter(function (p) { return !p.out; }); }
  function current(s) { return s.players[s.hand.player]; }
  function indexOf(s, id) {
    for (var i = 0; i < s.players.length; i++) if (s.players[i].id === id) return i;
    return -1;
  }
  function addLog(s, kind, text) {
    s.log.unshift({ k: kind, t: text });
    if (s.log.length > 60) s.log.length = 60;
  }
  function notice(s, text) { s.notice = { n: ((s.notice && s.notice.n) || 0) + 1, text: text }; }

  function newPlayer(p, i, chips) {
    return {
      id: p.id || ('p' + i), name: p.name, cpu: !!p.cpu, chips: chips, out: false, left: false,
      stats: { hands: 0, wins: 0, losses: 0, posts: 0, passes: 0, best: 0 }
    };
  }

  /* ---------- Setting up ---------- */
  function create(roster, rules) {
    rules = sanitizeRules(rules);
    var s = {
      v: 2,
      rules: rules,
      players: roster.map(function (p, i) { return newPlayer(p, i, rules.startChips); }),
      pot: 0, deck: R.shuffle(R.newDeck()),
      turn: 0, turnsSinceAnte: 0, turnsInLap: 0, lapSize: roster.length,
      handNo: 0, maxPot: 0, shuffles: 1,
      hand: null, log: [], over: false, endReason: null, notice: null
    };
    ante(s, true);
    startHand(s);
    return s;
  }

  /** Everyone antes. A fresh pot (game start, or after it's cleaned out)
      restarts the first-lap rule; an every-lap ante just tops it up. */
  function ante(s, fresh) {
    var a = s.rules.ante, paid = 0;
    active(s).forEach(function (p) {
      var amt = Math.min(a, p.chips);
      p.chips -= amt; paid += amt;
    });
    s.pot += paid;
    s.maxPot = Math.max(s.maxPot, s.pot);
    if (fresh) s.turnsSinceAnte = 0;
    s.turnsInLap = 0;
    s.lapSize = active(s).length;
    addLog(s, 'ante', (fresh ? 'Everyone antes ' : 'New lap — everyone antes ') + a + '. The pot is ' + s.pot + '.');
  }

  function draw(s) {
    if (!s.deck.length) reshuffle(s);
    return s.deck.pop();
  }
  function reshuffle(s) {
    s.deck = R.shuffle(R.newDeck());
    s.shuffles++;
    addLog(s, 'info', 'Fresh deck shuffled.');
    notice(s, '🔀 Fresh deck shuffled');
  }

  /* ---------- A hand ---------- */
  function startHand(s) {
    if (s.deck.length < 3) reshuffle(s);
    s.handNo++;
    s.hand = { id: s.handNo, player: s.turn, a: draw(s), b: null, aceLow: null, phase: 'bet', bet: 0, call: null, third: null, outcome: null, delta: 0 };
    if (R.rankOf(s.hand.a) === 'A' && s.rules.aceChoice) {
      s.hand.phase = 'ace';
    } else {
      s.hand.aceLow = false;
      dealSecond(s);
    }
  }

  function chooseAce(s, low) {
    var h = s.hand;
    if (s.over || h.phase !== 'ace') return false;
    h.aceLow = !!low;
    addLog(s, 'info', current(s).name + ' calls the Ace ' + (low ? 'low' : 'high') + '.');
    dealSecond(s);
    return true;
  }

  function dealSecond(s) {
    var h = s.hand;
    h.b = draw(s);
    var info = R.classify(h.a, h.b, h.aceLow);
    if (info.type === 'consecutive') return finishWithoutBet(s, 'nochance');
    if (info.type === 'pair' && s.rules.pairs === 'pass') return finishWithoutBet(s, 'pairpass');
    h.phase = 'bet';
  }

  /** End the hand with no chips moving: pass, no-chance, timeout, left… */
  function finishWithoutBet(s, kind) {
    var h = s.hand, p = current(s);
    h.phase = 'done'; h.outcome = kind; h.delta = 0;
    p.stats.hands++;
    var posts = h.b ? R.cardShort(h.a) + ' · ' + R.cardShort(h.b) : R.cardShort(h.a);
    switch (kind) {
      case 'nochance': addLog(s, 'skip', p.name + ': ' + posts + ' — consecutive, nothing fits. Turn passes.'); break;
      case 'pairpass': addLog(s, 'skip', p.name + ': ' + posts + ' — a pair. Turn passes.'); break;
      case 'timeout': addLog(s, 'skip', p.name + ' ran out of time — turn passes.'); break;
      case 'skip': addLog(s, 'skip', p.name + '’s turn was skipped by the host.'); break;
      case 'left': break; // logged by removePlayer
      default: p.stats.passes++; addLog(s, 'skip', p.name + ' passes on ' + posts + '.');
    }
  }

  /** Is the first-lap "no betting the whole pot" rule in force right now? */
  function firstLapCapped(s) {
    return s.rules.firstLapCap && s.turnsSinceAnte < s.lapSize && s.pot > 1;
  }
  function maxBet(s) {
    var p = current(s);
    var m = Math.min(s.pot, p.chips);
    if (firstLapCapped(s)) m = Math.min(m, s.pot - 1);
    return Math.max(0, m);
  }

  function placeBet(s, amount, call) {
    var h = s.hand, p = current(s);
    if (s.over || h.phase !== 'bet') return false;
    amount = Math.floor(+amount) || 0;
    if (amount <= 0) {
      if (!s.rules.allowPass && maxBet(s) >= 1) return false;
      finishWithoutBet(s, 'pass');
      return true;
    }
    amount = clamp(amount, 1, maxBet(s));
    var info = R.classify(h.a, h.b, h.aceLow);
    if (info.type === 'pair' && call !== 'higher' && call !== 'lower') return false;

    h.bet = amount; h.call = info.type === 'pair' ? call : null;
    h.third = draw(s);
    h.outcome = R.judge(h.a, h.b, h.aceLow, h.third, h.call);
    h.delta = R.settle(h.outcome, amount, info, s.rules, p.chips);
    h.phase = 'done';
    p.chips += h.delta;
    s.pot -= h.delta;
    s.maxPot = Math.max(s.maxPot, s.pot);

    p.stats.hands++;
    if (h.outcome === 'win') { p.stats.wins++; p.stats.best = Math.max(p.stats.best, h.delta); }
    else if (h.outcome === 'lose') p.stats.losses++;
    else p.stats.posts++;

    var posts = R.cardShort(h.a) + ' · ' + R.cardShort(h.b);
    var verb = h.call ? 'bets ' + amount + ' ' + h.call : 'bets ' + amount;
    var res = h.outcome === 'win' ? 'In between! ' + signed(h.delta)
      : h.outcome === 'lose' ? (info.type === 'pair' ? 'Wrong call. ' : 'Outside. ') + signed(h.delta)
      : (info.type === 'pair' ? 'Three of a kind! ' : 'Hit the post! ') + signed(h.delta);
    addLog(s, h.outcome, p.name + ': ' + posts + ', ' + verb + ' → ' + R.cardShort(h.third) + '. ' + res);
    if (h.outcome === 'win' && s.pot === 0) addLog(s, 'win', p.name + ' cleaned out the pot! 💰');
    return true;
  }

  /** The computer player whose turn it is makes its move. */
  function botMove(s) {
    var h = s.hand, p = current(s);
    if (s.over || !p.cpu || h.phase === 'done') return false;
    // Calling it low is never worse on average: an Ace–Ace then spans everything.
    if (h.phase === 'ace') return chooseAce(s, true);
    var d = R.botDecision(h.a, h.b, h.aceLow, s.deck, s.rules, maxBet(s), p.chips);
    return placeBet(s, d.bet, d.call);
  }

  function nextTurn(s) {
    if (s.over || s.hand.phase !== 'done') return false;
    s.turnsSinceAnte++;
    s.turnsInLap = (s.turnsInLap || 0) + 1;
    knockOut(s);
    if (active(s).length <= 1) { endGame(s, 'last'); return true; }
    var fresh = s.pot <= 0;
    if (fresh || (s.rules.lapAnte && s.turnsInLap >= s.lapSize)) {
      ante(s, fresh);
      knockOut(s);
      if (active(s).length <= 1) { endGame(s, 'last'); return true; }
    }
    var n = s.players.length, i = s.turn;
    do { i = (i + 1) % n; } while (s.players[i].out);
    s.turn = i;
    startHand(s);
    return true;
  }

  function knockOut(s) {
    s.players.forEach(function (p) {
      if (!p.out && p.chips <= 0) {
        p.out = true; p.chips = 0;
        addLog(s, 'out', p.name + ' is out of chips.');
      }
    });
  }

  function endGame(s, reason) {
    if (s.over) return false;
    s.over = true;
    s.endReason = reason;
    var left = active(s);
    if (reason === 'last' && left.length === 1 && s.pot > 0) {
      left[0].chips += s.pot;
      addLog(s, 'win', left[0].name + ' is the last one standing and scoops the pot of ' + s.pot + '.');
      s.pot = 0;
    }
    return true;
  }

  /* ---------- People coming and going (online rooms) ---------- */
  function addPlayer(s, p) {
    var pl = newPlayer(p, s.players.length, s.rules.startChips);
    s.players.push(pl);
    addLog(s, 'info', pl.name + ' pulls up a chair with ' + pl.chips + ' chips.');
    return pl;
  }

  function removePlayer(s, id, kicked) {
    var i = indexOf(s, id);
    if (i === -1 || s.players[i].left) return false;
    var p = s.players[i];
    p.left = true;
    var wasIn = !p.out;
    p.out = true;
    addLog(s, 'out', p.name + (kicked ? ' was removed from the table.' : ' left the table.'));
    if (!s.over && wasIn) {
      if (i === s.hand.player && s.hand.phase !== 'done') finishWithoutBet(s, 'left');
      if (active(s).length <= 1) endGame(s, 'last');
    }
    return true;
  }

  /** Host (or the timer) moves a stalled human along. */
  function skipTurn(s, kind) {
    if (s.over || s.hand.phase === 'done') return false;
    finishWithoutBet(s, kind || 'skip');
    return true;
  }

  /**
   * What happens next on its own, and when — for online rooms.
   * Returns { at, kind } (kind: 'bot' | 'next' | 'timeout') or null.
   */
  function nextDue(s, changedAt) {
    if (!s || s.over || !s.hand) return null;
    var h = s.hand, p = current(s);
    if (h.phase === 'done') return { at: changedAt + (p.cpu ? TIMING.botDone : TIMING.done), kind: 'next' };
    if (p.cpu) return { at: changedAt + TIMING.bot, kind: 'bot' };
    if (s.rules.turnTimer > 0) return { at: changedAt + s.rules.turnTimer * 1000, kind: 'timeout' };
    return null;
  }
  function runDue(s, kind) {
    if (kind === 'next') return nextTurn(s);
    if (kind === 'bot') return botMove(s);
    if (kind === 'timeout') return skipTurn(s, 'timeout');
    return false;
  }

  var api = {
    DEFAULT_RULES: DEFAULT_RULES, RULE_VALUES: RULE_VALUES, CPU_NAMES: CPU_NAMES, TIMING: TIMING,
    sanitizeRules: sanitizeRules, create: create, active: active, current: current, indexOf: indexOf,
    chooseAce: chooseAce, placeBet: placeBet, maxBet: maxBet, firstLapCapped: firstLapCapped,
    botMove: botMove, nextTurn: nextTurn, endGame: endGame,
    addPlayer: addPlayer, removePlayer: removePlayer, skipTurn: skipTurn,
    nextDue: nextDue, runDue: runDue, signed: signed
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InBetweenEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
