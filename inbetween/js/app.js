/* =========================================================
   In-Between — game state machine + UI.

   One shared table: a pot, a 52-card deck, and 2–8 players
   (any of them can be a computer). Each hand runs:

     ace?  →  bet  →  done  →  next player
      │        │
      │        └─ consecutive posts / pair-pass skip straight to done
      └─ only when the first post is an Ace and players call Aces

   Everything that changes the game goes through commit(), which
   saves to localStorage, re-renders and lets the computer players
   take their turn. A refresh never loses the game.
   ========================================================= */
(function () {
  'use strict';

  var R = window.InBetween;
  var STORE_KEY = 'dg-inbetween-v1';
  var SETUP_KEY = 'dg-inbetween-setup';
  var MIN_PLAYERS = 2, MAX_PLAYERS = 8;
  var CPU_NAMES = ['Lucky Lou', 'Card Shark', 'Dealer Dee', 'Big Stack', 'Sly Sal', 'Robo Rita', 'Chip Chase', 'Lady Luck'];
  var DEFAULT_RULES = {
    startChips: 100, ante: 2, postMult: 2, pairs: 'hilo',
    aceChoice: true, firstLapCap: true, allowPass: true, showOdds: true, lapAnte: false
  };

  var state = null;              // the live game (persisted)
  var setup = null;              // the setup form (persisted separately)
  var screen = 'home';
  var ui = { bet: null, lastBet: null, anim: {}, revealed: false, lastPot: null };
  var timers = [];

  /* ---------- Helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n); }
  function pct(n, total) { return total ? Math.round((n / total) * 100) : 0; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------- Persistence ---------- */
  function save() {
    try {
      if (state) localStorage.setItem(STORE_KEY, JSON.stringify(state));
      else localStorage.removeItem(STORE_KEY);
    } catch (e) { /* private mode — play on without saving */ }
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && s.v === 1 && s.players && s.hand) return s;
    } catch (e) {}
    return null;
  }
  function saveSetup() { try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch (e) {} }
  function loadSetup() {
    try {
      var s = JSON.parse(localStorage.getItem(SETUP_KEY));
      if (s && Array.isArray(s.players) && s.players.length >= MIN_PLAYERS) {
        s.rules = Object.assign({}, DEFAULT_RULES, s.rules || {});
        return s;
      }
    } catch (e) {}
    return { players: [{ name: '', cpu: false }, { name: '', cpu: true }], rules: copy(DEFAULT_RULES) };
  }

  /* =========================================================
     GAME LOGIC
     ========================================================= */
  function active() { return state.players.filter(function (p) { return !p.out; }); }
  function current() { return state.players[state.hand.player]; }
  function addLog(kind, text) {
    state.log.unshift({ k: kind, t: text });
    if (state.log.length > 60) state.log.length = 60;
  }

  function newGame(roster, rules) {
    state = {
      v: 1,
      rules: copy(rules),
      players: roster.map(function (p) {
        return {
          name: p.name, cpu: !!p.cpu, chips: rules.startChips, out: false,
          stats: { hands: 0, wins: 0, losses: 0, posts: 0, passes: 0, best: 0 }
        };
      }),
      pot: 0, deck: R.shuffle(R.newDeck()),
      turn: 0, turnsSinceAnte: 0, turnsInLap: 0, lapSize: roster.length,
      handNo: 0, maxPot: 0, shuffles: 1,
      hand: null, log: [], over: false, endReason: null
    };
    ui.lastBet = null;
    ui.lastPot = null;
    ante(true);
    startHand();
  }

  /** Everyone antes. A fresh pot (game start, or after it's cleaned out)
      restarts the first-lap rule; an every-lap ante just tops it up. */
  function ante(fresh) {
    var a = state.rules.ante, paid = 0;
    active().forEach(function (p) {
      var amt = Math.min(a, p.chips);
      p.chips -= amt; paid += amt;
    });
    state.pot += paid;
    state.maxPot = Math.max(state.maxPot, state.pot);
    if (fresh) state.turnsSinceAnte = 0;
    state.turnsInLap = 0;
    state.lapSize = active().length;
    addLog('ante', (fresh ? 'Everyone antes ' : 'New lap — everyone antes ') + a + '. The pot is ' + state.pot + '.');
  }

  function draw() {
    if (!state.deck.length) reshuffle();
    return state.deck.pop();
  }
  function reshuffle() {
    state.deck = R.shuffle(R.newDeck());
    state.shuffles++;
    addLog('info', 'Fresh deck shuffled.');
    toast('🔀 Fresh deck shuffled');
  }

  function startHand() {
    if (state.deck.length < 3) reshuffle();
    state.handNo++;
    state.hand = { player: state.turn, a: draw(), b: null, aceLow: null, phase: 'bet', bet: 0, call: null, third: null, outcome: null, delta: 0 };
    ui.anim = { a: true };
    ui.bet = null;
    if (R.rankOf(state.hand.a) === 'A' && state.rules.aceChoice) {
      state.hand.phase = 'ace';
    } else {
      state.hand.aceLow = false;
      dealSecond();
    }
  }

  function chooseAce(low) {
    var h = state.hand;
    if (h.phase !== 'ace') return;
    h.aceLow = !!low;
    addLog('info', current().name + ' calls the Ace ' + (low ? 'low' : 'high') + '.');
    ui.anim = { b: true };
    dealSecond();
  }

  function dealSecond() {
    var h = state.hand;
    h.b = draw();
    ui.anim.b = true;
    var info = R.classify(h.a, h.b, h.aceLow);
    if (info.type === 'consecutive') return finishWithoutBet('nochance');
    if (info.type === 'pair' && state.rules.pairs === 'pass') return finishWithoutBet('pairpass');
    h.phase = 'bet';
  }

  function finishWithoutBet(kind) {
    var h = state.hand, p = current();
    h.phase = 'done'; h.outcome = kind; h.delta = 0;
    p.stats.hands++;
    var posts = R.cardShort(h.a) + ' · ' + R.cardShort(h.b);
    if (kind === 'nochance') addLog('skip', p.name + ': ' + posts + ' — consecutive, nothing fits. Turn passes.');
    else if (kind === 'pairpass') addLog('skip', p.name + ': ' + posts + ' — a pair. Turn passes.');
    else { p.stats.passes++; addLog('skip', p.name + ' passes on ' + posts + '.'); }
  }

  /** Is the first-lap "no betting the whole pot" rule in force right now? */
  function firstLapCapped() {
    return state.rules.firstLapCap && state.turnsSinceAnte < state.lapSize && state.pot > 1;
  }
  function maxBet() {
    var p = current();
    var m = Math.min(state.pot, p.chips);
    if (firstLapCapped()) m = Math.min(m, state.pot - 1);
    return Math.max(0, m);
  }

  function placeBet(amount, call) {
    var h = state.hand, p = current();
    if (h.phase !== 'bet') return;
    amount = Math.floor(amount) || 0;
    if (amount <= 0) {
      if (!state.rules.allowPass && maxBet() >= 1) return;
      return finishWithoutBet('pass');
    }
    amount = clamp(amount, 1, maxBet());
    var info = R.classify(h.a, h.b, h.aceLow);
    if (info.type === 'pair' && call !== 'higher' && call !== 'lower') return;

    h.bet = amount; h.call = info.type === 'pair' ? call : null;
    h.third = draw();
    h.outcome = R.judge(h.a, h.b, h.aceLow, h.third, h.call);
    h.delta = R.settle(h.outcome, amount, info, state.rules, p.chips);
    h.phase = 'done';
    p.chips += h.delta;
    state.pot -= h.delta;
    state.maxPot = Math.max(state.maxPot, state.pot);
    if (!p.cpu) ui.lastBet = amount;
    ui.revealed = true;

    p.stats.hands++;
    if (h.outcome === 'win') { p.stats.wins++; p.stats.best = Math.max(p.stats.best, h.delta); }
    else if (h.outcome === 'lose') p.stats.losses++;
    else p.stats.posts++;

    var posts = R.cardShort(h.a) + ' · ' + R.cardShort(h.b);
    var verb = h.call ? 'bets ' + amount + ' ' + h.call : 'bets ' + amount;
    var res = h.outcome === 'win' ? 'In between! ' + signed(h.delta)
      : h.outcome === 'lose' ? (info.type === 'pair' ? 'Wrong call. ' : 'Outside. ') + signed(h.delta)
      : (info.type === 'pair' ? 'Three of a kind! ' : 'Hit the post! ') + signed(h.delta);
    addLog(h.outcome, p.name + ': ' + posts + ', ' + verb + ' → ' + R.cardShort(h.third) + '. ' + res);
    if (h.outcome === 'win' && state.pot === 0) addLog('win', p.name + ' cleaned out the pot! 💰');
  }

  function nextTurn() {
    if (!state || state.hand.phase !== 'done' || state.over) return;
    state.turnsSinceAnte++;
    state.turnsInLap = (state.turnsInLap || 0) + 1;
    knockOut();
    if (active().length <= 1) return endGame('last');
    var fresh = state.pot <= 0;
    if (fresh || (state.rules.lapAnte && state.turnsInLap >= state.lapSize)) {
      ante(fresh);
      knockOut();
      if (active().length <= 1) return endGame('last');
    }
    var n = state.players.length, i = state.turn;
    do { i = (i + 1) % n; } while (state.players[i].out);
    state.turn = i;
    startHand();
  }

  function knockOut() {
    state.players.forEach(function (p) {
      if (!p.out && p.chips <= 0) {
        p.out = true; p.chips = 0;
        addLog('out', p.name + ' is out of chips.');
      }
    });
  }

  function endGame(reason) {
    state.over = true;
    state.endReason = reason;
    var left = active();
    if (reason === 'last' && left.length === 1 && state.pot > 0) {
      left[0].chips += state.pot;
      addLog('win', left[0].name + ' is the last one standing and scoops the pot of ' + state.pot + '.');
      state.pot = 0;
    }
  }

  /* =========================================================
     FLOW: commit → save, render, let the computers play
     ========================================================= */
  function commit() {
    save();
    if (state && state.over) { show('results'); return; }
    render();
    pump();
  }

  function pump() {
    clearTimers();
    if (!state || state.over || screen !== 'table') return;
    var h = state.hand, p = current();
    var slow = reducedMotion() ? 0.6 : 1;
    if (h.phase === 'done') {
      if (p.cpu) later(2300 * slow, function () { nextTurn(); commit(); });
      return;
    }
    if (!p.cpu) return;
    if (h.phase === 'ace') {
      // Calling it low is never worse on average: an Ace–Ace then spans everything.
      later(900 * slow, function () { chooseAce(true); commit(); });
    } else if (h.phase === 'bet') {
      later(1400 * slow, function () {
        var d = R.botDecision(h.a, h.b, h.aceLow, state.deck, state.rules, maxBet(), p.chips);
        placeBet(d.bet, d.call);
        commit();
      });
    }
  }

  /* =========================================================
     RENDERING
     ========================================================= */
  function show(name) {
    screen = name;
    clearTimers();
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('screen--active', s.id === 'screen-' + name);
    });
    if (name === 'home') renderHome();
    if (name === 'setup') renderSetup();
    if (name === 'table') { render(); pump(); }
    if (name === 'results') renderResults();
    window.scrollTo(0, 0);
  }

  /* ---------- Home ---------- */
  function renderHome() {
    var live = state && !state.over;
    $('resume-card').hidden = !live;
    $('hero-actions').hidden = !!live;
    if (live) {
      var names = active().map(function (p) { return p.name; });
      $('resume-meta').textContent = 'Hand ' + state.handNo + ' · pot ' + state.pot + ' · ' + names.join(', ');
    }
  }

  /* ---------- Setup ---------- */
  function placeholderFor(i) {
    var p = setup.players[i];
    if (p.cpu) {
      var n = 0;
      for (var j = 0; j < i; j++) if (setup.players[j].cpu) n++;
      return CPU_NAMES[n % CPU_NAMES.length];
    }
    var h = 0;
    for (var k = 0; k <= i; k++) if (!setup.players[k].cpu) h++;
    return 'Player ' + h;
  }

  function renderSetup() {
    var list = $('player-list');
    list.innerHTML = setup.players.map(function (p, i) {
      return '<li class="pl' + (p.cpu ? ' pl--cpu' : '') + '">' +
        '<span class="pl__seat">' + (i + 1) + '</span>' +
        '<input class="pl__name" data-index="' + i + '" maxlength="18" autocomplete="off" ' +
          'value="' + esc(p.name) + '" placeholder="' + esc(placeholderFor(i)) + '" aria-label="Seat ' + (i + 1) + ' name" />' +
        '<button class="pl__kind" data-action="toggle-cpu" data-index="' + i + '" aria-pressed="' + p.cpu + '" ' +
          'title="' + (p.cpu ? 'Computer player — tap to make human' : 'Human player — tap to make a computer') + '">' +
          (p.cpu ? '🤖 CPU' : '🙂 Human') + '</button>' +
        '<button class="pl__remove" data-action="remove-player" data-index="' + i + '" aria-label="Remove seat ' + (i + 1) + '"' +
          (setup.players.length <= MIN_PLAYERS ? ' disabled' : '') + '>×</button>' +
      '</li>';
    }).join('');
    document.querySelectorAll('[data-action="add-human"],[data-action="add-cpu"]').forEach(function (b) {
      b.disabled = setup.players.length >= MAX_PLAYERS;
    });
    document.querySelectorAll('#screen-setup .segmented').forEach(function (seg) {
      var key = seg.getAttribute('data-opt');
      seg.querySelectorAll('.seg').forEach(function (b) {
        var on = String(setup.rules[key]) === b.getAttribute('data-val');
        b.classList.toggle('seg--on', on);
        b.setAttribute('aria-pressed', on);
      });
    });
    document.querySelectorAll('#screen-setup [data-toggle]').forEach(function (t) {
      t.setAttribute('aria-pressed', !!setup.rules[t.getAttribute('data-toggle')]);
    });
    $('setup-error').hidden = true;
  }

  function rosterFromSetup() {
    var seen = {};
    var roster = setup.players.map(function (p, i) {
      return { name: (p.name.trim() || placeholderFor(i)).slice(0, 18), cpu: p.cpu };
    });
    for (var i = 0; i < roster.length; i++) {
      var key = roster[i].name.toLowerCase();
      if (seen[key]) return { error: 'Two seats are both called “' + roster[i].name + '”. Give everyone their own name.' };
      seen[key] = true;
    }
    return { roster: roster };
  }

  /* ---------- Table ---------- */
  function cardHTML(card, extra) {
    var r = R.rankOf(card), s = R.suitOf(card);
    var face = r === 'J' || r === 'Q' || r === 'K' || r === 'A';
    return '<div class="card' + (s.red ? ' card--red' : '') + (extra ? ' ' + extra : '') + '" role="img" aria-label="' + esc(R.cardName(card)) + '">' +
      '<span class="card__corner">' + r + '<i>' + s.sym + '</i></span>' +
      (face ? '<span class="card__pip card__pip--face">' + r + '<i>' + s.sym + '</i></span>'
            : '<span class="card__pip">' + s.sym + '</span>') +
      '<span class="card__corner card__corner--br">' + r + '<i>' + s.sym + '</i></span>' +
    '</div>';
  }
  function backHTML(extra) { return '<div class="card card--back' + (extra ? ' ' + extra : '') + '" aria-label="Face-down card"></div>'; }
  function emptyHTML() { return '<div class="card card--empty" aria-hidden="true"></div>'; }

  function render() {
    if (!state || screen !== 'table') return;
    var h = state.hand, p = current();
    var info = h.b ? R.classify(h.a, h.b, h.aceLow) : null;

    // Top bar + pot
    $('tbar-meta').innerHTML = '<strong>Hand ' + state.handNo + '</strong><span>' + state.deck.length + ' cards in the deck</span>';
    $('pot-value').textContent = state.pot;
    var pot = $('pot');
    if (ui.lastPot !== null && ui.lastPot !== state.pot) {
      pot.classList.remove('pot--up', 'pot--down');
      void pot.offsetWidth;
      pot.classList.add(state.pot > ui.lastPot ? 'pot--up' : 'pot--down');
    }
    ui.lastPot = state.pot;

    // Seats
    $('seats').innerHTML = state.players.map(function (pl, i) {
      var isTurn = i === state.turn;
      var delta = isTurn && h.phase === 'done' && h.delta ? '<span class="seat__delta ' + (h.delta > 0 ? 'is-up' : 'is-down') + '">' + signed(h.delta) + '</span>' : '';
      return '<li class="seat' + (isTurn ? ' seat--turn' : '') + (pl.out ? ' seat--out' : '') + '">' +
        '<span class="seat__avatar" aria-hidden="true">' + (pl.cpu ? '🤖' : esc(pl.name.charAt(0).toUpperCase())) + '</span>' +
        '<span class="seat__name">' + esc(pl.name) + '</span>' +
        '<span class="seat__chips">' + (pl.out ? 'out' : pl.chips) + '</span>' + delta +
      '</li>';
    }).join('');
    var turnSeat = $('seats').querySelector('.seat--turn');
    if (turnSeat && turnSeat.scrollIntoView) {
      try { turnSeat.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (e) {}
    }

    // Turn label
    $('turn-label').innerHTML = (p.cpu ? '🤖 ' : '') + '<strong>' + esc(p.name) + '</strong>’s turn' +
      (p.cpu ? '' : ' <span class="felt__chips">· ' + p.chips + ' chips</span>');

    // Posts
    var hit = h.outcome === 'post' ? R.rankOf(h.third) : null;
    var aCls = (ui.anim.a ? 'deal' : '') + (hit && R.rankOf(h.a) === hit ? ' card--hit' : '');
    var bCls = (ui.anim.b ? 'deal deal--2' : '') + (hit && h.b && R.rankOf(h.b) === hit ? ' card--hit' : '');
    var aceTag = R.rankOf(h.a) === 'A' && h.aceLow !== null && state.rules.aceChoice
      ? '<span class="slot__tag">' + (h.aceLow ? 'Low · 1' : 'High · 14') + '</span>' : '';
    var middle;
    if (h.third) {
      var midCls = 'card--third card--' + h.outcome;
      middle = ui.revealed && !reducedMotion()
        ? '<div class="flip ' + midCls + '"><div class="flip__inner">' + backHTML('flip__back') + cardHTML(h.third, 'flip__front') + '</div></div>'
        : cardHTML(h.third, midCls);
    } else if (h.phase === 'bet') {
      middle = backHTML('card--waiting' + (ui.anim.b ? ' deal deal--3' : ''));
    } else {
      middle = emptyHTML();
    }
    $('posts').innerHTML =
      '<div class="slot">' + cardHTML(h.a, aCls) + aceTag + '</div>' +
      '<div class="slot slot--mid">' + middle + '</div>' +
      '<div class="slot">' + (h.b ? cardHTML(h.b, bCls) : emptyHTML()) + '</div>';
    $('felt').className = 'felt' + (h.outcome === 'post' ? ' felt--post' : '') + (h.outcome === 'win' ? ' felt--win' : '');

    // Spread label
    var spread = '';
    if (h.phase === 'ace') spread = 'An Ace! Call it low or high before the second card.';
    else if (info && info.type === 'consecutive') spread = 'Consecutive — nothing fits in between.';
    else if (info && info.type === 'pair') spread = 'A pair — will the next card be higher or lower?';
    else if (info) spread = info.gap + ' rank' + (info.gap === 1 ? '' : 's') + ' in between';
    $('spread-label').textContent = spread;

    renderControls(info);
    renderLog();

    ui.anim = {};
    ui.revealed = false;
  }

  function oddsBar(o, label) {
    var w = pct(o.win, o.total), l = pct(o.lose, o.total), pp = Math.max(0, 100 - w - l);
    return '<div class="odds">' +
      (label ? '<span class="odds__label">' + label + '</span>' : '') +
      '<div class="odds__bar" role="img" aria-label="Win ' + w + '%, lose ' + l + '%, post ' + pp + '%">' +
        '<span class="odds__seg odds__seg--win" style="width:' + w + '%"></span>' +
        '<span class="odds__seg odds__seg--lose" style="width:' + l + '%"></span>' +
        '<span class="odds__seg odds__seg--post" style="width:' + pp + '%"></span>' +
      '</div>' +
      '<div class="odds__key"><span class="k-win">Win ' + w + '%</span><span class="k-lose">Miss ' + l + '%</span><span class="k-post">Post ' + pp + '%</span></div>' +
    '</div>';
  }

  function verdict(edge) {
    if (edge > 0.45) return ['great', 'Huge edge'];
    if (edge > 0.2) return ['good', 'Good odds'];
    if (edge > 0) return ['ok', 'Slight edge'];
    if (edge > -0.2) return ['meh', 'Risky'];
    return ['bad', 'Long shot'];
  }

  function renderControls(info) {
    var el = $('controls'), h = state.hand, p = current();

    if (h.phase === 'done') {
      el.innerHTML = resultHTML(info) + nextButtonHTML();
      return;
    }
    if (p.cpu) {
      el.innerHTML = '<div class="thinking"><span>🤖 ' + esc(p.name) + ' is ' + (h.phase === 'ace' ? 'calling the Ace' : 'sizing up the bet') + '</span><span class="dots"><i></i><i></i><i></i></span></div>';
      return;
    }
    if (h.phase === 'ace') {
      el.innerHTML = '<div class="box">' +
        '<p class="box__title">Call your Ace</p>' +
        '<p class="box__sub">Low counts as 1, high as 14. Then the second card is dealt.</p>' +
        '<div class="duo">' +
          '<button class="btn btn--ghost btn--lg" data-action="ace-low">⬇ Low</button>' +
          '<button class="btn btn--ghost btn--lg" data-action="ace-high">⬆ High</button>' +
        '</div></div>';
      return;
    }

    // Betting
    var max = maxBet();
    if (ui.bet === null) ui.bet = clamp(ui.lastBet || state.rules.ante, 1, Math.max(1, max));
    ui.bet = clamp(ui.bet, 1, Math.max(1, max));
    var isPair = info.type === 'pair';
    var mult = R.postMultiplier(info, state.rules);
    var oddsHTML = '';
    if (state.rules.showOdds) {
      if (isPair) {
        var oh = R.odds(h.a, h.b, h.aceLow, state.deck, 'higher');
        var ol = R.odds(h.a, h.b, h.aceLow, state.deck, 'lower');
        oddsHTML = oddsBar(oh, 'Higher') + oddsBar(ol, 'Lower');
      } else {
        var o = R.odds(h.a, h.b, h.aceLow, state.deck);
        var v = verdict((o.win - o.lose - mult * o.post) / o.total);
        oddsHTML = '<div class="verdict verdict--' + v[0] + '">' + v[1] + ' · ' + o.win + ' of ' + o.total + ' cards win</div>' + oddsBar(o);
      }
    }
    var capNote = '';
    if (max < Math.min(state.pot, p.chips)) capNote = 'First lap — the whole pot can’t be bet yet, so the max is ' + max + '.';
    else if (max === p.chips && p.chips < state.pot) capNote = 'You can bet at most your whole stack (' + p.chips + ').';

    var go = isPair
      ? '<div class="duo">' +
          '<button class="btn btn--primary btn--lg" data-action="bet" data-call="lower">⬇ Lower <b data-bet-label></b></button>' +
          '<button class="btn btn--primary btn--lg" data-action="bet" data-call="higher">⬆ Higher <b data-bet-label></b></button>' +
        '</div>'
      : '<button class="btn btn--primary btn--lg btn--block" data-action="bet">Bet <b data-bet-label></b></button>';

    el.innerHTML = '<div class="box">' +
      oddsHTML +
      '<div class="wager">' +
        '<button class="wager__step" data-action="bet-dec" aria-label="Bet one less">−</button>' +
        '<div class="wager__val"><output id="bet-out">' + ui.bet + '</output><span>of max ' + max + '</span></div>' +
        '<button class="wager__step" data-action="bet-inc" aria-label="Bet one more">+</button>' +
      '</div>' +
      '<input class="range" id="bet-range" type="range" min="1" max="' + Math.max(1, max) + '" step="1" value="' + ui.bet + '" aria-label="Bet amount"' + (max <= 1 ? ' disabled' : '') + ' />' +
      '<div class="quick">' +
        '<button class="quick__btn" data-action="bet-set" data-frac="0">Min</button>' +
        '<button class="quick__btn" data-action="bet-set" data-frac="0.25">¼</button>' +
        '<button class="quick__btn" data-action="bet-set" data-frac="0.5">½</button>' +
        '<button class="quick__btn" data-action="bet-set" data-frac="1">Max</button>' +
      '</div>' +
      '<p class="stakes" id="stakes"></p>' +
      (capNote ? '<p class="box__note">' + capNote + '</p>' : '') +
      go +
      (state.rules.allowPass ? '<button class="btn btn--link btn--block" data-action="pass">Pass — no bet</button>' : '') +
    '</div>';
    el.setAttribute('data-mult', mult);
    updateBetUI();
  }

  function updateBetUI() {
    var out = $('bet-out'), range = $('bet-range'), stakes = $('stakes');
    if (!out) return;
    var mult = +$('controls').getAttribute('data-mult') || 2;
    var chips = current().chips;
    out.textContent = ui.bet;
    if (range) range.value = ui.bet;
    document.querySelectorAll('[data-bet-label]').forEach(function (b) { b.textContent = ui.bet; });
    if (stakes) {
      stakes.innerHTML = '<span class="k-win">Win +' + ui.bet + '</span>' +
        '<span class="k-lose">Miss −' + ui.bet + '</span>' +
        '<span class="k-post">Post −' + Math.min(ui.bet * mult, chips) + '</span>';
    }
  }

  function resultHTML(info) {
    var h = state.hand, p = current();
    var cls, title, sub;
    var posts = R.cardShort(h.a) + ' and ' + R.cardShort(h.b);
    switch (h.outcome) {
      case 'win':
        cls = 'win'; title = 'In between!';
        sub = esc(p.name) + ' takes ' + h.delta + ' from the pot' + (state.pot === 0 ? ' — and cleans it out! 💰' : '.');
        break;
      case 'lose':
        cls = 'lose'; title = info.type === 'pair' ? 'Wrong call.' : 'Outside.';
        sub = Math.abs(h.delta) + ' goes into the pot.';
        break;
      case 'post':
        cls = 'post'; title = info.type === 'pair' ? 'Three of a kind!' : 'Hit the post!';
        var mult = R.postMultiplier(info, state.rules), paid = Math.abs(h.delta);
        sub = esc(p.name) + ' pays ' + paid + (paid < h.bet * mult ? ' — everything they had.'
          : mult === 1 ? ' into the pot.' : ' — ' + (mult === 3 ? 'triple' : 'double') + ' the bet.');
        break;
      case 'nochance':
        cls = 'skip'; title = 'No room in between';
        sub = posts + ' are consecutive — the turn passes, no chips change hands.';
        break;
      case 'pairpass':
        cls = 'skip'; title = 'A pair';
        sub = 'House rule: pairs pass. No chips change hands.';
        break;
      default:
        cls = 'skip'; title = 'Pass';
        sub = esc(p.name) + ' sits this one out.';
    }
    var amount = h.delta ? '<span class="result__amt">' + signed(h.delta) + '</span>' : '';
    return '<div class="result result--' + cls + '"><div class="result__head"><strong>' + title + '</strong>' + amount + '</div><p>' + sub + '</p></div>';
  }

  function nextButtonHTML() {
    var n = state.players.length, others = [];
    for (var k = 1; k < n; k++) {
      var q = state.players[(state.turn + k) % n];
      if (!q.out) others.push(q);
    }
    var label = current().chips <= 0 && others.length <= 1 ? 'See the results →'
      : others.length ? 'Next: ' + esc(others[0].name) + ' →' : 'Continue →';
    return '<button class="btn btn--primary btn--lg btn--block" data-action="next">' + label + '</button>';
  }

  function renderLog() {
    $('log').innerHTML = state.log.slice(0, 12).map(function (l) {
      return '<li class="log__item log__item--' + l.k + '">' + esc(l.t) + '</li>';
    }).join('');
  }

  /* ---------- Results ---------- */
  function renderResults() {
    if (!state) return show('home');
    var ranked = state.players.map(function (p, i) { return { p: p, i: i }; })
      .sort(function (x, y) { return y.p.chips - x.p.chips || x.i - y.i; });
    var top = ranked[0].p;
    var tie = ranked.length > 1 && ranked[1].p.chips === top.chips;
    $('over-kicker').textContent = tie ? 'It’s a tie' : 'Winner';
    $('over-winner').textContent = tie
      ? ranked.filter(function (r) { return r.p.chips === top.chips; }).map(function (r) { return r.p.name; }).join(' & ')
      : top.name;
    $('over-sub').textContent = (state.endReason === 'last' ? 'Last one with chips after ' : 'Biggest stack after ') + state.handNo + ' hand' + (state.handNo === 1 ? '' : 's') + '.';

    var start = state.rules.startChips;
    $('standings').innerHTML = ranked.map(function (r, n) {
      var p = r.p, net = p.chips - start, s = p.stats;
      return '<li class="standing' + (n === 0 ? ' standing--lead' : '') + '">' +
        '<span class="standing__rank">' + (n + 1) + '</span>' +
        '<span class="standing__text"><strong>' + (p.cpu ? '🤖 ' : '') + esc(p.name) + '</strong>' +
          '<em class="standing__detail">' + s.wins + ' won · ' + s.losses + ' missed · ' + s.posts + ' post' + (s.posts === 1 ? '' : 's') + '</em></span>' +
        '<span class="standing__total">' + p.chips + '<em class="standing__net ' + (net >= 0 ? 'is-up' : 'is-down') + '">' + signed(net) + '</em></span>' +
      '</li>';
    }).join('');

    var best = state.players.slice().sort(function (a, b) { return b.stats.best - a.stats.best; })[0];
    var posty = state.players.slice().sort(function (a, b) { return b.stats.posts - a.stats.posts; })[0];
    $('stats').innerHTML =
      stat(best.stats.best ? '+' + best.stats.best : '—', 'Biggest win', best.stats.best ? best.name : '') +
      stat(state.maxPot, 'Biggest pot', '') +
      stat(posty.stats.posts || '0', 'Posts hit', posty.stats.posts ? 'Ouch, ' + posty.name : 'Nobody!') +
      stat(state.handNo, 'Hands dealt', state.shuffles + ' deck' + (state.shuffles === 1 ? '' : 's'));
  }
  function stat(v, k, sub) {
    return '<div class="stat"><div class="stat__v">' + esc(v) + '</div><div class="stat__k">' + k + '</div>' +
      (sub ? '<div class="stat__sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  /* ---------- Toast + modal ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    t.classList.remove('toast--on'); void t.offsetWidth; t.classList.add('toast--on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('toast--on'); t.hidden = true; }, 2200);
  }
  function openModal() { $('modal').hidden = false; clearTimers(); }
  function closeModal() { $('modal').hidden = true; }

  /* =========================================================
     EVENTS
     ========================================================= */
  function setBet(n) { ui.bet = clamp(Math.round(n), 1, Math.max(1, maxBet())); updateBetUI(); }

  var actions = {
    'go-home': function () { show('home'); },
    'go-how': function () { show('how'); },
    'go-setup': function () { show('setup'); },
    'resume': function () { show('table'); },
    'discard': function () { state = null; save(); show('setup'); },
    'leave': function () { show('home'); },

    'add-human': function () {
      if (setup.players.length >= MAX_PLAYERS) return;
      setup.players.push({ name: '', cpu: false }); saveSetup(); renderSetup();
      var inputs = document.querySelectorAll('.pl__name');
      if (inputs.length) inputs[inputs.length - 1].focus();
    },
    'add-cpu': function () {
      if (setup.players.length >= MAX_PLAYERS) return;
      setup.players.push({ name: '', cpu: true }); saveSetup(); renderSetup();
    },
    'toggle-cpu': function (el) {
      var p = setup.players[+el.getAttribute('data-index')];
      if (!p) return;
      p.cpu = !p.cpu; saveSetup(); renderSetup();
    },
    'remove-player': function (el) {
      if (setup.players.length <= MIN_PLAYERS) return;
      setup.players.splice(+el.getAttribute('data-index'), 1); saveSetup(); renderSetup();
    },
    'start': function () {
      var r = rosterFromSetup();
      if (r.error) { var e = $('setup-error'); e.textContent = r.error; e.hidden = false; return; }
      newGame(r.roster, setup.rules);
      save();
      show('table');
    },
    'rematch': function () {
      if (!state) return show('setup');
      var roster = state.players.map(function (p) { return { name: p.name, cpu: p.cpu }; });
      newGame(roster, state.rules);
      save();
      show('table');
    },

    'ace-low': function () { if (!current().cpu) { chooseAce(true); commit(); } },
    'ace-high': function () { if (!current().cpu) { chooseAce(false); commit(); } },
    'bet-dec': function () { setBet(ui.bet - 1); },
    'bet-inc': function () { setBet(ui.bet + 1); },
    'bet-set': function (el) {
      var f = +el.getAttribute('data-frac');
      setBet(f === 0 ? 1 : Math.max(1, Math.floor(maxBet() * f)));
    },
    'bet': function (el) {
      if (current().cpu) return;
      placeBet(ui.bet, el.getAttribute('data-call'));
      commit();
    },
    'pass': function () { if (!current().cpu) { placeBet(0); commit(); } },
    'next': function () { nextTurn(); commit(); },

    'ask-end': function () { openModal(); },
    'modal-cancel': function () { closeModal(); pump(); },
    'end': function () { closeModal(); endGame('called'); save(); show('results'); }
  };

  document.addEventListener('click', function (e) {
    var seg = e.target.closest('.segmented .seg');
    if (seg) {
      var group = seg.closest('.segmented');
      var key = group.getAttribute('data-opt'), val = seg.getAttribute('data-val');
      setup.rules[key] = group.hasAttribute('data-num') ? +val : val;
      saveSetup(); renderSetup();
      return;
    }
    var tog = e.target.closest('[data-toggle]');
    if (tog) {
      var k = tog.getAttribute('data-toggle');
      setup.rules[k] = !setup.rules[k];
      saveSetup(); renderSetup();
      return;
    }
    var el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var fn = actions[el.getAttribute('data-action')];
    if (fn) fn(el);
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'bet-range') { ui.bet = +e.target.value; updateBetUI(); }
    if (e.target.classList.contains('pl__name')) {
      var p = setup.players[+e.target.getAttribute('data-index')];
      if (p) { p.name = e.target.value; saveSetup(); }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('modal').hidden) { closeModal(); pump(); return; }
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('pl__name')) {
      e.preventDefault(); actions.start();
    }
  });

  /* ---------- Boot ---------- */
  setup = loadSetup();
  state = load();
  show('home');
})();
