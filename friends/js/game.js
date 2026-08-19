/* =========================================================
   Do You Really Know Your Friends? — game engine
   A pass-and-play party game. Single device, no backend.

   Flow per round:
     handoff(spotlight) -> answer -> for each guesser: handoff -> guess
        -> handoff(spotlight) -> reveal/judge -> scoreboard
   Rounds repeat until every player has been the spotlight
   `roundsPerPlayer` times.
   ========================================================= */
(function () {
  'use strict';

  // ---- Palette used for player avatars (distinct, high-contrast) ----
  var AVATAR_COLORS = [
    '#FFCF5C', '#FF7AC6', '#43D9A3', '#6C9BFF',
    '#FF9E6B', '#A06BFF', '#5CE1E6', '#FF6B7D',
  ];

  // ---- DOM helpers ----
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, className, html) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function initials(name) {
    var parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Deterministic-ish shuffle (Fisher–Yates).
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---- Game state ----
  var state = {
    players: [],          // { id, name, color, score }
    roundsPerPlayer: 2,
    daresOn: false,

    questionQueue: [],    // shuffled indices into QUESTION_BANK
    questionCursor: 0,

    schedule: [],         // ordered list of spotlight player ids across the whole game
    roundIndex: 0,        // index into schedule

    // per-round scratch
    round: null,          // { spotlightId, question, answer, guesses: {playerId: text}, judged: {playerId: bool} }
  };

  var nextPlayerId = 1;

  // =====================================================
  // Screen management
  // =====================================================
  var SCREENS = [
    'home', 'how', 'setup', 'handoff', 'answer', 'guess', 'reveal', 'scores', 'over',
  ];

  function show(screen) {
    SCREENS.forEach(function (s) {
      var node = $('#screen-' + s);
      if (!node) return;
      node.classList.toggle('screen--active', s === screen);
    });
    // Progress bar visible only during active play screens.
    var playing = ['handoff', 'answer', 'guess', 'reveal', 'scores'].indexOf(screen) !== -1;
    var prog = $('#progress');
    prog.hidden = !playing;
    window.scrollTo(0, 0);
  }

  function setProgress() {
    var total = state.schedule.length || 1;
    var pct = Math.min(100, Math.round((state.roundIndex / total) * 100));
    $('#progress-bar').style.width = pct + '%';
  }

  // =====================================================
  // SETUP
  // =====================================================
  function pickColor() {
    var used = state.players.map(function (p) { return p.color; });
    for (var i = 0; i < AVATAR_COLORS.length; i++) {
      if (used.indexOf(AVATAR_COLORS[i]) === -1) return AVATAR_COLORS[i];
    }
    return AVATAR_COLORS[state.players.length % AVATAR_COLORS.length];
  }

  function addPlayer(name) {
    name = name.trim();
    if (!name) return false;
    // Prevent exact duplicate names (case-insensitive) to keep the reveal clear.
    var dupe = state.players.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); });
    if (dupe) { flashInput('That name is already in — try another.'); return false; }
    if (state.players.length >= 8) { flashInput('8 players max for a snappy game.'); return false; }
    state.players.push({ id: nextPlayerId++, name: name, color: pickColor(), score: 0 });
    renderPlayers();
    return true;
  }

  function removePlayer(id) {
    state.players = state.players.filter(function (p) { return p.id !== id; });
    renderPlayers();
  }

  function flashInput(msg) {
    var input = $('#player-name');
    input.value = '';
    input.placeholder = msg;
    input.classList.add('input--warn');
    setTimeout(function () {
      input.placeholder = 'Add a name…';
      input.classList.remove('input--warn');
    }, 1800);
  }

  function renderPlayers() {
    var list = $('#player-list');
    list.innerHTML = '';
    state.players.forEach(function (p) {
      var li = el('li', 'player-chip');
      var av = el('span', 'player-chip__avatar', esc(initials(p.name)));
      av.style.background = p.color;
      var name = el('span', 'player-chip__name', esc(p.name));
      var rm = el('button', 'player-chip__remove', '&times;');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove ' + p.name);
      rm.addEventListener('click', function () { removePlayer(p.id); });
      li.appendChild(av); li.appendChild(name); li.appendChild(rm);
      list.appendChild(li);
    });
    // Enable start when we have at least 3 players.
    $('#start-btn').disabled = state.players.length < 3;
  }

  // =====================================================
  // GAME START
  // =====================================================
  function buildSchedule() {
    // Each "cycle" is a shuffled ordering of all players; repeat for roundsPerPlayer.
    var schedule = [];
    for (var r = 0; r < state.roundsPerPlayer; r++) {
      var order = shuffle(state.players.map(function (p) { return p.id; }));
      // Avoid the same spotlight bridging two cycles back-to-back.
      if (schedule.length && order[0] === schedule[schedule.length - 1]) {
        order.push(order.shift());
      }
      schedule = schedule.concat(order);
    }
    state.schedule = schedule;
  }

  function buildQuestionQueue() {
    var idx = QUESTION_BANK.map(function (_, i) { return i; });
    state.questionQueue = shuffle(idx);
    state.questionCursor = 0;
  }

  function nextQuestion() {
    if (state.questionCursor >= state.questionQueue.length) {
      // Reshuffle if we run out (large games).
      buildQuestionQueue();
    }
    var qi = state.questionQueue[state.questionCursor++];
    return QUESTION_BANK[qi];
  }

  function startGame() {
    if (state.players.length < 3) return;
    state.players.forEach(function (p) { p.score = 0; });
    state.roundIndex = 0;
    buildSchedule();
    buildQuestionQueue();
    beginRound();
  }

  function playerById(id) {
    return state.players.filter(function (p) { return p.id === id; })[0];
  }

  // =====================================================
  // ROUND: spotlight answers
  // =====================================================
  function beginRound() {
    if (state.roundIndex >= state.schedule.length) { endGame(); return; }
    setProgress();

    var spotlightId = state.schedule[state.roundIndex];
    state.round = {
      spotlightId: spotlightId,
      question: nextQuestion(),
      answer: '',
      guessers: state.players.filter(function (p) { return p.id !== spotlightId; }).map(function (p) { return p.id; }),
      guessIndex: 0,
      guesses: {},
      judged: {},
    };

    var sp = playerById(spotlightId);
    handoffTo(sp, "You're in the spotlight!", function () {
      showAnswerScreen();
    });
  }

  function roundMetaText() {
    var cycle = Math.floor(state.roundIndex / state.players.length) + 1;
    return 'Round ' + (state.roundIndex + 1) + ' of ' + state.schedule.length +
           ' • Turn ' + cycle + ' of ' + state.roundsPerPlayer;
  }

  function showAnswerScreen() {
    var sp = playerById(state.round.spotlightId);
    $('#answer-tag').innerHTML = '✨ ' + esc(sp.name) + "'s spotlight";
    $('#answer-round-meta').textContent = roundMetaText();
    $('#answer-question').textContent = state.round.question.me;
    var input = $('#answer-input');
    input.value = '';
    $('#answer-count').textContent = '0';
    $('#answer-submit').disabled = true;
    show('answer');
    setTimeout(function () { input.focus(); }, 250);
  }

  // =====================================================
  // ROUND: guessers guess
  // =====================================================
  function nextGuesser() {
    var r = state.round;
    if (r.guessIndex >= r.guessers.length) {
      // All guesses in — hand back to spotlight for the reveal.
      var sp = playerById(r.spotlightId);
      handoffTo(sp, 'Time to reveal the truth!', function () { showReveal(); });
      return;
    }
    var guesser = playerById(r.guessers[r.guessIndex]);
    handoffTo(guesser, 'Guess the answer!', function () { showGuessScreen(guesser); });
  }

  function showGuessScreen(guesser) {
    var r = state.round;
    var sp = playerById(r.spotlightId);
    $('#guess-tag').innerHTML = '🔮 ' + esc(guesser.name) + ' is guessing';
    $('#guess-round-meta').textContent = 'Guess ' + (r.guessIndex + 1) + ' of ' + r.guessers.length;
    $('#guess-question').textContent = questionForThem(r.question, sp.name);
    $('#guess-prompt').innerHTML = 'What did <strong>' + esc(sp.name) + '</strong> secretly answer?';
    var input = $('#guess-input');
    input.value = '';
    $('#guess-count').textContent = '0';
    $('#guess-submit').disabled = true;
    show('guess');
    setTimeout(function () { input.focus(); }, 250);
  }

  function questionForThem(q, name) {
    return q.them.replace(/\{name\}/g, name);
  }

  // =====================================================
  // ROUND: reveal & judge
  // =====================================================
  function showReveal() {
    var r = state.round;
    var sp = playerById(r.spotlightId);
    $('#reveal-question').textContent = questionForThem(r.question, sp.name);
    $('#truth-label').textContent = sp.name + ' really said…';
    $('#truth-answer').textContent = '“' + r.answer + '”';
    $('#judge-name').textContent = sp.name;

    var list = $('#judge-list');
    list.innerHTML = '';
    r.guessers.forEach(function (gid) {
      var g = playerById(gid);
      var item = el('li', 'judge-item');

      var head = el('div', 'judge-item__head');
      var av = el('span', 'judge-item__avatar', esc(initials(g.name)));
      av.style.background = g.color;
      var who = el('span', 'judge-item__who', esc(g.name));
      var guessText = el('span', 'judge-item__guess', '“' + esc(r.guesses[gid] || '—') + '”');
      head.appendChild(av); head.appendChild(who); head.appendChild(guessText);

      var actions = el('div', 'judge-item__actions');
      var yes = el('button', 'judge-btn', '✓ Right');
      yes.type = 'button'; yes.setAttribute('data-correct', 'yes');
      var no = el('button', 'judge-btn', '✗ Wrong');
      no.type = 'button'; no.setAttribute('data-correct', 'no');

      function setJudge(val) {
        r.judged[gid] = val;
        yes.classList.toggle('is-on', val === true);
        no.classList.toggle('is-on', val === false);
        refreshRevealButton();
      }
      yes.addEventListener('click', function () { setJudge(true); });
      no.addEventListener('click', function () { setJudge(false); });

      actions.appendChild(yes); actions.appendChild(no);
      item.appendChild(head); item.appendChild(actions);
      list.appendChild(item);
    });

    refreshRevealButton();
    show('reveal');
  }

  function refreshRevealButton() {
    var r = state.round;
    var allJudged = r.guessers.every(function (gid) {
      return typeof r.judged[gid] === 'boolean';
    });
    var btn = $('#reveal-next');
    btn.disabled = !allJudged;
    btn.textContent = allJudged ? 'Score it! →' : 'Judge every guess to continue';
  }

  function scoreRound() {
    var r = state.round;
    var correctGuessers = [];
    var wrongGuessers = [];
    r.guessers.forEach(function (gid) {
      if (r.judged[gid] === true) {
        playerById(gid).score += 1;
        correctGuessers.push(gid);
      } else {
        wrongGuessers.push(gid);
      }
    });
    // Bonus: spotlight earns a point if the WHOLE group read them correctly
    // (a nod to being wonderfully predictable / well-known).
    var sweep = correctGuessers.length === r.guessers.length && r.guessers.length > 0;
    if (sweep) playerById(r.spotlightId).score += 1;

    return { correctGuessers: correctGuessers, wrongGuessers: wrongGuessers, sweep: sweep };
  }

  // =====================================================
  // SCOREBOARD interstitial
  // =====================================================
  function showScores(roundResult) {
    var r = state.round;
    var sp = playerById(r.spotlightId);

    $('#scores-title').textContent = 'Scoreboard';
    var sub = '';
    if (roundResult.sweep) {
      sub = 'Clean sweep! Everyone read ' + sp.name + ' perfectly — ' + sp.name + ' scores a bonus point. 🎯';
    } else if (roundResult.correctGuessers.length === 0) {
      sub = 'Nobody guessed ' + sp.name + ' right — full of surprises! 🙃';
    } else {
      sub = roundResult.correctGuessers.length + ' of ' + r.guessers.length +
            ' guessed ' + sp.name + ' right.';
    }
    $('#scores-sub').textContent = sub;

    renderScoreboard('#scoreboard', roundResult);

    // Optional dare for a random wrong guesser.
    maybeShowDare(roundResult);

    var btn = $('#scores-continue');
    var last = state.roundIndex + 1 >= state.schedule.length;
    btn.textContent = last ? 'See who wins →' : 'Next round →';
    show('scores');
  }

  function maybeShowDare(roundResult) {
    // Remove any previous dare node.
    var old = $('#dare-node');
    if (old) old.parentNode.removeChild(old);
    if (!state.daresOn || roundResult.wrongGuessers.length === 0) return;

    var victimId = roundResult.wrongGuessers[Math.floor(Math.random() * roundResult.wrongGuessers.length)];
    var victim = playerById(victimId);
    var dare = DARE_BANK[Math.floor(Math.random() * DARE_BANK.length)];

    var node = el('div', 'dare');
    node.id = 'dare-node';
    node.innerHTML =
      '<div class="dare__label">🌶️ Dare</div>' +
      '<div class="dare__who">' + esc(victim.name) + ', you guessed wrong…</div>' +
      '<div class="dare__text">' + esc(dare) + '</div>';
    var sub = $('#scores-sub');
    sub.parentNode.insertBefore(node, sub.nextSibling);
  }

  function renderScoreboard(sel, roundResult) {
    var container = $(sel);
    container.innerHTML = '';
    var ranked = state.players.slice().sort(function (a, b) { return b.score - a.score; });
    var top = ranked.length ? ranked[0].score : 0;

    ranked.forEach(function (p, i) {
      var row = el('li', 'score-row' + (p.score === top && top > 0 ? ' score-row--lead' : ''));
      row.style.animationDelay = (i * 0.05) + 's';

      var rank = el('span', 'score-row__rank', p.score === top && top > 0 ? '👑' : (i + 1));
      var av = el('span', 'score-row__avatar', esc(initials(p.name)));
      av.style.background = p.color;
      var name = el('span', 'score-row__name', esc(p.name));
      var pts = el('span', 'score-row__pts', p.score + '<span>pts</span>');

      row.appendChild(rank); row.appendChild(av); row.appendChild(name);

      // Show +delta earned this round.
      if (roundResult) {
        var gained = 0;
        if (roundResult.correctGuessers.indexOf(p.id) !== -1) gained = 1;
        if (roundResult.sweep && p.id === state.round.spotlightId) gained = 1;
        if (gained > 0) {
          var delta = el('span', 'score-row__delta', '+' + gained);
          row.appendChild(delta);
        }
      }
      row.appendChild(pts);
      container.appendChild(row);
    });
  }

  // =====================================================
  // GAME OVER
  // =====================================================
  function endGame() {
    setProgress();
    $('#progress-bar').style.width = '100%';

    var ranked = state.players.slice().sort(function (a, b) { return b.score - a.score; });
    var top = ranked[0].score;
    var winners = ranked.filter(function (p) { return p.score === top; });

    var winnerEl = $('#over-winner');
    var subEl = $('#over-sub');
    if (top === 0) {
      winnerEl.textContent = "It's a mystery to everyone!";
      subEl.textContent = 'Nobody scored — you clearly keep each other guessing. 🙈';
    } else if (winners.length === 1) {
      winnerEl.textContent = winners[0].name + ' wins! 🎉';
      subEl.textContent = 'Truly the friend who knows the crew best.';
    } else {
      var names = winners.map(function (w) { return w.name; }).join(' & ');
      winnerEl.textContent = "It's a tie: " + names + '!';
      subEl.textContent = 'Equally plugged into the group. 🤝';
    }

    renderScoreboard('#final-scoreboard', null);
    show('over');
    if (top > 0) confetti();
  }

  // =====================================================
  // Handoff ("pass the phone") gate
  // =====================================================
  var handoffCallback = null;
  function handoffTo(player, role, cb) {
    handoffCallback = cb;
    var av = $('#handoff-avatar');
    av.textContent = initials(player.name);
    av.style.background = player.color;
    $('#handoff-name').textContent = player.name;
    $('#handoff-role').textContent = role;
    show('handoff');
  }

  // =====================================================
  // Confetti (lightweight, no deps)
  // =====================================================
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = AVATAR_COLORS;
    for (var i = 0; i < 90; i++) {
      (function (i) {
        var piece = el('div', 'confetti-piece');
        piece.style.left = Math.random() * 100 + 'vw';
        piece.style.background = colors[i % colors.length];
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        document.body.appendChild(piece);
        var dur = 2200 + Math.random() * 1800;
        var xEnd = (Math.random() - 0.5) * 220;
        var rot = (Math.random() - 0.5) * 900;
        piece.animate([
          { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
          { transform: 'translate(' + xEnd + 'px, 108vh) rotate(' + rot + 'deg)', opacity: 0.9 },
        ], { duration: dur, easing: 'cubic-bezier(0.2,0.6,0.4,1)', delay: Math.random() * 400 });
        setTimeout(function () { if (piece.parentNode) piece.parentNode.removeChild(piece); }, dur + 500);
      })(i);
    }
  }

  // =====================================================
  // Wiring / event listeners
  // =====================================================
  function bindCharCount(inputSel, countSel, submitSel) {
    var input = $(inputSel);
    input.addEventListener('input', function () {
      $(countSel).textContent = input.value.length;
      $(submitSel).disabled = input.value.trim().length === 0;
    });
  }

  function init() {
    // Global data-action buttons.
    $all('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-action');
        handleAction(action);
      });
    });

    // Add-player form.
    $('#add-player-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('#player-name');
      if (addPlayer(input.value)) { input.value = ''; input.focus(); }
    });

    // Rounds stepper.
    $all('[data-stepper="rounds"] .stepper__btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var step = parseInt(b.getAttribute('data-step'), 10);
        state.roundsPerPlayer = Math.max(1, Math.min(5, state.roundsPerPlayer + step));
        $('#rounds-value').textContent = state.roundsPerPlayer;
      });
    });

    // Dares switch.
    $('#dares-switch').addEventListener('click', function () {
      state.daresOn = !state.daresOn;
      this.setAttribute('aria-checked', state.daresOn ? 'true' : 'false');
    });

    // Handoff continue.
    $('#handoff-btn').addEventListener('click', function () {
      var cb = handoffCallback; handoffCallback = null;
      if (cb) cb();
    });

    // Answer submit.
    bindCharCount('#answer-input', '#answer-count', '#answer-submit');
    $('#answer-submit').addEventListener('click', function () {
      var val = $('#answer-input').value.trim();
      if (!val) return;
      state.round.answer = val;
      state.round.guessIndex = 0;
      nextGuesser();
    });

    // Guess submit.
    bindCharCount('#guess-input', '#guess-count', '#guess-submit');
    $('#guess-submit').addEventListener('click', function () {
      var r = state.round;
      var val = $('#guess-input').value.trim();
      if (!val) return;
      var gid = r.guessers[r.guessIndex];
      r.guesses[gid] = val;
      r.guessIndex += 1;
      nextGuesser();
    });

    // Reveal -> score.
    $('#reveal-next').addEventListener('click', function () {
      if ($('#reveal-next').disabled) return;
      var result = scoreRound();
      showScores(result);
    });

    // Scores -> next round / end.
    $('#scores-continue').addEventListener('click', function () {
      state.roundIndex += 1;
      if (state.roundIndex >= state.schedule.length) endGame();
      else beginRound();
    });

    renderPlayers();
    show('home');
  }

  function handleAction(action) {
    switch (action) {
      case 'go-home': show('home'); break;
      case 'go-how': show('how'); break;
      case 'go-setup': show('setup'); break;
      case 'start-game': startGame(); break;
      case 'play-again':
        // Same crew, reset scores.
        startGame();
        break;
      case 'new-crew':
        state.players = [];
        nextPlayerId = 1;
        renderPlayers();
        show('setup');
        break;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
