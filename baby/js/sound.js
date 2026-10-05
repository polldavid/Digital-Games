/* =========================================================
   Baby Log — sound.js
   A white-noise machine generated live with the Web Audio
   API (no audio files): white, pink and brown noise, a
   rhythmic "shush", and a resting heartbeat. Plus a soft
   chime for reminders.
   ========================================================= */
(function (root) {
  'use strict';

  var ctx = null, master = null, nodes = [], current = null, stopTimer = null, endsAt = null;

  function ac() {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // 4 seconds of looping noise in the requested "colour".
  function noiseBuffer(kind) {
    var len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, lastOut = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      if (kind === 'pink') { // Paul Kellet's refined method
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else if (kind === 'brown') {
        lastOut = (lastOut + 0.02 * w) / 1.02; d[i] = lastOut * 3.5;
      } else d[i] = w * 0.35;
    }
    // Cross-fade the loop seam so there's no click.
    var fade = Math.floor(ctx.sampleRate * 0.05);
    for (var j = 0; j < fade; j++) { var k = j / fade; d[j] = d[j] * k + d[len - fade + j] * (1 - k); }
    return buf;
  }

  function src(kind) {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuffer(kind); s.loop = true;
    return s;
  }

  var SOUNDS = {
    white: { label: 'White noise', icon: 'wave' },
    pink:  { label: 'Pink noise',  icon: 'wave' },
    brown: { label: 'Brown noise (deep)', icon: 'wave' },
    shush: { label: 'Shush',       icon: 'shush' },
    heart: { label: 'Heartbeat',   icon: 'heart' }
  };

  function build(kind) {
    var out = ctx.createGain(); out.gain.value = 0; out.connect(master);
    var list = [out];
    if (kind === 'white' || kind === 'pink' || kind === 'brown') {
      var s = src(kind); s.connect(out); s.start(); list.push(s);
    } else if (kind === 'shush') {
      // Band-passed noise, swelling and fading like a parent's "shhhh".
      var n = src('white');
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.7;
      var amp = ctx.createGain(); amp.gain.value = 0.55;
      var lfo = ctx.createOscillator(); lfo.frequency.value = 0.55;
      var depth = ctx.createGain(); depth.gain.value = 0.45;
      lfo.connect(depth); depth.connect(amp.gain);
      n.connect(bp); bp.connect(amp); amp.connect(out);
      n.start(); lfo.start(); list.push(n, lfo);
    } else if (kind === 'heart') {
      // A low "lub-dub" at ~70 bpm over a whisper of brown noise (womb-like).
      var bed = src('brown'); var bedG = ctx.createGain(); bedG.gain.value = 0.25; bed.connect(bedG); bedG.connect(out); bed.start(); list.push(bed);
      var beat = function () {
        if (current !== 'heart') return;
        var t = ctx.currentTime;
        [0, 0.28].forEach(function (off, idx) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.setValueAtTime(idx ? 48 : 55, t + off);
          g.gain.setValueAtTime(0.0001, t + off);
          g.gain.exponentialRampToValueAtTime(idx ? 0.7 : 1, t + off + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.18);
          o.connect(g); g.connect(out); o.start(t + off); o.stop(t + off + 0.2);
        });
        heartTimer = setTimeout(beat, 860);
      };
      setTimeout(beat, 50);
    }
    out.gain.setTargetAtTime(1, ctx.currentTime, 0.4); // gentle fade in
    return list;
  }
  var heartTimer = null;

  function play(kind, minutes) {
    if (!ac()) return false;
    stop(true);
    current = kind;
    nodes = build(kind);
    clearTimeout(stopTimer);
    endsAt = minutes ? Date.now() + minutes * 60000 : null;
    if (minutes) stopTimer = setTimeout(function () { stop(); if (api.onchange) api.onchange(); }, minutes * 60000);
    return true;
  }

  function stop(immediate) {
    clearTimeout(heartTimer); clearTimeout(stopTimer);
    var old = nodes; nodes = []; current = null; endsAt = null;
    if (!old.length || !ctx) return;
    var out = old[0];
    out.gain.setTargetAtTime(0, ctx.currentTime, immediate ? 0.02 : 0.8); // slow fade out
    setTimeout(function () { old.forEach(function (n) { try { n.stop && n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }); }, immediate ? 120 : 4000);
  }

  function volume(v) { if (ac()) master.gain.setTargetAtTime(v, ctx.currentTime, 0.1); }

  // Two soft notes — loud enough to notice, gentle enough not to wake a sleeping baby.
  function chime() {
    if (!ac()) return;
    var t = ctx.currentTime;
    [660, 880].forEach(function (f, i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.9);
      o.connect(g); g.connect(ctx.destination); o.start(t + i * 0.18); o.stop(t + i * 0.18 + 1);
    });
  }

  var api = {
    SOUNDS: SOUNDS, play: play, stop: stop, volume: volume, chime: chime,
    unlock: function () { ac(); },
    playing: function () { return current; },
    endsAt: function () { return endsAt; },
    onchange: null
  };
  root.BabySound = api;
})(this);
