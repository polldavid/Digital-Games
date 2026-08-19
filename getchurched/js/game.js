/* =========================================================
   Get ChurchED — game engine
   Team-vs-team, one phone, 30-second timer. Three modes:
   Sing / Act / Explain (or Mixed). Most points wins.
   ========================================================= */
(function () {
  'use strict';

  var TEAM_COLORS = ['#F6C453', '#F0616D', '#5AA9F6', '#4BD6A0', '#A06BFF', '#FF9E6B'];

  // ---- DOM helpers ----
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  var TIMER_CIRCUMFERENCE = 2 * Math.PI * 54; // r=54

  // ---- State ----
  var state = {
    teams: [],            // { id, name, color, score }
    mode: 'mixed',        // 'sing' | 'act' | 'explain' | 'mixed'
    seconds: 30,
    roundsPerTeam: 3,
    schedule: [],         // team ids, in turn order
    turnIndex: 0,
    decks: {},            // { sing:{items,cursor}, ... }
    turn: null,           // { teamId, mode, results:[{word,got}], score, endAt, timer }
  };
  var nextTeamId = 1;

  var SCREENS = ['home', 'how', 'setup', 'ready', 'play', 'turn', 'scores', 'over'];
  function show(screen) {
    SCREENS.forEach(function (s) { var n = $('#screen-' + s); if (n) n.classList.toggle('screen--active', s === screen); });
    var playing = ['ready', 'play', 'turn', 'scores'].indexOf(screen) !== -1;
    $('#progress').hidden = !playing;
    window.scrollTo(0, 0);
  }

  function setProgress() {
    var total = state.schedule.length || 1;
    $('#progress-bar').style.width = Math.min(100, Math.round((state.turnIndex / total) * 100)) + '%';
  }

  // =====================================================
  // Setup
  // =====================================================
  function pickTeamColor() {
    var used = state.teams.map(function (t) { return t.color; });
    for (var i = 0; i < TEAM_COLORS.length; i++) if (used.indexOf(TEAM_COLORS[i]) === -1) return TEAM_COLORS[i];
    return TEAM_COLORS[state.teams.length % TEAM_COLORS.length];
  }

  function addTeam(name) {
    name = name.trim();
    if (!name) return false;
    if (state.teams.some(function (t) { return t.name.toLowerCase() === name.toLowerCase(); })) { flashInput('That team name is taken.'); return false; }
    if (state.teams.length >= 6) { flashInput('6 teams max.'); return false; }
    state.teams.push({ id: nextTeamId++, name: name, color: pickTeamColor(), score: 0 });
    renderTeams();
    return true;
  }
  function removeTeam(id) { state.teams = state.teams.filter(function (t) { return t.id !== id; }); renderTeams(); }

  function flashInput(msg) {
    var input = $('#team-name'); input.value = ''; input.placeholder = msg; input.classList.add('input--warn');
    setTimeout(function () { input.placeholder = 'Add a team name…'; input.classList.remove('input--warn'); }, 1800);
  }

  function renderTeams() {
    var list = $('#team-list'); list.innerHTML = '';
    state.teams.forEach(function (t) {
      var li = el('li', 'team-chip');
      var dot = el('span', 'team-chip__dot'); dot.style.background = t.color;
      var name = el('span', 'team-chip__name', esc(t.name));
      var rm = el('button', 'team-chip__remove', '&times;'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + t.name);
      rm.addEventListener('click', function () { removeTeam(t.id); });
      li.appendChild(dot); li.appendChild(name); li.appendChild(rm); list.appendChild(li);
    });
    $('#start-btn').disabled = state.teams.length < 2;
  }

  function renderModePicker() {
    var picker = $('#mode-picker'); picker.innerHTML = '';
    var opts = [
      { key: 'sing', label: MODE_INFO.sing.label, emoji: MODE_INFO.sing.emoji, sub: 'Yellow', color: MODE_INFO.sing.color },
      { key: 'act', label: MODE_INFO.act.label, emoji: MODE_INFO.act.emoji, sub: 'Red', color: MODE_INFO.act.color },
      { key: 'explain', label: MODE_INFO.explain.label, emoji: MODE_INFO.explain.emoji, sub: 'Blue', color: MODE_INFO.explain.color },
      { key: 'mixed', label: 'Mixed', emoji: '🎲', sub: 'A bit of everything', color: '#F6C453' },
    ];
    opts.forEach(function (o) {
      var b = el('button', 'mode-opt' + (state.mode === o.key ? ' is-on' : ''));
      b.type = 'button'; b.style.setProperty('--mode', o.color);
      b.innerHTML = '<div class="mode-opt__top">' + o.emoji + ' ' + esc(o.label) + '</div><div class="mode-opt__sub">' + esc(o.sub) + '</div>';
      b.addEventListener('click', function () {
        state.mode = o.key;
        $all('.mode-opt', picker).forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
      });
      picker.appendChild(b);
    });
  }

  function renderHowCards() {
    var wrap = $('#how-mode-cards'); if (!wrap) return; wrap.innerHTML = '';
    ['sing', 'act', 'explain'].forEach(function (k) {
      var m = MODE_INFO[k];
      var c = el('div', 'mode-card'); c.style.setProperty('--mode', m.color);
      c.innerHTML =
        '<div class="mode-card__emoji">' + m.emoji + '</div>' +
        '<div class="mode-card__body"><div class="mode-card__title">' + esc(m.label) + ' <span>· ' + esc(m.tag) + '</span></div>' +
        '<div class="mode-card__desc">' + esc(m.how) + '</div></div>';
      wrap.appendChild(c);
    });
  }

  // =====================================================
  // Game start
  // =====================================================
  function buildSchedule() {
    var ids = state.teams.map(function (t) { return t.id; });
    var sched = [];
    for (var r = 0; r < state.roundsPerTeam; r++) sched = sched.concat(ids);
    state.schedule = sched;
  }
  function buildDecks() {
    state.decks = {
      sing: { items: shuffle(WORD_BANKS.sing), cursor: 0 },
      act: { items: shuffle(WORD_BANKS.act), cursor: 0 },
      explain: { items: shuffle(WORD_BANKS.explain), cursor: 0 },
    };
  }
  function nextWord(mode) {
    var d = state.decks[mode];
    if (d.cursor >= d.items.length) { d.items = shuffle(d.items); d.cursor = 0; }
    return d.items[d.cursor++];
  }
  function teamById(id) { return state.teams.filter(function (t) { return t.id === id; })[0]; }

  function startGame() {
    if (state.teams.length < 2) return;
    state.teams.forEach(function (t) { t.score = 0; });
    state.turnIndex = 0;
    buildSchedule();
    buildDecks();
    beginTurn();
  }

  function resolveMode() {
    if (state.mode !== 'mixed') return state.mode;
    var pool = ['sing', 'act', 'explain'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // =====================================================
  // Turn: ready screen
  // =====================================================
  function beginTurn() {
    if (state.turnIndex >= state.schedule.length) { endGame(); return; }
    setProgress();
    var teamId = state.schedule[state.turnIndex];
    var mode = resolveMode();
    state.turn = { teamId: teamId, mode: mode, results: [], score: 0, endAt: 0, timer: null, currentWord: null };

    var team = teamById(teamId);
    var m = MODE_INFO[mode];
    var round = Math.floor(state.turnIndex / state.teams.length) + 1;

    var ready = $('#screen-ready');
    ready.style.setProperty('--mode', m.color);
    $('#ready-team').textContent = team.name;
    $('#ready-team').style.color = team.color;
    $('#ready-mode-chip').innerHTML = m.emoji + ' ' + esc(m.label) + ' round';
    $('#ready-how').textContent = m.how;
    $('#ready-meta').textContent = 'Round ' + round + ' of ' + state.roundsPerTeam + ' • ' + state.seconds + ' seconds';

    var warn = {
      sing: 'Whole team can look. Start singing quickly!',
      act: 'One actor holds the phone — no talking! Teammates shout guesses. 🙊',
      explain: 'One describer holds the phone — never say the word! Teammates guess. 🙈',
    }[mode];
    $('#ready-warn').textContent = warn;

    show('ready');
  }

  // =====================================================
  // Turn: play
  // =====================================================
  function startPlay() {
    var t = state.turn;
    var m = MODE_INFO[t.mode];
    var play = $('#screen-play');
    play.style.setProperty('--mode', m.color);
    $('#play-team').textContent = teamById(t.teamId).name;
    $('#play-mode-chip').innerHTML = m.emoji + ' ' + esc(m.label);
    $('#turn-score').textContent = '0';
    $('#word-hint').textContent = { sing: 'Sing a song with…', act: 'Act this out…', explain: 'Describe this…' }[t.mode];

    var timerEl = $('#timer');
    timerEl.classList.remove('is-low');
    $('#timer-progress').style.strokeDasharray = TIMER_CIRCUMFERENCE;
    $('#timer-progress').style.strokeDashoffset = '0';

    show('play');
    drawWord();

    t.endAt = Date.now() + state.seconds * 1000;
    updateTimer();
    t.timer = setInterval(updateTimer, 100);
  }

  function drawWord() {
    var t = state.turn;
    t.currentWord = nextWord(t.mode);
    var wt = $('#word-text');
    wt.textContent = t.currentWord;
    var card = $('#word-card');
    card.classList.remove('pulse'); void card.offsetWidth; card.classList.add('pulse');
  }

  function updateTimer() {
    var t = state.turn;
    var remainingMs = Math.max(0, t.endAt - Date.now());
    var remaining = Math.ceil(remainingMs / 1000);
    $('#timer-num').textContent = remaining;
    var frac = remainingMs / (state.seconds * 1000); // 1 -> 0
    $('#timer-progress').style.strokeDashoffset = (TIMER_CIRCUMFERENCE * (1 - frac)).toFixed(2);
    $('#timer').classList.toggle('is-low', remaining <= 5);
    if (remainingMs <= 0) endTurn();
  }

  function recordResult(got) {
    var t = state.turn;
    if (!t || t.endAt === 0) return;
    if (Date.now() >= t.endAt) { endTurn(); return; }
    t.results.push({ word: t.currentWord, got: got });
    if (got) { t.score += 1; $('#turn-score').textContent = t.score; }
    drawWord();
  }

  function endTurn() {
    var t = state.turn;
    if (t.timer) { clearInterval(t.timer); t.timer = null; }
    if (t.endAt === 0) return; // already ended
    t.endAt = 0;
    teamById(t.teamId).score += t.score;
    showTurnSummary();
  }

  // =====================================================
  // Turn summary
  // =====================================================
  function showTurnSummary() {
    var t = state.turn;
    var team = teamById(t.teamId);
    var m = MODE_INFO[t.mode];
    var got = t.results.filter(function (r) { return r.got; }).length;

    $('#turn-emoji').textContent = got >= 8 ? '🔥' : got >= 4 ? '🎉' : got >= 1 ? '👏' : '😅';
    $('#turn-title').textContent = team.name + ' scored ' + got + (got === 1 ? ' point!' : ' points!');
    $('#turn-title').style.color = team.color;
    $('#turn-sub').textContent = got === 0 ? 'A tricky round — shake it off!' : m.label + ' round complete. Nicely done!';

    var recap = $('#turn-recap'); recap.innerHTML = '';
    if (t.results.length === 0) {
      recap.appendChild(el('li', '', '<span class="rc-word">No words this turn.</span>'));
    } else {
      t.results.forEach(function (r) {
        var li = el('li', r.got ? '' : 'is-skip');
        li.innerHTML = '<span class="' + (r.got ? 'rc-got' : 'rc-skip') + '">' + (r.got ? '✓' : '–') + '</span><span class="rc-word">' + esc(r.word) + '</span>';
        recap.appendChild(li);
      });
    }
    show('turn');
  }

  function advanceAfterTurn() {
    state.turnIndex += 1;
    setProgress();
    if (state.turnIndex >= state.schedule.length) { endGame(); return; }
    // End of a full round → show scoreboard interstitial.
    if (state.turnIndex % state.teams.length === 0) showScores();
    else beginTurn();
  }

  // =====================================================
  // Scoreboard
  // =====================================================
  function showScores() {
    var round = state.turnIndex / state.teams.length;
    $('#scores-title').textContent = 'After round ' + round;
    var leader = state.teams.slice().sort(function (a, b) { return b.score - a.score; })[0];
    $('#scores-sub').textContent = leader && leader.score > 0 ? leader.name + ' leads with ' + leader.score + '!' : 'All square — game on!';
    renderScoreboard('#scoreboard');
    show('scores');
  }

  function renderScoreboard(sel) {
    var container = $(sel); container.innerHTML = '';
    var ranked = state.teams.slice().sort(function (a, b) { return b.score - a.score; });
    var top = ranked.length ? ranked[0].score : 0;
    ranked.forEach(function (t, i) {
      var row = el('li', 'score-row' + (t.score === top && top > 0 ? ' score-row--lead' : ''));
      row.style.animationDelay = (i * 0.05) + 's';
      var rank = el('span', 'score-row__rank', t.score === top && top > 0 ? '👑' : (i + 1));
      var dot = el('span', 'score-row__dot'); dot.style.background = t.color;
      var name = el('span', 'score-row__name', esc(t.name));
      var pts = el('span', 'score-row__pts', t.score + '<span>pts</span>');
      row.appendChild(rank); row.appendChild(dot); row.appendChild(name); row.appendChild(pts);
      container.appendChild(row);
    });
  }

  // =====================================================
  // Game over
  // =====================================================
  function endGame() {
    $('#progress-bar').style.width = '100%';
    var ranked = state.teams.slice().sort(function (a, b) { return b.score - a.score; });
    var top = ranked[0].score;
    var winners = ranked.filter(function (t) { return t.score === top; });

    if (top === 0) {
      $('#over-winner').textContent = 'A holy stalemate!';
      $('#over-sub').textContent = 'Nobody scored — rematch and redeem yourselves. 😇';
    } else if (winners.length === 1) {
      $('#over-winner').textContent = winners[0].name + ' wins! 🎉';
      $('#over-winner').style.color = winners[0].color;
      $('#over-sub').textContent = 'Blessed and highly favored on the scoreboard.';
    } else {
      $('#over-winner').textContent = "It's a tie: " + winners.map(function (w) { return w.name; }).join(' & ') + '!';
      $('#over-sub').textContent = 'Equally anointed. 🤝';
    }
    renderScoreboard('#final-scoreboard');
    show('over');
    if (top > 0) confetti();
  }

  // =====================================================
  // Confetti
  // =====================================================
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (var i = 0; i < 90; i++) {
      (function (i) {
        var p = el('div', 'confetti-piece');
        p.style.left = Math.random() * 100 + 'vw';
        p.style.background = TEAM_COLORS[i % TEAM_COLORS.length];
        p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        document.body.appendChild(p);
        var dur = 2200 + Math.random() * 1800;
        p.animate([
          { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
          { transform: 'translate(' + ((Math.random() - 0.5) * 220) + 'px, 108vh) rotate(' + ((Math.random() - 0.5) * 900) + 'deg)', opacity: 0.9 },
        ], { duration: dur, easing: 'cubic-bezier(0.2,0.6,0.4,1)', delay: Math.random() * 400 });
        setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, dur + 500);
      })(i);
    }
  }

  // =====================================================
  // Wiring
  // =====================================================
  function init() {
    $all('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleAction(btn.getAttribute('data-action')); });
    });

    $('#add-team-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('#team-name');
      if (addTeam(input.value)) { input.value = ''; input.focus(); }
    });

    // Seconds segmented control.
    $all('#seg-seconds .seg').forEach(function (b) {
      b.addEventListener('click', function () {
        state.seconds = parseInt(b.getAttribute('data-seconds'), 10);
        $all('#seg-seconds .seg').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
      });
    });

    // Rounds stepper.
    $all('[data-stepper="rounds"] .stepper__btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.roundsPerTeam = Math.max(1, Math.min(6, state.roundsPerTeam + parseInt(b.getAttribute('data-step'), 10)));
        $('#rounds-value').textContent = state.roundsPerTeam;
      });
    });

    $('#ready-start').addEventListener('click', startPlay);
    $('#btn-correct').addEventListener('click', function () { recordResult(true); });
    $('#btn-skip').addEventListener('click', function () { recordResult(false); });
    $('#turn-continue').addEventListener('click', advanceAfterTurn);
    $('#scores-continue').addEventListener('click', beginTurn);

    // Keyboard convenience (desktop testing): space = got, s = skip.
    document.addEventListener('keydown', function (e) {
      if (!$('#screen-play').classList.contains('screen--active')) return;
      if (e.code === 'Space') { e.preventDefault(); recordResult(true); }
      else if (e.key === 's' || e.key === 'S') { recordResult(false); }
    });

    // Defaults on the segmented + mode picker.
    $all('#seg-seconds .seg').forEach(function (b) { if (parseInt(b.getAttribute('data-seconds'), 10) === state.seconds) b.classList.add('is-on'); });
    renderModePicker();
    renderHowCards();
    renderTeams();
    show('home');
  }

  function handleAction(action) {
    switch (action) {
      case 'go-home': show('home'); break;
      case 'go-how': show('how'); break;
      case 'go-setup': show('setup'); break;
      case 'start-game': startGame(); break;
      case 'play-again': startGame(); break;
      case 'new-teams': state.teams = []; nextTeamId = 1; renderTeams(); show('setup'); break;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
