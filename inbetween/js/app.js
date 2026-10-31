/* =========================================================
   In-Between — UI.

   Two ways to play, one table renderer:
     • local  — pass-and-play on this device. The engine runs
                here; computer players move on timers; the game
                is saved to localStorage.
     • online — everyone on their own device. The server
                (/api/room) runs the engine and owns the deck;
                this page polls for the room, renders it, and
                sends moves. Computer players, finished hands and
                turn timers advance via "tick" calls when due.

   `state` is always the engine state being shown (local game
   or the online room's game); render() doesn't care which.
   ========================================================= */
(function () {
  'use strict';

  var R = window.InBetween;
  var E = window.InBetweenEngine;
  var STORE_KEY = 'dg-inbetween-v2';
  var SETUP_KEY = 'dg-inbetween-setup';
  var ONLINE_KEY = 'dg-inbetween-online';
  var NAME_KEY = 'dg-inbetween-name';
  var API = '../api/room';
  var MIN_PLAYERS = 2, MAX_PLAYERS = 8;

  /* The house rules, described once and rendered in both setup and the lobby. */
  var RULE_SPEC = [
    { group: 'Table stakes' },
    { key: 'startChips', label: 'Starting chips', opts: [[50, '50'], [100, '100'], [250, '250']] },
    { key: 'ante', label: 'Ante', opts: [[1, '1'], [2, '2'], [5, '5']] },
    { key: 'postMult', label: 'Hit the post', opts: [[2, 'Pay 2×'], [1, 'Pay 1×']] },
    { key: 'pairs', label: 'On a pair', opts: [['hilo', 'Hi / Lo'], ['pass', 'Pass']] },
    { key: 'turnTimer', label: 'Turn timer', online: true, opts: [[0, 'Off'], [30, '30s'], [60, '60s'], [90, '90s']] },
    { group: 'House rules' },
    { key: 'aceChoice', toggle: true, title: 'Call the first Ace', desc: 'Low or high. Off: Aces are always high.' },
    { key: 'firstLapCap', toggle: true, title: 'No pot on the first lap', desc: 'After an ante, nobody may bet the whole pot until everyone’s had a turn.' },
    { key: 'lapAnte', toggle: true, title: 'Ante every lap', desc: 'Everyone antes again each time play goes round — the pot grows and games move faster.' },
    { key: 'allowPass', toggle: true, title: 'Allow passing', desc: 'Off: you must bet at least 1 chip.' },
    { key: 'showOdds', toggle: true, title: 'Show the odds', desc: 'Counted from the cards still in the deck.' }
  ];

  var mode = 'local';            // 'local' | 'online'
  var state = null;              // engine state being shown
  var localGame = null;          // the saved same-device game
  var setup = null;              // same-device setup form
  var screen = 'home';
  var ui = { bet: null, lastBet: null, lastPot: null, seen: null, notice: null };
  var timers = [];               // local computer-player timers
  var online = {
    available: false, storage: false,
    room: null, you: null, code: null,
    pollT: null, tickT: null, clockT: null, polling: false,
    offset: 0, busy: false, failures: 0, myTurnKey: null, invite: null
  };

  /* ---------- Helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  var signed = E.signed;
  function pct(n, total) { return total ? Math.round((n / total) * 100) : 0; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function getLS(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function setLS(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function current() { return E.current(state); }

  /** Can the person holding this device act on the current hand? */
  function canAct() {
    if (!state || state.over) return false;
    if (mode === 'local') return !current().cpu;
    return !!online.you && current().id === online.you.id;
  }
  function isHost() { return mode === 'online' && online.room && online.you && online.room.hostId === online.you.id; }
  function isMe(p) { return mode === 'online' && online.you && p.id === online.you.id; }

  /* =========================================================
     LOCAL (same-device) DRIVER
     ========================================================= */
  function saveLocal() { setLS(STORE_KEY, localGame); }
  function loadLocal() {
    var s = getLS(STORE_KEY);
    return s && s.v === 2 && s.players && s.hand ? s : null;
  }
  function loadSetup() {
    var s = getLS(SETUP_KEY);
    if (s && Array.isArray(s.players) && s.players.length >= MIN_PLAYERS) {
      s.rules = Object.assign({}, E.DEFAULT_RULES, s.rules || {});
      return s;
    }
    return { players: [{ name: '', cpu: false }, { name: '', cpu: true }], rules: copy(E.DEFAULT_RULES) };
  }
  function saveSetup() { setLS(SETUP_KEY, setup); }

  function startLocal(roster, rules) {
    if (mode === 'online') leaveOnlineQuietly();
    mode = 'local';
    localGame = E.create(roster, rules);
    state = localGame;
    ui.lastBet = null; ui.lastPot = null; ui.seen = null; ui.notice = localGame.notice ? localGame.notice.n : null;
    saveLocal();
    show('table');
  }

  function commitLocal() {
    saveLocal();
    if (state.over) return show('results');
    render();
    pump();
  }

  function pump() {
    clearTimers();
    if (mode !== 'local' || !state || state.over || screen !== 'table') return;
    var h = state.hand, p = current();
    var slow = reducedMotion() ? 0.6 : 1;
    if (h.phase === 'done') {
      if (p.cpu) later(2300 * slow, function () { E.nextTurn(state); commitLocal(); });
      return;
    }
    if (!p.cpu) return;
    later((h.phase === 'ace' ? 900 : 1400) * slow, function () { E.botMove(state); commitLocal(); });
  }

  var local = {
    ace: function (low) { E.chooseAce(state, low); commitLocal(); },
    bet: function (amount, call) { if (E.placeBet(state, amount, call)) { ui.lastBet = amount; } commitLocal(); },
    pass: function () { E.placeBet(state, 0); commitLocal(); },
    next: function () { E.nextTurn(state); commitLocal(); },
    end: function () { E.endGame(state, 'called'); saveLocal(); show('results'); }
  };

  /* =========================================================
     ONLINE DRIVER
     ========================================================= */
  function api(method, data) {
    var url = API, opt = { method: method, headers: {}, cache: 'no-store' };
    if (method === 'GET') url += '?' + new URLSearchParams(data).toString();
    else { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(data); }
    return fetch(url, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'The server said no (' + r.status + ').'); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  function checkOnline() {
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 5000);
    return fetch(API + '?ping=1', { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { online.available = !!(j && j.ok); online.storage = !!(j && j.storage); })
      .catch(function () { online.available = false; })
      .then(function () { clearTimeout(t); if (screen === 'home') renderHome(); });
  }

  function saveCreds() {
    if (online.code && online.you) setLS(ONLINE_KEY, { code: online.code, id: online.you.id, token: online.you.token });
  }
  function setRoomInUrl(code) {
    try {
      var u = new URL(location.href);
      if (code) u.searchParams.set('room', code); else u.searchParams.delete('room');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) {}
  }
  function inviteLink() {
    var u = new URL(location.href);
    u.search = '?room=' + online.code; u.hash = '';
    return u.toString();
  }

  /** Send a move; the server answers with the fresh room. */
  function send(action, extra, quiet) {
    if (!online.code || !online.you) return Promise.resolve();
    if (online.busy && !quiet) return Promise.resolve();
    if (!quiet) online.busy = true;
    var body = Object.assign({ action: action, code: online.code, id: online.you.id, token: online.you.token }, extra || {});
    return api('POST', body).then(function (v) { applyView(v); })
      .catch(function (e) {
        if (e.status === 403 || e.status === 404) return kicked(e.message);
        if (!quiet) toast('⚠︎ ' + e.message);
        else scheduleTick(1500);
      })
      .then(function () { if (!quiet) { online.busy = false; if (screen === 'table') render(); } });
  }

  function enterRoom(v) {
    mode = 'online';
    clearTimers();
    online.room = null;
    online.code = v.code;
    online.you = v.you;
    online.myTurnKey = null;
    ui.seen = null; ui.lastPot = null; ui.bet = null;
    ui.notice = v.game && v.game.notice ? v.game.notice.n : null;
    saveCreds();
    setRoomInUrl(v.code);
    applyView(v);
    startPolling();
  }

  function applyView(v) {
    if (!v || !v.code || v.code !== online.code) return;
    if (online.room && v.rev < online.room.rev) return; // stale answer
    online.offset = v.now - Date.now();
    online.failures = 0;
    $('net').hidden = true;
    if (v.you) { online.you = v.you; saveCreds(); }
    if (!online.you || !v.members.some(function (m) { return m.id === online.you.id; })) {
      return kicked('You’re no longer seated at that table.');
    }
    online.room = v;
    if (mode !== 'online') return;
    state = v.game;
    var target = v.status === 'lobby' ? 'lobby' : v.status === 'playing' ? 'table' : 'results';
    if (screen !== target) show(target);
    else if (target === 'table') render();
    else if (target === 'lobby') renderLobby();
    else renderResults();
    notifyMyTurn();
    scheduleTick();
  }

  function startPolling() {
    stopPolling();
    online.polling = true;
    loop();
    online.clockT = setInterval(updateCountdown, 500);
    function loop() {
      online.pollT = setTimeout(function () {
        poll().then(function () { if (online.polling) loop(); });
      }, document.hidden ? 4000 : 1200);
    }
  }
  function stopPolling() {
    online.polling = false;
    clearTimeout(online.pollT); clearTimeout(online.tickT); clearInterval(online.clockT);
  }
  function poll() {
    if (!online.code) return Promise.resolve();
    var q = { code: online.code };
    if (online.room) q.rev = online.room.rev;
    return api('GET', q).then(function (v) {
      if (v.same) { online.offset = v.now - Date.now(); online.failures = 0; $('net').hidden = true; return; }
      v.code = v.code || online.code;
      applyView(v);
    }).catch(function (e) {
      if (e.status === 404) return kicked('That room has closed.');
      online.failures++;
      if (online.failures >= 3) $('net').hidden = false;
    });
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && online.polling) { clearTimeout(online.pollT); startPolling(); }
  });

  /** Ask the server to advance bots / timers / finished hands when they fall due.
      The host asks first; everyone else only if the host seems to be away. */
  function scheduleTick(minWait) {
    clearTimeout(online.tickT);
    var room = online.room;
    if (!room || room.status !== 'playing' || !room.game) return;
    var g = room.game, due = E.nextDue(g, g.changedAt || 0);
    if (!due) return;
    var serverNow = Date.now() + online.offset;
    var wait = due.at - serverNow + (isHost() ? 120 : 2500 + Math.random() * 2000);
    online.tickT = setTimeout(function () { send('tick', {}, true); }, Math.max(minWait || 200, wait));
  }

  function notifyMyTurn() {
    var g = online.room && online.room.game;
    var mine = online.room.status === 'playing' && g && !g.over && g.hand.phase !== 'done' && E.current(g).id === online.you.id;
    var key = mine ? g.hand.id + ':' + g.hand.phase : null;
    if (mine && key !== online.myTurnKey && (!online.myTurnKey || online.myTurnKey.split(':')[0] !== String(g.hand.id))) {
      toast('🫵 Your turn!');
      try { if (navigator.vibrate) navigator.vibrate([60, 40, 60]); } catch (e) {}
    }
    online.myTurnKey = key;
    document.title = mine ? '▶ Your turn — In-Between' : 'In-Between';
  }

  function updateCountdown() {
    var el = $('countdown');
    if (!el || mode !== 'online' || !state || !online.room) return;
    var due = E.nextDue(state, state.changedAt || 0);
    if (!due || due.kind !== 'timeout') { el.textContent = ''; return; }
    var left = Math.max(0, Math.ceil((due.at - (Date.now() + online.offset)) / 1000));
    el.textContent = left + 's';
    el.classList.toggle('countdown--low', left <= 10);
  }

  function kicked(msg) {
    leaveOnlineQuietly();
    toast(msg);
    show('home');
  }
  function leaveOnlineQuietly() {
    stopPolling();
    if (mode === 'online') { state = null; }
    online.room = null; online.you = null; online.code = null; online.myTurnKey = null;
    setLS(ONLINE_KEY, null);
    setRoomInUrl(null);
    document.title = 'In-Between';
    mode = 'local';
    state = localGame;
  }

  function rejoin(code, creds) {
    online.code = code;
    online.you = creds;
    return api('POST', { action: 'join', code: code, id: creds.id, token: creds.token })
      .then(function (v) { enterRoom(Object.assign(v, { you: v.you || creds })); })
      .catch(function (e) {
        online.code = null; online.you = null;
        setLS(ONLINE_KEY, null);
        throw e;
      });
  }

  var net = {
    ace: function (low) { send('ace', { low: low }); },
    bet: function (amount, call) { ui.lastBet = amount; send('bet', { amount: amount, call: call }); },
    pass: function () { send('pass'); },
    next: function () { send('next'); },
    end: function () { send('end'); }
  };
  function driver() { return mode === 'online' ? net : local; }

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
    if (name === 'online') renderOnlineForm();
    if (name === 'lobby') renderLobby();
    if (name === 'table') { render(); pump(); }
    if (name === 'results') renderResults();
    window.scrollTo(0, 0);
  }

  /* ---------- Home ---------- */
  function renderHome() {
    var live = localGame && !localGame.over;
    var creds = getLS(ONLINE_KEY);
    $('resume-card').hidden = !live;
    if (live) {
      var names = E.active(localGame).map(function (p) { return p.name; });
      $('resume-meta').textContent = 'Hand ' + localGame.handNo + ' · pot ' + localGame.pot + ' · ' + names.join(', ');
    }
    $('rejoin-card').hidden = !(creds && creds.code && online.available);
    if (creds && creds.code) $('rejoin-meta').textContent = 'You have a seat in room ' + creds.code + '.';
    $('online-btn').hidden = !online.available;
    $('local-btn').className = 'btn btn--lg ' + (online.available ? 'btn--ghost' : 'btn--primary');
    var note = $('online-note');
    note.hidden = !(online.available && !online.storage);
    note.textContent = 'Online rooms need a database on the server — see the README to connect Upstash Redis on Vercel.';
  }

  /* ---------- Rules (setup + lobby) ---------- */
  function rulesHTML(rules, opts) {
    var dis = opts.editable ? '' : ' disabled';
    return RULE_SPEC.filter(function (r) { return !r.online || opts.online; }).map(function (r) {
      if (r.group) return '<h3 class="panel__h3">' + r.group + '</h3>';
      if (r.toggle) {
        return '<button class="toggle" data-toggle="' + r.key + '" aria-pressed="' + !!rules[r.key] + '"' + dis + '>' +
          '<span class="toggle__text"><strong>' + r.title + '</strong><em>' + r.desc + '</em></span>' +
          '<span class="toggle__switch" aria-hidden="true"></span></button>';
      }
      return '<div class="field"><span class="field__label">' + r.label + '</span><div class="segmented" data-opt="' + r.key + '">' +
        r.opts.map(function (o) {
          var on = rules[r.key] === o[0];
          return '<button class="seg' + (on ? ' seg--on' : '') + '" data-val="' + esc(JSON.stringify(o[0])) + '" aria-pressed="' + on + '"' + dis + '>' + o[1] + '</button>';
        }).join('') + '</div></div>';
    }).join('').replace(/(<button class="toggle"[\s\S]*?<\/button>)+/, function (m) { return '<div class="toggles">' + m + '</div>'; });
  }

  /* ---------- Setup (same device) ---------- */
  function placeholderFor(i) {
    var p = setup.players[i], n = 0, j;
    if (p.cpu) {
      for (j = 0; j < i; j++) if (setup.players[j].cpu) n++;
      return E.CPU_NAMES[n % E.CPU_NAMES.length];
    }
    for (j = 0; j <= i; j++) if (!setup.players[j].cpu) n++;
    return 'Player ' + n;
  }

  function renderSetup() {
    $('player-list').innerHTML = setup.players.map(function (p, i) {
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
    $('setup-rules').innerHTML = rulesHTML(setup.rules, { editable: true, online: false });
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

  /* ---------- Online: create / join ---------- */
  function renderOnlineForm() {
    var inv = online.invite;
    $('online-title').textContent = inv ? 'Join room ' + inv : 'Play online';
    $('online-sub').textContent = inv
      ? 'You’ve been invited to a table. Pop your name in and take a seat.'
      : 'Everyone on their own phone or laptop — perfect for a video call. Start a room and share the link, or join with a code.';
    $('online-create').hidden = !!inv;
    $('on-code').value = inv || $('on-code').value;
    $('on-join-btn').className = 'btn ' + (inv ? 'btn--primary' : 'btn--ghost');
    if (!$('on-name').value) $('on-name').value = getLS(NAME_KEY) || '';
    $('online-error').hidden = true;
    setTimeout(function () { var n = $('on-name'); if (!n.value) n.focus(); }, 50);
  }
  function onlineError(msg) { var e = $('online-error'); e.textContent = msg; e.hidden = false; }
  function onlineName() {
    var n = $('on-name').value.trim();
    if (!n) { onlineError('Pop your name in first.'); $('on-name').focus(); return null; }
    setLS(NAME_KEY, n);
    return n;
  }
  function withBusy(btn, p) {
    btn.disabled = true;
    return p.then(function (v) { btn.disabled = false; return v; }, function (e) { btn.disabled = false; throw e; });
  }

  /* ---------- Online: lobby ---------- */
  function renderLobby() {
    var room = online.room;
    if (!room) return;
    var host = isHost();
    $('lobby-code').textContent = room.code;
    $('lobby-count').textContent = 'At the table (' + room.members.length + '/' + MAX_PLAYERS + ')';
    $('lobby-members').innerHTML = room.members.map(function (m, i) {
      var me = m.id === online.you.id, isH = m.id === room.hostId;
      return '<li class="pl pl--static' + (m.cpu ? ' pl--cpu' : '') + (me ? ' pl--me' : '') + '">' +
        '<span class="pl__seat">' + (i + 1) + '</span>' +
        '<span class="pl__label">' + (m.cpu ? '🤖 ' : '') + esc(m.name) +
          (me ? ' <em>you</em>' : '') + (isH ? ' <em class="crown" title="Host">👑 host</em>' : '') + '</span>' +
        (host && !me ? '<button class="pl__remove" data-action="lobby-remove" data-id="' + esc(m.id) + '" aria-label="Remove ' + esc(m.name) + '">×</button>' : '') +
      '</li>';
    }).join('');
    document.querySelectorAll('#screen-lobby .host-only').forEach(function (b) { b.hidden = !host; });
    document.querySelector('[data-action="lobby-add-bot"]').disabled = room.members.length >= MAX_PLAYERS;
    $('lobby-start').disabled = room.members.length < 2;
    $('lobby-start').textContent = room.members.length < 2 ? 'Waiting for players…' : 'Deal the cards (' + room.members.length + ' players)';
    $('lobby-rules').innerHTML = rulesHTML(room.rules, { editable: host, online: true });
    var hostM = room.members.find(function (m) { return m.id === room.hostId; });
    var wait = $('lobby-wait');
    wait.hidden = host;
    wait.innerHTML = '<span class="dots"><i></i><i></i><i></i></span> Waiting for ' + esc(hostM ? hostM.name : 'the host') + ' to deal…';
    if (!navigator.share) document.querySelector('[data-action="share-link"]').hidden = true;
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

    // What's new since the last render? (drives the deal / flip animations)
    var seen = ui.seen, anim = { a: false, b: false, flip: false };
    if (!seen || seen.id !== h.id) { anim.a = true; anim.b = !!h.b; ui.bet = null; }
    else { anim.b = !!h.b && !seen.b; anim.flip = !!h.third && !seen.third; }
    ui.seen = { id: h.id, b: !!h.b, third: !!h.third };
    if (state.notice && ui.notice !== state.notice.n) {
      if (ui.notice !== null) toast(state.notice.text);
      ui.notice = state.notice.n;
    }

    // Top bar + pot
    $('tbar-meta').innerHTML = (mode === 'online' ? '<strong>Room ' + esc(online.code) + ' · Hand ' + state.handNo + '</strong>' : '<strong>Hand ' + state.handNo + '</strong>') +
      '<span>' + state.deck.length + ' cards in the deck</span>';
    $('end-btn').hidden = mode === 'online' && !isHost();
    $('pot-value').textContent = state.pot;
    var pot = $('pot');
    if (ui.lastPot !== null && ui.lastPot !== state.pot) {
      pot.classList.remove('pot--up', 'pot--down');
      void pot.offsetWidth;
      pot.classList.add(state.pot > ui.lastPot ? 'pot--up' : 'pot--down');
    }
    ui.lastPot = state.pot;

    // Seats
    $('seats').innerHTML = state.players.filter(function (pl) { return !pl.left || pl.chips > 0; }).map(function (pl) {
      var isTurn = pl === p;
      var delta = isTurn && h.phase === 'done' && h.delta ? '<span class="seat__delta ' + (h.delta > 0 ? 'is-up' : 'is-down') + '">' + signed(h.delta) + '</span>' : '';
      return '<li class="seat' + (isTurn ? ' seat--turn' : '') + (pl.out ? ' seat--out' : '') + (isMe(pl) ? ' seat--me' : '') + '">' +
        '<span class="seat__avatar" aria-hidden="true">' + (pl.cpu ? '🤖' : esc(pl.name.charAt(0).toUpperCase())) + '</span>' +
        '<span class="seat__name">' + esc(pl.name) + (isMe(pl) ? ' (you)' : '') + '</span>' +
        '<span class="seat__chips">' + (pl.left ? 'left' : pl.out ? 'out' : pl.chips) + '</span>' + delta +
      '</li>';
    }).join('');
    var turnSeat = $('seats').querySelector('.seat--turn');
    if (turnSeat && turnSeat.scrollIntoView) {
      try { turnSeat.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (e) {}
    }

    // Turn label
    var mine = mode === 'online' && isMe(p);
    var timer = mode === 'online' && !p.cpu && h.phase !== 'done' && state.rules.turnTimer > 0 ? ' <span class="countdown" id="countdown"></span>' : '';
    $('turn-label').innerHTML = mine
      ? '<strong class="felt__you">Your turn</strong> <span class="felt__chips">· ' + p.chips + ' chips</span>' + timer
      : (p.cpu ? '🤖 ' : '') + '<strong>' + esc(p.name) + '</strong>’s turn' +
        (p.cpu ? '' : ' <span class="felt__chips">· ' + p.chips + ' chips</span>') + timer;

    // Posts
    var hit = h.outcome === 'post' ? R.rankOf(h.third) : null;
    var aCls = (anim.a ? 'deal' : '') + (hit && R.rankOf(h.a) === hit ? ' card--hit' : '');
    var bCls = (anim.b ? 'deal deal--2' : '') + (hit && h.b && R.rankOf(h.b) === hit ? ' card--hit' : '');
    var aceTag = R.rankOf(h.a) === 'A' && h.aceLow !== null && state.rules.aceChoice
      ? '<span class="slot__tag">' + (h.aceLow ? 'Low · 1' : 'High · 14') + '</span>' : '';
    var middle;
    if (h.third) {
      var midCls = 'card--third card--' + h.outcome;
      middle = anim.flip && !reducedMotion()
        ? '<div class="flip ' + midCls + '"><div class="flip__inner">' + backHTML('flip__back') + cardHTML(h.third, 'flip__front') + '</div></div>'
        : cardHTML(h.third, midCls);
    } else if (h.phase === 'bet') {
      middle = backHTML('card--waiting' + (anim.b ? ' deal deal--3' : ''));
    } else {
      middle = emptyHTML();
    }
    $('posts').innerHTML =
      '<div class="slot">' + cardHTML(h.a, aCls) + aceTag + '</div>' +
      '<div class="slot slot--mid">' + middle + '</div>' +
      '<div class="slot">' + (h.b ? cardHTML(h.b, bCls) : emptyHTML()) + '</div>';
    $('felt').className = 'felt' + (anim.flip && h.outcome === 'post' ? ' felt--post' : '') + (anim.flip && h.outcome === 'win' ? ' felt--win' : '') + (mine && h.phase !== 'done' ? ' felt--mine' : '');

    // Spread label
    var spread = '';
    if (h.phase === 'ace') spread = 'An Ace! Call it low or high before the second card.';
    else if (info && info.type === 'consecutive') spread = 'Consecutive — nothing fits in between.';
    else if (info && info.type === 'pair') spread = 'A pair — will the next card be higher or lower?';
    else if (info) spread = info.gap + ' rank' + (info.gap === 1 ? '' : 's') + ' in between';
    $('spread-label').textContent = spread;

    renderControls(info, anim);
    renderLog();
    updateCountdown();
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

  function renderControls(info, anim) {
    var el = $('controls'), h = state.hand, p = current();

    if (h.phase === 'done') {
      el.innerHTML = resultHTML(info, anim.flip) + nextHTML();
      return;
    }
    if (!canAct()) {
      var what = h.phase === 'ace' ? 'calling the Ace' : 'sizing up the bet';
      var who = p.cpu ? '🤖 ' + esc(p.name) + ' is ' + what : 'Waiting for ' + esc(p.name) + ' to ' + (h.phase === 'ace' ? 'call the Ace' : 'bet');
      el.innerHTML = '<div class="thinking"><span>' + who + '</span><span class="dots"><i></i><i></i><i></i></span></div>' +
        (isHost() && !p.cpu ? '<button class="btn btn--link btn--block" data-action="skip">Skip ' + esc(p.name) + '’s turn</button>' : '');
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
    var max = E.maxBet(state);
    if (ui.bet === null) ui.bet = clamp(ui.lastBet || state.rules.ante, 1, Math.max(1, max));
    ui.bet = clamp(ui.bet, 1, Math.max(1, max));
    var isPair = info.type === 'pair';
    var mult = R.postMultiplier(info, state.rules);
    var oddsHTML = '';
    if (state.rules.showOdds) {
      if (isPair) {
        oddsHTML = oddsBar(R.odds(h.a, h.b, h.aceLow, state.deck, 'higher'), 'Higher') +
          oddsBar(R.odds(h.a, h.b, h.aceLow, state.deck, 'lower'), 'Lower');
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
    if (online.busy) el.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
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

  function resultHTML(info, fresh) {
    var h = state.hand, p = current();
    var cls, title, sub, who = isMe(p) ? 'You' : esc(p.name);
    var posts = h.b ? R.cardShort(h.a) + ' and ' + R.cardShort(h.b) : '';
    switch (h.outcome) {
      case 'win':
        cls = 'win'; title = 'In between!';
        sub = who + ' take' + (isMe(p) ? '' : 's') + ' ' + h.delta + ' from the pot' + (state.pot === 0 ? ' — and clean' + (isMe(p) ? '' : 's') + ' it out! 💰' : '.');
        break;
      case 'lose':
        cls = 'lose'; title = info.type === 'pair' ? 'Wrong call.' : 'Outside.';
        sub = Math.abs(h.delta) + ' goes into the pot.';
        break;
      case 'post':
        cls = 'post'; title = info.type === 'pair' ? 'Three of a kind!' : 'Hit the post!';
        var mult = R.postMultiplier(info, state.rules), paid = Math.abs(h.delta);
        sub = who + ' pay' + (isMe(p) ? '' : 's') + ' ' + paid + (paid < h.bet * mult ? ' — everything left.'
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
      case 'timeout':
        cls = 'skip'; title = 'Time’s up';
        sub = who + ' ran out of time — the turn passes.';
        break;
      case 'skip':
        cls = 'skip'; title = 'Turn skipped';
        sub = 'The host moved things along.';
        break;
      case 'left':
        cls = 'skip'; title = 'Left the table';
        sub = esc(p.name) + ' has gone. Their turn passes.';
        break;
      default:
        cls = 'skip'; title = 'Pass';
        sub = who + ' sit' + (isMe(p) ? '' : 's') + ' this one out.';
    }
    var amount = h.delta ? '<span class="result__amt">' + signed(h.delta) + '</span>' : '';
    return '<div class="result result--' + cls + (fresh ? '' : ' result--still') + '"><div class="result__head"><strong>' + title + '</strong>' + amount + '</div><p>' + sub + '</p></div>';
  }

  function nextHTML() {
    var n = state.players.length, others = [];
    for (var k = 1; k < n; k++) {
      var q = state.players[(state.turn + k) % n];
      if (!q.out) others.push(q);
    }
    var ending = current().chips <= 0 && others.length <= 1;
    var label = ending ? 'See the results →'
      : others.length ? 'Next: ' + (isMe(others[0]) ? 'you' : esc(others[0].name)) + ' →' : 'Continue →';
    if (mode === 'online' && !canActNext()) {
      return '<p class="next-note">' + (ending ? 'Totting up the chips…' : 'Next up: ' + (others[0] ? (isMe(others[0]) ? '<strong>you</strong>' : esc(others[0].name)) : '…')) + '</p>';
    }
    return '<button class="btn btn--primary btn--lg btn--block" data-action="next">' + label + '</button>' +
      (mode === 'online' ? '<p class="next-note next-note--small">Moves on by itself in a few seconds.</p>' : '');
  }
  function canActNext() { return isHost() || (online.you && current().id === online.you.id); }

  function renderLog() {
    $('log').innerHTML = state.log.slice(0, 12).map(function (l) {
      return '<li class="log__item log__item--' + l.k + '">' + esc(l.t) + '</li>';
    }).join('');
  }

  /* ---------- Results ---------- */
  function renderResults() {
    if (!state) return show('home');
    var ranked = state.players.map(function (p, i) { return { p: p, i: i }; })
      // Anyone who left early ranks below everyone still at the table.
      .sort(function (x, y) { return (x.p.left - y.p.left) || y.p.chips - x.p.chips || x.i - y.i; });
    var top = ranked[0].p;
    var tie = ranked.length > 1 && !ranked[1].p.left && ranked[1].p.chips === top.chips;
    $('over-kicker').textContent = tie ? 'It’s a tie' : 'Winner';
    $('over-winner').textContent = tie
      ? ranked.filter(function (r) { return !r.p.left && r.p.chips === top.chips; }).map(function (r) { return r.p.name; }).join(' & ')
      : (isMe(top) ? 'You! ' : '') + top.name;
    $('over-sub').textContent = (state.endReason === 'last' ? 'Last one with chips after ' : 'Biggest stack after ') + state.handNo + ' hand' + (state.handNo === 1 ? '' : 's') + '.';

    var start = state.rules.startChips;
    $('standings').innerHTML = ranked.map(function (r, n) {
      var p = r.p, net = p.chips - start, s = p.stats;
      return '<li class="standing' + (n === 0 ? ' standing--lead' : '') + (isMe(p) ? ' standing--me' : '') + '">' +
        '<span class="standing__rank">' + (n + 1) + '</span>' +
        '<span class="standing__text"><strong>' + (p.cpu ? '🤖 ' : '') + esc(p.name) + (isMe(p) ? ' (you)' : '') + '</strong>' +
          '<em class="standing__detail">' + s.wins + ' won · ' + s.losses + ' missed · ' + s.posts + ' post' + (s.posts === 1 ? '' : 's') + (p.left ? ' · left early' : '') + '</em></span>' +
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

    var actions;
    if (mode === 'online') {
      actions = isHost()
        ? '<button class="btn btn--primary btn--block btn--lg" data-action="lobby-start">Rematch — same table</button>' +
          '<button class="btn btn--ghost btn--block" data-action="to-lobby">Back to the lobby</button>'
        : '<p class="lobby__wait"><span class="dots"><i></i><i></i><i></i></span> Waiting for the host to deal again…</p>';
      actions += '<button class="btn btn--link btn--block" data-action="ask-leave">Leave room</button>';
    } else {
      actions = '<button class="btn btn--primary btn--block btn--lg" data-action="rematch">Rematch</button>' +
        '<button class="btn btn--ghost btn--block" data-action="go-setup">New table</button>' +
        '<button class="btn btn--link btn--block" data-action="go-home">Home</button>';
    }
    $('results-actions').innerHTML = actions;
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
    toastTimer = setTimeout(function () { t.classList.remove('toast--on'); t.hidden = true; }, 2600);
  }
  var modalOk = null;
  function openModal(o) {
    $('modal-title').textContent = o.title;
    $('modal-body').textContent = o.body;
    $('modal-ok').textContent = o.ok;
    $('modal-cancel').textContent = o.cancel || 'Cancel';
    modalOk = o.onOk;
    $('modal').hidden = false;
    clearTimers();
  }
  function closeModal() { $('modal').hidden = true; modalOk = null; }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  /* =========================================================
     EVENTS
     ========================================================= */
  function setBet(n) { ui.bet = clamp(Math.round(n), 1, Math.max(1, E.maxBet(state))); updateBetUI(); }

  var actions = {
    'go-home': function () { show('home'); },
    'go-how': function () { show('how'); },
    'go-setup': function () {
      if (mode === 'online') leaveOnlineQuietly();
      show('setup');
    },
    'go-online': function () { online.invite = null; show('online'); },
    'resume': function () { if (mode === 'online') leaveOnlineQuietly(); state = localGame; ui.seen = null; ui.lastPot = null; show('table'); },
    'discard': function () { localGame = null; saveLocal(); if (mode === 'local') state = null; show('setup'); },
    'leave': function () {
      if (mode === 'online') return actions['ask-leave']();
      show('home');
    },

    /* same-device setup */
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
      startLocal(r.roster, setup.rules);
    },
    'rematch': function () {
      if (!localGame) return show('setup');
      startLocal(localGame.players.map(function (p) { return { name: p.name, cpu: p.cpu }; }), localGame.rules);
    },

    /* online: create / join / lobby */
    'on-create': function (el) {
      var name = onlineName(); if (!name) return;
      withBusy(el, api('POST', { action: 'create', name: name, rules: setup.rules }))
        .then(enterRoom)
        .catch(function (e) { onlineError(e.message); });
    },
    'on-join': function (el) {
      var name = onlineName(); if (!name) return;
      var code = $('on-code').value.toUpperCase().replace(/[^A-Z]/g, '');
      if (code.length !== 4) { onlineError('Room codes are 4 letters.'); $('on-code').focus(); return; }
      var creds = getLS(ONLINE_KEY);
      var body = { action: 'join', code: code, name: name };
      if (creds && creds.code === code) { body.id = creds.id; body.token = creds.token; }
      online.code = code;
      withBusy(el, api('POST', body))
        .then(function (v) { online.invite = null; enterRoom(v); })
        .catch(function (e) { online.code = null; onlineError(e.message); });
    },
    'rejoin': function () {
      var c = getLS(ONLINE_KEY);
      if (!c) return renderHome();
      rejoin(c.code, { id: c.id, token: c.token }).catch(function (e) { toast(e.message); renderHome(); });
    },
    'forget-room': function () { setLS(ONLINE_KEY, null); renderHome(); },
    'copy-link': function () {
      copyText(inviteLink()).then(function () { toast('🔗 Invite link copied — paste it in the meeting chat'); },
        function () { toast('Copy failed — the code is ' + online.code); });
    },
    'share-link': function () {
      if (navigator.share) navigator.share({ title: 'In-Between', text: 'Pull up a chair — In-Between, room ' + online.code, url: inviteLink() }).catch(function () {});
    },
    'lobby-add-bot': function () { send('add-bot'); },
    'lobby-remove': function (el) { send('remove', { target: el.getAttribute('data-id') }); },
    'lobby-start': function () { send('start'); },
    'to-lobby': function () { send('lobby'); },
    'skip': function () { send('skip'); },
    'ask-leave': function () {
      openModal({
        title: 'Leave the room?',
        body: online.room && online.room.status === 'playing'
          ? 'You’ll give up your seat and your chips for the rest of this game.'
          : 'You can rejoin with the invite link while the room is open.',
        ok: 'Leave', cancel: 'Stay',
        onOk: function () {
          var code = online.code, you = online.you;
          leaveOnlineQuietly();
          if (code && you) api('POST', { action: 'leave', code: code, id: you.id, token: you.token }).catch(function () {});
          show('home');
        }
      });
    },

    /* the table */
    'ace-low': function () { if (canAct()) driver().ace(true); },
    'ace-high': function () { if (canAct()) driver().ace(false); },
    'bet-dec': function () { setBet(ui.bet - 1); },
    'bet-inc': function () { setBet(ui.bet + 1); },
    'bet-set': function (el) {
      var f = +el.getAttribute('data-frac');
      setBet(f === 0 ? 1 : Math.max(1, Math.floor(E.maxBet(state) * f)));
    },
    'bet': function (el) { if (canAct()) driver().bet(ui.bet, el.getAttribute('data-call')); },
    'pass': function () { if (canAct()) driver().pass(); },
    'next': function () { driver().next(); },

    'ask-end': function () {
      openModal({
        title: 'End the game?', body: 'The biggest stack wins. Chips still in the pot stay there.',
        ok: 'End game', cancel: 'Keep playing', onOk: function () { driver().end(); }
      });
    },
    'modal-cancel': function () { closeModal(); pump(); },
    'modal-ok': function () { var f = modalOk; closeModal(); if (f) f(); }
  };

  function ruleClick(container, key, val) {
    if (container.id === 'setup-rules') {
      setup.rules[key] = val; saveSetup(); renderSetup();
    } else if (container.id === 'lobby-rules' && isHost()) {
      var rules = Object.assign({}, online.room.rules); rules[key] = val;
      online.room.rules = rules; renderLobby();
      send('rules', { rules: rules }, true);
    }
  }

  document.addEventListener('click', function (e) {
    var seg = e.target.closest('.segmented .seg');
    if (seg && !seg.disabled) {
      var group = seg.closest('.segmented');
      ruleClick(seg.closest('[id$="-rules"]'), group.getAttribute('data-opt'), JSON.parse(seg.getAttribute('data-val')));
      return;
    }
    var tog = e.target.closest('[data-toggle]');
    if (tog && !tog.disabled) {
      var c = tog.closest('[id$="-rules"]'), k = tog.getAttribute('data-toggle');
      var rules = c.id === 'setup-rules' ? setup.rules : online.room.rules;
      ruleClick(c, k, !rules[k]);
      return;
    }
    var el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var fn = actions[el.getAttribute('data-action')];
    if (fn) fn(el);
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'bet-range') { ui.bet = +e.target.value; updateBetUI(); }
    if (e.target.id === 'on-code') { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); }
    if (e.target.classList.contains('pl__name')) {
      var p = setup.players[+e.target.getAttribute('data-index')];
      if (p) { p.name = e.target.value; saveSetup(); }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('modal').hidden) { closeModal(); pump(); return; }
    if (e.key !== 'Enter' || !e.target.classList) return;
    if (e.target.classList.contains('pl__name')) { e.preventDefault(); actions.start(); }
    if (e.target.id === 'on-name' || e.target.id === 'on-code') {
      e.preventDefault();
      var code = $('on-code').value;
      if (code.length === 4 || online.invite) actions['on-join']($('on-join-btn'));
      else if (e.target.id === 'on-name') actions['on-create'](document.querySelector('[data-action="on-create"]'));
    }
  });

  /* ---------- Boot ---------- */
  setup = loadSetup();
  localGame = loadLocal();
  state = localGame;
  show('home');

  var params = new URLSearchParams(location.search);
  var inviteCode = (params.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '');
  checkOnline().then(function () {
    if (inviteCode.length !== 4) return;
    if (!online.available) { toast('Online rooms aren’t available on this copy of the site.'); return; }
    var creds = getLS(ONLINE_KEY);
    if (creds && creds.code === inviteCode) {
      return rejoin(inviteCode, { id: creds.id, token: creds.token }).catch(function () {
        online.invite = inviteCode; show('online');
      });
    }
    online.invite = inviteCode;
    show('online');
  });
})();
