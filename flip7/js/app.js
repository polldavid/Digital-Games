/* =========================================================
   Flip 7 Scorer — app
   A round-by-round scorekeeper: a board of players, a card
   picker per player, a full editable history, and stats at
   the end. The maths lives in rules.js; this file is state,
   rendering and persistence.
   ========================================================= */
(function () {
  'use strict';

  var R = window.Flip7Rules;
  var STORE_KEY = 'flip7-game-v1';
  var MAX_PLAYERS = 12;
  var COLORS = ['#FF5A4E', '#FFC93C', '#35D6A4', '#56B6F7', '#9B7BFF', '#FF8AC4',
                '#7DD35B', '#FF9F45', '#22D3EE', '#E879F9', '#F2B36B', '#8FA6FF'];

  // ---- DOM helpers ----
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  // =====================================================
  // State
  // =====================================================
  var state = newGame([]);
  var ui = { stack: [], screen: 'home', sheet: null };

  function newGame(players, target, bonus) {
    return {
      v: 1,
      players: players || [],
      target: target || R.DEFAULT_TARGET,
      bonus: bonus == null ? R.DEFAULT_BONUS : bonus,
      rounds: [],     // completed rounds: [{ entries: { playerId: entry } }]
      draft: {},      // the round being scored right now
      finished: false,
      nextId: (players || []).length + 1
    };
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }
  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.players || s.players.length < 2) return null;
      s.rounds = s.rounds || []; s.draft = s.draft || {};
      s.nextId = s.nextId || s.players.length + 1;
      return s;
    } catch (e) { return null; }
  }
  function clearSaved() { try { localStorage.removeItem(STORE_KEY); } catch (e) {} }

  // ---- derived ----
  function opts() { return { flip7Bonus: state.bonus }; }
  function entryOf(playerId, roundIndex) {
    var bag = roundIndex == null ? state.draft : (state.rounds[roundIndex] || {}).entries;
    return (bag || {})[playerId] || null;
  }
  function scoreOf(playerId, roundIndex) { return R.scoreEntry(entryOf(playerId, roundIndex), opts()); }

  function totals() {
    var t = {};
    state.players.forEach(function (p) { t[p.id] = 0; });
    state.rounds.forEach(function (round) {
      state.players.forEach(function (p) {
        t[p.id] += R.scoreEntry(round.entries[p.id], opts()).total;
      });
    });
    return t;
  }

  /* Players sorted best-first, with ranks that share on a tie. */
  function standings() {
    var t = totals();
    var rows = state.players.map(function (p) { return { player: p, total: t[p.id] }; });
    rows.sort(function (a, b) { return b.total - a.total; });
    var rank = 0, prev = null;
    rows.forEach(function (row, i) {
      if (row.total !== prev) { rank = i + 1; prev = row.total; }
      row.rank = rank;
    });
    return rows;
  }
  function rankOf(playerId) {
    var found = null;
    standings().forEach(function (r) { if (r.player.id === playerId) found = r.rank; });
    return found;
  }
  function playerById(id) {
    var found = null;
    state.players.forEach(function (p) { if (String(p.id) === String(id)) found = p; });
    return found;
  }
  function allEntered() {
    return state.players.length > 0 && state.players.every(function (p) { return R.isEntered(state.draft[p.id]); });
  }

  // =====================================================
  // Navigation
  // =====================================================
  var SCREENS = ['home', 'how', 'setup', 'round', 'summary', 'history', 'over'];
  function show(screen, remember) {
    if (remember !== false && ui.screen !== screen) ui.stack.push(ui.screen);
    ui.screen = screen;
    SCREENS.forEach(function (s) {
      var n = $('#screen-' + s);
      if (n) n.classList.toggle('screen--active', s === screen);
    });
    window.scrollTo(0, 0);
  }
  function back() { show(ui.stack.pop() || 'home', false); }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    t.classList.add('toast--on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      t.classList.remove('toast--on');
      setTimeout(function () { t.hidden = true; }, 250);
    }, 2200);
  }

  // =====================================================
  // Home
  // =====================================================
  function renderHome() {
    var saved = loadSaved();
    var card = $('#resume-card');
    if (!saved) { card.hidden = true; $('#new-game-btn').hidden = false; return; }
    var names = saved.players.map(function (p) { return p.name; }).join(', ');
    $('#resume-meta').textContent = saved.finished
      ? 'Finished · ' + saved.rounds.length + ' rounds · ' + names
      : 'Round ' + (saved.rounds.length + 1) + ' · ' + saved.players.length + ' players · ' + names;
    card.hidden = false;
    $('#new-game-btn').hidden = true;   // the resume card offers it instead
  }

  function resumeGame() {
    var saved = loadSaved();
    if (!saved) { toast('That game is gone.'); renderHome(); return; }
    state = saved;
    if (state.finished) { renderOver(false); show('over'); }
    else { renderBoard(); show('round'); }
  }

  // =====================================================
  // Rules screen (built from the deck definition)
  // =====================================================
  function renderRules() {
    var list = $('#actions-list');
    list.innerHTML = '';
    R.ACTIONS.forEach(function (a) {
      list.appendChild(el('li', 'action-row',
        '<span class="action-row__emoji">' + a.emoji + '</span>' +
        '<div><strong>' + esc(a.label) + '</strong> <span class="action-row__copies">×' + a.copies + ' in the deck</span>' +
        '<em>' + esc(a.blurb) + '</em></div>'));
    });

    var strip = $('#deck-strip');
    strip.innerHTML = '';
    R.NUMBERS.forEach(function (n) {
      strip.appendChild(el('span', 'deck-chip',
        '<b>' + n + '</b><i>×' + R.numberCopies(n) + '</i>'));
    });
    R.MODIFIERS.forEach(function (m) {
      strip.appendChild(el('span', 'deck-chip deck-chip--mod',
        '<b>' + m.label + '</b><i>×' + m.copies + '</i>'));
    });
  }

  // =====================================================
  // Setup
  // =====================================================
  var setup = { players: [], target: R.DEFAULT_TARGET, bonus: R.DEFAULT_BONUS, nextId: 1 };

  function pickColor() {
    var used = setup.players.map(function (p) { return p.color; });
    for (var i = 0; i < COLORS.length; i++) if (used.indexOf(COLORS[i]) === -1) return COLORS[i];
    return COLORS[setup.players.length % COLORS.length];
  }

  function addPlayer(name) {
    name = String(name || '').trim();
    if (!name) return false;
    if (setup.players.length >= MAX_PLAYERS) { flashInput(MAX_PLAYERS + ' players max.'); return false; }
    if (setup.players.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); })) {
      flashInput('That name is taken.'); return false;
    }
    setup.players.push({ id: setup.nextId++, name: name, color: pickColor() });
    renderSetup();
    return true;
  }
  function flashInput(msg) {
    var input = $('#player-name');
    input.value = ''; input.placeholder = msg; input.classList.add('input--warn');
    setTimeout(function () { input.placeholder = 'Add a player…'; input.classList.remove('input--warn'); }, 1800);
  }

  function renderSetup() {
    var list = $('#player-list');
    list.innerHTML = '';
    setup.players.forEach(function (p, i) {
      var li = el('li', 'player-chip');
      var dot = el('span', 'dot'); dot.style.background = p.color;
      li.appendChild(dot);
      li.appendChild(el('span', 'player-chip__seat', String(i + 1)));
      li.appendChild(el('span', 'player-chip__name', esc(p.name)));
      var rm = el('button', 'player-chip__remove', '&times;');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove ' + p.name);
      rm.addEventListener('click', function () {
        setup.players = setup.players.filter(function (x) { return x.id !== p.id; });
        renderSetup();
      });
      li.appendChild(rm);
      list.appendChild(li);
    });

    $all('#seg-target .seg').forEach(function (b) {
      b.classList.toggle('seg--on', Number(b.getAttribute('data-target')) === setup.target);
    });
    $('#bonus-value').textContent = setup.bonus;
    $('#start-btn').disabled = setup.players.length < 2;
  }

  function startGame() {
    if (setup.players.length < 2) return;
    state = newGame(setup.players.map(function (p) { return { id: p.id, name: p.name, color: p.color }; }),
                    setup.target, setup.bonus);
    state.nextId = setup.nextId;
    save();
    renderBoard();
    ui.stack = ['home'];
    show('round');
  }

  // =====================================================
  // Round board
  // =====================================================
  function renderBoard() {
    var roundNo = state.rounds.length + 1;
    $('#board-round').textContent = 'Round ' + roundNo;

    var t = totals();
    var leader = standings()[0];
    $('#board-hint').innerHTML = state.rounds.length === 0
      ? 'Tap a player to score their cards'
      : esc(leader.player.name) + ' leads on ' + leader.total + ' · playing to ' + state.target;

    var flip7Player = null;
    state.players.forEach(function (p) {
      if (scoreOf(p.id).flip7) flip7Player = p;
    });
    $('#flip7-banner').hidden = !flip7Player;
    if (flip7Player) $('#flip7-who').textContent = flip7Player.name;

    var list = $('#entries');
    list.innerHTML = '';
    state.players.forEach(function (p) {
      var entry = state.draft[p.id];
      var entered = R.isEntered(entry);
      var s = R.scoreEntry(entry, opts());

      var li = el('li', 'entry' + (entered ? ' entry--done' : ''));
      li.style.setProperty('--pc', p.color);

      var main = el('button', 'entry__main');
      main.type = 'button';
      var chipClass = 'chip chip--empty', chipText = '—';
      if (entered) {
        if (s.busted) { chipClass = 'chip chip--bust'; chipText = 'Bust'; }
        else if (s.flip7) { chipClass = 'chip chip--flip7'; chipText = s.total + ''; }
        else { chipClass = 'chip chip--ok'; chipText = s.total + ''; }
      }
      main.innerHTML =
        '<span class="dot" style="background:' + p.color + '"></span>' +
        '<span class="entry__text">' +
          '<strong>' + esc(p.name) + '</strong>' +
          '<em>' + (entered ? esc(R.describe(entry, opts())) : t[p.id] + ' pts · ' + ordinal(rankOf(p.id))) + '</em>' +
        '</span>' +
        '<span class="entry__right">' +
          '<span class="' + chipClass + '">' + chipText + '</span>' +
          (s.flip7 && !s.busted ? '<span class="entry__flag">Flip 7</span>' : '') +
        '</span>';
      main.addEventListener('click', function () { openSheet(p.id, null); });
      li.appendChild(main);

      var bust = el('button', 'entry__bust' + (entered && s.busted ? ' entry__bust--on' : ''), '💥');
      bust.type = 'button';
      bust.setAttribute('aria-label', (entered && s.busted ? 'Un-bust ' : 'Mark busted: ') + p.name);
      bust.setAttribute('aria-pressed', entered && s.busted ? 'true' : 'false');
      bust.addEventListener('click', function () {
        var cur = state.draft[p.id];
        if (cur && cur.busted) delete state.draft[p.id];
        else state.draft[p.id] = { mode: 'cards', numbers: [], mods: [], busted: true };
        save(); renderBoard();
      });
      li.appendChild(bust);
      list.appendChild(li);
    });

    $('#finish-round').disabled = !allEntered();
    $('#undo-round').hidden = state.rounds.length === 0;
  }

  function finishRound() {
    if (!allEntered()) return;
    state.rounds.push({ entries: state.draft });
    state.draft = {};
    var t = totals();
    var over = state.players.some(function (p) { return t[p.id] >= state.target; });
    state.finished = over;
    save();
    if (over) { renderOver(true); show('over'); }
    else { renderSummary(); show('summary'); }
  }

  function undoRound() {
    if (!state.rounds.length) return;
    var last = state.rounds.pop();
    state.draft = last.entries;
    state.finished = false;
    save();
    renderBoard();
    show('round', ui.screen !== 'round');
    toast('Round ' + (state.rounds.length + 1) + ' reopened for editing.');
  }

  // =====================================================
  // Round summary
  // =====================================================
  function renderSummary() {
    var roundIndex = state.rounds.length - 1;
    $('#summary-title').textContent = 'Round ' + (roundIndex + 1) + ' done';

    var rows = standings();
    var leader = rows[0];
    var best = null;
    state.players.forEach(function (p) {
      var s = scoreOf(p.id, roundIndex);
      if (!best || s.total > best.total) best = { player: p, total: s.total, flip7: s.flip7 };
    });
    var behind = rows.length > 1 ? (leader.total - rows[1].total) : 0;
    var lead = 'leads on ' + leader.total +
      (behind > 0 ? ', ' + behind + ' clear' : ' (level at the top)') +
      ' · ' + Math.max(0, state.target - leader.total) + ' to go.';
    var won = best && best.total > 0;
    $('#summary-sub').innerHTML = won && best.player.id === leader.player.id
      ? '<strong>' + esc(best.player.name) + '</strong> took the round with ' + best.total +
        (best.flip7 ? ' (Flip 7!)' : '') + ' and ' + lead
      : (won
          ? '<strong>' + esc(best.player.name) + '</strong> took the round with ' + best.total +
            (best.flip7 ? ' (Flip 7!)' : '') + '. '
          : 'Nobody scored — brutal round. ') +
        '<strong>' + esc(leader.player.name) + '</strong> ' + lead;

    renderStandings($('#summary-standings'), rows, roundIndex);
    $('#summary-continue').textContent = 'Start round ' + (state.rounds.length + 1);
  }

  function renderStandings(node, rows, roundIndex) {
    node.innerHTML = '';
    rows.forEach(function (row) {
      var li = el('li', 'standing' + (row.rank === 1 ? ' standing--lead' : ''));
      li.style.setProperty('--pc', row.player.color);
      var deltaHtml = '', detailHtml = '';
      if (roundIndex != null) {
        var s = scoreOf(row.player.id, roundIndex);
        var cls = s.busted ? 'delta delta--bust' : (s.flip7 ? 'delta delta--flip7' : 'delta');
        deltaHtml = '<span class="' + cls + '">' + (s.busted ? 'bust' : '+' + s.total) + '</span>';
      } else {
        var st = playerStats(row.player.id);
        detailHtml = '<em class="standing__detail">best ' + st.best + ' · ' + plural(st.busts, 'bust') +
          (st.flip7s ? ' · ' + st.flip7s + '× Flip 7' : '') + '</em>';
      }
      li.innerHTML =
        '<span class="standing__rank">' + row.rank + '</span>' +
        '<span class="dot" style="background:' + row.player.color + '"></span>' +
        '<span class="standing__text"><strong>' + esc(row.player.name) + '</strong>' + detailHtml + '</span>' +
        deltaHtml +
        '<span class="standing__total">' + row.total + '</span>';
      node.appendChild(li);
    });
  }

  // =====================================================
  // History (editable)
  // =====================================================
  function renderHistory() {
    var table = $('#history-table');
    table.innerHTML = '';
    $('#history-empty').hidden = state.rounds.length > 0;
    if (!state.rounds.length) { table.hidden = true; return; }
    table.hidden = false;

    var thead = el('thead');
    var hr = el('tr');
    hr.appendChild(el('th', 'history__corner', 'Round'));
    state.players.forEach(function (p) {
      var th = el('th', 'history__player',
        '<span class="dot" style="background:' + p.color + '"></span>' + esc(p.name));
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = el('tbody');
    var running = {};
    state.players.forEach(function (p) { running[p.id] = 0; });

    state.rounds.forEach(function (round, i) {
      var tr = el('tr');
      tr.appendChild(el('th', 'history__round', String(i + 1)));
      state.players.forEach(function (p) {
        var s = R.scoreEntry(round.entries[p.id], opts());
        running[p.id] += s.total;
        var td = el('td');
        var b = el('button', 'cell' + (s.busted ? ' cell--bust' : (s.flip7 ? ' cell--flip7' : '')),
          s.busted ? '0' : String(s.total));
        b.type = 'button';
        b.setAttribute('aria-label', 'Edit ' + p.name + ', round ' + (i + 1));
        b.addEventListener('click', function () { openSheet(p.id, i); });
        td.appendChild(b);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    var tfoot = el('tfoot');
    var fr = el('tr');
    fr.appendChild(el('th', 'history__round', 'Total'));
    var t = totals();
    var top = Math.max.apply(null, state.players.map(function (p) { return t[p.id]; }));
    state.players.forEach(function (p) {
      fr.appendChild(el('td', 'history__total' + (t[p.id] === top ? ' history__total--lead' : ''), String(t[p.id])));
    });
    tfoot.appendChild(fr);
    table.appendChild(tfoot);
  }

  function shareText() {
    var rows = standings();
    var lines = ['Flip 7 — ' + (state.finished ? 'final scores' : 'scores after ' + state.rounds.length + ' rounds')];
    rows.forEach(function (r) { lines.push(r.rank + '. ' + r.player.name + ' — ' + r.total); });
    var g = gameStats();
    lines.push('');
    lines.push(plural(state.rounds.length, 'round') + ' · ' + plural(g.flip7s, 'Flip 7') +
               ' · ' + plural(g.busts, 'bust') + ' · playing to ' + state.target);
    return lines.join('\n');
  }

  function copyResults() {
    var text = shareText();
    function fallback() {
      var ta = el('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? 'Results copied.' : 'Could not copy — select and copy by hand.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Results copied.'); }, fallback);
    } else fallback();
  }

  // =====================================================
  // Stats & game over
  // =====================================================
  function playerStats(playerId) {
    var st = { total: 0, best: 0, busts: 0, flip7s: 0, rounds: state.rounds.length };
    state.rounds.forEach(function (round) {
      var s = R.scoreEntry(round.entries[playerId], opts());
      st.total += s.total;
      if (s.total > st.best) st.best = s.total;
      if (s.busted) st.busts++;
      if (s.flip7 && !s.busted) st.flip7s++;
    });
    st.average = st.rounds ? Math.round(st.total / st.rounds) : 0;
    return st;
  }

  function gameStats() {
    var g = { busts: 0, flip7s: 0, best: { total: -1, name: '—' }, rounds: state.rounds.length };
    state.players.forEach(function (p) {
      var st = playerStats(p.id);
      g.busts += st.busts;
      g.flip7s += st.flip7s;
      if (st.best > g.best.total) g.best = { total: st.best, name: p.name };
    });
    if (g.best.total < 0) g.best = { total: 0, name: '—' };
    return g;
  }

  function renderOver(celebrate) {
    var rows = standings();
    var winners = rows.filter(function (r) { return r.rank === 1; });
    $('#over-winner').textContent = winners.length > 1
      ? winners.map(function (w) { return w.player.name; }).join(' & ') + ' tie!'
      : winners[0].player.name + ' wins!';

    var st = playerStats(winners[0].player.id);
    $('#over-sub').innerHTML = winners[0].total + ' points in ' + state.rounds.length + ' rounds' +
      (st.best ? ' · best round ' + st.best : '') + ' · played to ' + state.target + '.';

    renderStandings($('#final-standings'), rows, null);

    var g = gameStats();
    var stats = $('#stats');
    stats.innerHTML = '';
    [
      { k: 'Rounds played', v: g.rounds },
      { k: 'Biggest round', v: g.best.total, sub: g.best.name },
      { k: 'Flip 7s', v: g.flip7s },
      { k: 'Total busts', v: g.busts }
    ].forEach(function (s) {
      stats.appendChild(el('div', 'stat',
        '<div class="stat__v">' + s.v + '</div><div class="stat__k">' + s.k + '</div>' +
        (s.sub ? '<div class="stat__sub">' + esc(s.sub) + '</div>' : '')));
    });

    if (celebrate) confetti();
  }

  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = state.players.map(function (p) { return p.color; });
    for (var i = 0; i < 80; i++) {
      (function (i) {
        var p = el('div', 'confetti-piece');
        p.style.left = Math.random() * 100 + 'vw';
        p.style.background = colors[i % colors.length];
        p.style.borderRadius = Math.random() > 0.5 ? '50%' : '3px';
        document.body.appendChild(p);
        var dur = 2200 + Math.random() * 1800;
        p.animate([
          { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
          { transform: 'translate(' + ((Math.random() - 0.5) * 220) + 'px, 108vh) rotate(' + ((Math.random() - 0.5) * 900) + 'deg)', opacity: 0.9 }
        ], { duration: dur, easing: 'cubic-bezier(0.2,0.6,0.4,1)', delay: Math.random() * 400 });
        setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, dur + 600);
      })(i);
    }
  }

  // =====================================================
  // Scoring sheet
  // =====================================================
  function blankEntry() { return { mode: 'cards', numbers: [], mods: [], busted: false, total: 0 }; }

  function openSheet(playerId, roundIndex) {
    var player = playerById(playerId);
    if (!player) return;
    var existing = entryOf(playerId, roundIndex);
    var working = blankEntry();
    if (existing) {
      working.mode = existing.mode || 'cards';
      working.numbers = (existing.numbers || []).slice();
      working.mods = (existing.mods || []).slice();
      working.busted = !!existing.busted;
      working.total = existing.mode === 'manual' ? (existing.total || 0) : 0;
    }
    ui.sheet = { playerId: playerId, roundIndex: roundIndex, entry: working };

    $('#sheet-name').textContent = player.name;
    $('#sheet-dot').style.background = player.color;
    $('#sheet-round').textContent = 'Round ' + (roundIndex == null ? state.rounds.length + 1 : roundIndex + 1);
    $('#sheet').style.setProperty('--pc', player.color);

    renderSheet();
    $('#sheet').hidden = false;
    document.body.classList.add('is-locked');
    requestAnimationFrame(function () { $('#sheet').classList.add('sheet--on'); });
  }

  function closeSheet() {
    var s = $('#sheet');
    s.classList.remove('sheet--on');
    document.body.classList.remove('is-locked');
    setTimeout(function () { s.hidden = true; }, 220);
    ui.sheet = null;
  }

  function buildSheetControls() {
    var grid = $('#number-grid');
    grid.innerHTML = '';
    R.NUMBERS.forEach(function (n) {
      var b = el('button', 'card', '<span class="card__n">' + n + '</span>');
      b.type = 'button';
      b.setAttribute('data-number', n);
      b.addEventListener('click', function () {
        var e = ui.sheet.entry;
        var i = e.numbers.indexOf(n);
        if (i === -1) e.numbers.push(n); else e.numbers.splice(i, 1);
        e.mode = 'cards';
        renderSheet();
      });
      grid.appendChild(b);
    });

    var mods = $('#mod-grid');
    mods.innerHTML = '';
    R.MODIFIERS.forEach(function (m) {
      var b = el('button', 'card card--mod' + (m.type === 'mult' ? ' card--mult' : ''), '<span class="card__n">' + m.label + '</span>');
      b.type = 'button';
      b.setAttribute('data-mod', m.key);
      b.addEventListener('click', function () {
        var e = ui.sheet.entry;
        var i = e.mods.indexOf(m.key);
        if (i === -1) e.mods.push(m.key); else e.mods.splice(i, 1);
        e.mode = 'cards';
        renderSheet();
      });
      mods.appendChild(b);
    });

    var pad = $('#keypad');
    pad.innerHTML = '';
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].forEach(function (k) {
      var b = el('button', 'key' + (k === 'C' || k === '⌫' ? ' key--util' : ''), k);
      b.type = 'button';
      b.addEventListener('click', function () {
        var e = ui.sheet.entry;
        e.mode = 'manual';
        e.busted = false;
        var cur = String(e.total || 0);
        if (k === 'C') cur = '0';
        else if (k === '⌫') cur = cur.length > 1 ? cur.slice(0, -1) : '0';
        else cur = (cur === '0' ? '' : cur) + k;
        e.total = Math.min(999, parseInt(cur, 10) || 0);
        renderSheet();
      });
      pad.appendChild(b);
    });
  }

  function renderSheet() {
    if (!ui.sheet) return;
    var e = ui.sheet.entry;
    var s = R.scoreEntry(e, opts());

    // Tabs
    $all('.tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === e.mode;
      t.classList.toggle('tab--on', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('#pane-cards').hidden = e.mode !== 'cards';
    $('#pane-manual').hidden = e.mode !== 'manual';

    // Readout
    $('#readout').classList.toggle('readout--bust', !!e.busted);
    $('#readout').classList.toggle('readout--flip7', !!s.flip7 && !e.busted);
    $('#readout-total').textContent = e.busted ? '0' : s.total;
    $('#readout-sum').textContent = e.busted
      ? 'Busted — the round scores nothing'
      : (e.mode === 'manual' ? 'Typed in by hand' : R.describe(e, opts()));
    $('#flip7-flag').hidden = !s.flip7 || !!e.busted;

    // Cards
    var claimed = R.cardsClaimed(
      ui.sheet.roundIndex == null ? state.draft : (state.rounds[ui.sheet.roundIndex] || {}).entries,
      ui.sheet.playerId);

    $all('#number-grid .card').forEach(function (b) {
      var n = Number(b.getAttribute('data-number'));
      var on = e.numbers.indexOf(n) !== -1;
      b.classList.toggle('card--on', on);
      var over = on && R.numberOverdrawn(n, claimed);
      b.classList.toggle('card--warn', over);
      if (over) b.title = 'The deck only holds ' + R.numberCopies(n) + ' × ' + n + ' — someone else already has ' + (R.numberCopies(n) === 1 ? 'it' : 'them') + ' this round.';
      else b.removeAttribute('title');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $all('#mod-grid .card').forEach(function (b) {
      var key = b.getAttribute('data-mod');
      var on = e.mods.indexOf(key) !== -1;
      b.classList.toggle('card--on', on);
      var over = on && R.modOverdrawn(key, claimed);
      b.classList.toggle('card--warn', over);
      if (over) b.title = 'Only one of these in the deck, and it is already claimed this round.';
      else b.removeAttribute('title');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    var count = e.numbers.length;
    $('#cards-count').textContent = count + ' of ' + R.FLIP7_COUNT;
    $('#cards-count').classList.toggle('pane__hint--hot', count >= R.FLIP7_COUNT);

    // Bust
    $('#bust-btn').classList.toggle('bust-btn--on', !!e.busted);
    $('#bust-btn').setAttribute('aria-pressed', e.busted ? 'true' : 'false');
  }

  function saveSheet() {
    if (!ui.sheet) return;
    var e = ui.sheet.entry;
    var stored;
    if (e.mode === 'manual') stored = { mode: 'manual', total: e.busted ? 0 : e.total, busted: !!e.busted };
    else if (R.isEntered(e)) stored = { mode: 'cards', numbers: e.numbers.slice(), mods: e.mods.slice(), busted: !!e.busted };
    else stored = { mode: 'manual', total: 0, busted: false }; // explicit zero: frozen before flipping

    if (ui.sheet.roundIndex == null) state.draft[ui.sheet.playerId] = stored;
    else state.rounds[ui.sheet.roundIndex].entries[ui.sheet.playerId] = stored;

    var wasEditingHistory = ui.sheet.roundIndex != null;
    closeSheet();

    // An edit can pull the winner back under the target — then the game is on
    // again. (It never declares a new winner: that is settled when a round is
    // finished, not while a past score is being corrected.)
    var reopened = false;
    if (wasEditingHistory && state.finished) {
      var t = totals();
      if (!state.players.some(function (p) { return t[p.id] >= state.target; })) {
        state.finished = false;
        reopened = true;
      }
    }
    save();

    if (!wasEditingHistory) { renderBoard(); return; }
    renderHistory();
    if (reopened) {
      renderBoard();
      ui.stack = ['home'];
      show('round');
      toast('Nobody is at ' + state.target + ' any more — the game is back on.');
    } else toast('Score updated.');
  }

  function clearSheet() {
    if (!ui.sheet) return;
    ui.sheet.entry = blankEntry();
    if (ui.sheet.roundIndex == null) delete state.draft[ui.sheet.playerId];
    renderSheet();
  }

  // =====================================================
  // Actions
  // =====================================================
  function handleAction(action) {
    switch (action) {
      case 'go-home': show('home'); renderHome(); break;
      case 'go-how': renderRules(); show('how'); break;
      case 'go-setup':
        if (!setup.players.length && state.players.length) {
          // Reuse the last line-up as a starting point.
          setup.players = state.players.map(function (p) { return { id: p.id, name: p.name, color: p.color }; });
          setup.nextId = state.nextId;
          setup.target = state.target; setup.bonus = state.bonus;
        }
        renderSetup(); show('setup'); break;
      case 'go-back': back(); break;
      case 'go-history': renderHistory(); show('history'); break;
      case 'start-game': startGame(); break;
      case 'resume': resumeGame(); break;
      case 'discard':
        if (window.confirm('Throw away the saved game and start fresh?')) {
          clearSaved(); state = newGame([]);
          setup.players = []; setup.nextId = 1;
          renderHome(); toast('Saved game cleared.');
        }
        break;
      case 'undo-round': undoRound(); break;
      case 'quit-game':
        if (window.confirm('End the game here? The scores as they stand decide it.')) {
          state.finished = true; save(); renderOver(false); show('over');
        }
        break;
      case 'rematch':
        state = newGame(state.players, state.target, state.bonus);
        save(); renderBoard(); ui.stack = ['home']; show('round');
        break;
      case 'new-players':
        setup.players = []; setup.nextId = 1;
        clearSaved(); state = newGame([]);
        renderSetup(); show('setup'); break;
    }
  }

  // =====================================================
  // Wiring
  // =====================================================
  function init() {
    $all('[data-action]').forEach(function (b) {
      b.addEventListener('click', function () { handleAction(b.getAttribute('data-action')); });
    });

    $('#add-player-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var input = $('#player-name');
      if (addPlayer(input.value)) { input.value = ''; input.focus(); }
    });

    $all('#seg-target .seg').forEach(function (b) {
      b.addEventListener('click', function () {
        setup.target = Number(b.getAttribute('data-target'));
        renderSetup();
      });
    });
    $all('[data-bonus-step]').forEach(function (b) {
      b.addEventListener('click', function () {
        setup.bonus = Math.max(0, Math.min(50, setup.bonus + Number(b.getAttribute('data-bonus-step'))));
        renderSetup();
      });
    });

    $('#finish-round').addEventListener('click', finishRound);
    $('#summary-continue').addEventListener('click', function () { renderBoard(); show('round'); });
    $('#history-share').addEventListener('click', copyResults);

    buildSheetControls();
    $all('[data-sheet-close]').forEach(function (b) { b.addEventListener('click', closeSheet); });
    $('#sheet-save').addEventListener('click', saveSheet);
    $('#sheet-clear').addEventListener('click', clearSheet);
    $('#bust-btn').addEventListener('click', function () {
      var e = ui.sheet && ui.sheet.entry;
      if (!e) return;
      e.busted = !e.busted;
      renderSheet();
    });
    $all('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        if (!ui.sheet) return;
        ui.sheet.entry.mode = t.getAttribute('data-tab');
        renderSheet();
      });
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && ui.sheet) closeSheet();
    });

    renderSetup();
    renderRules();
    renderHome();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
