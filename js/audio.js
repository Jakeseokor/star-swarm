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
  const MUSIC_VOL = 0.42;

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


  // ---------------- 배경음악: K-pop 스타일 오리지널 전투곡 ----------------
  // 구성: 인트로 → 벌스 → 프리코러스(빌드업) → 드롭(후렴) 반복. 킥에 맞춘 사이드체인, 슈퍼소우 리드,
  // 808 베이스, 클랩·하이햇, 크래시·상승음. 모든 멜로디는 직접 작곡한 것.
  const mf = (n) => 440 * Math.pow(2, (n - 69) / 12);
  let duck = null; // 사이드체인 버스 (킥이 칠 때 화성 악기 볼륨이 출렁임)

  function ensureBus() {
    if (!duck) { duck = ctx.createGain(); duck.connect(musicBus); }
    return duck;
  }
  function env(g, t, vol, a, hold, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }
  // 슈퍼소우: 디튠한 톱니파 3개 + 필터
  function supersaw(n, t, dur, vol, cutoff) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 1.5;
    f.frequency.setValueAtTime(cutoff * 2.2, t);
    f.frequency.exponentialRampToValueAtTime(cutoff, t + Math.min(0.3, dur));
    const g = ctx.createGain();
    env(g, t, vol, 0.01, Math.max(0.01, dur * 0.75), dur * 0.35 + 0.05);
    for (const d of [-14, 0, 14]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = mf(n); o.detune.value = d;
      o.connect(f); o.start(t); o.stop(t + dur * 1.2 + 0.1);
    }
    f.connect(g); g.connect(ensureBus());
  }
  function pluck(n, t, vol, dec) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(700, t + (dec || 0.18));
    const g = ctx.createGain();
    env(g, t, vol, 0.004, 0.01, dec || 0.2);
    const o = ctx.createOscillator();
    o.type = 'square'; o.frequency.value = mf(n);
    o.connect(f); f.connect(g); g.connect(ensureBus());
    o.start(t); o.stop(t + (dec || 0.2) + 0.05);
  }
  function pad(notes, t, dur, vol) {
    for (const n of notes) {
      const g = ctx.createGain();
      env(g, t, vol, Math.min(0.25, dur * 0.3), dur * 0.5, dur * 0.3);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
      for (const [type, d] of [['sawtooth', -8], ['triangle', 8]]) {
        const o = ctx.createOscillator();
        o.type = type; o.frequency.value = mf(n); o.detune.value = d;
        o.connect(f); o.start(t); o.stop(t + dur + 0.1);
      }
      f.connect(g); g.connect(ensureBus());
    }
  }
  function stab(notes, t, vol) { // 브라스 스탭
    for (const n of notes) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = 3; f.frequency.setValueAtTime(3500, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.16);
      const g = ctx.createGain(); env(g, t, vol, 0.005, 0.05, 0.12);
      for (const d of [-10, 10]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mf(n); o.detune.value = d;
        o.connect(f); o.start(t); o.stop(t + 0.25);
      }
      f.connect(g); g.connect(ensureBus());
    }
  }
  function bass808(n, t, dur, vol, from) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(mf(from || n), t);
    if (from) o.frequency.exponentialRampToValueAtTime(mf(n), t + 0.09);
    const g = ctx.createGain(); env(g, t, vol, 0.005, Math.max(0.01, dur * 0.7), dur * 0.3 + 0.05);
    const o2 = ctx.createOscillator(); // 배음 (작은 스피커에서도 들리게)
    o2.type = 'triangle'; o2.frequency.value = mf(n + 12);
    const g2 = ctx.createGain(); env(g2, t, vol * 0.35, 0.005, dur * 0.4, 0.08);
    o.connect(g); o2.connect(g2); g.connect(ensureBus()); g2.connect(ensureBus());
    o.start(t); o.stop(t + dur + 0.1); o2.start(t); o2.stop(t + dur + 0.1);
  }
  function kick(t, vol, side) {
    toneAt(musicBus, 'sine', 165, 42, t, 0.24, vol);
    noiseAt(musicBus, t, 0.012, vol * 0.4, 6000, 2000);
    if (side) { const b = ensureBus(); b.gain.setValueAtTime(0.35, t); b.gain.linearRampToValueAtTime(1, t + 0.22); }
  }
  function clap(t, vol) {
    for (let i = 0; i < 3; i++) noiseAt(musicBus, t + i * 0.011, 0.02, vol, 2400, 1100, 'bandpass');
    noiseAt(musicBus, t + 0.033, 0.16, vol * 0.7, 2200, 900, 'bandpass');
  }
  function snare(t, vol) { noiseAt(musicBus, t, 0.12, vol, 7000, 1600); toneAt(musicBus, 'triangle', 230, 140, t, 0.06, vol * 0.5); }
  function hat(t, vol, open) { noiseAt(musicBus, t, open ? 0.18 : 0.03, vol, 8000, 10000, 'highpass'); }
  function crash(t) { noiseAt(musicBus, t, 1.6, 0.14, 9000, 5000, 'highpass'); }
  function riser(t, dur, vol) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    s.connect(f); f.connect(g); g.connect(musicBus); s.start(t); s.stop(t + dur + 0.1);
  }
  // 멜로디: [시작 16분음표(0~63), 음, 길이(16분음표)] → 빠른 조회용 맵
  const phrase = (ev) => { const m = {}; for (const [st, n, l] of ev) m[st] = [n, l]; return m; };

  // 화성 (E단조: Em – C – G – D)
  const EM = [64, 67, 71], CM = [60, 64, 67], GM = [62, 67, 71], DM = [62, 66, 69];
  const PROG = [EM, CM, GM, DM], ROOT = [40, 36, 43, 38];

  // 후렴 훅 (A·B 프레이즈)
  const HOOK_A = phrase([[0, 76, 2], [3, 76, 1], [4, 79, 2], [6, 78, 2], [8, 76, 2], [11, 74, 1], [12, 76, 4],
    [16, 79, 2], [19, 79, 1], [20, 81, 2], [22, 79, 2], [24, 76, 2], [27, 74, 1], [28, 72, 4],
    [32, 71, 2], [35, 74, 1], [36, 79, 2], [38, 78, 2], [40, 79, 2], [43, 81, 1], [44, 83, 4],
    [48, 81, 2], [50, 79, 2], [52, 78, 2], [54, 76, 2], [56, 78, 3], [59, 74, 1], [60, 78, 4]]);
  const HOOK_B = phrase([[0, 76, 2], [3, 76, 1], [4, 79, 2], [6, 78, 2], [8, 76, 2], [11, 74, 1], [12, 76, 4],
    [16, 79, 2], [19, 79, 1], [20, 81, 2], [22, 79, 2], [24, 76, 2], [27, 74, 1], [28, 72, 4],
    [32, 83, 3], [35, 81, 1], [36, 79, 2], [38, 81, 2], [40, 83, 4], [44, 86, 4],
    [48, 81, 4], [52, 78, 2], [54, 81, 2], [56, 76, 8]]);
  const VERSE = phrase([[0, 71, 1], [2, 71, 1], [4, 76, 2], [7, 74, 1], [8, 71, 2], [12, 67, 2],
    [16, 72, 1], [18, 72, 1], [20, 76, 2], [23, 74, 1], [24, 72, 2], [28, 67, 2],
    [32, 74, 1], [34, 74, 1], [36, 79, 2], [39, 78, 1], [40, 74, 2], [44, 71, 2],
    [48, 69, 2], [50, 74, 2], [52, 78, 2], [54, 81, 2], [56, 78, 4], [60, 74, 4]]);
  const PRE = phrase([[0, 72, 8], [8, 74, 8], [16, 74, 8], [24, 76, 8], [32, 76, 8], [40, 78, 8], [48, 79, 12]]);
  const PRE_PROG = [CM, DM, CM, DM], PRE_ROOT = [36, 38, 36, 38];

  // 스테이지: 150BPM 업비트 K-pop 댄스 (G장조 I–V–vi–IV: G–D–Em–C)
  const S_PROG = [[62, 67, 71], [62, 66, 69], [64, 67, 71], [60, 64, 67]], S_ROOT = [43, 38, 40, 36];
  const S_PRE = [[60, 64, 69], [60, 64, 67], [62, 66, 69], [62, 66, 69]], S_PRE_ROOT = [45, 36, 38, 38];
  function chant(ch, t, vol) { // 구호처럼 짧게 외치는 신스 코러스 ("Hey!" 자리)
    noiseAt(musicBus, t, 0.09, vol * 0.8, 3000, 1200, 'bandpass');
    stab(ch.map((n) => n + 12), t, vol * 0.6);
  }
  function playStage(sec, bar, s, t, sd) {
    const i4 = bar % 4, st = i4 * 16 + s;
    const ch = S_PROG[i4], root = S_ROOT[i4];
    const hot = intensity >= 0.45;
    if (sec === 'intro') {
      if (s === 0) pad(ch, t, sd * 16, 0.035);
      pluck(ch[s % 3] + 12, t, 0.03, 0.08);                       // 16분음표 아르페지오
      if (s % 4 === 0) kick(t, 0.3, true);
      if (s % 2 === 1) hat(t, 0.03);
      if (bar === 1 && s === 0) riser(t, sd * 16, 0.07);
    } else if (sec === 'verse') {
      if (s % 4 === 0) kick(t, 0.4, true);
      if (s === 4 || s === 12) { clap(t, 0.13); snare(t, 0.05); }
      hat(t, s % 4 === 2 ? 0.06 : 0.028, s % 4 === 2);
      if (s % 4 === 2) bass808(root + 12, t, sd * 1.6, 0.15);      // 엇박 하우스 베이스
      if (s === 0) { bass808(root, t, sd * 2, 0.17); pad(ch, t, sd * 16, 0.022); }
      if (s % 2 === 0) pluck(ch[(s / 2) % 3] + 12, t, 0.025, 0.06);
      const m = VERSE[st]; if (m) pluck(m[0], t, 0.065, 0.08 + m[1] * sd * 0.6);
    } else if (sec === 'pre') {
      const pc = S_PRE[i4], pr = S_PRE_ROOT[i4];
      if (bar < 3 && s % 4 === 0) kick(t, 0.38, true);
      if (bar === 3 && s % 2 === 0 && s < 12) kick(t, 0.3, true);   // 킥이 촘촘해지며 몰아붙임
      const every = [4, 2, 1, 1][i4];
      if (!(bar === 3 && s >= 12) && s % every === 0) snare(t, 0.06 + (st / 64) * 0.18);
      if (s === 0) { pad(pc, t, sd * 16, 0.032); bass808(pr, t, sd * 12, 0.14); }
      if (s % 2 === 0) pluck(pc[(s / 2) % 3] + 12 + (bar >= 2 ? 12 : 0), t, 0.025, 0.05);
      if (bar === 0 && s === 0) riser(t, sd * 60, 0.1);
      const m = PRE[st]; if (m) supersaw(m[0], t, m[1] * sd, 0.034, 2600);
      // 마지막 박은 정적 → 드롭
    } else {
      const two = sec === 'drop2';
      if (bar === 0 && s === 0) crash(t);
      if (two && i4 === 0 && s === 0 && bar > 0) crash(t);
      if (s % 4 === 0) kick(t, 0.44, true);
      if (two && i4 === 3 && (s === 14 || s === 15)) kick(t, 0.32, true);
      if (s === 4 || s === 12) { clap(t, 0.18); snare(t, 0.07); }
      hat(t, s % 4 === 2 ? 0.075 : 0.03, s % 4 === 2);
      if (two || hot) hat(t + sd / 2, 0.02);                        // 32분음표 반짝임
      if (s % 4 === 2) bass808(root + 12, t, sd * 1.6, 0.18);
      if (s === 0 || s === 8) bass808(root, t, sd * 2, 0.2, s === 8 ? root + 7 : 0);
      if (s === 2 || s === 6 || s === 10 || s === 14) stab(ch.map((n) => n - 12), t, 0.026);
      pluck(ch[s % 3] + 24, t, two ? 0.022 : 0.014, 0.05);          // 반짝이는 16분음표 아르페지오
      if (i4 % 2 === 1 && s === 14) chant(ch, t, 0.05);
      const hook = bar < 4 ? HOOK_A : HOOK_B;
      const m = hook[st];
      if (m) {
        supersaw(m[0], t, m[1] * sd, 0.052, 3600);
        if (two || hot) supersaw(m[0] + 12, t, m[1] * sd, 0.024, 5000); // 드롭2: 옥타브 위로 더블링
      }
    }
  }

  // 보스: 170BPM 에픽 오케스트라 + EDM (E단조, Em–C–D–B)
  // 현악 16분음표 오스티나토 · 합창 패드 · 파워 브라스 · 팀파니 탐 필인 · 솟구치는 리드
  function strings(n, t, vol) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 2; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.12);
    const g = ctx.createGain(); env(g, t, vol, 0.004, 0.03, 0.1);
    for (const d of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mf(n); o.detune.value = d;
      o.connect(f); o.start(t); o.stop(t + 0.2);
    }
    f.connect(g); g.connect(ensureBus());
  }
  function tom(t, f0, vol) {
    toneAt(musicBus, 'sine', f0, f0 * 0.55, t, 0.28, vol);
    noiseAt(musicBus, t, 0.05, vol * 0.3, 1500, 400);
  }
  const E_PROG = [[64, 67, 71], [60, 64, 67], [62, 66, 69], [63, 66, 71]], E_ROOT = [40, 36, 38, 35];
  const OST = [0, 2, 1, 2]; // 화음 구성음 순서 (16분음표 반복)
  const BRASS = [0, 3, 6, 8, 10, 12, 14];
  const EPIC = phrase([[0, 83, 6], [6, 81, 2], [8, 79, 4], [12, 78, 4],
    [16, 79, 6], [22, 78, 2], [24, 76, 4], [28, 72, 4],
    [32, 74, 4], [36, 78, 4], [40, 81, 4], [44, 86, 4],
    [48, 87, 8], [56, 86, 4], [60, 83, 4]]);
  function playBoss(sec, bar, s, t, sd) {
    const i4 = bar % 4, ch = E_PROG[i4], root = E_ROOT[i4], st = i4 * 16 + s;
    const hot = intensity >= 0.45, fill = i4 === 3 && s >= 12;
    // 드럼: 쉬지 않는 킥 + 투베이스, 백비트, 8분 하이햇, 4마디마다 크래시, 탐 필인
    if (s % 4 === 0 && !fill) kick(t, 0.44, true);
    if (bar % 2 === 1 && (s === 14 || s === 15)) kick(t, 0.36, true);
    if ((s === 4 || s === 12) && !fill) { snare(t, 0.13); clap(t, 0.12); }
    if (s % 2 === 1 || hot) hat(t, s % 4 === 2 ? 0.06 : 0.03, s % 4 === 2);
    if (i4 === 0 && s === 0) crash(t);
    if (fill) tom(t, [220, 180, 150, 120][s - 12], 0.32);
    // 베이스: 8분음표로 몰아치기
    if (s % 2 === 0) bass808(root + (s % 4 === 2 ? 12 : 0), t, sd * 1.8, 0.17);
    // 현악 오스티나토 (2옥타브 위, 16분음표)
    strings(ch[OST[s % 4]] + (s % 8 >= 4 ? 12 : 0), t, 0.026);
    // 합창 패드 (화음 + 옥타브)
    if (s === 0) pad([...ch, ch[0] + 12, root + 12], t, sd * 16, 0.022);
    if (sec === 'A') {
      // 파워 브라스 리프
      if (BRASS.includes(s)) stab([root + 24, root + 31, root + 36], t, s === 0 ? 0.05 : 0.035);
    } else {
      // 솟구치는 리드 + 브라스는 마디 첫 박만
      const m = EPIC[st];
      if (m) {
        supersaw(m[0], t, m[1] * sd, 0.05, 3600);
        if (hot) supersaw(m[0] - 12, t, m[1] * sd, 0.025, 2200);
      }
      if (s === 0 || s === 8) stab([root + 24, root + 31, root + 36], t, 0.04);
    }
    if (sec === 'B' && bar === 7 && s === 0) riser(t, sd * 16, 0.08);
  }

  // 타이틀: 140BPM 업비트 댄스팝 오프닝 (G장조 G–D–Em–C)
  //  A: 그루브 + 플럭으로 후렴 훅 예고 / B: 슈퍼소우 훅 + 구호 신스로 분위기 고조
  function playTitle(sec, bar, s, t, sd) {
    const i4 = bar % 4, st = i4 * 16 + s;
    const ch = S_PROG[i4], root = S_ROOT[i4];
    const B = sec === 'B';
    if (bar === 0 && s === 0) crash(t);
    if (s % 4 === 0) kick(t, 0.38, true);
    if (s === 4 || s === 12) { clap(t, B ? 0.16 : 0.12); if (B) snare(t, 0.05); }
    hat(t, s % 4 === 2 ? 0.06 : 0.025, s % 4 === 2);
    if (B) hat(t + sd / 2, 0.016);
    if (s % 4 === 2) bass808(root + 12, t, sd * 1.6, 0.14);           // 엇박 베이스
    if (s === 0 || s === 8) bass808(root, t, sd * 2, 0.16);
    if (s === 0) pad(ch, t, sd * 16, 0.026);
    pluck(ch[s % 3] + 24, t, 0.016, 0.05);                           // 반짝이는 아르페지오
    if (s === 2 || s === 6 || s === 10 || s === 14) stab(ch.map((n) => n - 12), t, 0.02);
    const m = (i4 < 2 ? HOOK_A : HOOK_B)[st];
    if (m) {
      if (B) supersaw(m[0], t, m[1] * sd, 0.042, 3400);
      else pluck(m[0], t, 0.055, 0.1 + m[1] * sd * 0.5);
    }
    if (B && i4 % 2 === 1 && s === 14) chant(ch, t, 0.045);
    if (sec === 'A' && bar === 3 && s === 0) riser(t, sd * 16, 0.06);
  }

  const TRACKS = {
    title: { bpm: 140, sections: [['A', 4], ['B', 4]], loopFrom: 0, play: playTitle },
    stage: { bpm: 150, sections: [['intro', 2], ['verse', 4], ['pre', 4], ['drop', 8], ['drop2', 8]], loopFrom: 1, play: playStage },
    boss: { bpm: 170, sections: [['A', 4], ['B', 8], ['A', 4], ['B', 4]], loopFrom: 0, play: playBoss },
  };

  // 사용자 음원 (music/list.json 에 파일 이름을 적으면 합성곡 대신 재생)
  const custom = {};
  let customSrc = null, customLoaded = false;
  function loadCustomMusic() {
    if (customLoaded || !ctx || !/^https?:$/.test(location.protocol)) return;
    customLoaded = true;
    fetch('music/list.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).then((list) => {
      for (const name of ['title', 'stage', 'boss']) {
        const file = list && list[name];
        if (!file) continue;
        fetch('music/' + file).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
          .then((buf) => new Promise((res, rej) => ctx.decodeAudioData(buf, res, rej)))
          .then((ab) => { custom[name] = ab; if (music.name === name) { music.name = null; setMusic(name); } })
          .catch(() => { /* 파일 없음·형식 오류 → 합성곡 사용 */ });
      }
    }).catch(() => {});
  }

  const music = { name: null, track: null, step: 0, next: 0 };

  function setMusic(name) {
    if (music.name === name) return;
    music.name = name;
    if (customSrc) { try { customSrc.stop(); } catch (e) { /* 이미 정지 */ } customSrc = null; }
    if (name && custom[name] && ctx) {
      customSrc = ctx.createBufferSource();
      customSrc.buffer = custom[name];
      customSrc.loop = true;
      customSrc.connect(musicBus);
      customSrc.start();
      music.track = null;
      return;
    }
    music.track = TRACKS[name] || null;
    music.step = 0;
    music.next = ctx ? ctx.currentTime + 0.08 : 0;
  }

  function songPos(tr, step) {
    let bar = Math.floor(step / 16);
    const total = tr.sections.reduce((a, x) => a + x[1], 0);
    const head = tr.sections.slice(0, tr.loopFrom).reduce((a, x) => a + x[1], 0);
    if (bar >= total) bar = head + ((bar - head) % (total - head));
    for (const [name, len] of tr.sections) {
      if (bar < len) return [name, bar];
      bar -= len;
    }
    return [tr.sections[0][0], 0];
  }

  // 매 프레임 호출: 0.15초 앞까지 음표를 미리 예약 (프레임이 흔들려도 박자가 일정)
  function updateMusic() {
    if (!ctx || ctx.state !== 'running' || !musicOn) return;
    loadCustomMusic();
    const tr = music.track;
    if (!tr) return;
    const sd = 60 / tr.bpm / 4;
    if (music.next < ctx.currentTime - 0.1) music.next = ctx.currentTime + 0.03; // 일시중단 후 복귀
    while (music.next < ctx.currentTime + 0.15) {
      const [sec, bar] = songPos(tr, music.step);
      try { tr.play(sec, bar, music.step % 16, music.next, sd); } catch (e) { if (!music.err) { music.err = true; console.error('music', e); } }
      music.step++;
      if (music.step > 16 * 4096) music.step = 16 * 64;
      music.next += sd;
    }
  }

  SS.Audio = {
    unlock,
    setMusic,
    updateMusic,
    _tracks: TRACKS, _songPos: songPos, // 테스트용
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
