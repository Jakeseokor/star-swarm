'use strict';
/* 효과음 + 배경음악: Web Audio API로 실시간 합성 (외부 사운드 파일 없음) */
(function () {
  const SS = window.SS;
  const MASTER = 0.35;
  const MUSIC_VOL = 0.22;

  let ctx = null, master = null, musicBus = null, noiseBuf = null;
  let enabled = true, musicOn = true, unlocked = false;
  const lastPlayed = {};
  const MIN_GAP = { shoot: 0.04, enemyDie: 0.03, hit: 0.03, bossHit: 0.06, dive: 0.25 };

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? MASTER : 0;
    master.connect(ctx.destination);
    musicBus = ctx.createGain(); // 배경음악은 효과음과 따로 켜고 끔
    musicBus.gain.value = musicOn ? MUSIC_VOL : 0;
    musicBus.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  // iOS 사파리는 사용자 터치 안에서만 오디오가 시작되므로 첫 터치/키 입력 때 호출
  function unlock() {
    try {
      if (!ctx && !init()) return;
      if (ctx.state !== 'running') ctx.resume();
      if (!unlocked) {
        const b = ctx.createBuffer(1, 1, 22050);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
        unlocked = true;
      }
    } catch (e) { /* 오디오 미지원 환경은 무음으로 진행 */ }
  }

  function envelope(g, t0, vol, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  function tone(type, f0, f1, dur, vol, delay) {
    toneAt(master, type, f0, f1, ctx.currentTime + (delay || 0), dur, vol);
  }

  function toneAt(dest, type, f0, f1, t0, dur, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    envelope(g, t0, vol, dur);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  function noise(dur, vol, fStart, fEnd, delay) {
    noiseAt(master, ctx.currentTime + (delay || 0), dur, vol, fStart, fEnd);
  }

  function noiseAt(dest, t0, dur, vol, fStart, fEnd) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(fStart, t0);
    f.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
    const g = ctx.createGain();
    envelope(g, t0, vol, dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t0);
    s.stop(t0 + dur + 0.03);
  }

  function notes(type, freqs, step, vol, delay) {
    freqs.forEach((f, i) => { if (f) tone(type, f, f, step * 0.9, vol, (delay || 0) + i * step); });
  }

  const SFX = {
    shoot() { tone('square', 1500, 320, 0.08, 0.07); },
    hit() { tone('square', 420, 180, 0.07, 0.12); },
    enemyDie() { noise(0.22, 0.4, 3200, 200); tone('triangle', 300, 50, 0.2, 0.18); },
    dive() { tone('triangle', 1400, 260, 0.5, 0.09); },
    playerDie() {
      noise(1.1, 0.5, 2500, 80);
      tone('sawtooth', 620, 40, 1.0, 0.14);
      tone('square', 300, 30, 0.8, 0.08, 0.15);
    },
    powerup() { notes('square', [523, 659, 784, 1047, 1319], 0.055, 0.1); },
    shieldBreak() { noise(0.3, 0.35, 5000, 400); tone('square', 900, 120, 0.3, 0.1); },
    extraLife() { notes('square', [784, 988, 1175, 1568, 0, 1175, 1568], 0.07, 0.1); },
    stageStart() { notes('square', [392, 523, 659, 523, 659, 784, 0, 1047], 0.09, 0.09); notes('triangle', [196, 0, 262, 0, 330, 0, 392, 523], 0.09, 0.12); },
    stageClear() { notes('square', [659, 784, 880, 1047, 0, 880, 1047, 1319], 0.09, 0.1); notes('triangle', [330, 392, 440, 523, 0, 440, 523, 659], 0.09, 0.12); },
    bossHit() { tone('square', 160, 90, 0.05, 0.08); },
    bossPhase() { tone('sawtooth', 90, 500, 0.6, 0.14); noise(0.6, 0.3, 800, 3000); },
    bossDie() {
      noise(2.2, 0.55, 3000, 60);
      tone('sawtooth', 400, 30, 2.0, 0.15);
      for (let i = 0; i < 6; i++) noise(0.25, 0.35, 2500, 200, i * 0.3);
    },
    warning() { for (let i = 0; i < 4; i++) { tone('square', 440, 440, 0.22, 0.1, i * 0.5); tone('square', 330, 330, 0.22, 0.1, i * 0.5 + 0.25); } },
    select() { tone('square', 660, 660, 0.04, 0.08); },
    confirm() { tone('square', 880, 1320, 0.09, 0.09); },
    denied() { tone('square', 160, 120, 0.15, 0.1); },
    pause() { notes('square', [880, 660], 0.06, 0.08); },
    bomb() {
      noise(1.2, 0.6, 6000, 60);
      tone('sawtooth', 220, 30, 1.0, 0.18);
      tone('square', 110, 40, 0.8, 0.12, 0.05);
      tone('sine', 900, 60, 0.5, 0.15);
    },
    bombEmpty() { tone('square', 200, 200, 0.05, 0.08); tone('square', 150, 150, 0.08, 0.08, 0.07); },
    bombGet() { notes('square', [392, 523, 784, 1047], 0.06, 0.1); noise(0.2, 0.15, 3000, 500, 0.24); },
    gameOver() { notes('triangle', [523, 494, 440, 392, 349, 330, 294, 262], 0.16, 0.18); },
    ending() {
      notes('square', [523, 659, 784, 1047, 784, 1047, 1319, 0, 1175, 1319, 1568], 0.13, 0.09);
      notes('triangle', [262, 330, 392, 523, 392, 523, 659, 0, 587, 659, 784], 0.13, 0.13);
    },
  };

  // ---------------- 배경음악 (오리지널 칩튠) ----------------
  // 16분음표 단위 시퀀스. 숫자 = MIDI 음 번호, 0 = 쉼표
  const mf = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function bassBar(root, pat) { return pat.map((o) => (o === null ? 0 : root + o)); }
  const PULSE = [0, null, 12, null, 0, null, 12, null, 0, null, 12, null, 0, null, 12, 10];
  const DRIVE = [0, 0, 12, 0, 0, 0, 12, 11, 0, 0, 12, 0, 0, 12, 11, 12];

  const TRACKS = {
    title: {
      bpm: 104, wave: 'triangle', leadVol: 0.07, bassVol: 0.09, drums: false,
      lead: [
        72, 0, 76, 0, 79, 0, 84, 0, 83, 0, 79, 0, 76, 0, 0, 0,
        69, 0, 72, 0, 76, 0, 81, 0, 79, 0, 76, 0, 72, 0, 0, 0,
        65, 0, 69, 0, 72, 0, 77, 0, 76, 0, 72, 0, 69, 0, 72, 0,
        67, 0, 71, 0, 74, 0, 79, 0, 77, 0, 74, 0, 71, 0, 0, 0,
      ],
      bass: [].concat(bassBar(48, PULSE), bassBar(45, PULSE), bassBar(41, PULSE), bassBar(43, PULSE)),
    },
    stage: {
      bpm: 138, wave: 'square', leadVol: 0.045, bassVol: 0.11, drums: true,
      lead: [
        69, 0, 72, 0, 76, 0, 74, 72, 69, 0, 0, 67, 69, 0, 72, 0,
        77, 0, 76, 0, 74, 0, 72, 0, 74, 0, 76, 0, 72, 0, 0, 0,
        74, 0, 71, 0, 67, 0, 71, 74, 79, 0, 77, 0, 76, 0, 74, 0,
        76, 0, 0, 75, 76, 0, 79, 0, 76, 0, 74, 0, 71, 0, 68, 0,
      ],
      bass: [].concat(bassBar(45, PULSE), bassBar(41, PULSE), bassBar(43, PULSE), bassBar(40, PULSE)),
    },
    boss: {
      bpm: 160, wave: 'sawtooth', leadVol: 0.035, bassVol: 0.12, drums: true,
      lead: [
        64, 0, 67, 0, 70, 0, 69, 67, 64, 0, 0, 0, 76, 75, 74, 73,
        65, 0, 68, 0, 71, 0, 70, 68, 65, 0, 0, 0, 77, 76, 75, 74,
        64, 0, 67, 0, 70, 0, 69, 67, 64, 0, 0, 0, 71, 0, 70, 0,
        63, 0, 66, 0, 69, 0, 68, 66, 63, 0, 75, 0, 76, 0, 0, 0,
      ],
      bass: [].concat(bassBar(40, DRIVE), bassBar(41, DRIVE), bassBar(40, DRIVE), bassBar(39, DRIVE)),
    },
  };

  const music = { name: null, track: null, step: 0, next: 0 };

  function setMusic(name) {
    if (music.name === name) return;
    music.name = name;
    music.track = TRACKS[name] || null;
    music.step = 0;
    music.next = ctx ? ctx.currentTime + 0.08 : 0;
  }

  function playStep(tr, i, t, sd) {
    const n = tr.lead[i % tr.lead.length];
    if (n) toneAt(musicBus, tr.wave, mf(n), mf(n), t, sd * 1.7, tr.leadVol);
    const b = tr.bass[i % tr.bass.length];
    if (b) toneAt(musicBus, 'triangle', mf(b), mf(b), t, sd * 0.95, tr.bassVol);
    if (tr.drums) {
      if (i % 4 === 0) toneAt(musicBus, 'sine', 140, 40, t, 0.12, 0.25);        // 킥
      if (i % 8 === 4) noiseAt(musicBus, t, 0.1, 0.12, 4000, 1200);            // 스네어
      if (i % 2 === 1) noiseAt(musicBus, t, 0.03, 0.04, 9000, 6000);           // 하이햇
    }
  }

  // 매 프레임 호출: 0.15초 앞까지 음표를 미리 예약 (프레임이 흔들려도 박자가 일정)
  function updateMusic() {
    if (!ctx || ctx.state !== 'running' || !music.track || !musicOn) return;
    const tr = music.track;
    const sd = 60 / tr.bpm / 4;
    const len = Math.max(tr.lead.length, tr.bass.length);
    if (music.next < ctx.currentTime - 0.1) music.next = ctx.currentTime + 0.03; // 일시중단 후 복귀
    while (music.next < ctx.currentTime + 0.15) {
      playStep(tr, music.step, music.next, sd);
      music.step = (music.step + 1) % len;
      music.next += sd;
    }
  }

  SS.Audio = {
    unlock,
    setMusic,
    updateMusic,
    setMusicEnabled(on) {
      musicOn = on;
      if (musicBus) musicBus.gain.setValueAtTime(on ? MUSIC_VOL : 0, ctx.currentTime);
    },
    play(name) {
      if (!ctx || !enabled || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const gap = MIN_GAP[name] || 0;
      if (gap && lastPlayed[name] && now - lastPlayed[name] < gap) return;
      lastPlayed[name] = now;
      try { SFX[name] && SFX[name](); } catch (e) { /* 무시 */ }
    },
    setEnabled(on) {
      enabled = on;
      if (master) master.gain.setValueAtTime(on ? MASTER : 0, ctx.currentTime);
    },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && unlocked) ctx.resume(); },
  };
})();
