/* =========================================================
   Heart to Heart — app
   A small single-page app for two. Every view is a function
   that returns markup; one delegated click handler routes
   [data-act] buttons to actions. Everything the couple
   saves (names, check-ins, prayers, favourites, date list)
   lives in localStorage on this device only.
   ========================================================= */
(function () {
  'use strict';

  var C = window.HTH;
  var KEY = 'hth-v1';
  var DAY = 864e5;

  // ---------- helpers ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function rand(n) { return Math.floor(Math.random() * n); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function startOfDay(d) { d = new Date(d); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function daysSince(ts) { return Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY); }
  function agoText(d) { return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; }
  function fmtDate(ts) { return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function norm(w) { return String(w).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function reducedMotion() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }

  // ---------- storage ----------
  function load() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
    d = d && typeof d === 'object' ? d : {};
    return {
      names: Array.isArray(d.names) && d.names.length === 2 ? d.names : ['', ''],
      since: typeof d.since === 'string' ? d.since : '',
      journal: Array.isArray(d.journal) ? d.journal : [],
      prayers: Array.isArray(d.prayers) ? d.prayers : [],
      favs: Array.isArray(d.favs) ? d.favs : [],
      dates: Array.isArray(d.dates) ? d.dates : [],
      best: d.best && typeof d.best === 'object' ? d.best : {}
    };
  }
  var store = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { toast('Couldn’t save on this device'); } }
  function name(i) { return esc(store.names[i] || (i ? 'Partner 2' : 'Partner 1')); }
  function hasNames() { return !!(store.names[0] && store.names[1]); }

  // ---------- toast ----------
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('toast--show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('toast--show'); }, 2400);
  }

  // =====================================================
  // Router
  // =====================================================
  var views = {};
  var actions = {};
  var binds = {};
  var current = 'home';

  function go(view) { current = view; render(true); }
  function render(scroll) {
    if (!hasNames() && current !== 'onboard') current = 'onboard';
    var out = views[current]();
    var root = $('#view');
    root.innerHTML = out.html;
    var nav = $('#tabbar');
    nav.hidden = out.nav === false;
    document.body.classList.toggle('has-nav', out.nav !== false);
    Array.prototype.forEach.call(nav.querySelectorAll('.tab'), function (b) {
      var on = b.getAttribute('data-tab') === out.tab;
      b.classList.toggle('tab--on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (scroll) { window.scrollTo(0, 0); root.focus({ preventScroll: true }); }
    if (out.after) out.after();
  }

  function bar(title, o) {
    o = o || {};
    return '<header class="bar">' +
      (o.back ? '<button class="bar__btn" data-act="' + o.back + '" aria-label="' + (o.backLabel || 'Back') + '">' + (o.backIcon || '←') + '</button>' : '') +
      '<div class="bar__titles">' + (o.kicker ? '<div class="bar__kicker">' + o.kicker + '</div>' : '') +
      '<h1 class="bar__title">' + title + '</h1></div>' + (o.right || '') + '</header>';
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var fn = actions[el.getAttribute('data-act')];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-bind]');
    if (el && binds[el.getAttribute('data-bind')]) binds[el.getAttribute('data-bind')](el);
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-form]');
    if (f && actions[f.getAttribute('data-form')]) { e.preventDefault(); actions[f.getAttribute('data-form')](f, e); }
  });

  var TAB_VIEWS = { home: 'home', checkin: 'checkin', talk: 'talk', play: 'play', pray: 'pray' };
  actions.tab = function (el) { go(TAB_VIEWS[el.getAttribute('data-tab')] || 'home'); };
  actions.go = function (el) { go(el.getAttribute('data-to')); };

  // =====================================================
  // Onboarding & settings
  // =====================================================
  function namesForm(submitLabel) {
    return '<form class="stack" data-form="save-names" autocomplete="off">' +
      '<label class="field"><span class="field__label">Your name</span>' +
      '<input class="input" name="a" maxlength="20" required value="' + esc(store.names[0]) + '" placeholder="e.g. Sam" /></label>' +
      '<label class="field"><span class="field__label">Your person’s name</span>' +
      '<input class="input" name="b" maxlength="20" required value="' + esc(store.names[1]) + '" placeholder="e.g. Jordan" /></label>' +
      '<label class="field"><span class="field__label">Together since <em>(optional)</em></span>' +
      '<input class="input" name="since" type="date" value="' + esc(store.since) + '" max="' + new Date().toISOString().slice(0, 10) + '" /></label>' +
      '<button class="btn btn--primary btn--block btn--lg" type="submit">' + submitLabel + '</button>' +
      '</form>';
  }

  views.onboard = function () {
    return { nav: false, html:
      '<section class="hero">' +
        '<div class="hero__mark" aria-hidden="true">💞</div>' +
        '<div class="badge">For couples</div>' +
        '<h1 class="hero__title">Heart <em>to</em> Heart</h1>' +
        '<p class="hero__sub">A little space for the two of you to catch up on <strong>life</strong>, <strong>faith</strong> and <strong>us</strong> — with games to keep it fun.</p>' +
      '</section>' +
      '<div class="card">' + namesForm('Let’s begin') +
        '<p class="fine">Everything stays on this phone. No accounts, nothing uploaded.</p>' +
      '</div>' +
      '<a class="backlink" href="../">← All games</a>'
    };
  };

  actions['save-names'] = function (f) {
    var a = f.a.value.trim(), b = f.b.value.trim();
    if (!a || !b) { toast('Add both names'); return; }
    if (a.toLowerCase() === b.toLowerCase()) { toast('Use two different names'); return; }
    var first = !hasNames();
    store.names = [a, b];
    store.since = f.since.value || '';
    save();
    toast(first ? 'Welcome, ' + a + ' & ' + b + ' 💞' : 'Saved');
    go('home');
  };

  views.settings = function () {
    return { tab: 'home', html:
      bar('Settings', { back: 'go-home' }) +
      '<div class="card">' + namesForm('Save') + '</div>' +
      '<div class="card">' +
        '<h2 class="card__title">Your data</h2>' +
        '<p class="muted">' + plural(store.journal.length, 'check-in') + ', ' + plural(store.prayers.length, 'prayer request') + ', ' +
          plural(store.favs.length, 'favourite card') + ' and ' + plural(store.dates.length, 'saved date idea') + ' — stored only on this device.</p>' +
        '<button class="btn btn--danger btn--block" data-act="erase">Erase everything</button>' +
      '</div>'
    };
  };
  actions['go-home'] = function () { go('home'); };
  actions.settings = function () { go('settings'); };
  actions.erase = function () {
    if (!confirm('Erase all names, check-ins, prayers and favourites from this device? This can’t be undone.')) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
    store = load(); ci = null;
    toast('All cleared');
    go('onboard');
  };

  // =====================================================
  // Home
  // =====================================================
  views.home = function () {
    var last = store.journal[0];
    var nudge;
    if (ci) nudge = { t: 'Check-in in progress', d: 'You’re on step ' + (ci.step + 1) + ' of ' + CI_STEPS.length + '. Pick up where you left off.', cta: 'Continue' };
    else if (!last) nudge = { t: 'Your first catch-up', d: 'Set aside 15 minutes, grab a drink, and walk through life, faith and us together.', cta: 'Start a check-in' };
    else {
      var d = daysSince(last.date);
      nudge = d >= 7
        ? { t: 'It’s been ' + d + ' days', d: 'Time for a catch-up? A little check-in goes a long way.', cta: 'Catch up now' }
        : { t: 'Last caught up ' + agoText(d), d: 'Nice rhythm. Keep it going — or draw a Talk card tonight.', cta: 'Check in again' };
    }

    var together = '';
    if (store.since) {
      var n = daysSince(new Date(store.since + 'T00:00:00').getTime());
      if (n >= 0) together = '<div class="together"><strong>' + n.toLocaleString() + '</strong> ' + (n === 1 ? 'day' : 'days') + ' together</div>';
    }
    var v = C.VERSES[Math.floor(startOfDay(Date.now()) / DAY) % C.VERSES.length];
    var active = store.prayers.filter(function (p) { return !p.answered; }).length;
    var answered = store.prayers.length - active;

    return { tab: 'home', html:
      '<header class="greet">' +
        '<button class="bar__btn greet__gear" data-act="settings" aria-label="Settings">⚙️</button>' +
        '<div class="greet__kicker">Heart to Heart</div>' +
        '<h1 class="greet__title">' + name(0) + ' <span class="amp">&amp;</span> ' + name(1) + '</h1>' +
        together +
      '</header>' +

      '<button class="nudge" data-act="tab" data-tab="checkin">' +
        '<span class="nudge__icon" aria-hidden="true">☕</span>' +
        '<span class="nudge__body"><span class="nudge__title">' + esc(nudge.t) + '</span><span class="nudge__text">' + esc(nudge.d) + '</span></span>' +
        '<span class="nudge__cta">' + esc(nudge.cta) + ' →</span>' +
      '</button>' +

      '<div class="tiles">' +
        tile('talk', '💬', 'Talk', C.DECKS.length + ' decks of conversation cards', '#b49cff') +
        tile('play', '🎲', 'Play', '5 games for the two of you', '#ffb36b') +
        tile('pray', '🙏', 'Pray', active ? plural(active, 'request') + ' on your list' : 'Your shared prayer list', '#f3c27a') +
        tile('journal', '📖', 'Journal', store.journal.length ? plural(store.journal.length, 'check-in') + ' saved' : 'Your check-ins, kept', '#8fd3b0') +
      '</div>' +

      '<figure class="verse">' +
        '<div class="verse__label">Verse for today</div>' +
        '<blockquote class="verse__text">“' + esc(v.text) + '”</blockquote>' +
        '<figcaption class="verse__ref">' + esc(v.ref) + ' · KJV</figcaption>' +
      '</figure>' +

      (store.journal.length || answered ? '<div class="stats">' +
        stat(store.journal.length, 'check-ins') + stat(answered, 'prayers answered') + stat(store.favs.length, 'favourite cards') +
      '</div>' : '') +

      '<a class="backlink" href="../">← All games</a>'
    };
  };
  function tile(tab, emoji, title, sub, color) {
    var act = tab === 'journal' ? 'data-act="open-journal"' : 'data-act="tab" data-tab="' + tab + '"';
    return '<button class="tile" ' + act + ' style="--c:' + color + '">' +
      '<span class="tile__emoji" aria-hidden="true">' + emoji + '</span>' +
      '<span class="tile__title">' + title + '</span><span class="tile__sub">' + esc(sub) + '</span></button>';
  }
  function stat(n, label) { return '<div class="stat"><strong>' + n + '</strong><span>' + label + '</span></div>'; }
  actions['open-journal'] = function () { praySub = 'journal'; go('pray'); };

  // =====================================================
  // Check-in
  // =====================================================
  var CI_STEPS = ['mood', 'life', 'faith', 'us', 'appreciate', 'pray', 'close'];
  var ci = null;

  function ciStart() {
    ci = { step: 0, moods: [null, null], first: rand(2), appreciate: ['', ''], prayers: ['', ''], topics: {}, verse: C.VERSES[rand(C.VERSES.length)] };
    ['life', 'faith', 'us'].forEach(function (t) {
      ci.topics[t] = { order: shuffle(C.CHECKIN[t].prompts.map(function (_, i) { return i; })), k: 0, notes: '' };
    });
  }
  function ciPrompt(t) { var s = ci.topics[t]; return C.CHECKIN[t].prompts[s.order[s.k % s.order.length]]; }

  views.checkin = function () {
    if (!ci) {
      return { tab: 'checkin', html:
        bar('Catch up', { kicker: 'Weekly check-in' }) +
        '<div class="card card--intro">' +
          '<div class="intro__emoji" aria-hidden="true">☕</div>' +
          '<h2 class="card__title">Fifteen minutes, just the two of you</h2>' +
          '<p class="muted">Put the phone between you. You’ll take turns answering one question in each area, say what you appreciated, share prayer requests — then pray together.</p>' +
          '<ul class="checklist">' +
            '<li><span>🙂</span> How you’re each feeling</li>' +
            '<li><span>🌱</span> Life — the highs, lows and to-do list</li>' +
            '<li><span>✝️</span> Faith — where you are with God</li>' +
            '<li><span>💞</span> Us — how you’re doing as a team</li>' +
            '<li><span>🙏</span> Appreciation, prayer requests and a blessing</li>' +
          '</ul>' +
          '<button class="btn btn--primary btn--block btn--lg" data-act="ci-begin">Start check-in</button>' +
        '</div>' +
        (store.journal.length ? '<button class="linkbtn" data-act="open-journal">See past check-ins (' + store.journal.length + ') →</button>' : '')
      };
    }

    var step = CI_STEPS[ci.step];
    var pct = Math.round((ci.step / (CI_STEPS.length - 1)) * 100);
    var head = bar('Catch up', { kicker: 'Step ' + (ci.step + 1) + ' of ' + CI_STEPS.length, back: 'ci-quit', backIcon: '✕', backLabel: 'Quit check-in' }) +
      '<div class="progress" aria-hidden="true"><span style="width:' + pct + '%"></span></div>';
    var body = '', canNext = true, nextLabel = 'Next';

    if (step === 'mood') {
      body = '<h2 class="step__title">How are you each doing?</h2>' +
        '<p class="muted">Be honest — there’s no wrong answer. Tap one each.</p>' +
        [0, 1].map(function (w) {
          return '<div class="mood"><div class="mood__name">' + name(w) + '</div><div class="mood__row" role="group" aria-label="' + name(w) + '’s mood">' +
            C.MOODS.map(function (m, i) {
              var on = ci.moods[w] === i;
              return '<button class="mood__btn' + (on ? ' is-on' : '') + '" data-act="ci-mood" data-w="' + w + '" data-v="' + i + '" aria-pressed="' + on + '">' +
                '<span aria-hidden="true">' + m.emoji + '</span><small>' + m.label + '</small></button>';
            }).join('') + '</div></div>';
        }).join('');
      canNext = ci.moods[0] !== null && ci.moods[1] !== null;
      if (canNext && (ci.moods[0] <= 1 || ci.moods[1] <= 1)) {
        body += '<p class="gentle">💛 Someone’s having a rough one. Go gently — it’s okay to spend the whole check-in right here.</p>';
      }
    } else if (C.CHECKIN[step]) {
      var t = C.CHECKIN[step];
      var speaker = (ci.first + ci.step) % 2;
      body = '<div class="step__chip">' + t.emoji + ' ' + t.title + '</div>' +
        '<p class="muted">' + esc(t.blurb) + '</p>' +
        '<div class="prompt">' +
          '<div class="prompt__who">' + name(speaker) + ' goes first, then ' + name(1 - speaker) + '</div>' +
          '<p class="prompt__text">' + esc(ciPrompt(step)) + '</p>' +
          '<button class="chipbtn" data-act="ci-swap">↻ Different question</button>' +
        '</div>' +
        '<label class="field"><span class="field__label">Anything worth remembering? <em>(optional)</em></span>' +
        '<textarea class="input input--area" rows="3" data-bind="ci-notes" data-topic="' + step + '" placeholder="A few words for your journal…">' + esc(ci.topics[step].notes) + '</textarea></label>';
    } else if (step === 'appreciate') {
      body = '<h2 class="step__title">Say thank you</h2>' +
        '<p class="muted">One thing you appreciated about each other this week. Say it out loud, then jot it down.</p>' +
        [0, 1].map(function (w) {
          return '<label class="field"><span class="field__label">' + name(w) + ' → ' + name(1 - w) + '</span>' +
            '<textarea class="input input--area" rows="2" data-bind="ci-app" data-w="' + w + '" placeholder="I loved it when you…">' + esc(ci.appreciate[w]) + '</textarea></label>';
        }).join('');
    } else if (step === 'pray') {
      body = '<h2 class="step__title">How can I pray for you?</h2>' +
        '<p class="muted">Each share one request for this week. They’ll go onto your shared prayer list so you can keep praying — and mark them answered.</p>' +
        [0, 1].map(function (w) {
          return '<label class="field"><span class="field__label">Pray for ' + name(w) + '</span>' +
            '<textarea class="input input--area" rows="2" data-bind="ci-pray" data-w="' + w + '" placeholder="Please pray for…">' + esc(ci.prayers[w]) + '</textarea></label>';
        }).join('');
    } else if (step === 'close') {
      var reqs = [0, 1].filter(function (w) { return ci.prayers[w].trim(); });
      body = '<h2 class="step__title">Pray together</h2>' +
        '<ol class="guide">' +
          '<li><strong>Thank</strong> — each thank God for one good thing from this week.</li>' +
          '<li><strong>Ask</strong> — pray for each other’s requests' + (reqs.length ? ':' : '.') +
            (reqs.length ? '<ul>' + reqs.map(function (w) { return '<li><em>' + name(w) + ':</em> ' + esc(ci.prayers[w].trim()) + '</li>'; }).join('') + '</ul>' : '') + '</li>' +
          '<li><strong>Bless</strong> — finish by reading this over each other:</li>' +
        '</ol>' +
        '<figure class="verse verse--inline"><blockquote class="verse__text">“' + esc(ci.verse.text) + '”</blockquote>' +
        '<figcaption class="verse__ref">' + esc(ci.verse.ref) + ' · KJV</figcaption></figure>';
      nextLabel = 'Save to our journal';
    }

    return { tab: 'checkin', html: head + '<section class="step">' + body + '</section>' +
      '<div class="navrow">' +
        (ci.step > 0 ? '<button class="btn btn--ghost" data-act="ci-back">Back</button>' : '<span></span>') +
        '<button class="btn btn--primary" data-act="ci-next"' + (canNext ? '' : ' disabled') + '>' + nextLabel + '</button>' +
      '</div>'
    };
  };

  actions['ci-begin'] = function () { ciStart(); render(true); };
  actions['ci-mood'] = function (el) { ci.moods[+el.getAttribute('data-w')] = +el.getAttribute('data-v'); render(); };
  actions['ci-swap'] = function () { ci.topics[CI_STEPS[ci.step]].k++; render(); };
  actions['ci-back'] = function () { ci.step = Math.max(0, ci.step - 1); render(true); };
  actions['ci-next'] = function () {
    if (ci.step < CI_STEPS.length - 1) { ci.step++; render(true); return; }
    ciSave();
  };
  actions['ci-quit'] = function () {
    if (!confirm('Leave this check-in? Nothing from it will be saved.')) return;
    ci = null; go('checkin');
  };
  binds['ci-notes'] = function (el) { ci.topics[el.getAttribute('data-topic')].notes = el.value; };
  binds['ci-app'] = function (el) { ci.appreciate[+el.getAttribute('data-w')] = el.value; };
  binds['ci-pray'] = function (el) { ci.prayers[+el.getAttribute('data-w')] = el.value; };

  function ciSave() {
    var now = Date.now();
    var entry = {
      id: uid(), date: now, moods: ci.moods.slice(),
      items: ['life', 'faith', 'us'].map(function (t) { return { topic: t, prompt: ciPrompt(t), notes: ci.topics[t].notes.trim() }; }),
      appreciate: ci.appreciate.map(function (s) { return s.trim(); }),
      prayers: ci.prayers.map(function (s) { return s.trim(); }),
      verse: ci.verse.ref
    };
    store.journal.unshift(entry);
    entry.prayers.forEach(function (p, w) {
      if (p) store.prayers.unshift({ id: uid(), text: p, who: w, added: now, answered: null });
    });
    save();
    ci = null;
    toast('Saved to your journal 💛');
    go('home');
  }

  // =====================================================
  // Talk — conversation cards
  // =====================================================
  var DEPTHS = ['All', 'Light', 'Deeper', 'Deepest'];
  var tk = null;
  function deckById(id) { for (var i = 0; i < C.DECKS.length; i++) if (C.DECKS[i].id === id) return C.DECKS[i]; return null; }
  function isFav(t) { return store.favs.some(function (f) { return f.t === t; }); }

  views.talk = function () {
    var favCount = store.favs.length;
    return { tab: 'talk', html:
      bar('Talk', { kicker: 'Conversation cards' }) +
      '<p class="lede">Pick a deck, put the phone down between you and take turns. Go as light or as deep as tonight allows.</p>' +
      '<div class="decks">' +
        C.DECKS.map(function (d) {
          return '<button class="deck" data-act="deck" data-id="' + d.id + '" style="--c:' + d.color + '">' +
            '<span class="deck__emoji" aria-hidden="true">' + d.emoji + '</span>' +
            '<span class="deck__title">' + esc(d.title) + '</span>' +
            '<span class="deck__blurb">' + esc(d.blurb) + '</span>' +
            '<span class="deck__count">' + d.cards.length + ' cards</span></button>';
        }).join('') +
        '<button class="deck deck--fav" data-act="deck" data-id="favs" style="--c:#ff6f91"' + (favCount ? '' : ' disabled') + '>' +
          '<span class="deck__emoji" aria-hidden="true">❤️</span><span class="deck__title">Favourites</span>' +
          '<span class="deck__blurb">' + (favCount ? 'The cards you’ve hearted.' : 'Tap ♡ on any card to save it here.') + '</span>' +
          '<span class="deck__count">' + plural(favCount, 'card') + '</span></button>' +
      '</div>'
    };
  };

  function tkCards() {
    var list;
    if (tk.id === 'favs') list = store.favs.map(function (f) { return { t: f.t, depth: f.depth || 1, deck: f.d }; });
    else list = deckById(tk.id).cards.map(function (c) { return { t: c[0], depth: c[1], deck: tk.id }; });
    if (tk.depth) list = list.filter(function (c) { return c.depth === tk.depth; });
    return list;
  }
  function tkDeal() { tk.cards = shuffle(tkCards()); tk.pos = 0; tk.first = rand(2); }

  actions.deck = function (el) { tk = { id: el.getAttribute('data-id'), depth: 0 }; tkDeal(); go('card'); };

  views.card = function () {
    if (!tk) return views.talk();
    var isFavDeck = tk.id === 'favs';
    var deck = isFavDeck ? { title: 'Favourites', emoji: '❤️', color: '#ff6f91' } : deckById(tk.id);
    var source = isFavDeck ? store.favs.map(function (f) { return f.depth || 1; }) : deck.cards.map(function (c) { return c[1]; });
    var depthsHere = [1, 2, 3].filter(function (d) { return source.indexOf(d) !== -1; });

    var html = bar(esc(deck.title), { back: 'to-talk', kicker: 'Talk' });
    if (depthsHere.length > 1) {
      html += '<div class="seg" role="group" aria-label="Depth">' + [0].concat(depthsHere).map(function (d) {
        return '<button class="seg__btn' + (tk.depth === d ? ' is-on' : '') + '" data-act="tk-depth" data-d="' + d + '" aria-pressed="' + (tk.depth === d) + '">' + DEPTHS[d] + '</button>';
      }).join('') + '</div>';
    }
    if (!tk.cards.length) {
      return { tab: 'talk', html: html + '<div class="empty">No cards here yet.</div>' };
    }
    var c = tk.cards[tk.pos];
    var cd = deckById(c.deck) || deck;
    var speaker = (tk.first + tk.pos) % 2;
    var fav = isFav(c.t);
    html +=
      '<article class="talkcard" style="--c:' + cd.color + '">' +
        '<div class="talkcard__top"><span>' + cd.emoji + ' ' + esc(cd.title) + '</span>' +
          '<span class="dots" aria-label="' + DEPTHS[c.depth] + '">' + [1, 2, 3].map(function (i) { return '<i class="' + (i <= c.depth ? 'on' : '') + '"></i>'; }).join('') + '</span></div>' +
        '<p class="talkcard__text">' + esc(c.t) + '</p>' +
        '<div class="talkcard__who">' + name(speaker) + ' answers first</div>' +
      '</article>' +
      '<div class="cardnav">' +
        '<button class="roundbtn" data-act="tk-prev" aria-label="Previous card"' + (tk.pos === 0 ? ' disabled' : '') + '>←</button>' +
        '<button class="roundbtn roundbtn--fav' + (fav ? ' is-on' : '') + '" data-act="tk-fav" aria-pressed="' + fav + '" aria-label="' + (fav ? 'Remove from favourites' : 'Save to favourites') + '">' + (fav ? '❤️' : '♡') + '</button>' +
        '<button class="roundbtn roundbtn--next" data-act="tk-next" aria-label="Next card">→</button>' +
      '</div>' +
      '<div class="cardmeta">Card ' + (tk.pos + 1) + ' of ' + tk.cards.length + ' · <button class="linkbtn linkbtn--inline" data-act="tk-shuffle">Shuffle</button></div>';
    return { tab: 'talk', html: html };
  };
  actions['to-talk'] = function () { go('talk'); };
  actions['tk-depth'] = function (el) { tk.depth = +el.getAttribute('data-d'); tkDeal(); render(); };
  actions['tk-prev'] = function () { if (tk.pos > 0) { tk.pos--; render(); } };
  actions['tk-next'] = function () {
    if (tk.pos < tk.cards.length - 1) tk.pos++;
    else { tkDeal(); toast('Deck reshuffled'); }
    render();
  };
  actions['tk-shuffle'] = function () { tkDeal(); render(); toast('Shuffled'); };
  actions['tk-fav'] = function () {
    var c = tk.cards[tk.pos];
    if (isFav(c.t)) store.favs = store.favs.filter(function (f) { return f.t !== c.t; });
    else store.favs.push({ d: c.deck, t: c.t, depth: c.depth });
    save(); render();
  };

  // =====================================================
  // Play — game list
  // =====================================================
  var GAMES = [
    { id: 'knowme', emoji: '🧠', title: 'How Well Do You Know Me?', color: '#ff8fab',
      desc: 'Answer about yourself in secret, then your person guesses. Five each, then swap.' },
    { id: 'sync', emoji: '🔗', title: 'In Sync', color: '#7cc7ff',
      desc: 'Ten quick this-or-thats. You each pick privately — then see how in sync you really are.' },
    { id: 'quiz', emoji: '📜', title: 'Couples of the Bible', color: '#f3c27a',
      desc: 'Ruth & Boaz, Priscilla & Aquila and more. Ten questions — compete or team up.' },
    { id: 'verse', emoji: '🧩', title: 'Verse Builder', color: '#8fd3b0',
      desc: 'Tap the scrambled words into order to build verses about love — together.' },
    { id: 'spin', emoji: '🎡', title: 'Date Night Spinner', color: '#b49cff',
      desc: 'Can’t decide? Spin for a date idea — stay in, go out, serve, pray, create.' }
  ];

  views.play = function () {
    return { tab: 'play', html:
      bar('Play', { kicker: 'Games for two' }) +
      '<div class="games">' + GAMES.map(function (g) {
        var best = g.id === 'sync' && store.best.sync != null ? 'Best: ' + store.best.sync + '% in sync'
          : g.id === 'knowme' && store.best.knowme != null ? 'Best: ' + store.best.knowme + '/10 together'
          : g.id === 'spin' && store.dates.length ? plural(store.dates.length, 'saved idea') : '';
        return '<button class="game" data-act="start-game" data-id="' + g.id + '" style="--c:' + g.color + '">' +
          '<span class="game__emoji" aria-hidden="true">' + g.emoji + '</span>' +
          '<span class="game__body"><span class="game__title">' + esc(g.title) + '</span>' +
          '<span class="game__desc">' + esc(g.desc) + '</span>' +
          (best ? '<span class="game__best">' + esc(best) + '</span>' : '') + '</span>' +
          '<span class="game__go" aria-hidden="true">→</span></button>';
      }).join('') + '</div>'
    };
  };

  actions['start-game'] = function (el) {
    var id = el.getAttribute('data-id');
    if (id === 'knowme') kmStart();
    if (id === 'sync') syStart();
    if (id === 'quiz') qzStart();
    if (id === 'verse') vsStart();
    if (id === 'spin') spStart();
    go(id);
  };
  actions['quit-game'] = function (el) {
    if (el.hasAttribute('data-confirm') && !confirm('Quit this game?')) return;
    go('play');
  };
  function gameBar(title, midGame) {
    return bar(title, { back: 'quit-game', backIcon: '✕', backLabel: 'Quit game', kicker: 'Play' })
      .replace('data-act="quit-game"', 'data-act="quit-game"' + (midGame ? ' data-confirm' : ''));
  }
  function handScreen(who, sub, act) {
    return '<section class="hand">' +
      '<div class="hand__emoji" aria-hidden="true">🤫</div>' +
      '<p class="hand__pass">Pass the phone to</p>' +
      '<h2 class="hand__name">' + name(who) + '</h2>' +
      '<p class="muted">' + sub + '</p>' +
      '<button class="btn btn--primary btn--block btn--lg" data-act="' + act + '">I’m ' + name(who) + ' — ready</button>' +
    '</section>';
  }
  function optionButtons(opts, act, extra) {
    return '<div class="opts">' + opts.map(function (o, i) {
      var cls = extra ? extra(i) : '';
      return '<button class="opt' + (cls ? ' ' + cls : '') + '" data-act="' + act + '" data-v="' + i + '"' + (cls && cls.indexOf('is-locked') !== -1 ? ' disabled' : '') + '>' + esc(o) + '</button>';
    }).join('') + '</div>';
  }

  // ---------- Game: How Well Do You Know Me? ----------
  var km = null;
  var KM_PER = 5;
  function kmStart() {
    var qs = shuffle(C.KNOWME);
    km = { phase: 'intro', subject: 0, i: 0, qs: [qs.slice(0, KM_PER), qs.slice(KM_PER, KM_PER * 2)], ans: [[], []], guess: [[], []] };
  }
  function kmScore(s) { var n = 0; for (var i = 0; i < KM_PER; i++) if (km.ans[s][i] === km.guess[s][i]) n++; return n; }

  views.knowme = function () {
    var s = km.subject, g = 1 - s, h;
    var mid = km.phase !== 'intro' && km.phase !== 'final';
    if (km.phase === 'intro') {
      h = '<section class="intro">' +
        '<div class="intro__emoji" aria-hidden="true">🧠</div>' +
        '<h2 class="card__title">How well do you know me?</h2>' +
        '<ol class="howto">' +
          '<li>' + name(0) + ' secretly answers ' + KM_PER + ' questions about themselves.</li>' +
          '<li>' + name(1) + ' guesses what ' + name(0) + ' picked.</li>' +
          '<li>Swap and do it again. Then compare notes!</li>' +
        '</ol>' +
        '<button class="btn btn--primary btn--block btn--lg" data-act="km-go">Start</button></section>';
    } else if (km.phase === 'handA') {
      h = handScreen(s, 'Answer ' + KM_PER + ' questions about <strong>yourself</strong>. Don’t let ' + name(g) + ' see!', 'km-go');
    } else if (km.phase === 'answer' || km.phase === 'guess') {
      var answering = km.phase === 'answer';
      var q = km.qs[s][km.i];
      h = '<div class="qhead"><span class="pill">' + (answering ? name(s) + ' answering' : name(g) + ' guessing') + '</span><span class="qcount">' + (km.i + 1) + ' / ' + KM_PER + '</span></div>' +
        '<h2 class="qtext">' + esc(q.q) + '</h2>' +
        '<p class="muted center">' + (answering ? 'Pick what’s true for you.' : 'What did ' + name(s) + ' pick?') + '</p>' +
        optionButtons(q.o, 'km-pick');
    } else if (km.phase === 'handG') {
      h = handScreen(g, 'Time to guess how ' + name(s) + ' answered. No peeking at their face!', 'km-go');
    } else if (km.phase === 'reveal') {
      var sc = kmScore(s);
      h = '<section class="result"><div class="result__big">' + sc + '<small>/' + KM_PER + '</small></div>' +
        '<p class="result__line">' + name(g) + ' knows ' + name(s) + ' ' + ['…we have some catching up to do 😅', 'a little bit', 'pretty well', 'really well', 'so well!', 'perfectly 🤯'][sc] + '</p></section>' +
        '<ul class="reveal">' + km.qs[s].map(function (q, i) {
          var ok = km.ans[s][i] === km.guess[s][i];
          return '<li class="reveal__row' + (ok ? ' is-ok' : '') + '"><div class="reveal__q">' + esc(q.q) + '</div>' +
            '<div class="reveal__a"><span>' + name(s) + ': <strong>' + esc(q.o[km.ans[s][i]]) + '</strong></span>' +
            (ok ? '<span class="tick">✓</span>' : '<span>' + name(g) + ' guessed: ' + esc(q.o[km.guess[s][i]]) + '</span>') + '</div></li>';
        }).join('') + '</ul>' +
        '<p class="gentle">💬 Pick one you missed and ask: “Why that answer?”</p>' +
        '<button class="btn btn--primary btn--block btn--lg" data-act="km-go">' + (s === 0 ? 'Swap — ' + name(1) + '’s turn' : 'See final score') + '</button>';
    } else {
      var a = kmScore(0), b = kmScore(1), tot = a + b;
      if (store.best.knowme == null || tot > store.best.knowme) { store.best.knowme = tot; save(); }
      h = '<section class="result"><div class="result__emoji">' + (tot >= 8 ? '🏆' : tot >= 5 ? '💞' : '🌱') + '</div>' +
        '<div class="result__big">' + tot + '<small>/' + (KM_PER * 2) + '</small></div>' +
        '<p class="result__line">' + (tot >= 8 ? 'You two are basically mind-readers.' : tot >= 5 ? 'You know each other well — and there’s still more to discover.' : 'Plenty left to learn about each other. That’s the fun part!') + '</p></section>' +
        '<div class="duo">' +
          '<div class="duo__cell"><strong>' + b + '/' + KM_PER + '</strong><span>' + name(0) + ' knows ' + name(1) + '</span></div>' +
          '<div class="duo__cell"><strong>' + a + '/' + KM_PER + '</strong><span>' + name(1) + ' knows ' + name(0) + '</span></div>' +
        '</div>' +
        '<button class="btn btn--primary btn--block btn--lg" data-act="start-game" data-id="knowme">Play again</button>' +
        '<button class="btn btn--ghost btn--block" data-act="quit-game">Back to games</button>';
    }
    return { nav: !mid, tab: 'play', html: gameBar('Know Me', mid) + h };
  };
  actions['km-go'] = function () {
    var p = km.phase;
    if (p === 'intro') km.phase = 'handA';
    else if (p === 'handA') { km.phase = 'answer'; km.i = 0; }
    else if (p === 'handG') { km.phase = 'guess'; km.i = 0; }
    else if (p === 'reveal') { if (km.subject === 0) { km.subject = 1; km.phase = 'handA'; } else km.phase = 'final'; }
    render(true);
  };
  actions['km-pick'] = function (el) {
    var v = +el.getAttribute('data-v');
    var list = km.phase === 'answer' ? km.ans[km.subject] : km.guess[km.subject];
    list[km.i] = v;
    if (km.i < KM_PER - 1) { km.i++; render(); return; }
    km.phase = km.phase === 'answer' ? 'handG' : 'reveal';
    render(true);
  };

  // ---------- Game: In Sync ----------
  var sy = null;
  var SY_N = 10;
  function syStart() { sy = { phase: 'intro', who: 0, i: 0, pairs: shuffle(C.THISTHAT).slice(0, SY_N), picks: [[], []] }; }
  views.sync = function () {
    var h, mid = sy.phase === 'hand' || sy.phase === 'pick';
    if (sy.phase === 'intro') {
      h = '<section class="intro"><div class="intro__emoji" aria-hidden="true">🔗</div>' +
        '<h2 class="card__title">How in sync are you?</h2>' +
        '<ol class="howto"><li>' + name(0) + ' picks one side of ' + SY_N + ' this-or-thats, in secret.</li>' +
        '<li>' + name(1) + ' does the same ' + SY_N + '.</li><li>Reveal and see how often you matched.</li></ol>' +
        '<button class="btn btn--primary btn--block btn--lg" data-act="sy-go">Start</button></section>';
    } else if (sy.phase === 'hand') {
      h = handScreen(sy.who, 'Pick quickly — go with your gut. Keep it hidden from ' + name(1 - sy.who) + '.', 'sy-go');
    } else if (sy.phase === 'pick') {
      var pair = sy.pairs[sy.i];
      h = '<div class="qhead"><span class="pill">' + name(sy.who) + ' picking</span><span class="qcount">' + (sy.i + 1) + ' / ' + SY_N + '</span></div>' +
        '<div class="tot">' +
          '<button class="tot__btn" data-act="sy-pick" data-v="0">' + esc(pair[0]) + '</button>' +
          '<span class="tot__or">or</span>' +
          '<button class="tot__btn" data-act="sy-pick" data-v="1">' + esc(pair[1]) + '</button>' +
        '</div>';
    } else {
      var m = 0;
      sy.pairs.forEach(function (_, i) { if (sy.picks[0][i] === sy.picks[1][i]) m++; });
      var pct = Math.round((m / SY_N) * 100);
      if (store.best.sync == null || pct > store.best.sync) { store.best.sync = pct; save(); }
      h = '<section class="result"><div class="result__emoji">' + (pct >= 80 ? '🔗' : pct >= 50 ? '💞' : '🌶️') + '</div>' +
        '<div class="result__big">' + pct + '<small>%</small></div>' +
        '<p class="result__line">' + (pct >= 80 ? 'Totally in sync. Are you sure you’re two people?' : pct >= 50 ? 'Nicely in tune — with just enough difference to keep things interesting.' : 'Opposites attract! Plenty to talk about here.') + '</p></section>' +
        '<ul class="sync">' + sy.pairs.map(function (p, i) {
          var a = sy.picks[0][i], b = sy.picks[1][i], same = a === b;
          return '<li class="sync__row' + (same ? ' is-ok' : '') + '">' +
            '<span class="sync__pick"><small>' + name(0) + '</small>' + esc(p[a]) + '</span>' +
            '<span class="sync__mid" aria-label="' + (same ? 'match' : 'different') + '">' + (same ? '✓' : '≠') + '</span>' +
            '<span class="sync__pick"><small>' + name(1) + '</small>' + esc(p[b]) + '</span></li>';
        }).join('') + '</ul>' +
        '<button class="btn btn--primary btn--block btn--lg" data-act="start-game" data-id="sync">Play again</button>' +
        '<button class="btn btn--ghost btn--block" data-act="quit-game">Back to games</button>';
    }
    return { nav: !mid, tab: 'play', html: gameBar('In Sync', mid) + h };
  };
  actions['sy-go'] = function () {
    if (sy.phase === 'intro') { sy.phase = 'hand'; sy.who = 0; }
    else if (sy.phase === 'hand') { sy.phase = 'pick'; sy.i = 0; }
    render(true);
  };
  actions['sy-pick'] = function (el) {
    sy.picks[sy.who][sy.i] = +el.getAttribute('data-v');
    if (sy.i < SY_N - 1) { sy.i++; render(); return; }
    if (sy.who === 0) { sy.who = 1; sy.phase = 'hand'; } else sy.phase = 'reveal';
    render(true);
  };

  // ---------- Game: Couples of the Bible quiz ----------
  var qz = null;
  var QZ_N = 10;
  function qzStart() { qz = { phase: 'intro', team: false, i: 0, turn: rand(2), scores: [0, 0], picked: null, qs: [] }; }
  function qzDeal() {
    qz.qs = shuffle(C.QUIZ).slice(0, QZ_N).map(function (q) {
      var order = shuffle(q.o.map(function (_, i) { return i; }));
      return { q: q.q, ref: q.ref, o: order.map(function (i) { return q.o[i]; }), a: order.indexOf(q.a) };
    });
    qz.i = 0; qz.scores = [0, 0]; qz.picked = null;
  }
  views.quiz = function () {
    var h, mid = qz.phase === 'play';
    if (qz.phase === 'intro') {
      h = '<section class="intro"><div class="intro__emoji" aria-hidden="true">📜</div>' +
        '<h2 class="card__title">Couples of the Bible</h2>' +
        '<p class="muted">' + QZ_N + ' questions about the love stories — and love lessons — of Scripture.</p>' +
        '<div class="choice">' +
          '<button class="choice__btn" data-act="qz-mode" data-team="0"><strong>⚔️ Take turns</strong><span>Alternate questions. Most right wins.</span></button>' +
          '<button class="choice__btn" data-act="qz-mode" data-team="1"><strong>🤝 Team up</strong><span>Answer every question together.</span></button>' +
        '</div></section>';
    } else if (qz.phase === 'play') {
      var q = qz.qs[qz.i];
      var who = qz.team ? 'Together' : name((qz.turn + qz.i) % 2) + '’s question';
      var answered = qz.picked !== null;
      h = '<div class="qhead"><span class="pill">' + who + '</span><span class="qcount">' + (qz.i + 1) + ' / ' + QZ_N + '</span></div>' +
        (qz.team ? '<div class="scoreline">Team score: <strong>' + qz.scores[0] + '</strong></div>'
          : '<div class="scoreline">' + name(0) + ' <strong>' + qz.scores[0] + '</strong> · ' + name(1) + ' <strong>' + qz.scores[1] + '</strong></div>') +
        '<h2 class="qtext">' + esc(q.q) + '</h2>' +
        optionButtons(q.o, 'qz-pick', function (i) {
          if (!answered) return '';
          return 'is-locked' + (i === q.a ? ' is-right' : i === qz.picked ? ' is-wrong' : '');
        }) +
        (answered ? '<div class="feedback ' + (qz.picked === q.a ? 'feedback--ok' : 'feedback--no') + '">' +
          (qz.picked === q.a ? '✓ Correct!' : '✗ Not quite — it’s “' + esc(q.o[q.a]) + '”.') + ' <span class="ref">' + esc(q.ref) + '</span></div>' +
          '<button class="btn btn--primary btn--block btn--lg" data-act="qz-next">' + (qz.i < QZ_N - 1 ? 'Next question' : 'See results') + '</button>' : '');
    } else {
      var a = qz.scores[0], b = qz.scores[1], line, emoji;
      if (qz.team) { emoji = a >= 8 ? '🏆' : a >= 5 ? '📖' : '🌱'; line = a >= 8 ? 'Bible scholars, both of you!' : a >= 5 ? 'A solid team effort.' : 'A perfect excuse to read Ruth together this week.'; }
      else if (a === b) { emoji = '🤝'; line = 'A tie! Equally yoked.'; }
      else { emoji = '🏆'; line = name(a > b ? 0 : 1) + ' takes it!'; }
      h = '<section class="result"><div class="result__emoji">' + emoji + '</div>' +
        (qz.team ? '<div class="result__big">' + a + '<small>/' + QZ_N + '</small></div>'
          : '<div class="duo"><div class="duo__cell"><strong>' + a + '</strong><span>' + name(0) + '</span></div><div class="duo__cell"><strong>' + b + '</strong><span>' + name(1) + '</span></div></div>') +
        '<p class="result__line">' + line + '</p></section>' +
        '<button class="btn btn--primary btn--block btn--lg" data-act="start-game" data-id="quiz">Play again</button>' +
        '<button class="btn btn--ghost btn--block" data-act="quit-game">Back to games</button>';
    }
    return { nav: !mid, tab: 'play', html: gameBar('Bible Quiz', mid) + h };
  };
  actions['qz-mode'] = function (el) { qz.team = el.getAttribute('data-team') === '1'; qzDeal(); qz.phase = 'play'; render(true); };
  actions['qz-pick'] = function (el) {
    if (qz.picked !== null) return;
    var q = qz.qs[qz.i];
    qz.picked = +el.getAttribute('data-v');
    if (qz.picked === q.a) qz.scores[qz.team ? 0 : (qz.turn + qz.i) % 2]++;
    render();
  };
  actions['qz-next'] = function () {
    if (qz.i < QZ_N - 1) { qz.i++; qz.picked = null; } else qz.phase = 'final';
    render(true);
  };

  // ---------- Game: Verse Builder ----------
  var vs = null;
  var VS_N = 5;
  function vsStart() { vs = { phase: 'play', list: shuffle(C.BUILD_VERSES).slice(0, VS_N), i: 0, slips: 0, hints: 0 }; vsLoad(); }
  function vsLoad() {
    var words = vs.list[vs.i].text.split(/\s+/);
    vs.words = words; vs.built = 0;
    vs.tiles = shuffle(words.map(function (w, i) { return { t: w, id: i, used: false }; }));
  }
  views.verse = function () {
    var h, v = vs.list[vs.i];
    var mid = vs.phase !== 'final';
    if (vs.phase === 'final') {
      var clean = vs.slips + vs.hints;
      h = '<section class="result"><div class="result__emoji">' + (clean === 0 ? '🌟' : clean <= 5 ? '🙌' : '🌱') + '</div>' +
        '<div class="result__big">' + VS_N + '<small> verses</small></div>' +
        '<p class="result__line">' + (clean === 0 ? 'Flawless! Not a single slip or hint.' : 'Built with ' + plural(vs.slips, 'slip') + ' and ' + plural(vs.hints, 'hint') + '.') + '</p></section>' +
        '<ul class="verselist">' + vs.list.map(function (x) { return '<li><p>“' + esc(x.text) + '”</p><small>' + esc(x.ref) + '</small></li>'; }).join('') + '</ul>' +
        '<p class="gentle">💡 Pick one to memorise together this week.</p>' +
        '<button class="btn btn--primary btn--block btn--lg" data-act="start-game" data-id="verse">Play again</button>' +
        '<button class="btn btn--ghost btn--block" data-act="quit-game">Back to games</button>';
    } else {
      var done = vs.phase === 'done';
      h = '<div class="qhead"><span class="pill">' + esc(v.ref) + '</span><span class="qcount">' + (vs.i + 1) + ' / ' + VS_N + '</span></div>' +
        '<div class="build' + (done ? ' is-done' : '') + '" aria-live="polite">' +
          vs.words.map(function (w, i) { return i < vs.built ? '<span class="build__w">' + esc(w) + '</span>' : '<span class="build__blank" aria-hidden="true"></span>'; }).join(' ') +
        '</div>';
      if (done) {
        h += '<p class="gentle center">🙌 Now read it out loud together.</p>' +
          '<button class="btn btn--primary btn--block btn--lg" data-act="vs-next">' + (vs.i < VS_N - 1 ? 'Next verse' : 'Finish') + '</button>';
      } else {
        h += '<p class="muted center">Tap the words in order. Take turns tapping!</p>' +
          '<div class="tiles-w">' + vs.tiles.map(function (t) {
            return '<button class="wtile" data-act="vs-tap" data-id="' + t.id + '"' + (t.used ? ' disabled' : '') + '>' + esc(t.t) + '</button>';
          }).join('') + '</div>' +
          '<div class="vsfoot"><span id="vs-slips">' + plural(vs.slips, 'slip') + '</span>' +
          '<button class="chipbtn" data-act="vs-hint">💡 Hint</button></div>';
      }
    }
    return { nav: !mid, tab: 'play', html: gameBar('Verse Builder', mid && (vs.i > 0 || vs.built > 0)) + h };
  };
  function vsAdvance(tile) {
    tile.used = true; vs.built++;
    if (vs.built === vs.words.length) vs.phase = 'done';
    render();
  }
  actions['vs-tap'] = function (el) {
    var id = +el.getAttribute('data-id');
    var tile = vs.tiles.filter(function (t) { return t.id === id; })[0];
    if (!tile || tile.used) return;
    if (norm(tile.t) === norm(vs.words[vs.built])) { vsAdvance(tile); return; }
    vs.slips++;
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    var s = $('#vs-slips'); if (s) s.textContent = plural(vs.slips, 'slip');
  };
  actions['vs-hint'] = function () {
    var want = norm(vs.words[vs.built]);
    var tile = vs.tiles.filter(function (t) { return !t.used && norm(t.t) === want; })[0];
    if (!tile) return;
    vs.hints++;
    vsAdvance(tile);
  };
  actions['vs-next'] = function () {
    if (vs.i < VS_N - 1) { vs.i++; vs.phase = 'play'; vsLoad(); } else vs.phase = 'final';
    render(true);
  };

  // ---------- Game: Date Night Spinner ----------
  var sp = null;
  var SLICE = 360 / C.DATES.length;
  function spStart() { if (!sp) sp = { rot: 0, spinning: false, cat: null, idea: 0 }; sp.spinning = false; }
  function wheelBg() {
    return 'conic-gradient(' + C.DATES.map(function (d, i) { return d.color + ' ' + (i * SLICE) + 'deg ' + ((i + 1) * SLICE) + 'deg'; }).join(', ') + ')';
  }
  views.spin = function () {
    var res = '';
    if (sp.cat !== null) {
      var d = C.DATES[sp.cat], idea = d.ideas[sp.idea % d.ideas.length];
      var saved = store.dates.some(function (x) { return x.t === idea; });
      res = '<div class="spinres" style="--c:' + d.color + '">' +
        '<div class="spinres__cat">' + d.emoji + ' ' + esc(d.label) + '</div>' +
        '<p class="spinres__idea">' + esc(idea) + '</p>' +
        '<div class="spinres__btns">' +
          '<button class="chipbtn" data-act="sp-another">↻ Another ' + esc(d.label.toLowerCase()) + ' idea</button>' +
          '<button class="chipbtn' + (saved ? ' is-on' : '') + '" data-act="sp-save"' + (saved ? ' disabled' : '') + '>' + (saved ? '✓ On your list' : '＋ Save to our list') + '</button>' +
        '</div></div>';
    }
    var list = store.dates.length ? '<h2 class="sect">Our date list</h2><ul class="datelist">' + store.dates.map(function (x) {
      return '<li class="datelist__item' + (x.done ? ' is-done' : '') + '">' +
        '<button class="check" data-act="sp-toggle" data-id="' + x.id + '" aria-pressed="' + !!x.done + '" aria-label="Mark ' + (x.done ? 'not done' : 'done') + '">' + (x.done ? '✓' : '') + '</button>' +
        '<span class="datelist__t">' + esc(x.e) + ' ' + esc(x.t) + '</span>' +
        '<button class="iconbtn" data-act="sp-del" data-id="' + x.id + '" aria-label="Remove">✕</button></li>';
    }).join('') + '</ul>' : '';

    return { tab: 'play', html: gameBar('Date Night', false) +
      '<div class="wheelwrap">' +
        '<div class="wheel__pointer" aria-hidden="true"></div>' +
        '<div class="wheel__clip"><div class="wheel" id="wheel" style="background:' + wheelBg() + ';transform:rotate(' + sp.rot + 'deg)">' +
          C.DATES.map(function (d, i) {
            return '<span class="wheel__label" style="--a:' + (i * SLICE + SLICE / 2) + 'deg"><span>' + d.emoji + '</span></span>';
          }).join('') +
        '</div></div>' +
        '<button class="wheel__hub" id="spin-btn" data-act="sp-spin"' + (sp.spinning ? ' disabled' : '') + '>Spin</button>' +
      '</div>' +
      '<div id="spin-result" aria-live="polite">' + (res || '<p class="muted center">Tap <strong>Spin</strong> for tonight’s date idea.</p>') + '</div>' +
      list
    };
  };
  actions['sp-spin'] = function () {
    if (sp.spinning) return;
    sp.spinning = true;
    var k = rand(C.DATES.length);
    var jitter = (Math.random() - 0.5) * (SLICE * 0.6);
    var targetMod = ((360 - (k * SLICE + SLICE / 2 + jitter)) % 360 + 360) % 360;
    var cur = ((sp.rot % 360) + 360) % 360;
    var delta = ((targetMod - cur) % 360 + 360) % 360;
    sp.rot = sp.rot + 360 * 5 + delta;
    var dur = reducedMotion() ? 400 : 4200;
    var w = $('#wheel'), btn = $('#spin-btn');
    if (btn) btn.disabled = true;
    w.style.transition = 'transform ' + dur + 'ms cubic-bezier(0.17, 0.67, 0.16, 1)';
    void w.offsetWidth;
    w.style.transform = 'rotate(' + sp.rot + 'deg)';
    setTimeout(function () {
      sp.spinning = false; sp.cat = k; sp.idea = rand(C.DATES[k].ideas.length);
      if (current === 'spin') render();
    }, dur + 60);
  };
  actions['sp-another'] = function () { sp.idea++; render(); };
  actions['sp-save'] = function () {
    var d = C.DATES[sp.cat], idea = d.ideas[sp.idea % d.ideas.length];
    store.dates.unshift({ id: uid(), t: idea, e: d.emoji, done: false });
    save(); render(); toast('Saved to your date list');
  };
  actions['sp-toggle'] = function (el) {
    var id = el.getAttribute('data-id');
    store.dates.forEach(function (x) { if (x.id === id) x.done = !x.done; });
    save(); render();
  };
  actions['sp-del'] = function (el) {
    var id = el.getAttribute('data-id');
    store.dates = store.dates.filter(function (x) { return x.id !== id; });
    save(); render();
  };

  // =====================================================
  // Pray — prayer list & journal
  // =====================================================
  var praySub = 'prayers';
  var prayFilter = 'active';
  var prayWho = 2;
  var prayDraft = '';

  views.pray = function () {
    var html = bar('Pray', { kicker: 'Together' }) +
      '<div class="seg seg--wide" role="tablist">' +
        '<button class="seg__btn' + (praySub === 'prayers' ? ' is-on' : '') + '" data-act="pray-sub" data-v="prayers" role="tab" aria-selected="' + (praySub === 'prayers') + '">🙏 Prayer list</button>' +
        '<button class="seg__btn' + (praySub === 'journal' ? ' is-on' : '') + '" data-act="pray-sub" data-v="journal" role="tab" aria-selected="' + (praySub === 'journal') + '">📖 Journal</button>' +
      '</div>';
    return { tab: 'pray', html: html + (praySub === 'prayers' ? prayersHtml() : journalHtml()) };
  };
  actions['pray-sub'] = function (el) { praySub = el.getAttribute('data-v'); render(); };

  function whoLabel(w) { return w === 2 ? 'Us' : name(w); }
  function prayersHtml() {
    var active = store.prayers.filter(function (p) { return !p.answered; });
    var answered = store.prayers.filter(function (p) { return p.answered; });
    var list = prayFilter === 'active' ? active : answered;
    return '<form class="card addpray" data-form="pray-add" autocomplete="off">' +
        '<label class="field"><span class="field__label">Add a prayer request</span>' +
        '<textarea class="input input--area" name="text" rows="2" maxlength="280" data-bind="pray-draft" placeholder="What should we pray about?">' + esc(prayDraft) + '</textarea></label>' +
        '<div class="addpray__row"><div class="seg seg--sm" role="group" aria-label="Who is this for?">' +
          [0, 1, 2].map(function (w) {
            return '<button type="button" class="seg__btn' + (prayWho === w ? ' is-on' : '') + '" data-act="pray-who" data-w="' + w + '" aria-pressed="' + (prayWho === w) + '">' + (w === 2 ? '💞 Us' : name(w)) + '</button>';
          }).join('') +
        '</div><button class="btn btn--primary" type="submit">Add</button></div>' +
      '</form>' +
      '<div class="filter">' +
        '<button class="filter__btn' + (prayFilter === 'active' ? ' is-on' : '') + '" data-act="pray-filter" data-v="active">Praying (' + active.length + ')</button>' +
        '<button class="filter__btn' + (prayFilter === 'answered' ? ' is-on' : '') + '" data-act="pray-filter" data-v="answered">Answered (' + answered.length + ')</button>' +
      '</div>' +
      (list.length ? '<ul class="prayers">' + list.map(function (p) {
        return '<li class="prayer' + (p.answered ? ' is-answered' : '') + '">' +
          '<div class="prayer__top"><span class="who who--' + p.who + '">' + whoLabel(p.who) + '</span>' +
          '<span class="prayer__date">' + (p.answered ? 'Answered ' + fmtDate(p.answered) : 'Added ' + fmtDate(p.added)) + '</span></div>' +
          '<p class="prayer__text">' + esc(p.text) + '</p>' +
          '<div class="prayer__btns">' +
            (p.answered ? '<button class="chipbtn" data-act="pray-toggle" data-id="' + p.id + '">↺ Still praying</button>'
              : '<button class="chipbtn chipbtn--ok" data-act="pray-toggle" data-id="' + p.id + '">✓ Answered!</button>') +
            '<button class="iconbtn" data-act="pray-del" data-id="' + p.id + '" aria-label="Delete request">✕</button>' +
          '</div></li>';
      }).join('') + '</ul>'
        : '<div class="empty">' + (prayFilter === 'active'
          ? '<span>🕊️</span>Nothing on the list right now. Add a request above — or do a check-in.'
          : '<span>🌤️</span>Answered prayers will collect here. Celebrate them when they come!') + '</div>');
  }
  binds['pray-draft'] = function (el) { prayDraft = el.value; };
  actions['pray-who'] = function (el) { prayWho = +el.getAttribute('data-w'); render(); };
  actions['pray-filter'] = function (el) { prayFilter = el.getAttribute('data-v'); render(); };
  actions['pray-add'] = function (f) {
    var text = f.text.value.trim();
    if (!text) { toast('Write a request first'); return; }
    store.prayers.unshift({ id: uid(), text: text, who: prayWho, added: Date.now(), answered: null });
    prayDraft = ''; prayFilter = 'active';
    save(); render(); toast('Added to your prayer list');
  };
  actions['pray-toggle'] = function (el) {
    var id = el.getAttribute('data-id'), nowAnswered = false;
    store.prayers.forEach(function (p) { if (p.id === id) { p.answered = p.answered ? null : Date.now(); nowAnswered = !!p.answered; } });
    save(); render();
    if (nowAnswered) toast('Praise God! 🙌 Moved to Answered');
  };
  actions['pray-del'] = function (el) {
    if (!confirm('Delete this prayer request?')) return;
    var id = el.getAttribute('data-id');
    store.prayers = store.prayers.filter(function (p) { return p.id !== id; });
    save(); render();
  };

  function journalHtml() {
    if (!store.journal.length) {
      return '<div class="empty"><span>📖</span>Your check-ins will be kept here — moods, notes, what you appreciated and what you prayed for.' +
        '<button class="btn btn--primary" data-act="tab" data-tab="checkin">Start a check-in</button></div>';
    }
    return '<ul class="journal">' + store.journal.map(function (j, idx) {
      var moods = (j.moods || []).map(function (m, w) { return m == null ? '' : '<span class="jmood" title="' + name(w) + ': ' + C.MOODS[m].label + '">' + C.MOODS[m].emoji + ' ' + name(w) + '</span>'; }).join('');
      var items = (j.items || []).map(function (it) {
        var t = C.CHECKIN[it.topic];
        return '<div class="jitem"><div class="jitem__h">' + t.emoji + ' ' + t.title + '</div><div class="jitem__q">' + esc(it.prompt) + '</div>' +
          (it.notes ? '<p class="jitem__n">' + esc(it.notes) + '</p>' : '') + '</div>';
      }).join('');
      var app = (j.appreciate || []).map(function (s, w) { return s ? '<p class="jline"><strong>' + name(w) + ' → ' + name(1 - w) + ':</strong> ' + esc(s) + '</p>' : ''; }).join('');
      var pr = (j.prayers || []).map(function (s, w) { return s ? '<p class="jline"><strong>For ' + name(w) + ':</strong> ' + esc(s) + '</p>' : ''; }).join('');
      return '<li><details class="jentry"' + (idx === 0 ? ' open' : '') + '>' +
        '<summary><span class="jentry__date">' + fmtDate(j.date) + '</span><span class="jentry__moods">' + moods + '</span></summary>' +
        '<div class="jentry__body">' + items +
          (app ? '<div class="jitem"><div class="jitem__h">💛 Appreciated</div>' + app + '</div>' : '') +
          (pr ? '<div class="jitem"><div class="jitem__h">🙏 Prayed for</div>' + pr + '</div>' : '') +
          '<button class="linkbtn linkbtn--danger" data-act="j-del" data-id="' + j.id + '">Delete this entry</button>' +
        '</div></details></li>';
    }).join('') + '</ul>';
  }
  actions['j-del'] = function (el) {
    if (!confirm('Delete this journal entry?')) return;
    var id = el.getAttribute('data-id');
    store.journal = store.journal.filter(function (j) { return j.id !== id; });
    save(); render();
  };

  // ---------- boot ----------
  current = hasNames() ? 'home' : 'onboard';
  render(true);
})();
