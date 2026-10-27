/* Helios Haul — WebAudio synth sfx + soft ambient music */
(function () {
  'use strict';
  var HH = window.HH = window.HH || {};

  var ctx = null, master = null, sfxGain = null, musGain = null;
  var muted = false, musicOn = true, vol = 0.7;
  var lastShot = 0, lastPick = 0, pickPitch = 0, musicTimer = null, step = 0;

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      sfxGain = ctx.createGain();
      musGain = ctx.createGain();
      sfxGain.connect(master);
      musGain.connect(master);
      master.connect(ctx.destination);
      apply();
    } catch (e) { ctx = null; }
    return ctx;
  }

  function apply() {
    if (!ctx) return;
    master.gain.value = muted ? 0 : vol * 0.8;
    musGain.gain.value = musicOn ? 0.22 : 0;
    sfxGain.gain.value = 0.9;
  }

  function tone(freq, dur, type, gain, slideTo, delay) {
    if (!ctx || muted) return;
    var t = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, gain, lp) {
    if (!ctx || muted) return;
    var t = ctx.currentTime, n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0), i;
    for (i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    f.type = 'lowpass'; f.frequency.value = lp || 900;
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t);
  }

  // gentle pentatonic arpeggio over a slow pad
  var NOTES = [0, 3, 7, 10, 12, 10, 7, 3];
  function musicStep() {
    if (!ctx || muted || !musicOn) return;
    var t = ctx.currentTime, base = (step % 32 < 16) ? 110 : 98;
    var f = base * Math.pow(2, NOTES[step % NOTES.length] / 12) * 2;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g); g.connect(musGain);
    o.start(t); o.stop(t + 0.75);
    if (step % 8 === 0) {
      var p = ctx.createOscillator(), pg = ctx.createGain();
      p.type = 'sine'; p.frequency.value = base / 2;
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.exponentialRampToValueAtTime(0.35, t + 0.6);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
      p.connect(pg); pg.connect(musGain);
      p.start(t); p.stop(t + 3.7);
    }
    step++;
  }

  HH.Audio = {
    // call from a user gesture
    unlock: function () {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (!musicTimer) musicTimer = setInterval(musicStep, 420);
    },
    setMuted: function (m) { muted = !!m; apply(); },
    setMusic: function (m) { musicOn = !!m; apply(); },
    setVolume: function (v) { vol = Math.max(0, Math.min(1, v)); apply(); },
    isMuted: function () { return muted; },

    shoot: function () {
      var now = performance.now();
      if (now - lastShot < 85) return;
      lastShot = now;
      tone(780 + Math.random() * 80, 0.09, 'square', 0.05, 320);
    },
    hit: function () { tone(220, 0.06, 'triangle', 0.06, 140); },
    boom: function (big) {
      noise(big ? 0.55 : 0.28, big ? 0.5 : 0.28, big ? 600 : 1100);
      tone(big ? 90 : 140, big ? 0.4 : 0.2, 'sawtooth', 0.1, 40);
    },
    pickup: function () {
      var now = performance.now();
      pickPitch = (now - lastPick < 260) ? Math.min(pickPitch + 1, 12) : 0;
      lastPick = now;
      tone(660 * Math.pow(2, pickPitch / 12), 0.08, 'sine', 0.07);
    },
    gem: function () { tone(880, 0.12, 'sine', 0.1); tone(1320, 0.18, 'sine', 0.08, null, 0.07); },
    heal: function () { tone(520, 0.14, 'sine', 0.09, 780); },
    hurt: function () { tone(160, 0.22, 'sawtooth', 0.12, 70); noise(0.12, 0.15, 500); },
    shield: function () { tone(420, 0.15, 'triangle', 0.1, 260); },
    drone: function () { tone(300, 0.08, 'square', 0.04, 220); },
    alert: function () { tone(440, 0.14, 'square', 0.07); tone(330, 0.2, 'square', 0.07, null, 0.16); },
    tick: function () { tone(1000, 0.05, 'square', 0.05); },
    click: function () { tone(520, 0.05, 'triangle', 0.07, 700); },
    buy: function () { tone(520, 0.08, 'triangle', 0.1); tone(780, 0.12, 'triangle', 0.1, null, 0.08); tone(1040, 0.16, 'triangle', 0.08, null, 0.16); },
    deny: function () { tone(150, 0.14, 'square', 0.07, 100); },
    launch: function () { tone(120, 0.6, 'sawtooth', 0.09, 520); noise(0.5, 0.18, 1400); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.1, null, i * 0.11); }); },
    ascend: function () { [262, 330, 392, 523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.4, 'sine', 0.1, null, i * 0.09); }); }
  };
})();
