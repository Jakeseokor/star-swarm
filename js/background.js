'use strict';
/*
 * 전장 배경: 절차적으로 만든 지형(높이맵 + 언덕 음영)을 위성사진처럼 렌더링하고 세로로 스크롤한다.
 * 위아래가 이어지도록(타일링) 노이즈를 세로 방향으로 주기화했다.
 *
 *  sea      남중국해   : 푸른 바다, 산호초 섬, 인공섬 활주로, 함정과 항적
 *  desert   중동 사막  : 사구, 바위 고원, 고속도로, 마을, 유전
 *  mountain 히말라야   : 설산 능선, 빙하, 계곡
 *  arctic   북극해     : 해빙, 균열, 개수로 (황혼)
 *  gulfnight 페르시아만 야간 : 해안 도시 불빛, 불타는 유전
 */
(function () {
  const SS = window.SS;
  const C = SS.CONFIG;
  const TH = 1024;          // 타일 높이 (논리 px) — 노이즈 주기와 맞춤
  const CELL = 2;           // 높이맵 한 칸 = 2 논리 px
  const BASE = 128;         // 노이즈 기본 격자 크기 (TH / BASE = 정수)

  // ---------- 타일링 가능한 값 노이즈 ----------
  function hash(ix, iy, seed) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, py, seed) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const y0 = ((iy % py) + py) % py, y1 = (y0 + 1) % py;
    const a = hash(ix, y0, seed), b = hash(ix + 1, y0, seed);
    const c = hash(ix, y1, seed), d = hash(ix + 1, y1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  // n(nx, ny, 가로배율, 세로배율, 옥타브, 시드)
  // 세로 배율은 1/8 단위로 맞춰 노이즈 주기가 타일 높이와 정확히 맞도록 함 (위아래 이음매 없음)
  function n(nx, ny, fx, fy, oct, seed) { return fbm(nx * fx, ny, oct, seed, 1, Math.max(0.125, Math.round(fy * 8) / 8)); }
  function fbm(x, y, oct, seed, fx, fyMul) {
    fx = fx || 1;
    const fyi = fyMul || 1;
    let sum = 0, amp = 0.5, norm = 0, f = 1;
    const period = (TH / BASE) * fyi;
    for (let o = 0; o < oct; o++) {
      sum += amp * vnoise(x * f * fx, y * f * fyi, period * f, seed + o * 17);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }

  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function sstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5 | 0; s ^= s >>> 13; return ((s >>> 0) % 100000) / 100000; }; }

  // ---------- 지형별 높이·색 ----------
  // height(nx, ny) → { h, k(음영 세기), ...} / color(info, shade) → [r,g,b]
  const BIOMES = {
    sea: {
      seed: 101,
      field(nx, ny) {
        const h = n(nx, ny, 1, 1, 5, this.seed) * 0.9 + n(nx, ny, 2, 2, 2, this.seed + 50) * 0.1;
        const rip = n(nx, ny, 6, 6, 2, this.seed + 9);
        return { h, rip };
      },
      relief(f) { return f.h > 0.655 ? 70 : 4; },
      color(f, sh) {
        const h = f.h;
        if (h < 0.64) {
          const deep = hex('#0b3f66'), mid = hex('#14709a'), shallow = hex('#3cc2c4');
          let c = h < 0.5 ? mix(deep, mid, sstep(0.3, 0.5, h)) : mix(mid, shallow, sstep(0.5, 0.64, h));
          return mix(c, [255, 255, 255], (f.rip - 0.5) * 0.12 + 0.02);
        }
        if (h < 0.646) return mix(hex('#5fd6cc'), hex('#f2fbfb'), sstep(0.637, 0.646, h)); // 쇄파
        if (h < 0.66) return mix(hex('#e9f6f2'), hex('#efe3b4'), sstep(0.646, 0.66, h));
        const land = mix(hex('#4c9a3e'), hex('#22582a'), sstep(0.67, 0.8, h));
        return land.map((v) => v * sh);
      },
    },
    desert: {
      seed: 202,
      field(nx, ny) {
        // 바람에 수직인 횡사구: 휘어진 사인 띠 (세로 주기 유지를 위해 휨은 노이즈로)
        const warp = n(nx, ny, 0.5, 0.75, 3, this.seed + 3);
        const phase = nx * 1.7 + warp * 4.5 + n(nx, ny, 1.5, 1.5, 3, this.seed + 8) * 0.9;
        const sw = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
        const cross = n(nx, ny, 2.5, 2.5, 3, this.seed + 23);           // 작은 사구가 겹쳐 규칙성을 깸
        const dune = Math.pow(sw, 2.2) * 0.65 + cross * 0.35;          // 완만한 바람받이 + 가파른 미끄럼면
        const field = n(nx, ny, 0.5, 0.5, 4, this.seed + 7);
        const rock = n(nx + 5, ny, 0.5, 0.5, 4, this.seed + 11);
        const flat = n(nx + 9, ny, 0.375, 0.375, 3, this.seed + 15); // 자갈 평원
        const tone = n(nx, ny, 0.25, 0.25, 2, this.seed + 27);
        const wadi = Math.abs(n(nx, ny, 0.625, 0.625, 3, this.seed + 19) - 0.5);
        const amp = 1 - sstep(0.5, 0.65, flat);
        return { h: dune * 0.42 * amp + field * 0.58, rock, flat, tone, wadi };
      },
      relief(f) { return f.rock > 0.6 ? 110 : 40; },
      color(f, sh) {
        let c = mix(hex('#c99a5c'), hex('#efd29a'), sstep(0.25, 0.8, f.h));
        c = mix(c, mix(hex('#d8a46a'), hex('#e6cfa0'), f.tone), 0.45);       // 붉은 모래 ↔ 옅은 모래
        if (f.flat > 0.55) c = mix(c, hex('#b49a76'), sstep(0.55, 0.68, f.flat) * 0.7);
        if (f.rock > 0.6) c = mix(c, mix(hex('#8e623a'), hex('#b4814c'), f.h), sstep(0.6, 0.65, f.rock));
        if (f.wadi < 0.012) c = mix(c, hex('#e6dcc0'), 0.55 * (1 - f.wadi / 0.012));
        return c.map((v) => v * sh);
      },
    },
    mountain: {
      seed: 303,
      field(nx, ny) {
        const r = 1 - Math.abs(2 * n(nx, ny, 1.25, 1.25, 5, this.seed) - 1);
        const h = Math.pow(r, 1.7) * 0.8 + n(nx, ny, 0.5, 0.5, 3, this.seed + 5) * 0.2;
        const ice = n(nx, ny, 0.875, 0.875, 3, this.seed + 13);
        const river = Math.abs(n(nx, ny, 0.5, 0.5, 4, this.seed + 31) - 0.5);
        const tex = n(nx, ny, 6, 6, 2, this.seed + 41);
        return { h, ice, river, tex };
      },
      relief() { return 120; },
      color(f, sh) {
        const h = f.h, slope = f.slope || 0;
        let c;
        if (h < 0.22) c = mix(hex('#2f4a26'), hex('#4a5c34'), sstep(0.08, 0.22, h));          // 계곡 숲
        else if (h < 0.34) c = mix(hex('#4a5c34'), hex('#6e6150'), sstep(0.22, 0.34, h));     // 수목한계선
        else c = mix(hex('#6e6150'), hex('#8d8b8c'), sstep(0.34, 0.5, h));                    // 암벽
        c = c.map((v) => v * (0.94 + f.tex * 0.12));
        if (h < 0.2 && f.river < 0.01) c = mix(c, hex('#5f8fa8'), 0.8);                        // 빙하 녹은 강
        if (f.ice > 0.6 && h > 0.3 && h < 0.5) c = mix(c, hex('#cfe2f0'), sstep(0.6, 0.66, f.ice));
        // 눈: 높고 완만한 곳에 쌓이고, 가파른 절벽은 바위가 드러남
        const snow = sstep(0.46, 0.58, h) * (1 - 0.6 * sstep(1.2, 2.6, slope));
        const lit = c.map((v) => v * sh);
        if (snow > 0) {
          const sn = mix(hex('#8aa2c2'), hex('#f7fafd'), Math.max(0, Math.min(1, (sh - 0.45) / 0.75)));
          return mix(lit, sn, snow);
        }
        return lit;
      },
    },
    arctic: {
      seed: 404,
      field(nx, ny) {
        const h = n(nx, ny, 1.375, 1.375, 5, this.seed);
        const crack = Math.abs(n(nx, ny, 3.5, 3.5, 3, this.seed + 21) - 0.5);
        const rough = n(nx, ny, 5, 5, 2, this.seed + 33);
        return { h, crack, rough };
      },
      relief(f) { return f.h > 0.47 ? 25 : 2; },
      color(f, sh) {
        if (f.h < 0.47) return mix(hex('#0a2032'), hex('#163a52'), sstep(0.3, 0.47, f.h));
        if (f.h < 0.485) return mix(hex('#5f7f96'), hex('#bcd2e2'), sstep(0.47, 0.485, f.h));
        let c = mix(hex('#c6d8e6'), hex('#f0f6fb'), sstep(0.5, 0.7, f.h + (f.rough - 0.5) * 0.15));
        if (f.crack < 0.008) c = mix(c, hex('#6f8ea6'), 0.7);
        return c.map((v) => v * sh);
      },
    },
    gulfnight: {
      seed: 505,
      field(nx, ny, x, W) {
        const coast = n(nx, ny, 0.625, 0.625, 4, this.seed) + (x / W - 0.55) * 0.55;
        const rip = n(nx, ny, 6, 6, 2, this.seed + 9);
        const h = n(nx, ny, 1, 1, 4, this.seed + 40);
        return { coast, rip, h };
      },
      relief(f) { return f.coast > 0.52 ? 40 : 3; },
      color(f, sh) {
        if (f.coast < 0.52) {
          const c = mix(hex('#030b16'), hex('#08223a'), sstep(0.2, 0.52, f.coast));
          return mix(c, hex('#1d3d5c'), Math.max(0, f.rip - 0.62) * 0.8);
        }
        const c = mix(hex('#1a1611'), hex('#2e261c'), f.h);
        return c.map((v) => v * (0.6 + sh * 0.4));
      },
    },
  };

  // ---------- 지형 위 시설물 (타일 좌표에 그림) ----------
  function decorate(g, biome, W, rnd) {
    const sea = (n) => { // 함정과 항적
      for (let i = 0; i < n; i++) {
        const x = 30 + rnd() * (W - 60), y = 60 + rnd() * (TH - 120), a = (rnd() - 0.5) * 0.8;
        g.save(); g.translate(x, y); g.rotate(a);
        g.strokeStyle = 'rgba(235,248,255,0.55)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(0, 6); g.lineTo(-6, 34); g.moveTo(0, 6); g.lineTo(6, 34); g.stroke();
        g.fillStyle = 'rgba(235,248,255,0.5)'; g.fillRect(-1.5, 6, 3, 14);
        g.fillStyle = '#7d8590'; g.beginPath(); g.ellipse(0, 0, 2.6, 8, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#c9ced6'; g.fillRect(-1.2, -2, 2.4, 4);
        g.restore();
      }
    };
    if (biome === 'sea') {
      sea(5);
      // 인공섬 + 활주로
      for (let i = 0; i < 2; i++) {
        const x = 70 + rnd() * (W - 140), y = 150 + i * 480 + rnd() * 120;
        g.save(); g.translate(x, y); g.rotate((rnd() - 0.5) * 0.6);
        g.fillStyle = '#5fd6cc'; g.beginPath(); g.roundRect(-44, -22, 88, 44, 14); g.fill();
        g.fillStyle = '#d8d2c0'; g.beginPath(); g.roundRect(-38, -16, 76, 32, 8); g.fill();
        g.fillStyle = '#4a4d52'; g.fillRect(-34, -4, 68, 8);
        g.fillStyle = '#ffffff'; for (let k = -30; k < 30; k += 8) g.fillRect(k, -0.5, 4, 1);
        g.fillStyle = '#8f9399'; g.fillRect(-30, 7, 10, 6); g.fillRect(-16, 8, 8, 5); g.fillRect(14, -14, 12, 7);
        g.restore();
      }
    } else if (biome === 'desert') {
      // 고속도로 (세로 주기에 맞춘 곡선 → 끊김 없음)
      const roadX = (y) => W * 0.32 + Math.sin((y / TH) * Math.PI * 2) * W * 0.14 + Math.sin((y / TH) * Math.PI * 6) * 14;
      g.lineCap = 'round';
      for (const [w, col] of [[9, 'rgba(120,95,60,0.5)'], [6, '#4b4945']]) {
        g.strokeStyle = col; g.lineWidth = w; g.beginPath();
        for (let y = -10; y <= TH + 10; y += 8) (y === -10 ? g.moveTo(roadX(y), y) : g.lineTo(roadX(y), y));
        g.stroke();
      }
      g.strokeStyle = '#e8d080'; g.lineWidth = 0.8; g.setLineDash([6, 8]); g.beginPath();
      for (let y = -10; y <= TH + 10; y += 8) (y === -10 ? g.moveTo(roadX(y), y) : g.lineTo(roadX(y), y));
      g.stroke(); g.setLineDash([]);
      // 마을
      for (let t = 0; t < 2; t++) {
        const cy = 220 + t * 500, cx = roadX(cy) + (t ? -60 : 60);
        for (let i = 0; i < 26; i++) {
          const bx = cx + (rnd() - 0.5) * 90, by = cy + (rnd() - 0.5) * 70, s = 5 + rnd() * 6;
          g.fillStyle = 'rgba(60,40,20,0.35)'; g.fillRect(bx + 2, by + 2, s, s);
          g.fillStyle = rnd() < 0.5 ? '#e4d3ab' : '#cdb88f'; g.fillRect(bx, by, s, s);
        }
        g.fillStyle = '#3f7a3a';
        for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(cx + (rnd() - 0.5) * 110, cy + (rnd() - 0.5) * 90, 2.2, 0, Math.PI * 2); g.fill(); }
      }
      // 유전 (패드 + 펌프잭)
      for (let i = 0; i < 9; i++) {
        const x = W * 0.55 + rnd() * W * 0.4, y = 40 + rnd() * (TH - 80);
        g.fillStyle = '#b39669'; g.fillRect(x - 6, y - 6, 12, 12);
        g.fillStyle = '#2b2b2b'; g.fillRect(x - 3, y - 1, 6, 2); g.fillRect(x - 1, y - 3, 2, 6);
      }
    } else if (biome === 'mountain') {
      // 산악 도로 하나
      g.strokeStyle = 'rgba(70,60,50,0.7)'; g.lineWidth = 1.5; g.beginPath();
      for (let y = 0; y <= TH; y += 6) {
        const x = W * 0.7 + Math.sin((y / TH) * Math.PI * 8) * 22 + Math.sin((y / TH) * Math.PI * 2) * 40;
        y ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    } else if (biome === 'arctic') {
      // 쇄빙선 항로
      g.strokeStyle = 'rgba(20,50,70,0.8)'; g.lineWidth = 4; g.beginPath();
      for (let y = 0; y <= TH; y += 8) {
        const x = W * 0.25 + Math.sin((y / TH) * Math.PI * 2) * 30;
        y ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      g.fillStyle = '#c0392b'; g.beginPath(); g.ellipse(W * 0.25, 300, 3, 9, 0, 0, Math.PI * 2); g.fill();
    } else if (biome === 'gulfnight') {
      sea(3);
      // 도시 불빛 (해안선 근처 육지)
      const lights = [];
      for (let i = 0; i < 900; i++) {
        const x = W * 0.45 + rnd() * W * 0.55, y = rnd() * TH;
        lights.push([x, y]);
      }
      return { lights };
    }
    return {};
  }

  // ---------- 구름 이미지 (부드러운 덩어리) ----------
  function cloudImage(rnd, tint) {
    const w = 140 + rnd() * 80, h = 70 + rnd() * 30;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w); c.height = Math.ceil(h);
    const g = c.getContext('2d');
    for (let i = 0; i < 14; i++) {
      const x = w * (0.2 + rnd() * 0.6), y = h * (0.3 + rnd() * 0.4), r = h * (0.18 + rnd() * 0.25);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${tint},0.9)`);
      gr.addColorStop(1, `rgba(${tint},0)`);
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  const CLOUDS = {
    sea: { n: 5, tint: '255,255,255', alpha: 0.6, shadow: 0.22 },
    desert: { n: 3, tint: '240,214,170', alpha: 0.28, shadow: 0.1 },
    mountain: { n: 6, tint: '250,252,255', alpha: 0.6, shadow: 0.2 },
    arctic: { n: 5, tint: '205,214,228', alpha: 0.45, shadow: 0.15 },
    gulfnight: { n: 4, tint: '70,64,72', alpha: 0.45, shadow: 0 },
  };

  class Background {
    constructor() {
      this.biome = null;
      this.tile = null;
      this.scroll = 0;
      this.extra = {};
      this.clouds = [];
      this.builtW = 0;
    }

    set(biome) {
      if (biome === this.biome && this.builtW === C.WIDTH) return;
      this.biome = biome;
      this.build();
    }

    build() {
      const W = C.WIDTH;
      const B = BIOMES[this.biome];
      const gw = Math.ceil(W / CELL), gh = TH / CELL;
      const fields = new Array(gw * gh);
      const H = new Float32Array(gw * gh);
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const lx = x * CELL, ly = y * CELL;
          const f = B.field(lx / BASE, ly / BASE, lx, W);
          fields[y * gw + x] = f;
          H[y * gw + x] = f.h !== undefined ? f.h : f.coast;
        }
      }
      // 언덕 음영 (빛: 왼쪽 위)
      const img = new ImageData(gw, gh);
      const L = [-0.55, -0.55, 0.63];
      for (let y = 0; y < gh; y++) {
        const yu = (y - 1 + gh) % gh, yd = (y + 1) % gh;
        for (let x = 0; x < gw; x++) {
          const xl = Math.max(0, x - 1), xr = Math.min(gw - 1, x + 1);
          const f = fields[y * gw + x];
          const k = B.relief(f);
          const dx = (H[y * gw + xr] - H[y * gw + xl]) * k, dy = (H[yd * gw + x] - H[yu * gw + x]) * k;
          f.slope = Math.sqrt(dx * dx + dy * dy) / Math.max(1, k) * 40;
          const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
          const dot = (-dx * L[0] - dy * L[1] + L[2]) * inv;
          const sh = Math.max(0.35, Math.min(1.35, 0.45 + dot * 0.75));
          const c = B.color(f, sh);
          const i = (y * gw + x) * 4;
          img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
        }
      }
      const raw = document.createElement('canvas');
      raw.width = gw; raw.height = gh;
      raw.getContext('2d').putImageData(img, 0, 0);

      const R = Math.min(2, Math.max(1, SS.view.scale || 1));
      const tile = document.createElement('canvas');
      tile.width = Math.ceil(W * R); tile.height = Math.ceil(TH * R);
      const g = tile.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.scale(R, R);
      g.drawImage(raw, 0, 0, gw * CELL, TH);
      // 사진 같은 미세 입자 질감 (세로 이음매가 없도록 타일 전체에 균일하게)
      const grain = document.createElement('canvas');
      grain.width = grain.height = 128;
      const gg = grain.getContext('2d'), gd = gg.createImageData(128, 128);
      for (let i = 0; i < gd.data.length; i += 4) {
        const v = Math.random() < 0.5 ? 0 : 255;
        gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v; gd.data[i + 3] = Math.random() * 18;
      }
      gg.putImageData(gd, 0, 0);
      g.fillStyle = g.createPattern(grain, 'repeat');
      g.fillRect(0, 0, W, TH);
      const rnd = rng(B.seed * 7 + Math.round(W));
      this.extra = decorate(g, this.biome, W, rnd) || {};
      if (this.extra.lights) {
        for (const [x, y] of this.extra.lights) {
          const f = B.field(x / BASE, y / BASE, x, W);
          if (f.coast < 0.56 || f.coast > 0.8) continue; // 해안 띠에만 도시
          g.fillStyle = rnd() < 0.7 ? 'rgba(255,200,100,0.9)' : 'rgba(255,245,220,0.95)';
          g.fillRect(x, y, 1.2, 1.2);
        }
        // 유정 화재 위치
        this.fires = [];
        for (let i = 0; i < 40 && this.fires.length < 8; i++) {
          const x = W * 0.5 + rnd() * W * 0.48, y = 30 + rnd() * (TH - 60);
          const f = B.field(x / BASE, y / BASE, x, W);
          if (f.coast > 0.6) this.fires.push({ x, y, p: rnd() * 10 });
        }
      } else this.fires = null;
      this.tile = tile;
      this.builtW = W;

      // 구름층
      const cl = CLOUDS[this.biome];
      const imgs = [0, 1, 2].map(() => cloudImage(rnd, cl.tint));
      this.cloudCfg = cl;
      this.clouds = [];
      for (let i = 0; i < cl.n; i++) {
        this.clouds.push({ img: imgs[i % 3], x: rnd() * W - 60, y: rnd() * C.HEIGHT, speed: 70 + rnd() * 50, s: 0.9 + rnd() * 0.8 });
      }
    }

    update(dt, speed) {
      this.scroll = (this.scroll + speed * dt) % TH;
      const W = C.WIDTH, H = C.HEIGHT;
      for (const c of this.clouds) {
        c.y += c.speed * dt * (speed / 36);
        if (c.y > H + 40) { c.y = -c.img.height * c.s - Math.random() * 200; c.x = Math.random() * W - 80; }
      }
    }

    // 지면 (그림자보다 먼저)
    drawGround(ctx, time) {
      if (!this.tile) return;
      const W = C.WIDTH, H = C.HEIGHT;
      ctx.imageSmoothingEnabled = true;
      const px = 1 / Math.max(1, SS.view.scale || 1);
      for (let y = this.scroll - TH; y < H; y += TH) {
        const yy = Math.round(y / px) * px;
        ctx.drawImage(this.tile, 0, yy, W, TH + px * 2); // 경계에 머리카락 같은 선이 생기지 않도록 겹침
      }
      if (this.fires) { // 불타는 유정: 깜빡이는 불길 + 연기
        const fire = SS.FX && SS.FX.sprite('fire');
        for (let y0 = this.scroll - TH; y0 < H; y0 += TH) {
          for (const f of this.fires) {
            const y = y0 + f.y;
            if (y < -40 || y > H + 20) continue;
            const fl = 0.75 + Math.sin(time * 13 + f.p) * 0.15 + Math.sin(time * 31 + f.p * 2) * 0.1;
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#20160f';
            ctx.beginPath(); ctx.ellipse(f.x + 10, y - 22, 9, 26, 0.4, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            if (fire) {
              ctx.globalCompositeOperation = 'lighter';
              ctx.drawImage(fire, f.x - 12 * fl, y - 14 * fl, 24 * fl, 24 * fl);
              ctx.globalCompositeOperation = 'source-over';
            }
          }
        }
      }
    }

    // 구름 그림자 (지면에)
    drawCloudShadows(ctx) {
      const cl = this.cloudCfg;
      if (!cl || !cl.shadow) return;
      ctx.globalAlpha = cl.shadow;
      ctx.filter = 'none';
      for (const c of this.clouds) {
        ctx.drawImage(this.shadowOf(c.img), c.x + 40, c.y + 60, c.img.width * c.s, c.img.height * c.s);
      }
      ctx.globalAlpha = 1;
    }

    shadowOf(img) {
      if (!img._shadow) {
        const s = document.createElement('canvas');
        s.width = img.width; s.height = img.height;
        const g = s.getContext('2d');
        g.drawImage(img, 0, 0);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = '#000';
        g.fillRect(0, 0, s.width, s.height);
        img._shadow = s;
      }
      return img._shadow;
    }

    // 구름 (항공기 아래층)
    drawClouds(ctx) {
      const cl = this.cloudCfg;
      if (!cl) return;
      ctx.globalAlpha = cl.alpha;
      for (const c of this.clouds) ctx.drawImage(c.img, c.x, c.y, c.img.width * c.s, c.img.height * c.s);
      ctx.globalAlpha = 1;
    }

    // 대기 원근감: 화면 위쪽(먼 곳)일수록 옅은 연무 — 항공기보다 아래층
    drawHaze(ctx) {
      const W = C.WIDTH, H = C.HEIGHT;
      const haze = { sea: '200,225,240', desert: '245,225,190', mountain: '215,228,245', arctic: '230,200,200', gulfnight: '20,24,40' }[this.biome];
      if (haze) {
        if (!this.hazeGrad || this.hazeH !== H || this.hazeB !== this.biome) {
          this.hazeGrad = ctx.createLinearGradient(0, 0, 0, H);
          this.hazeGrad.addColorStop(0, `rgba(${haze},0.28)`);
          this.hazeGrad.addColorStop(0.45, `rgba(${haze},0.06)`);
          this.hazeGrad.addColorStop(1, `rgba(${haze},0)`);
          this.hazeH = H; this.hazeB = this.biome;
        }
        ctx.fillStyle = this.hazeGrad;
        ctx.fillRect(0, 0, W, H);
      }
    }

    // 화면 고정 색감 (황혼·야간)
    drawTint(ctx) {
      const W = C.WIDTH, H = C.HEIGHT;
      if (this.biome === 'arctic') {
        const gr = ctx.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, 'rgba(255,140,90,0.16)');
        gr.addColorStop(1, 'rgba(80,60,140,0.2)');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      } else if (this.biome === 'gulfnight') {
        const gr = ctx.createRadialGradient(W / 2, H * 0.6, H * 0.2, W / 2, H * 0.6, H * 0.9);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(1, 'rgba(0,0,10,0.45)');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      } else if (this.biome === 'desert') {
        ctx.fillStyle = 'rgba(255,190,110,0.06)'; ctx.fillRect(0, 0, W, H);
      }
    }
  }

  // Safari 구버전용 roundRect 대체
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
  }

  SS.Background = Background;
  Background.BIOMES = BIOMES; // 테스트·디버그용
})();
