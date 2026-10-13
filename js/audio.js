'use strict';
/* 효과음: Web Audio API로 실시간 합성 (외부 사운드 파일 없음) */
(function () {
  const SS = window.SS;
  const MASTER = 0.35;

  let ctx = null, master = null, noiseBuf = null;
  let enabled = true, unlocked = false;
  const lastPlayed = {};
  const MIN_GAP = { shoot: 0.04, enemyDie: 0.03, hit: 0.03, bossHit: 0.06, dive: 0.25 };

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? MASTER : 0;
    master.connect(ctx.destination);
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
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    envelope(g, t0, vol, dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  function noise(dur, vol, fStart, fEnd, delay) {
    const t0 = ctx.currentTime + (delay || 0);
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
    g.connect(master);
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
    gameOver() { notes('triangle', [523, 494, 440, 392, 349, 330, 294, 262], 0.16, 0.18); },
    ending() {
      notes('square', [523, 659, 784, 1047, 784, 1047, 1319, 0, 1175, 1319, 1568], 0.13, 0.09);
      notes('triangle', [262, 330, 392, 523, 392, 523, 659, 0, 587, 659, 784], 0.13, 0.13);
    },
  };

  SS.Audio = {
    unlock,
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
