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

  // ---------------- 기종별 도면 (단위: 화면 px, 기수가 위쪽) ----------------
  const DESIGNS = {
    player: {
      w: 44, h: 50,
      draw(g, c) {
        const fus = [[0, -24], [1.6, -20], [2.8, -15], [3.6, -9], [5.6, -6], [6, 4], [5.6, 14], [4.8, 21], [4.2, 23.5], [0, 23.5]];
        const wing = [[5.6, -5], [19.5, 7], [20, 11.5], [6, 12]];
        const stab = [[5, 13], [13.5, 18.5], [13.8, 22], [5, 21]];
        pairPath(g, wing); fillStroke(g, grad(g, 44, c), c.edge);
        pairPath(g, stab); fillStroke(g, grad(g, 30, c), c.edge);
        line(g, 7, -2, 18, 8.5, c.panel, 0.35, true);      // 날개 패널
        line(g, 8, 11.6, 19.5, 11.2, c.panel, 0.3, true);  // 플랩 힌지
        symPath(g, fus); fillStroke(g, grad(g, 14, c), c.edge, 0.6);
        // 공기흡입구
        pairPath(g, [[3.4, -8], [5.9, -6.2], [6.1, 0], [3.7, 0]]);
        g.fillStyle = '#2b3039'; g.fill();
        // 수직미익 (위에서 보면 얇은 판)
        pairPath(g, [[3.4, 9], [4.7, 9], [6.6, 20], [5.3, 20.5]]);
        fillStroke(g, c.dark, c.edge, 0.4);
        line(g, 0, -7, 0, 21, c.panel, 0.35);              // 등줄기
        line(g, 1.5, 2, 4.5, 2, c.panel, 0.3, true);
        line(g, 1.5, 9, 4.5, 9, c.panel, 0.3, true);
        canopy(g, 0, -12.5, 2.1, 5);
        nozzle(g, 2.3, 22.6, 1.9); nozzle(g, -2.3, 22.6, 1.9);
        missile(g, 11, 2, 9); missile(g, 15.5, 5.5, 6, '#d9b33c');
        // 표식: 날개 원형 마크 + 꼬리 붉은 띠
        for (const s of [1, -1]) {
          g.beginPath(); g.arc(13 * s, 8.5, 2.1, 0, Math.PI * 2); g.fillStyle = '#244fb8'; g.fill();
          g.beginPath(); g.arc(13 * s, 8.5, 0.9, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
        }
        g.fillStyle = '#c8323c';
        g.fillRect(5.6, 17.5, 1.2, 2); g.fillRect(-6.8, 17.5, 1.2, 2);
        g.fillStyle = '#ff5050'; g.fillRect(-20.4, 9.5, 1, 1.4);    // 항법등 (좌 적색)
        g.fillStyle = '#50ff8a'; g.fillRect(19.4, 9.5, 1, 1.4);     // 우 녹색
      },
      colors: { base: '#9aa6b6', light: '#d3dbe6', dark: '#5f6a7a', edge: 'rgba(30,36,46,0.9)', panel: 'rgba(40,48,60,0.55)' },
    },

    grunt: {
      w: 30, h: 38,
      draw(g, c) {
        const fus = [[0, -18.5], [0.5, -17], [1.2, -15], [2, -11], [2.7, -5], [3, 4], [2.8, 13], [2.2, 17.5], [0, 17.5]];
        const wing = [[2.6, -3], [13.5, 9.5], [13.5, 11.2], [2.8, 11.2]];
        const stab = [[2.6, 12.5], [7.5, 15.8], [7.5, 17.4], [2.4, 17.4]];
        pairPath(g, wing); fillStroke(g, grad(g, 30, c), c.edge);
        camo(g, () => pairPath(g, wing), c.camo, 30, 24, 11);
        pairPath(g, stab); fillStroke(g, grad(g, 16, c), c.edge);
        symPath(g, fus); fillStroke(g, grad(g, 8, c), c.edge, 0.5);
        camo(g, () => symPath(g, fus), c.camo, 8, 36, 7);
        g.fillStyle = c.dark; g.fillRect(-0.6, 6, 1.2, 11);          // 수직미익
        line(g, 4, 1, 12, 9.8, c.panel, 0.3, true);
        canopy(g, 0, -8.5, 1.5, 3.4);
        nozzle(g, 0, 17.4, 1.7);
        missile(g, 8.5, 4, 6, '#c8323c');
        g.fillStyle = '#b8322a';
        pairPath(g, [[11.5, 8.6], [13.5, 9.5], [13.5, 11.2], [11.5, 11.2]]); g.fill(); // 날개 끝 표식
        g.fillStyle = '#ffd75a'; g.fillRect(-0.4, -18.8, 0.8, 1.6);   // 피토관
      },
      colors: { base: '#6f7f45', light: '#a3b06c', dark: '#3c4626', edge: 'rgba(20,26,12,0.95)', panel: 'rgba(25,30,15,0.5)', camo: ['rgba(60,72,36,0.85)', 'rgba(140,138,84,0.7)', 'rgba(44,52,28,0.8)'] },
    },

    striker: {
      w: 32, h: 42,
      draw(g, c) {
        const fus = [[0, -21], [1.2, -18], [2.2, -13], [3, -8], [4.6, -4], [5, 6], [4.4, 15], [3.8, 19.5], [0, 19.5]];
        const wing = [[4.6, -4.5], [14.5, 8], [15, 10.8], [5, 9.5]];
        const stab = [[4.4, 12], [11.5, 16], [11.5, 19], [4, 18]];
        pairPath(g, wing); fillStroke(g, grad(g, 30, c), c.edge);
        g.save(); pairPath(g, wing); g.clip();
        g.fillStyle = 'rgba(40,44,54,0.85)';                         // 침략자 도장 띠
        pairPath(g, [[7, -2], [11, 2], [9, 9], [6, 6]]); g.fill();
        g.restore();
        pairPath(g, stab); fillStroke(g, grad(g, 24, c), c.edge);
        symPath(g, fus); fillStroke(g, grad(g, 10, c), c.edge, 0.6);
        pairPath(g, [[3.3, 8], [4.4, 8], [6, 17], [4.9, 17.5]]);    // 쌍수직미익
        fillStroke(g, '#2e323c', c.edge, 0.4);
        line(g, 0, -9, 0, 18, c.panel, 0.35);
        line(g, 6, -1, 14, 8.6, c.panel, 0.3, true);
        canopy(g, 0, -12.5, 1.8, 4.2);
        nozzle(g, 1.9, 19.6, 1.6); nozzle(g, -1.9, 19.6, 1.6);
        missile(g, 9.5, 2, 8, '#ffd23a'); missile(g, 12.5, 5, 5);
        g.fillStyle = '#ffd23a'; g.fillRect(-0.5, -16, 1, 2.2);       // 기수 경고 띠
      },
      colors: { base: '#9c2f3a', light: '#de6670', dark: '#561520', edge: 'rgba(30,8,12,0.95)', panel: 'rgba(40,10,14,0.5)' },
    },

    commander: {
      w: 46, h: 38,
      draw(g, c) {
        const fus = [[0, -18.5], [1.4, -16.5], [2.5, -12], [3, -2], [2.9, 10], [2.1, 16.5], [0, 18]];
        const wing = [[2.8, -4.5], [22.3, 2], [22.5, 5.2], [3, 5]];
        const stab = [[2.6, 12], [9.5, 14], [9.5, 16.6], [2.4, 16.2]];
        pairPath(g, wing); fillStroke(g, grad(g, 46, c), c.edge, 0.6);
        pairPath(g, stab); fillStroke(g, grad(g, 20, c), c.edge);
        line(g, 4, 3.4, 21.5, 3.6, c.panel, 0.3, true);
        // 엔진 나셀 4기
        for (const ex of [7.5, 14]) {
          for (const s of [1, -1]) {
            g.beginPath();
            g.roundRect(s * ex - 1.4, -4.5 + ex * 0.33, 2.8, 9, 1.2);
            fillStroke(g, '#3a3d48', 'rgba(10,10,14,0.9)', 0.4);
            g.beginPath(); g.arc(s * ex, -4.2 + ex * 0.33, 1.1, 0, Math.PI * 2); g.fillStyle = '#111317'; g.fill();
          }
        }
        symPath(g, fus); fillStroke(g, grad(g, 8, c), c.edge, 0.6);
        g.fillStyle = c.dark; g.fillRect(-0.6, 8, 1.2, 9.5);
        for (let i = 0; i < 4; i++) { g.fillStyle = '#9fd8ff'; g.fillRect(-1.2 + (i % 2) * 1.6, -15.5 + Math.floor(i / 2) * 1.4, 0.9, 0.9); }
        line(g, 0, -10, 0, 16, c.panel, 0.35);
        g.fillStyle = c.mark; g.fillRect(20.4, 2.2, 2, 2.8); g.fillRect(-22.4, 2.2, 2, 2.8);
        if (c.scorch) {                                               // 피격 흔적
          for (const [x, y, r] of [[9, 1, 3], [-12, 2, 2.5], [1, -4, 2], [-4, 9, 2.2]]) {
            const gr = g.createRadialGradient(x, y, 0, x, y, r);
            gr.addColorStop(0, 'rgba(10,8,6,0.9)'); gr.addColorStop(1, 'rgba(10,8,6,0)');
            g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
          }
        }
      },
      colors: { base: '#6d6a92', light: '#a7a4cc', dark: '#3c3958', edge: 'rgba(16,14,30,0.95)', panel: 'rgba(20,18,36,0.5)', mark: '#ffb02e' },
      hurt: { base: '#5c5c5e', light: '#85858a', dark: '#2f2f32', edge: 'rgba(10,10,10,0.95)', panel: 'rgba(10,10,10,0.5)', mark: '#ff6a2e', scorch: true },
    },

    boss: {
      w: 176, h: 108,
      draw(g, c) {
        // 톱니형 후연을 가진 전익기
        const wing = [[0, -50], [14, -44], [42, -27], [86, 0], [87, 6], [72, 10], [60, 6], [48, 14], [36, 10], [24, 18], [12, 14], [0, 22]];
        symPath(g, wing); fillStroke(g, grad(g, 176, c), c.edge, 0.8);
        const body = [[0, -50], [9, -42], [14, -22], [15, 6], [10, 16], [0, 22]];
        symPath(g, body);
        const gb = g.createLinearGradient(-15, -50, 15, 22);
        gb.addColorStop(0, c.light); gb.addColorStop(1, c.base);
        fillStroke(g, gb, c.edge, 0.6);
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

  function build(type, hurt, facingDown) {
    const d = DESIGNS[type];
    const [c, g] = makeCanvas(d.w, d.h);
    if (facingDown) g.rotate(Math.PI);
    d.draw(g, hurt && d.hurt ? d.hurt : d.colors);
    return {
      img: c, w: d.w, h: d.h,
      shadow: silhouette(c, 'rgba(0,0,0,1)'),
      flash: silhouette(c, '#ffffff'),
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
      ctx.globalAlpha = 0.32;
      ctx.translate(x + alt, y + alt * 1.5);
      if (rot) ctx.rotate(rot);
      ctx.drawImage(s.shadow, -s.w * k * 0.45, -s.h * k * 0.45, s.w * k * 0.9, s.h * k * 0.9);
      ctx.restore();
    },
    draw(ctx, type, x, y, rot, opt) {
      opt = opt || {};
      const s = this.get(type, opt.hurt);
      const k = opt.scale || 1;
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      if (opt.alpha !== undefined) ctx.globalAlpha = opt.alpha;
      ctx.drawImage(opt.flash ? s.flash : s.img, -s.w * k / 2, -s.h * k / 2, s.w * k, s.h * k);
      ctx.restore();
    },
    size(type) { return DESIGNS[type]; },
  };
})();
