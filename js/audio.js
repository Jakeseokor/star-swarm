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
    climb() { noise(0.45, 0.22, 600, 4000); tone('sawtooth', 180, 420, 0.4, 0.05); },
    dive() { noise(0.45, 0.22, 4000, 500); tone('sawtooth', 420, 160, 0.4, 0.05); },
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


  // ---------------- 배경음악: 전쟁영화 스타일 오리지널 전투곡 ----------------
  // 저음 현악 스피카토 오스티나토 · 태고(전쟁 북) · 금속성 타격 · 저음 브라스 '브람' ·
  // 영웅적 호른 선율 · 합창 패드 · 시계 틱 · 공간 잔향(리버브). 모든 선율은 직접 작곡.
  const mf = (n) => 440 * Math.pow(2, (n - 69) / 12);
  let inst = null, drums = null, revIn = null;

  // 홀 잔향: 지수 감쇠 노이즈로 만든 임펄스 응답
  function buildBuses() {
    if (inst) return;
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    revIn = ctx.createGain(); revIn.gain.value = 1;
    const revOut = ctx.createGain(); revOut.gain.value = 0.55;
    revIn.connect(conv); conv.connect(revOut); revOut.connect(musicBus);
    inst = ctx.createGain(); inst.connect(musicBus);
    const s1 = ctx.createGain(); s1.gain.value = 0.38; inst.connect(s1); s1.connect(revIn);
    drums = ctx.createGain(); drums.connect(musicBus);
    const s2 = ctx.createGain(); s2.gain.value = 0.22; drums.connect(s2); s2.connect(revIn);
  }
  function env(g, t, vol, a, hold, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }
  function osc(type, n, t, dur, dest, detune) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = mf(n); if (detune) o.detune.value = detune;
    o.connect(dest); o.start(t); o.stop(t + dur + 0.1);
    return o;
  }
  // 현악 스피카토 (짧게 끊는 활)
  function spiccato(n, t, vol, bright) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(bright || 1800, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.1);
    const g = ctx.createGain(); env(g, t, vol, 0.006, 0.02, 0.09);
    for (const d of [-9, 9]) osc('sawtooth', n, t, 0.18, f, d);
    f.connect(g); g.connect(inst);
  }
  // 현악 트레몰로 / 레가토 (긴 음)
  function strings(notes, t, dur, vol, trem) {
    for (const n of notes) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
      const g = ctx.createGain(); env(g, t, vol, Math.min(0.3, dur * 0.25), dur * 0.55, dur * 0.25);
      if (trem) { // 트레몰로: 빠른 음량 떨림
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.frequency.value = 13; lg.gain.value = vol * 0.6;
        lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t + dur + 0.1);
      }
      for (const d of [-11, 0, 11]) osc('sawtooth', n, t, dur, f, d);
      f.connect(g); g.connect(inst);
    }
  }
  // 호른 (부드러운 어택 + 비브라토)
  function horn(n, t, dur, vol) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1700, t + 0.15);
    const g = ctx.createGain(); env(g, t, vol, 0.09, Math.max(0.05, dur * 0.75), dur * 0.25 + 0.12);
    const vib = ctx.createOscillator(), vg = ctx.createGain();
    vib.frequency.value = 5.2; vg.gain.value = 9;
    for (const [type, d] of [['sawtooth', -5], ['sawtooth', 5], ['triangle', 0]]) {
      const o = osc(type, n, t, dur + 0.3, f, d);
      vib.connect(vg); vg.connect(o.detune);
    }
    vib.start(t); vib.stop(t + dur + 0.4);
    f.connect(g); g.connect(inst);
  }
  // 브람: 저음 브라스가 서서히 열리며 부풀어 오르는 영화 예고편 사운드
  function braam(root, t, dur, vol) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(140, t); f.frequency.exponentialRampToValueAtTime(1500, t + dur * 0.45);
    f.frequency.exponentialRampToValueAtTime(300, t + dur);
    const sh = ctx.createWaveShaper(); // 약간의 일그러짐
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2); }
    sh.curve = curve;
    const g = ctx.createGain(); env(g, t, vol, 0.12, dur * 0.5, dur * 0.4);
    for (const n of [root, root + 7, root + 12]) for (const d of [-14, 0, 14]) osc('sawtooth', n, t, dur, f, d);
    f.connect(sh); sh.connect(g); g.connect(inst);
  }
  function choir(notes, t, dur, vol) { // 합창 "아—" (포먼트 필터)
    for (const n of notes) {
      const g = ctx.createGain(); env(g, t, vol, Math.min(0.5, dur * 0.3), dur * 0.45, dur * 0.25);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 1.4;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      for (const d of [-12, 0, 12]) osc('sawtooth', n, t, dur, bp, d);
      bp.connect(lp); lp.connect(g); g.connect(inst);
    }
  }
  function sub(n, t, dur, vol) {
    const g = ctx.createGain(); env(g, t, vol, 0.01, dur * 0.6, dur * 0.35);
    osc('sine', n, t, dur, g); g.connect(inst);
  }
  // 타악기
  function taiko(t, vol, big) {
    toneAt(drums, 'sine', big ? 95 : 130, big ? 42 : 60, t, big ? 0.6 : 0.35, vol);
    noiseAt(drums, t, big ? 0.18 : 0.1, vol * 0.5, 900, 120);
  }
  function anvil(t, vol) { // 금속성 타격
    toneAt(drums, 'square', 1250, 1180, t, 0.12, vol * 0.25);
    toneAt(drums, 'square', 1790, 1700, t, 0.1, vol * 0.18);
    noiseAt(drums, t, 0.08, vol * 0.6, 6000, 3000, 'highpass');
  }
  function snareMil(t, vol) { noiseAt(drums, t, 0.14, vol, 5200, 1400); toneAt(drums, 'triangle', 210, 150, t, 0.05, vol * 0.4); }
  function tick(t, vol) { noiseAt(drums, t, 0.015, vol, 9000, 7000, 'highpass'); }
  function timpRoll(t, dur, vol) { for (let x = 0; x < dur; x += 0.055) toneAt(drums, 'sine', 70, 50, t + x, 0.12, vol * (0.4 + 0.6 * x / dur)); }
  function riser(t, dur, vol) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    s.connect(f); f.connect(g); g.connect(inst); s.start(t); s.stop(t + dur + 0.1);
  }
  const phrase = (ev) => { const m = {}; for (const [st, n, l] of ev) m[st] = [n, l]; return m; };

  // ===== 스테이지: "Into the Fire" — 132BPM, D단조 Dm–B♭–Gm–A =====
  const ST_CH = [[62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64]];
  const ST_ROOT = [50, 46, 43, 45];
  const OSTI = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 7, 0, 12, 10]; // 저음 오스티나토
  const MAIN_MEL = phrase([[0, 69, 6], [6, 72, 2], [8, 74, 8], [16, 77, 6], [22, 76, 2], [24, 74, 4], [28, 72, 4],
    [32, 70, 8], [40, 74, 4], [44, 72, 4], [48, 73, 8], [56, 76, 8]]);
  const CLIMAX_MEL = phrase([[0, 81, 4], [4, 77, 4], [8, 74, 8], [16, 82, 6], [22, 81, 2], [24, 79, 4], [28, 77, 4],
    [32, 79, 8], [40, 82, 4], [44, 81, 4], [48, 85, 8], [56, 81, 8]]);
  function playStage(sec, bar, s, t, sd) {
    buildBuses();
    const i4 = bar % 4, st = i4 * 16 + s, ch = ST_CH[i4], root = ST_ROOT[i4];
    const hot = intensity >= 0.45;
    const lvl = { intro: 0, build: 1, main: 2, climax: 3 }[sec];
    // 저음 현악 오스티나토 (항상)
    spiccato(root + OSTI[s] - 12, t, 0.05 + lvl * 0.008);
    if (lvl >= 1) spiccato(root + OSTI[s], t, 0.03, 2400);
    if (s % 2 === 0) tick(t, 0.025);
    if (s === 0) sub(root - 12, t, sd * 16, 0.13);
    if (sec === 'intro' && bar === 0 && s === 0) braam(root - 12, t, sd * 16, 0.07);
    if (sec === 'intro' && bar === 3 && s === 0) riser(t, sd * 16, 0.05);
    if (lvl >= 1) { // 태고 전쟁 북
      if (s === 0 || s === 8) taiko(t, 0.42, true);
      if (s === 3 || s === 6 || s === 11) taiko(t, 0.26, false);
      if (lvl >= 2 && (s === 4 || s === 12)) { snareMil(t, 0.09); anvil(t, 0.12); }
      if (lvl >= 2 && s === 14) taiko(t, 0.24, false);
    }
    if (lvl >= 2) {
      if (s === 0) choir(ch.map((n) => n - 12), t, sd * 16, 0.016);
      const m = (sec === 'climax' ? CLIMAX_MEL : MAIN_MEL)[st];
      if (m) horn(m[0] - (sec === 'climax' ? 0 : 0), t, m[1] * sd, 0.05);
      if (i4 === 0 && s === 0 && (sec === 'climax' || bar === 0)) braam(root - 12, t, sd * 12, 0.06);
    }
    if (sec === 'climax') {
      if (s === 0) strings(ch.map((n) => n + 12), t, sd * 16, 0.012, true); // 높은 현 트레몰로
      if (i4 === 3 && s === 8) timpRoll(t, sd * 8, 0.3);
    }
    if (hot) { // 긴장도 레이어
      if (s % 4 === 2) taiko(t, 0.18, false);
      if (s === 0 && lvl < 3) strings(ch.map((n) => n + 12), t, sd * 16, 0.009, true);
    }
    if (sec === 'build' && bar === 3 && s === 0) { riser(t, sd * 16, 0.07); timpRoll(t + sd * 8, sd * 8, 0.3); }
  }

  // ===== 보스: "Last Stand" — 148BPM, D 프리지안 Dm–E♭–B♭–A =====
  const BS_CH = [[62, 65, 69], [63, 67, 70], [58, 62, 65], [57, 61, 64]];
  const BS_ROOT = [50, 51, 46, 45];
  const BOSS_MEL = phrase([[0, 62, 4], [4, 63, 4], [8, 62, 8], [16, 63, 4], [20, 65, 4], [24, 67, 8],
    [32, 70, 6], [38, 69, 2], [40, 67, 8], [48, 69, 8], [56, 73, 8]]);
  function playBoss(sec, bar, s, t, sd) {
    buildBuses();
    const i4 = bar % 4, st = i4 * 16 + s, ch = BS_CH[i4], root = BS_ROOT[i4];
    const B = sec === 'B', hot = intensity >= 0.45;
    // 두 겹 오스티나토 (저음 + 옥타브 위 엇갈림)
    spiccato(root + OSTI[s] - 12, t, 0.06);
    spiccato(root + OSTI[(s + 2) % 16], t, 0.035, 2600);
    if (s === 0) { sub(root - 12, t, sd * 16, 0.15); braam(root - 12, t, sd * (B ? 8 : 12), 0.06); }
    // 몰아치는 태고 + 군악 스네어
    if (s % 4 === 0) taiko(t, 0.44, true);
    if (s % 4 === 2 || (B && s % 2 === 1)) taiko(t, 0.22, false);
    if (s === 4 || s === 12) { snareMil(t, 0.12); anvil(t, 0.14); }
    if (i4 === 3 && s >= 12) snareMil(t, 0.06 + (s - 12) * 0.03);
    tick(t, 0.03);
    if (B) {
      if (s === 0) { choir(ch, t, sd * 16, 0.02); strings(ch.map((n) => n + 12), t, sd * 16, 0.013, true); }
      const m = BOSS_MEL[st]; if (m) { horn(m[0] + 12, t, m[1] * sd, 0.055); horn(m[0], t, m[1] * sd, 0.035); }
      if (bar === 7 && s === 0) riser(t, sd * 16, 0.08);
    } else {
      const m = BOSS_MEL[st]; if (m) horn(m[0], t, m[1] * sd, 0.045);
    }
    if (hot && s === 8) braam(root - 12, t, sd * 6, 0.04);
  }

  // ===== 타이틀: "Briefing" — 88BPM, 째깍이는 긴장 속 멀리서 들리는 호른 =====
  const TI_CH = [[62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64]];
  const TI_ROOT = [50, 46, 43, 45];
  const CALL = phrase([[0, 62, 8], [8, 69, 8], [16, 70, 8], [24, 69, 4], [28, 67, 4], [32, 65, 8], [40, 64, 8], [48, 62, 16]]);
  function playTitle(sec, bar, s, t, sd) {
    buildBuses();
    const i4 = bar % 4, ch = TI_CH[i4], root = TI_ROOT[i4];
    tick(t, s % 4 === 0 ? 0.05 : 0.025);                             // 시계 초침
    if (s % 2 === 0) spiccato(root - 12 + (s % 8 === 6 ? 12 : 0), t, 0.04, 1200);
    if (s === 0) { strings(ch.map((n) => n - 12), t, sd * 16, 0.016); sub(root - 12, t, sd * 16, 0.1); }
    if (s === 0 || (bar % 2 === 1 && s === 10)) taiko(t, 0.3, true);
    if ((bar === 0 || bar === 4) && s === 0) braam(root - 12, t, sd * 16, 0.055);
    if (bar >= 4) { const m = CALL[i4 * 16 + s]; if (m) horn(m[0], t, m[1] * sd, 0.05); }
    if (bar === 7 && s === 0) riser(t, sd * 16, 0.05);
  }

  const TRACKS = {
    title: { bpm: 88, sections: [['A', 8]], loopFrom: 0, play: playTitle },
    stage: { bpm: 132, sections: [['intro', 4], ['build', 4], ['main', 8], ['climax', 8]], loopFrom: 1, play: playStage },
    boss: { bpm: 148, sections: [['A', 4], ['B', 8]], loopFrom: 0, play: playBoss },
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
