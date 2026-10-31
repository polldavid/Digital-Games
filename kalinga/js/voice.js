/* =========================================================
   Kalinga — voice.js
   Everything spoken and heard:
   - say(text): the phone reads text aloud (text-to-speech), a
     little slower than usual, in Filipino when the phone has it.
   - Family voice clips: record("Pa, inumin mo na…"), play(id).
   - hear(onDone): one utterance from the microphone, returned as
     the recognizer's alternatives. The reading flow (elder.js)
     turns them into numbers with KalingaSpeech and ALWAYS reads
     the result back before saving.
   In a browser, speech-to-text goes through the phone's speech
   service (Google/Apple); Kalinga only gets the words.
   ========================================================= */
(function () {
  'use strict';

  var App = window.KalingaApp, I = window.KalingaI18n, F = window.KalingaFiles;
  var synth = window.speechSynthesis || null, current = null, audio = null;

  /* ---------- Text-to-speech ---------- */
  function pickVoice() {
    if (!synth) return null;
    var want = I.speechLang().toLowerCase(), list = synth.getVoices() || [];
    var exact = list.filter(function (v) { return (v.lang || '').toLowerCase().replace('_', '-') === want; })[0];
    if (exact) return exact;
    var prefix = want.split('-')[0];
    return list.filter(function (v) { var l = (v.lang || '').toLowerCase(); return l.indexOf(prefix) === 0 || (prefix === 'fil' && l.indexOf('tl') === 0); })[0] || null;
  }
  // say(text, { onend }) — stops anything already playing first.
  function say(text, opts) {
    opts = opts || {};
    stop();
    if (!synth || !text) { if (opts.onend) setTimeout(opts.onend, 0); return; }
    var u = new SpeechSynthesisUtterance(text), v = pickVoice();
    if (v) u.voice = v;
    u.lang = v ? v.lang : I.speechLang();
    u.rate = 0.88;
    u.onend = u.onerror = function () { if (current === u) current = null; if (opts.onend) opts.onend(); };
    current = u;
    try { synth.speak(u); } catch (e) { if (opts.onend) opts.onend(); }
  }
  function stop() {
    if (synth) try { synth.cancel(); } catch (e) {}
    current = null;
    if (audio) { try { audio.pause(); } catch (e) {} audio = null; }
  }
  function speaking() { return !!(current || audio); }
  // Some browsers load voices late.
  if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', function () {});

  /* ---------- Family voice clips ---------- */
  // play(id, { onend }) -> Promise (rejects when the clip is missing or can't play)
  function play(id, opts) {
    opts = opts || {};
    stop();
    return F.url(id).then(function (u) {
      if (!u) throw new Error('missing');
      var a = audio = new Audio(u);
      a.onended = function () { if (audio === a) audio = null; if (opts.onend) opts.onend(); };
      return a.play();
    });
  }
  // A clip if there is one, else text-to-speech.
  function clipOrSay(clipId, text, opts) {
    if (!clipId) { say(text, opts); return; }
    play(clipId, opts).catch(function () { say(text, opts); });
  }

  var rec = null;
  function canRecord() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder); }
  // record() starts; the returned stop() resolves with the saved clip id.
  function record() {
    if (!canRecord()) return Promise.reject(new Error('unsupported'));
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var chunks = [], mr = new MediaRecorder(stream);
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      mr.start();
      rec = { mr: mr, stream: stream };
      return {
        stop: function () {
          return new Promise(function (resolve, reject) {
            mr.onstop = function () {
              stream.getTracks().forEach(function (tr) { tr.stop(); });
              rec = null;
              if (!chunks.length) { reject(new Error('empty')); return; }
              var id = 'clip-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
              F.put(id, new Blob(chunks, { type: mr.mimeType || 'audio/webm' })).then(resolve, reject);
            };
            try { mr.stop(); } catch (e) { reject(e); }
          });
        }
      };
    });
  }
  function cancelRecording() { if (rec) { try { rec.mr.stop(); } catch (e) {} rec.stream.getTracks().forEach(function (tr) { tr.stop(); }); rec = null; } }

  /* ---------- Listening ---------- */
  function Recognizer() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; }
  function canHear() { return !!Recognizer(); }
  var listening = null;
  // hear({ onResult(alts), onError(code), onPartial(text) }) — one utterance.
  function hear(cb) {
    var R = Recognizer();
    if (!R) { cb.onError('unsupported'); return; }
    stop();
    stopHearing();
    var r = new R(), got = false;
    r.lang = I.speechLang();
    r.interimResults = true;
    r.maxAlternatives = 4;
    r.continuous = false;
    r.onresult = function (ev) {
      var res = ev.results[ev.results.length - 1];
      if (!res.isFinal) { if (cb.onPartial) cb.onPartial(res[0].transcript); return; }
      got = true;
      var alts = [];
      for (var i = 0; i < res.length; i++) alts.push(res[i].transcript);
      cb.onResult(alts);
    };
    r.onerror = function (ev) {
      got = true;
      var e = ev && ev.error;
      if (e === 'aborted') return;
      cb.onError(e === 'not-allowed' || e === 'service-not-allowed' ? 'blocked' : e === 'no-speech' ? 'nothing' : e || 'unknown');
    };
    r.onend = function () { if (listening === r) listening = null; if (!got) cb.onError('nothing'); };
    listening = r;
    try { r.start(); } catch (e) { cb.onError('unknown'); }
  }
  function stopHearing() { if (listening) { try { listening.abort(); } catch (e) {} listening = null; } }

  window.KalingaVoice = {
    say: say, stop: stop, speaking: speaking, play: play, clipOrSay: clipOrSay,
    canRecord: canRecord, record: record, cancelRecording: cancelRecording,
    canHear: canHear, hear: hear, stopHearing: stopHearing
  };
})();
