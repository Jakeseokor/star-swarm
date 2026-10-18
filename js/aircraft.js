'use strict';
/*
 * 전투기 그래픽: Canvas 벡터로 그린 위에서 본 항공기 (오리지널 디자인)
 * 동체·주익·수평미익 음영, 패널 라인, 캐노피 반사, 공기흡입구, 노즐, 무장, 표식까지 그린 뒤
 * 고해상도 이미지로 캐시해 매 프레임 drawImage 한 번으로 그린다. 그림자·피격 섬광용 실루엣도 함께 만든다.
 *
 *  player    : 쌍발 제공 전투기 (아군, 회색 제공 도장)
 *  grunt     : 경량 델타익 전투기 (녹색 위장)
 *  striker   : 장거리 요격기 (적색 침략자 도장, 빠름)
 *  commander : 4발 중폭격기 (2회 피격, 손상 시 그을린 도장)
 *  boss      : 전익형 공중요새 (포탑 4기)
 */
(function () {
  const SS = window.SS;
  let RES = 3;
  const cache = {};

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * RES);
    c.height = Math.ceil(h * RES);
    const g = c.getContext('2d');
    g.scale(RES, RES);
    g.translate(w / 2, h / 2);
    return [c, g];
  }

  // 오른쪽 절반 외곽점 → 좌우 대칭 닫힌 경로
  function symPath(g, pts) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    for (let i = pts.length - 1; i >= 0; i--) g.lineTo(-pts[i][0], pts[i][1]);
    g.closePath();
  }
  // 오른쪽 부품 하나 → 좌우 한 쌍 (주익·미익 등)
  function pairPath(g, pts) {
    g.beginPath();
    for (const s of [1, -1]) {
      g.moveTo(pts[0][0] * s, pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * s, pts[i][1]);
      g.closePath();
    }
  }
  function grad(g, w, c) {
    const gr = g.createLinearGradient(-w / 2, -w / 4, w / 2, w / 4); // 왼쪽 위에서 빛
    gr.addColorStop(0, c.light);
    gr.addColorStop(0.5, c.base);
    gr.addColorStop(1, c.dark);
    return gr;
  }
  function fillStroke(g, fill, stroke, lw) {
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = lw || 0.5;
    g.strokeStyle = stroke;
    g.stroke();
  }
  function line(g, x1, y1, x2, y2, color, lw, mirror) {
    g.strokeStyle = color;
    g.lineWidth = lw || 0.35;
    g.beginPath();
    g.moveTo(x1, y1); g.lineTo(x2, y2);
    if (mirror) { g.moveTo(-x1, y1); g.lineTo(-x2, y2); }
    g.stroke();
  }
  function canopy(g, cx, cy, rx, ry) {
    const gr = g.createLinearGradient(-rx, cy - ry, rx, cy + ry);
    gr.addColorStop(0, '#bff6ff');
    gr.addColorStop(0.35, '#3fa8d0');
    gr.addColorStop(1, '#0c2a44');
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 0.4;
    g.strokeStyle = 'rgba(20,30,40,0.9)';
    g.stroke();
    g.beginPath(); // 반사광
    g.ellipse(cx - rx * 0.35, cy - ry * 0.35, rx * 0.25, ry * 0.35, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fill();
  }
  function nozzle(g, x, y, r) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#2a2e36';
    g.fill();
    g.lineWidth = 0.5;
    g.strokeStyle = '#8a8f99';
    g.stroke();
    g.beginPath();
    g.arc(x, y, r * 0.5, 0, Math.PI * 2);
    g.fillStyle = '#0c0d10';
    g.fill();
  }
  function missile(g, x, y, len, tip) {
    for (const s of [1, -1]) {
      g.fillStyle = '#e9ecef';
      g.fillRect(s * x - 0.6, y, 1.2, len);
      g.fillStyle = tip || '#c8323c';
      g.fillRect(s * x - 0.6, y - 0.8, 1.2, 1.2);
      g.fillStyle = '#7b818c';
      g.fillRect(s * x - 1.3, y + len - 1.2, 2.6, 0.6);
    }
  }
  // 위장 무늬: 동체·날개 모양 안쪽에만 얼룩
  function camo(g, clipFn, colors, w, h, seed) {
    g.save();
    clipFn();
    g.clip();
    let s = seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      const x = (rnd() - 0.5) * w, y = (rnd() - 0.5) * h;
      g.ellipse(x, y, 1.5 + rnd() * 3.5, 1 + rnd() * 2.5, rnd() * 3, 0, Math.PI * 2);
      g.fillStyle = colors[i % colors.length];
      g.fill();
    }
    g.restore();
  }

  // ---- 사실감 헬퍼 ----
  // 동체: 날개 위로 드리우는 그림자 → 음영 채우기 → 등줄기 반사광
  function body(g, pts, w, c) {
    g.save(); g.translate(1.1, 1.4); symPath(g, pts); g.fillStyle = 'rgba(0,0,0,0.38)'; g.fill(); g.restore();
    symPath(g, pts); fillStroke(g, grad(g, w, c), c.edge, 0.55);
    g.save(); symPath(g, pts); g.clip();
    const top = pts[0][1], bot = pts[pts.length - 1][1];
    const hl = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    hl.addColorStop(0, 'rgba(255,255,255,0)'); hl.addColorStop(0.42, 'rgba(255,255,255,0.32)');
    hl.addColorStop(0.5, 'rgba(255,255,255,0.08)'); hl.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = hl; g.fillRect(-w / 2, top, w, bot - top);
    g.restore();
  }
  // 주익·미익: 음영 + 앞전 하이라이트 + 뒷전 조종면 분할선
  function surface(g, pts, w, c, opt) {
    opt = opt || {};
    pairPath(g, pts); fillStroke(g, grad(g, w, c), c.edge, 0.5);
    if (opt.camo) camo(g, () => pairPath(g, pts), opt.camo, w, Math.abs(pts[2][1] - pts[0][1]) * 2 + 10, opt.seed || 3);
    const [a, b2, c2, d] = pts;
    line(g, a[0] + 0.3, a[1] + 0.4, b2[0] - 0.2, b2[1] + 0.3, 'rgba(255,255,255,0.45)', 0.5, true); // 앞전
    if (opt.flaps) { // 뒷전에서 조금 안쪽으로 평행선 + 분할
      const k = 1.6;
      line(g, d[0], d[1] - k, c2[0] - 0.5, c2[1] - k, c.panel, 0.35, true);
      const mx = d[0] + (c2[0] - d[0]) * 0.55, my = d[1] + (c2[1] - d[1]) * 0.55;
      line(g, mx, my - k, mx, my, c.panel, 0.35, true);
    }
  }
  function radome(g, tipY, len, w, color) {
    g.save();
    g.beginPath(); g.ellipse(0, tipY + len / 2, w, len / 2, 0, 0, Math.PI * 2); g.clip();
    g.fillStyle = color; g.fillRect(-w, tipY - 1, w * 2, len);
    g.restore();
  }
  function petals(g, x, y, r) {
    nozzle(g, x, y, r);
    g.strokeStyle = 'rgba(160,165,175,0.7)'; g.lineWidth = 0.25;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
    }
  }
  function soot(g, x, y, r) { // 노즐 주변 배기 그을음
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(20,18,16,0.55)'); gr.addColorStop(1, 'rgba(20,18,16,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  function fin(g, pts, c) { // 수직미익 (밝은 면/어두운 면) + 오른쪽 아래로 드리운 그림자
    g.save(); g.translate(1.6, 1.8); pairPath(g, pts); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill(); g.restore();
    pairPath(g, pts);
    const gr = g.createLinearGradient(pts[0][0], 0, pts[1][0], 0);
    gr.addColorStop(0, c.light); gr.addColorStop(1, c.dark);
    fillStroke(g, gr, c.edge, 0.4);
  }
  function canopyFrame(g, cy, ry) {
    g.strokeStyle = 'rgba(30,36,46,0.85)'; g.lineWidth = 0.45;
    g.beginPath(); g.moveTo(-1.6, cy + ry * 0.15); g.quadraticCurveTo(0, cy - ry * 0.05, 1.6, cy + ry * 0.15); g.stroke();
  }

  // ---------------- 기종별 도면 (단위: 화면 px, 기수가 위쪽) ----------------
  const DESIGNS = {
    player: {
      w: 46, h: 52,
      draw(g, c) {
        const fus = [[0, -25], [1.4, -21.5], [2.6, -16.5], [3.5, -10.5], [5.4, -7.5], [6.1, -1], [6.2, 6], [5.7, 14], [4.9, 21], [4.3, 24.5], [0, 24.5]];
        const wing = [[5.8, -5.5], [20.5, 7.5], [21, 12], [6.2, 12.5]];
        const stab = [[5.2, 13.5], [14.5, 19], [14.8, 22.8], [5.2, 21.6]];
        surface(g, wing, 46, c, { flaps: true, camo: c.camo, seed: 5 });
        surface(g, stab, 32, c, { camo: c.camo, seed: 9 });
        line(g, 7.5, -1.5, 18.5, 8.6, c.panel, 0.3, true);
        // 날개 밑 무장 (파일런 + 미사일)
        missile(g, 11.2, 1.5, 9.5); missile(g, 15.8, 5.2, 6.5, '#d9b33c');
        body(g, fus, 14, c);
        camo(g, () => symPath(g, fus), c.camo, 12, 50, 13);
        radome(g, -25, 7, 2.6, '#6c7686');
        // 공기흡입구 (어두운 덕트 + 경사판)
        pairPath(g, [[3.5, -9], [6.1, -7], [6.3, -0.5], [3.8, -0.5]]); g.fillStyle = '#20242c'; g.fill();
        line(g, 3.6, -8.8, 6, -6.9, 'rgba(150,160,175,0.7)', 0.35, true);
        fin(g, [[3.5, 9.5], [4.9, 9.5], [6.8, 20.5], [5.4, 21]], c);
        // 패널 라인·리벳
        line(g, 0, -6, 0, 22, c.panel, 0.3);
        for (const y of [-4, 3, 10, 16]) line(g, 1.2, y, 5.2, y, c.panel, 0.25, true);
        g.fillStyle = 'rgba(30,36,46,0.45)';
        for (let y = -3; y < 20; y += 3) { g.fillRect(2.2, y, 0.35, 0.35); g.fillRect(-2.55, y, 0.35, 0.35); }
        canopy(g, 0, -13, 2.15, 5.3); canopyFrame(g, -13, 5.3);
        soot(g, 2.35, 21.5, 4); soot(g, -2.35, 21.5, 4);
        petals(g, 2.35, 23.4, 2.05); petals(g, -2.35, 23.4, 2.05);
        // 표식: 날개 원형 마크, 꼬리 띠, 항법등
        for (const sx of [1, -1]) {
          g.beginPath(); g.arc(13.5 * sx, 9, 2.2, 0, Math.PI * 2); g.fillStyle = '#21469f'; g.fill();
          g.beginPath(); g.arc(13.5 * sx, 9, 0.95, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
        }
        g.fillStyle = '#b8323c'; g.fillRect(5.9, 18, 1.1, 2.2); g.fillRect(-7, 18, 1.1, 2.2);
        g.fillStyle = '#ff5050'; g.fillRect(-21.4, 10, 1, 1.4);
        g.fillStyle = '#50ff8a'; g.fillRect(20.4, 10, 1, 1.4);
        g.fillStyle = 'rgba(20,24,30,0.7)'; g.fillRect(-0.9, 4.5, 1.8, 2.6); // 공중급유구
      },
      colors: { base: '#9aa6b6', light: '#d6dee8', dark: '#5c6778', edge: 'rgba(26,32,42,0.92)', panel: 'rgba(40,48,60,0.5)', camo: ['rgba(110,122,140,0.5)', 'rgba(150,162,178,0.35)'] },
    },

    grunt: {
      w: 30, h: 38,
      draw(g, c) {
        const fus = [[0, -18.5], [1.3, -17.6], [1.9, -14.5], [2.4, -10], [2.8, -4], [3, 4], [2.8, 13], [2.2, 17.6], [0, 17.6]];
        const wing = [[2.7, -3.5], [13.6, 9.4], [13.6, 11.3], [2.9, 11.3]];
        const stab = [[2.6, 12.4], [7.6, 15.8], [7.6, 17.5], [2.4, 17.5]];
        surface(g, wing, 30, c, { flaps: true, camo: c.camo, seed: 11 });
        surface(g, stab, 16, c, { camo: c.camo, seed: 4 });
        missile(g, 8.6, 3.6, 6.5, '#c8323c');
        // 중앙 보조연료탱크
        g.save(); g.translate(0.8, 1.2); g.beginPath(); g.ellipse(0, 4, 1.6, 6.5, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill(); g.restore();
        body(g, fus, 8, c);
        camo(g, () => symPath(g, fus), c.camo, 8, 36, 7);
        // 기수 공기흡입구 + 쇼크콘
        g.beginPath(); g.ellipse(0, -17.6, 1.35, 0.9, 0, 0, Math.PI * 2); g.fillStyle = '#15181c'; g.fill();
        g.beginPath(); g.arc(0, -17.7, 0.55, 0, Math.PI * 2); g.fillStyle = '#8a8f99'; g.fill();
        fin(g, [[-0.7, 5.5], [0.7, 5.5], [0.7, 16.8], [-0.7, 16.8]], c);
        line(g, 4.2, 0.8, 12, 9.6, c.panel, 0.28, true);
        for (const y of [-6, 0, 7]) line(g, 0.8, y, 2.7, y, c.panel, 0.25, true);
        canopy(g, 0, -9.5, 1.5, 3.3); canopyFrame(g, -9.5, 3.3);
        soot(g, 0, 16, 3.5);
        petals(g, 0, 17.6, 1.75);
        g.fillStyle = '#b8322a';
        pairPath(g, [[11.6, 8.5], [13.6, 9.4], [13.6, 11.3], [11.6, 11.3]]); g.fill();
        g.fillStyle = '#ffd75a'; g.fillRect(-0.3, -20, 0.6, 1.8); // 피토관
      },
      colors: { base: '#6f7f45', light: '#a8b472', dark: '#3a4424', edge: 'rgba(18,24,10,0.95)', panel: 'rgba(25,30,15,0.5)', camo: ['rgba(58,70,34,0.8)', 'rgba(146,140,88,0.6)', 'rgba(40,48,26,0.75)'] },
    },

    striker: {
      w: 32, h: 44,
      draw(g, c) {
        const fus = [[0, -22], [1.1, -19.5], [2.1, -14.5], [2.9, -9.5], [4.4, -6], [5.2, -1], [5.2, 6], [4.6, 15], [3.9, 20], [0, 20]];
        const wing = [[4.6, -4.5], [14.8, 8.4], [15.2, 11.2], [5.1, 9.8]];
        const stab = [[4.4, 12.4], [11.8, 16.4], [11.8, 19.4], [4, 18.4]];
        const lerx = [[2.8, -10], [4.6, -4.6], [5.1, -1.5], [3.3, -3]];
        surface(g, wing, 30, c, { flaps: true });
        g.save(); pairPath(g, wing); g.clip();          // 침략자 도장 띠
        g.fillStyle = 'rgba(38,42,52,0.85)'; pairPath(g, [[7, -2], [11.5, 2.5], [9.4, 9.6], [6.2, 6.4]]); g.fill();
        g.restore();
        surface(g, stab, 24, c);
        missile(g, 9.6, 1.8, 8.5, '#ffd23a'); missile(g, 12.8, 4.8, 5.5);
        body(g, fus, 11, c);
        pairPath(g, lerx); fillStroke(g, c.dark, c.edge, 0.35);
        radome(g, -22, 7, 2.2, '#3a3f4a');
        fin(g, [[3.3, 8], [4.5, 8], [6.2, 17.6], [5, 18]], { light: '#e07a82', dark: '#4a1218', edge: c.edge });
        line(g, 0, -8, 0, 19, c.panel, 0.3);
        for (const y of [-3, 4, 11]) line(g, 1.2, y, 4.6, y, c.panel, 0.25, true);
        canopy(g, 0, -13, 1.85, 4.4); canopyFrame(g, -13, 4.4);
        soot(g, 1.95, 18.5, 3.5); soot(g, -1.95, 18.5, 3.5);
        petals(g, 1.95, 20.2, 1.65); petals(g, -1.95, 20.2, 1.65);
        g.fillStyle = '#ffd23a'; g.fillRect(-0.5, -16.6, 1, 2.2);
      },
      colors: { base: '#9c2f3a', light: '#e06c76', dark: '#521420', edge: 'rgba(28,6,10,0.95)', panel: 'rgba(40,10,14,0.5)' },
    },

    commander: {
      w: 46, h: 40,
      draw(g, c) {
        const fus = [[0, -19], [1.5, -17.4], [2.6, -13], [3.1, -3], [3, 10], [2.2, 17], [0, 18.6]];
        const wing = [[2.8, -4.8], [22.4, 1.8], [22.6, 5.4], [3, 5]];
        const stab = [[2.6, 12], [9.8, 14], [9.8, 16.8], [2.4, 16.4]];
        surface(g, wing, 46, c, { flaps: true, camo: c.camo, seed: 21 });
        surface(g, stab, 20, c);
        // 엔진 나셀 4기 (그림자 → 본체 → 흡입구)
        for (const ex of [7.6, 14.2]) {
          for (const sx of [1, -1]) {
            const y0 = -5 + ex * 0.33;
            g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.roundRect(sx * ex - 1.4 + 0.8, y0 + 1, 2.8, 9.5, 1.2); g.fill();
            const ng = g.createLinearGradient(sx * ex - 1.5, 0, sx * ex + 1.5, 0);
            ng.addColorStop(0, '#6a6e7c'); ng.addColorStop(1, '#2a2c34');
            g.beginPath(); g.roundRect(sx * ex - 1.4, y0, 2.8, 9.5, 1.2);
            fillStroke(g, ng, 'rgba(10,10,14,0.9)', 0.4);
            g.beginPath(); g.ellipse(sx * ex, y0 + 0.4, 1.15, 0.7, 0, 0, Math.PI * 2); g.fillStyle = '#0e1013'; g.fill();
            g.fillStyle = 'rgba(255,140,60,0.5)'; g.fillRect(sx * ex - 0.7, y0 + 9, 1.4, 0.7);
          }
        }
        body(g, fus, 8, c);
        fin(g, [[-0.7, 7.5], [0.7, 7.5], [0.7, 18], [-0.7, 18]], c);
        // 유리 기수 + 조종석 창
        g.beginPath(); g.ellipse(0, -17, 1.3, 1.8, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(140,210,255,0.75)'; g.fill();
        for (let i = 0; i < 4; i++) { g.fillStyle = '#9fd8ff'; g.fillRect(-1.25 + (i % 2) * 1.6, -14.6 + Math.floor(i / 2) * 1.3, 0.9, 0.8); }
        line(g, 0, -11, 0, 17, c.panel, 0.32);
        for (const y of [-8, -1, 6, 12]) line(g, 0.8, y, 3, y, c.panel, 0.25, true);
        g.fillStyle = '#d0d4dc'; g.fillRect(-0.25, -6, 0.5, 3); // 안테나
        g.fillStyle = c.mark; g.fillRect(20.6, 2.2, 2, 3.2); g.fillRect(-22.6, 2.2, 2, 3.2);
        if (c.scorch) {                                               // 피격 흔적
          for (const [x, y, r] of [[9, 1, 3.2], [-12, 2, 2.6], [1, -4, 2.2], [-4, 9, 2.4], [16, 3, 1.8]]) {
            const gr = g.createRadialGradient(x, y, 0, x, y, r);
            gr.addColorStop(0, 'rgba(10,8,6,0.92)'); gr.addColorStop(1, 'rgba(10,8,6,0)');
            g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
          }
        }
      },
      colors: { base: '#6d6a92', light: '#aaa7d0', dark: '#3a3756', edge: 'rgba(16,14,30,0.95)', panel: 'rgba(20,18,36,0.5)', mark: '#ffb02e', camo: ['rgba(70,66,100,0.55)', 'rgba(130,126,160,0.4)'] },
      hurt: { base: '#5c5c5e', light: '#88888c', dark: '#2e2e31', edge: 'rgba(10,10,10,0.95)', panel: 'rgba(10,10,10,0.5)', mark: '#ff6a2e', scorch: true, camo: ['rgba(40,40,42,0.5)'] },
    },

    boss: {
      w: 176, h: 108,
      draw(g, c) {
        // 톱니형 후연을 가진 전익기
        const wing = [[0, -50], [14, -44], [42, -27], [86, 0], [87, 6], [72, 10], [60, 6], [48, 14], [36, 10], [24, 18], [12, 14], [0, 22]];
        symPath(g, wing); fillStroke(g, grad(g, 176, c), c.edge, 0.8);
        const bodyPts = [[0, -50], [9, -42], [14, -22], [15, 6], [10, 16], [0, 22]];
        body(g, bodyPts, 30, c);
        g.fillStyle = 'rgba(10,12,18,0.45)';
        for (let x = 20; x < 80; x += 6) for (const sx of [1, -1]) g.fillRect(sx * x, -24 + x * 0.3, 0.6, 0.6);
        // 패널 라인
        for (let i = 1; i <= 4; i++) line(g, 14 + i * 3, -40 + i * 2, 84 - i * 4, 1 + i, c.panel, 0.4, true);
        line(g, 0, -44, 0, 20, c.panel, 0.5);
        // 흡입구·배기구
        pairPath(g, [[16, -26], [26, -20], [25, -17], [15, -23]]); g.fillStyle = '#121418'; g.fill();
        pairPath(g, [[18, 8], [30, 10], [29, 12.5], [17, 10.5]]); g.fillStyle = c.glow; g.fill();
        // 조종석 창
        g.fillStyle = '#ff3040';
        g.fillRect(-5, -41, 3, 1.4); g.fillRect(2, -41, 3, 1.4);
        // 포탑 4기 (포신은 기수 쪽)
        for (const [tx, ty] of [[30, -10], [56, -2]]) {
          for (const s of [1, -1]) {
            g.fillStyle = '#5b6372';
            g.fillRect(s * tx - 0.9, ty - 9, 1.8, 7);
            g.beginPath(); g.arc(s * tx, ty, 5, 0, Math.PI * 2);
            fillStroke(g, '#3a404c', '#0a0c10', 0.6);
            g.beginPath(); g.arc(s * tx, ty, 2.2, 0, Math.PI * 2);
            g.fillStyle = c.glow; g.fill();
          }
        }
        g.fillStyle = '#ff5050'; g.fillRect(-87, 2, 1.5, 2);
        g.fillStyle = '#50ff8a'; g.fillRect(85.5, 2, 1.5, 2);
      },
      colors: { base: '#3d4454', light: '#6a7488', dark: '#20242e', edge: 'rgba(8,10,14,0.95)', panel: 'rgba(10,12,18,0.6)', glow: '#ff3040' },
      hurt: { base: '#4c3036', light: '#7a4a54', dark: '#26161a', edge: 'rgba(8,4,6,0.95)', panel: 'rgba(14,6,8,0.6)', glow: '#ffb02e' },
    },
  };

  // 실루엣(그림자·섬광)
  function silhouette(src, color) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // 가장자리를 흐린 그림자 (작게 줄였다 키우는 방식의 간단한 블러)
  function softShadow(src) {
    const sil = silhouette(src, '#000000');
    const k = 6;
    const sm = document.createElement('canvas');
    sm.width = Math.max(1, Math.ceil(src.width / k)); sm.height = Math.max(1, Math.ceil(src.height / k));
    const sg = sm.getContext('2d');
    sg.imageSmoothingEnabled = true;
    sg.drawImage(sil, 0, 0, sm.width, sm.height);
    const out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    const og = out.getContext('2d');
    og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
    og.globalAlpha = 0.6; og.drawImage(sm, 0, 0, out.width, out.height);
    og.globalAlpha = 0.55; og.drawImage(sil, 0, 0);
    return out;
  }

  function build(type, hurt, facingDown) {
    const d = DESIGNS[type];
    const [c, g] = makeCanvas(d.w, d.h);
    if (facingDown) g.rotate(Math.PI);
    d.draw(g, hurt && d.hurt ? d.hurt : d.colors);
    // 화면 기준 조명 (왼쪽 위 태양) — 적기도 아군과 같은 방향에서 빛을 받음
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    const lg = g.createLinearGradient(0, 0, c.width, c.height);
    lg.addColorStop(0, 'rgba(255,248,230,0.2)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0)');
    lg.addColorStop(1, 'rgba(0,0,20,0.28)');
    g.fillStyle = lg;
    g.fillRect(0, 0, c.width, c.height);
    // 금속 표면 미세 질감 (패널마다 살짝 다른 반사)
    const nz = document.createElement('canvas');
    nz.width = nz.height = 64;
    const ng = nz.getContext('2d'), nd = ng.createImageData(64, 64);
    for (let i = 0; i < nd.data.length; i += 4) {
      const v = Math.random() < 0.5 ? 0 : 255;
      nd.data[i] = nd.data[i + 1] = nd.data[i + 2] = v; nd.data[i + 3] = Math.random() * 22;
    }
    ng.putImageData(nd, 0, 0);
    g.fillStyle = g.createPattern(nz, 'repeat');
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    return {
      img: c, w: d.w, h: d.h,
      shadow: softShadow(c),
      flash: silhouette(c, '#ffffff'),
      dark: silhouette(c, '#05070c'),
    };
  }

  SS.Aircraft = {
    // 해상도: 화면 배율에 맞춰 선명하게 (바뀌면 캐시 재생성)
    setResolution(r) {
      const n = Math.max(2, Math.min(4, Math.ceil(r)));
      if (n !== RES) { RES = n; for (const k in cache) delete cache[k]; }
    },
    // type: player|grunt|striker|commander|boss, hurt: 손상 도장
    get(type, hurt) {
      const key = type + (hurt ? ':hurt' : '');
      if (!cache[key]) cache[key] = build(type, hurt, type !== 'player');
      return cache[key];
    },
    // 그림자 → 기체 순으로 그리기. rot: 회전(라디안), alt: 고도(그림자 거리)
    drawShadow(ctx, type, x, y, rot, alt, scale) {
      const s = this.get(type);
      const k = scale || 1;
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.imageSmoothingEnabled = true;
      ctx.translate(x + alt, y + alt * 1.5);
      if (rot) ctx.rotate(rot);
      ctx.drawImage(s.shadow, -s.w * k * 0.45, -s.h * k * 0.45, s.w * k * 0.9, s.h * k * 0.9);
      ctx.restore();
    },
    draw(ctx, type, x, y, rot, opt) {
      opt = opt || {};
      const s = this.get(type, opt.hurt);
      const k = opt.scale || 1, kx = opt.scaleX || 1;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      if (opt.alpha !== undefined) ctx.globalAlpha = opt.alpha;
      const w = s.w * k * kx, h = s.h * k;
      ctx.drawImage(opt.flash ? s.flash : s.img, -w / 2, -h / 2, w, h);
      // 롤: 기운 쪽 날개는 햇빛을 덜 받아 어두워짐
      if (opt.roll && Math.abs(opt.roll) > 0.05 && !opt.flash) {
        ctx.globalAlpha = Math.min(0.45, Math.abs(opt.roll) * 0.45);
        const iw = s.dark.width / 2, ih = s.dark.height;
        if (opt.roll > 0) ctx.drawImage(s.dark, iw, 0, iw, ih, 0, -h / 2, w / 2, h);   // 오른쪽 날개
        else ctx.drawImage(s.dark, 0, 0, iw, ih, -w / 2, -h / 2, w / 2, h);           // 왼쪽 날개
      }
      ctx.restore();
    },
    size(type) { return DESIGNS[type]; },
  };
})();
