/* =========================================================
   Alaga — mic.js
   Voice logging: tap 🎤, say "bottle 120 ml formula", check the
   card, done. The words are turned into an entry by voice.js;
   this file listens and confirms.

   - Off by default. In a browser, speech-to-text is done by the
     phone's speech service (Google on Android, Apple on iPhone),
     so the audio leaves the phone; the app only gets the text,
     which stays here. Turning it on explains that once.
   - Everyday entries save after a 3-second countdown (Cancel is
     always there). Medicine never does: it opens the medicine
     form, filled in, so the dose-spacing checks run and the
     parent taps Save.
   - Never saves a guess: if it isn't sure, it says what it heard
     and offers the closest buttons.
   ========================================================= */
(function () {
  'use strict';

  var S = window.BabyStore, Voice = window.BabyVoice, App = window.BabyApp, h = App.h, F = window.BabyForms, G = window.BabyGuide;
  var $ = h.$, esc = h.esc, MIN = h.MIN;
  var AUTO_MS = 3000;
  var rec = null, countdown = null, state = null;

  function Recognizer() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; }
  // In the Android app the phone's own speech engine is used through a plugin
  // (it works offline when the phone has the language downloaded).
  function nativeSpeech() { var C = window.Capacitor; return App.platform.native && C && C.Plugins && C.Plugins.SpeechRecognition || null; }
  function supported() { return !!(nativeSpeech() || Recognizer()); }
  function settings() { return S.get().settings; }

  /* ---------- Settings ---------- */
  function settingsRows(row, sel) {
    var s = settings();
    var sub = !supported() ? 'Not available in this browser. Works in Chrome on Android and Safari on iPhone.' :
      'Tap 🎤 at the top and say “bottle 120 ml”, “wet diaper” or “she’s asleep”. Speech is turned into text by your phone’s speech service (Google or Apple).';
    var html = row('🎤 Voice logging', sub, supported() ? h.sw('voice', s.voice, 'Voice logging') : '');
    if (s.voice && supported()) {
      html += row('&nbsp;&nbsp;&nbsp;Language', 'Filipino understands Taglish best (“dumede sa kaliwa”, “umihi”).', sel('voiceLang', [['en-US', 'English'], ['en-PH', 'English (Philippines)'], ['fil-PH', 'Filipino / Taglish']], s.voiceLang, 'Voice language')) +
        row('&nbsp;&nbsp;&nbsp;Save automatically', 'After 3 seconds, unless you tap Cancel. Medicine always waits for you.', h.sw('voiceAutoSave', s.voiceAutoSave, 'Save voice entries automatically'));
    }
    return html;
  }

  // Turning it on: say plainly where the audio goes, once.
  function enable() {
    h.ask({
      title: 'Turn on voice logging?',
      text: 'To turn speech into text, your phone sends the recording to its speech service (Google on Android, Apple on iPhone) — like any voice typing. Alaga only gets the words, and they stay on this phone. You confirm every entry before it’s saved.',
      ok: 'Turn on'
    }, function () {
      settings().voice = true;
      App.commit();
      paintButton();
      h.toast('Voice logging on — tap 🎤 at the top');
    });
  }

  function paintButton() {
    var b = $('#micbtn');
    if (b) b.hidden = !(settings().voice && supported());
  }

  /* ---------- Listening ---------- */
  function ctx() {
    var st = S.get(), T = S.timers(), b = S.baby(), H = S.health();
    var lastBreast = S.last('feed', function (e) { return e.data.kind === 'breast'; });
    var next = lastBreast ? (lastBreast.data.right > lastBreast.data.left ? 'L' : lastBreast.data.left > lastBreast.data.right ? 'R' : lastBreast.data.startSide === 'L' ? 'R' : 'L') : 'L';
    return {
      now: Date.now(), volume: st.settings.volume, temp: st.settings.temp, weight: st.settings.length === 'in' ? 'lb' : 'kg',
      babies: st.babies.map(function (x) { return { id: x.id, name: x.name }; }), activeBaby: st.activeBaby, feeding: b ? b.feeding : 'breast',
      rx: (H.rx || []).filter(function (r) { return S.rxStatus(r).active; }).map(function (r) { return { id: r.id, name: r.name }; }),
      timers: { sleep: !!T.sleep, breast: T.breast || null, pump: !!T.pump, tummy: !!T.tummy, bottle: !!T.bottle }, nextSide: next
    };
  }

  function listenNative(P) {
    stopAll();
    state = { phase: 'listening', heard: '' };
    open();
    P.requestPermissions().then(function (p) {
      if (p && p.speechRecognition && p.speechRecognition !== 'granted') throw { error: 'not-allowed' };
      return P.start({ language: settings().voiceLang || 'en-US', maxResults: 3, partialResults: false, popup: false });
    }).then(function (r) {
      if (!state || state.phase !== 'listening') return;
      var alts = (r && r.matches) || [];
      if (!alts.length) { fail('Didn’t catch that.'); return; }
      state.heard = alts[0];
      understood(alts);
    }).catch(function (e) {
      var m = String((e && (e.error || e.message)) || e || '');
      fail(/not-allowed|permission|denied/i.test(m) ? 'Alaga needs the microphone. Allow it in Settings → Apps → Alaga → Permissions, then try again.' :
        /no match|no speech|didn/i.test(m) ? 'Didn’t hear anything — tap Try again and speak a little louder.' : 'Voice didn’t work this time (' + (m || 'unknown') + ').');
    });
  }

  function listen() {
    var P = nativeSpeech();
    if (P) return listenNative(P);
    var R = Recognizer();
    if (!R) { h.toast('Voice logging isn’t available in this browser.'); return; }
    stopAll();
    state = { phase: 'listening', heard: '' };
    open();
    try {
      rec = new R();
      rec.lang = settings().voiceLang || 'en-US';
      rec.interimResults = true;
      rec.maxAlternatives = 3;
      rec.continuous = false;
    } catch (e) { fail('Couldn’t start the microphone.'); return; }
    var got = false;
    rec.onresult = function (ev) {
      var res = ev.results[ev.results.length - 1];
      state.heard = res[0].transcript;
      if (!res.isFinal) { paintHeard(); return; }
      got = true;
      var alts = [];
      for (var i = 0; i < res.length; i++) alts.push(res[i].transcript);
      understood(alts);
    };
    rec.onerror = function (ev) {
      got = true;
      var e = ev && ev.error;
      fail(e === 'not-allowed' || e === 'service-not-allowed' ? 'Alaga needs the microphone. Allow it in your browser’s site settings (or the phone’s Settings), then try again.' :
        e === 'no-speech' ? 'Didn’t hear anything — tap Try again and speak after the beep… or just say it a little louder.' :
        e === 'network' ? 'Voice needs an internet connection here. You can still log with the buttons.' :
        e === 'aborted' ? null : 'Voice didn’t work this time (' + (e || 'unknown') + ').');
    };
    rec.onend = function () { rec = null; if (!got && state && state.phase === 'listening') fail('Didn’t catch that.'); };
    try { rec.start(); } catch (e) { fail('Couldn’t start the microphone.'); }
  }

  // Pick the first alternative that makes sense.
  function understood(alts) {
    var c = ctx(), best = null;
    for (var i = 0; i < alts.length; i++) {
      var r = Voice.parse(alts[i], c);
      if (r.kind !== 'unknown') { best = r; best.heard = alts[i]; break; }
      if (!best) { best = r; best.heard = alts[i]; }
    }
    if (best.kind === 'form') { finishSheet(); h.closeSheet(); switchBaby(best.baby); F.open(best.type, null, best.preset); h.toast('Check the dose, then tap Save'); return; }
    state = { phase: best.kind === 'unknown' ? 'unknown' : 'confirm', r: best, heard: best.heard };
    h.renderSheet();
    if (state.phase === 'confirm' && settings().voiceAutoSave) startCountdown();
  }

  function fail(msg) {
    if (!state) return;
    if (msg === null) { h.closeSheet(); return; }
    state = { phase: 'error', msg: msg, heard: state.heard };
    h.renderSheet();
  }

  /* ---------- The sheet ---------- */
  var ACTION_TEXT = {
    'sleep-start': ['😴', 'Start the sleep timer'], 'sleep-stop': ['☀️', 'Woke up — stop the sleep timer'],
    'breast-side': ['🤱', 'Breastfeeding'], 'breast-finish': ['🤱', 'Finish the feed and save it'], 'breast-pause': ['⏸️', 'Pause the feed'],
    'pump-both': ['🧴', 'Start pumping (both sides)'], 'pump-side': ['🧴', 'Pumping'], 'pump-finish': ['🧴', 'Stop pumping and enter amounts'],
    'tummy-start': ['🤸', 'Start tummy time'], 'tummy-stop': ['🤸', 'Stop tummy time'],
    'bottle-start': ['🍼', 'Start the bottle timer'], 'bottle-done': ['🍼', 'Bottle finished']
  };
  function summary(r) {
    var who = r.baby && r.baby !== S.get().activeBaby && S.baby(r.baby) ? ' · ' + S.baby(r.baby).name : '';
    if (r.kind === 'action') {
      var a = ACTION_TEXT[r.action] || ['•', r.action];
      var title = a[1] + (r.action === 'breast-side' ? (S.timers().breast ? ' — switch to the ' : ' — start on the ') + (r.side === 'R' ? 'right' : 'left') : r.action === 'pump-side' ? ' — ' + (r.side === 'R' ? 'right' : 'left') + ' side' : '');
      if (r.action === 'bottle-done') { var bt = S.timers().bottle; title += r.amountMl ? ' — ' + h.vol(r.amountMl) : ' — enter the amount'; if (bt) return { icon: a[0], title: title + who, sub: 'Took ' + h.durMs(bt.done ? bt.acc : S.bottleTotal(bt)) }; }
      var when = r.action === 'sleep-start' && r.time && Date.now() - r.time > MIN ? 'Fell asleep ' + h.ago(r.time, Date.now()) : 'Now';
      return { icon: a[0], title: title + who, sub: when };
    }
    var ev = { type: r.type, time: r.time, end: r.end, data: r.data, baby: r.baby || S.get().activeBaby };
    var d = h.describe(ev, Date.now());
    var t = Date.now() - r.time < 2 * MIN ? 'Now' : h.fmtTime(r.time) + ' (' + h.ago(r.time, Date.now()) + ')';
    return { icon: d.icon, title: d.title + who, sub: [d.sub, t].filter(Boolean).join(' · '), flag: d.flag };
  }

  function sheetHtml() {
    if (!state) return '';
    var heard = state.heard ? '<p class="mic__heard">“' + esc(state.heard) + '”</p>' : '';
    if (state.phase === 'listening') {
      return '<div class="mic"><div class="mic__orb" aria-hidden="true">🎤</div><p class="mic__status" role="status">Listening…</p>' + (heard || '<p class="faint mic__hint">Try “bottle 120 ml”, “wet diaper”, “she’s asleep”, “fed left 15 minutes”.</p>') +
        '<div class="btn-row"><button class="btn btn--lg" data-action="mic-cancel">Cancel</button></div></div>';
    }
    if (state.phase === 'error') {
      return '<div class="mic"><div class="mic__orb mic__orb--off" aria-hidden="true">🎤</div><p class="mic__status" role="alert">' + esc(state.msg) + '</p>' + heard +
        '<div class="btn-row"><button class="btn btn--lg" data-action="mic-cancel">Close</button><button class="btn btn--lg btn--primary" data-action="mic-again">Try again</button></div></div>';
    }
    if (state.phase === 'unknown') {
      var r = state.r, LABEL = { feed: '🍼 Feed', diaper: '🧷 Diaper', sleep: '😴 Sleep', pump: '🧴 Pump', med: '💊 Medicine', temp: '🌡️ Temp' };
      return '<div class="mic"><p class="mic__status" role="alert">' + esc(r.why || 'Not sure what to log.') + '</p>' + heard +
        '<p class="faint">Did you mean:</p><div class="btn-row">' + (r.suggest || []).map(function (t) { return '<button class="btn btn--lg" data-action="mic-form" data-type="' + t + '">' + (LABEL[t] || t) + '</button>'; }).join('') + '</div>' +
        '<div class="btn-row" style="margin-top:10px"><button class="btn btn--lg" data-action="mic-cancel">Close</button><button class="btn btn--lg btn--primary" data-action="mic-again">Try again</button></div></div>';
    }
    var sm = summary(state.r);
    return '<div class="mic">' + heard +
      '<div class="mic__card' + (sm.flag ? ' mic__card--flag' : '') + '"><span class="mic__icon" aria-hidden="true">' + sm.icon + '</span><div><div class="mic__title">' + esc(sm.title) + '</div><div class="mic__sub">' + esc(sm.sub) + '</div></div></div>' +
      (state.r.kind === 'entry' && sm.flag ? '<p class="faint">⚠️ Worth a look — open it after saving to see why.</p>' : '') +
      '<div class="mic__bar" aria-hidden="true"' + (countdown ? '' : ' hidden') + '><i id="mic-bar"></i></div>' +
      '<div class="btn-row sheet-save"><button class="btn btn--lg" data-action="mic-cancel">Cancel</button>' + (state.r.kind === 'entry' ? '<button class="btn btn--lg" data-action="mic-edit">Edit</button>' : '') +
      '<button class="btn btn--lg btn--primary" data-action="mic-save" id="mic-save">' + (countdown ? 'Save (' + Math.ceil(countdown.left / 1000) + ')' : 'Save') + '</button></div></div>';
  }

  function open() {
    h.openSheet({ title: 'Voice', kind: 'voice', html: sheetHtml, onclose: stopAll });
  }
  function paintHeard() { var p = document.querySelector('.mic__heard'), st = document.querySelector('.mic__hint'); if (st) st.remove(); if (p) p.textContent = '“' + state.heard + '”'; else h.renderSheet(); }

  function startCountdown() {
    var t0 = Date.now();
    countdown = { left: AUTO_MS, id: setInterval(function () {
      if (!countdown) return;
      countdown.left = AUTO_MS - (Date.now() - t0);
      var bar = $('#mic-bar'), btn = $('#mic-save');
      if (bar) bar.style.width = Math.max(0, 100 - countdown.left / AUTO_MS * 100) + '%';
      if (btn) btn.textContent = 'Save (' + Math.max(1, Math.ceil(countdown.left / 1000)) + ')';
      if (countdown.left <= 0) save();
    }, 100) };
    h.renderSheet();
  }
  function stopCountdown() { if (countdown) clearInterval(countdown.id); countdown = null; }
  function stopAll() {
    stopCountdown();
    if (rec) { try { rec.abort(); } catch (e) {} rec = null; }
    var P = nativeSpeech(); if (P && state && state.phase === 'listening') P.stop().catch(function () {});
  }
  function finishSheet() { stopAll(); state = null; }

  function switchBaby(id) {
    if (id && id !== S.get().activeBaby && S.baby(id)) { S.get().activeBaby = id; h.toast('Switched to ' + S.baby(id).name); }
  }

  /* ---------- Saving ---------- */
  function save(thenEdit) {
    if (!state || !state.r) return;
    var r = state.r;
    finishSheet();
    h.closeSheet();
    if (r.kind === 'action' && r.action === 'bottle-done' && r.amountMl) { switchBaby(r.baby); saveBottle(r.amountMl); return; }
    if (r.kind === 'action') {
      switchBaby(r.baby);
      App.act(r.action, { side: r.side });
      if (r.action === 'sleep-start' && r.time && r.time < Date.now() - MIN && S.timers().sleep) { S.timers().sleep.start = r.time; App.commit(); }
      return;
    }
    var ev = S.addEvent({ type: r.type, time: r.time, end: r.end, data: r.data, baby: r.baby || S.get().activeBaby });
    App.commit();
    var d = h.describe(ev);
    if (thenEdit) { F.open(ev.type, ev); return; }
    h.toast('🎤 Saved · ' + d.title + (d.sub ? ' · ' + d.sub : ''), { label: 'Undo', fn: function () { S.removeEvent(ev.id); App.commit(); } });
  }

  // "Done, 15 ml" with the bottle timer running: save it the way the form would.
  function saveBottle(ml) {
    var b = S.bottleFinish();
    if (!b) return;
    var lastB = S.last('feed', function (x) { return x.data.kind === 'bottle'; }), baby = S.baby();
    var data = { kind: 'bottle', amountMl: ml, milk: lastB ? lastB.data.milk : baby.feeding === 'breast' ? 'breast' : 'formula', durationMs: b.acc, note: '' };
    var nip = S.last('feed', function (x) { return x.data.kind === 'bottle' && x.data.nipple; });
    if (nip) data.nipple = nip.data.nipple;
    var ev = S.addEvent({ type: 'feed', time: b.start, end: b.start + b.acc, data: data });
    var saved = S.stopTimer('bottle');
    App.commit();
    var d = h.describe(ev);
    h.toast('🎤 Saved · Bottle · ' + d.sub, { label: 'Undo', fn: function () { S.removeEvent(ev.id); saved.done = false; delete saved.end; S.timers().bottle = saved; App.commit(); } });
  }

  var ACTIONS = {
    'mic-listen': listen,
    'mic-again': listen,
    'mic-cancel': function () { finishSheet(); h.closeSheet(); App.render(); },
    'mic-save': function () { save(false); },
    'mic-edit': function () { save(true); },
    'mic-form': function (n) { var t = n.getAttribute('data-type'); finishSheet(); h.closeSheet(); if (t === 'sleep') App.act('sleep-toggle'); else F.open(t); }
  };
  document.addEventListener('click', function (e) {
    var n = e.target.closest('[data-action^="mic-"]');
    if (!n || n.disabled || !ACTIONS[n.getAttribute('data-action')]) return;
    e.preventDefault();
    ACTIONS[n.getAttribute('data-action')](n);
  });
  // Touching the card (anything but Save) stops the countdown, so a correction is never raced.
  document.addEventListener('pointerdown', function (e) {
    // Update in place: re-rendering here would swap out the button being tapped.
    if (countdown && e.target.closest('.mic') && !e.target.closest('#mic-save')) {
      stopCountdown();
      var bar = document.querySelector('.mic__bar'), btn = $('#mic-save');
      if (bar) bar.hidden = true;
      if (btn) btn.textContent = 'Save';
    }
  }, true);

  function init() { paintButton(); }

  window.BabyMic = { init: init, settingsRows: settingsRows, enable: enable, listen: listen, paintButton: paintButton, supported: supported };
})();
