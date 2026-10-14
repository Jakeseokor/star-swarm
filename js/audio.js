'use strict';
/*
 * 효과음 + 배경음악: Web Audio API로 실시간 합성 (외부 사운드 파일 없음)
 *
 * iOS(아이패드) 주의점
 *  1) 사용자가 화면을 터치한 "그 순간"에만 오디오를 켤 수 있음 → 터치마다 켜질 때까지 재시도
 *  2) 무음 모드(제어 센터 종 아이콘)에서는 Web Audio가 꺼짐
 *     → iOS 17+: navigator.audioSession.type = 'playback' 으로 무음 모드에서도 재생
 *     → 그 이하: 무음 <audio>를 반복 재생해 오디오 세션을 '재생' 모드로 전환
 */
(function () {
  const SS = window.SS;
  const MASTER = 0.4;
  const MUSIC_VOL = 0.3;

  let ctx = null, master = null, musicBus = null, noiseBuf = null;
  let enabled = true, musicOn = true, primed = false;
  let htmlKeepAlive = null;
  let intensity = 0;
  const lastPlayed = {};
  const MIN_GAP = { shoot: 0.05, enemyDie: 0.03, hit: 0.03, bossHit: 0.06, dive: 0.25 };

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

  // 0.5초짜리 무음 WAV (데이터 URI)
  function silentWav() {
    const n = 4000, buf = new Uint8Array(44 + n);
    const dv = new DataView(buf.buffer);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
    str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
    str(36, 'data'); dv.setUint32(40, n, true);
    buf.fill(128, 44);
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }

  function bypassSilentSwitch() {
    try {
      if (navigator.audioSession) {
        if (navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
        return;
      }
    } catch (e) { /* 미지원 */ }
    // 구형 iOS: 무음 오디오 반복 재생으로 세션 전환
    try {
      if (!htmlKeepAlive) {
        htmlKeepAlive = new Audio(silentWav());
        htmlKeepAlive.loop = true;
        htmlKeepAlive.setAttribute('playsinline', '');
      }
      if (htmlKeepAlive.paused) {
        const p = htmlKeepAlive.play();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) { /* 무시 */ }
  }

  // 터치·키 입력마다 호출. 실제로 'running'이 될 때까지 매번 다시 시도한다.
  function unlock() {
    try {
      if (!ctx && !init()) return;
      bypassSilentSwitch();
      if (ctx.state !== 'running') {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
      if (!primed || ctx.state !== 'running') {
        // 사용자 제스처 안에서 아주 짧은 무음 버퍼를 재생해야 iOS가 출력을 연다
        const b = ctx.createBuffer(1, 1, 22050);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
        primed = true;
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

  function noiseAt(dest, t0, dur, vol, fStart, fEnd, type) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.setValueAtTime(fStart, t0);
    f.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
    const g = ctx.createGain();
    envelope(g, t0, vol, dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + dur + 0.03);
  }

  function notes(type, freqs, step, vol, delay) {
    freqs.forEach((f, i) => { if (f) tone(type, f, f, step * 0.9, vol, (delay || 0) + i * step); });
  }

  const SFX = {
    shoot() { noise(0.05, 0.16, 6000, 1500); tone('square', 420, 140, 0.06, 0.06); }, // 기관포
    hit() { tone('square', 420, 180, 0.07, 0.12); },
    enemyDie() { noise(0.45, 0.45, 3500, 120); tone('triangle', 180, 35, 0.35, 0.22); tone('square', 90, 30, 0.25, 0.06, 0.02); },
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


  // ---------------- 배경음악 (오리지널 전투 칩튠) ----------------
  // 16분음표 단위. 숫자 = MIDI 음 번호, 0 = 쉼표
  // 전투 긴장도(intensity 0~1)가 오르면 아르페지오·16비트 하이햇·상승 효과음 레이어가 더해진다.
  const mf = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const rep = (arr, n) => [].concat(...Array(n).fill(arr));
  function bars(roots, pat) { return [].concat(...roots.map((r) => pat.map((o) => (o === null ? 0 : r + o)))); }
  function arps(chords) { return [].concat(...chords.map((c) => rep(c, 4))); }
  const GALLOP = [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 12, 0, 12]; // 쉼 없이 몰아치는 16비트 베이스
  const STOMP = [0, 0, 12, 0, 1, 0, 12, 0, 0, 0, 12, 0, 3, 0, 1, 0];   // 반음 충돌로 불안감
  const PULSE8 = [0, null, 0, null, 0, null, 0, null, 0, null, 0, null, 0, null, 7, null];

  const TRACKS = {
    // 타이틀: 느리고 불길한 전운 (A단조, 반음 하강)
    title: {
      bpm: 92, lead: 'triangle', leadVol: 0.09, bassVol: 0.09, arpVol: 0.03,
      kick: [0, 8], snare: [], hat: 0, riser: false,
      melody: [
        69, 0, 0, 0, 0, 0, 72, 0, 0, 0, 71, 0, 0, 0, 0, 0,
        69, 0, 0, 0, 0, 0, 65, 0, 0, 0, 64, 0, 0, 0, 0, 0,
        62, 0, 0, 0, 0, 0, 65, 0, 0, 0, 69, 0, 0, 0, 0, 0,
        68, 0, 0, 0, 0, 0, 71, 0, 0, 0, 76, 0, 0, 0, 0, 0,
      ],
      bass: bars([45, 41, 38, 40], PULSE8),
      arp: arps([[57, 60, 64, 69], [53, 57, 60, 65], [50, 53, 57, 62], [52, 56, 59, 64]]),
    },
    // 스테이지: 빠른 D단조 전투곡. 질주하는 베이스 + 긴박한 리드, B파트에서 고음으로 상승
    stage: {
      bpm: 156, lead: 'square', leadVol: 0.05, bassVol: 0.075, arpVol: 0.028,
      kick: [0, 4, 8, 12], snare: [4, 12], hat: 2, riser: true,
      melody: [
        // A
        74, 0, 74, 0, 72, 0, 74, 0, 0, 0, 77, 0, 76, 0, 74, 0,
        74, 0, 74, 0, 72, 0, 70, 0, 0, 0, 69, 0, 70, 0, 72, 0,
        72, 0, 72, 0, 70, 0, 72, 0, 0, 0, 76, 0, 74, 0, 72, 0,
        73, 0, 0, 0, 76, 0, 0, 0, 79, 0, 0, 0, 81, 0, 82, 0,
        // B
        86, 0, 0, 0, 0, 0, 84, 0, 82, 0, 0, 0, 81, 0, 79, 0,
        82, 0, 0, 0, 0, 0, 81, 0, 79, 0, 0, 0, 77, 0, 74, 0,
        81, 0, 0, 0, 0, 0, 79, 0, 77, 0, 0, 0, 76, 0, 77, 0,
        73, 0, 76, 0, 79, 0, 76, 0, 73, 0, 76, 0, 81, 0, 0, 0,
      ],
      bass: bars([50, 46, 48, 45, 50, 46, 48, 45], GALLOP),
      arp: arps([[62, 65, 69, 74], [58, 62, 65, 70], [60, 64, 67, 72], [61, 64, 69, 73],
        [62, 65, 69, 74], [58, 62, 65, 70], [60, 64, 67, 72], [61, 64, 69, 73]]),
    },
    // 보스: 더 빠르고 무거운 E 프리지안. 경보음 같은 트라이톤 리드 + 투베이스 킥
    boss: {
      bpm: 172, lead: 'sawtooth', leadVol: 0.04, bassVol: 0.085, arpVol: 0.026,
      kick: [0, 4, 8, 12, 14, 15], snare: [4, 12], hat: 1, riser: true,
      melody: [
        76, 0, 0, 70, 0, 0, 76, 0, 75, 0, 70, 0, 71, 0, 72, 0,
        77, 0, 0, 71, 0, 0, 77, 0, 76, 0, 71, 0, 72, 0, 73, 0,
        76, 0, 0, 70, 0, 0, 76, 0, 75, 0, 70, 0, 71, 0, 72, 0,
        76, 75, 74, 73, 72, 71, 70, 69, 70, 0, 76, 0, 82, 0, 0, 0,
      ],
      bass: bars([52, 52, 53, 51], STOMP),
      arp: arps([[64, 67, 70, 73], [64, 67, 70, 73], [65, 68, 71, 74], [63, 66, 69, 72]]),
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
    const len = tr.melody.length;
    const s16 = i % 16;
    const n = tr.melody[i % len];
    if (n) toneAt(musicBus, tr.lead, mf(n), mf(n), t, sd * 1.6, tr.leadVol);
    const b = tr.bass[i % tr.bass.length];
    if (b) {
      toneAt(musicBus, 'square', mf(b), mf(b), t, sd * 0.8, tr.bassVol * 0.55);
      toneAt(musicBus, 'triangle', mf(b - 12), mf(b - 12), t, sd * 0.9, tr.bassVol);
    }
    // 긴장도가 오를수록 레이어 추가
    if (intensity >= 0.45 || tr.hat === 0) {
      const a = tr.arp[i % tr.arp.length];
      if (a && (tr.hat !== 0 || i % 2 === 0)) toneAt(musicBus, 'square', mf(a + 12), mf(a + 12), t, sd * 0.5, tr.arpVol);
    }
    if (tr.kick.includes(s16)) toneAt(musicBus, 'sine', 150, 42, t, 0.13, 0.4);
    if (tr.snare.includes(s16)) {
      noiseAt(musicBus, t, 0.13, 0.2, 6000, 1500);
      toneAt(musicBus, 'triangle', 220, 120, t, 0.07, 0.12);
    }
    if (tr.hat) {
      const every = intensity >= 0.3 ? 1 : tr.hat;
      if (i % every === 0) noiseAt(musicBus, t, 0.035, s16 % 4 === 2 ? 0.07 : 0.04, 7000, 9000, 'highpass');
    }
    // 4마디마다 끝에서 긴장감을 끌어올리는 상승 노이즈
    if (tr.riser && intensity >= 0.45 && i % 64 === 48) noiseAt(musicBus, t, sd * 16, 0.05, 400, 9000);
  }

  // 매 프레임 호출: 0.15초 앞까지 음표를 미리 예약 (프레임이 흔들려도 박자가 일정)
  function updateMusic() {
    if (!ctx || ctx.state !== 'running' || !music.track || !musicOn) return;
    const tr = music.track;
    const sd = 60 / tr.bpm / 4;
    const len = tr.melody.length;
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
    setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); },
    // 'running'이면 소리가 나는 상태
    state() { return ctx ? ctx.state : 'none'; },
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
    suspend() {
      if (ctx && ctx.state === 'running') ctx.suspend();
      if (htmlKeepAlive && !htmlKeepAlive.paused) htmlKeepAlive.pause();
    },
    resume() {
      if (!ctx) return;
      const p = ctx.resume();
      if (p && p.catch) p.catch(() => {});
    },
  };
})();
