'use strict';
/* 그래픽 도우미(픽셀 폰트·스프라이트) + 화면/메뉴/HUD */
(function () {
  const SS = window.SS;
  const C = SS.CONFIG;
  const W = C.WIDTH, H = C.HEIGHT;

  // ---------------- 5×7 픽셀 폰트 (오리지널) ----------------
  const FONT = {
    A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.',
    C: '.###.|#...#|#....|#....|#....|#...#|.###.', D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
    E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
    G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
    I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.', J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
    K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
    M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
    O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.', P: '####.|#...#|#...#|####.|#....|#....|#....',
    Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
    U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
    W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
    0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
    2: '.###.|#...#|....#|...#.|..#..|.#...|#####', 3: '####.|....#|....#|.###.|....#|....#|####.',
    4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
    6: '.###.|#....|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
    8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.', 9: '.###.|#...#|#...#|.####|....#|....#|.###.',
    '.': '.....|.....|.....|.....|.....|.....|..#..', ',': '.....|.....|.....|.....|.....|..#..|.#...',
    ':': '.....|..#..|.....|.....|.....|..#..|.....', '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
    '?': '.###.|#...#|....#|...#.|..#..|.....|..#..', '-': '.....|.....|.....|#####|.....|.....|.....',
    '+': '.....|..#..|..#..|#####|..#..|..#..|.....', '/': '....#|....#|...#.|..#..|.#...|#....|#....',
    "'": '..#..|..#..|.....|.....|.....|.....|.....', '(': '...#.|..#..|.#...|.#...|.#...|..#..|...#.',
    ')': '.#...|..#..|...#.|...#.|...#.|..#..|.#...', '>': '.#...|..#..|...#.|....#|...#.|..#..|.#...',
    '<': '...#.|..#..|.#...|#....|.#...|..#..|...#.', '%': '##..#|##..#|...#.|..#..|.#...|#..##|#..##',
    '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....', '=': '.....|.....|#####|.....|#####|.....|.....',
    '#': '.###.|#...#|#...#|#####|##.##|##.##|#####', // 자물쇠 아이콘
  };
  const GW = 5, GH = 7;
  const glyphIndex = {};
  const atlasCache = {};

  function buildAtlas(color) {
    const chars = Object.keys(FONT);
    const cv = document.createElement('canvas');
    cv.width = chars.length * GW;
    cv.height = GH;
    const g = cv.getContext('2d');
    g.fillStyle = color;
    chars.forEach((ch, i) => {
      glyphIndex[ch] = i;
      const rows = FONT[ch].split('|');
      for (let y = 0; y < GH; y++) {
        for (let x = 0; x < GW; x++) if (rows[y][x] === '#') g.fillRect(i * GW + x, y, 1, 1);
      }
    });
    return cv;
  }

  const Gfx = {
    makeSprite(rows, palette, scale, solid) {
      scale = scale || 1;
      const h = rows.length, w = rows[0].length;
      const cv = document.createElement('canvas');
      cv.width = w * scale;
      cv.height = h * scale;
      const g = cv.getContext('2d');
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const ch = rows[y][x];
          if (ch === '.' || ch === ' ') continue;
          const col = solid || palette[ch];
          if (!col) continue;
          g.fillStyle = col;
          g.fillRect(x * scale, y * scale, scale, scale);
        }
      }
      return cv;
    },

    textWidth(str, s) { return String(str).length * 6 * s - s; },

    // 픽셀 폰트 텍스트. opt: size, color, align('left'|'center'|'right'), shadow(색)
    text(ctx, str, x, y, opt) {
      opt = opt || {};
      const s = opt.size || 2;
      str = String(str).toUpperCase();
      const w = this.textWidth(str, s);
      let sx = opt.align === 'center' ? x - w / 2 : opt.align === 'right' ? x - w : x;
      sx = Math.round(sx);
      y = Math.round(y);
      if (opt.shadow) { const o = Math.ceil(s / 2); this.rawText(ctx, str, sx + o, y + o, s, opt.shadow); }
      this.rawText(ctx, str, sx, y, s, opt.color || '#ffffff');
    },

    rawText(ctx, str, x, y, s, color) {
      const atlas = atlasCache[color] || (atlasCache[color] = buildAtlas(color));
      for (let i = 0; i < str.length; i++) {
        const gi = glyphIndex[str[i]];
        if (gi === undefined) continue;
        ctx.drawImage(atlas, gi * GW, 0, GW, GH, x + i * 6 * s, y, GW * s, GH * s);
      }
    },

    // 한글 안내문 (시스템 폰트)
    ktext(ctx, str, x, y, px, color, align) {
      ctx.font = `600 ${px}px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
      ctx.textAlign = align || 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color || '#ffffff';
      ctx.fillText(str, x, y);
    },

    pad(n, len) { return String(Math.floor(n)).padStart(len || 6, '0'); },

    frame(ctx, x, y, w, h, border, fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
      ctx.fillStyle = border;
      ctx.fillRect(x + 3, y, w - 6, 3);
      ctx.fillRect(x + 3, y + h - 3, w - 6, 3);
      ctx.fillRect(x, y + 3, 3, h - 6);
      ctx.fillRect(x + w - 3, y + 3, 3, h - 6);
    },
  };
  SS.Gfx = Gfx;

  // ---------------- 화면 / 메뉴 ----------------
  const PAUSE_BTN = { x: W - 44, y: 4, w: 40, h: 36 };
  const FIRE_BTN = { x: W - 58, y: H - 58, r: 38 };
  const BOMB_BTN = { x: 46, y: H - 72, r: 30 };
  const PU_COLORS = { double: '#ffd23a', shield: '#4ff0ff', rapid: '#ff5ad1', bomb: '#ff8a2e' };
  const PU_LETTER = { double: 'D', shield: 'S', rapid: 'R', bomb: 'B' };

  function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

  class UI {
    constructor(game) {
      this.game = game;
      this.sel = 0;
      this.lastState = null;
      this.confirmReset = false;
      this.arm = 0;
    }

    buttons() {
      const g = this.game, s = g.save;
      const bw = 260, bx = (W - bw) / 2;
      const B = (y, label, sub, action, extra) => Object.assign({ x: bx, y, w: bw, h: 52, label, sub, action }, extra || {});
      const soundBtn = (y) => B(y, 'SOUND: ' + (s.sound ? 'ON' : 'OFF'), '효과음 켜기/끄기', () => g.toggleSound());
      const musicBtn = (y) => B(y, 'MUSIC: ' + (s.music ? 'ON' : 'OFF'), '배경음악 켜기/끄기', () => g.toggleMusic());
      const fireBtn = (y) => B(y, 'FIRE: ' + (s.fireMode === 'auto' ? 'AUTO' : 'MANUAL'),
        s.fireMode === 'auto' ? '자동 연사 (탭하면 수동 버튼으로)' : '수동 발사 버튼 (탭하면 자동으로)', () => g.toggleFireMode());

      switch (g.state) {
        case 'title':
          return [
            B(372, 'PLAY', '게임 시작', () => g.goto('select')),
            B(436, 'SETTINGS', '설정', () => g.goto('settings')),
          ];
        case 'select': {
          const list = [];
          for (let i = 1; i <= 5; i++) {
            const open = i <= s.unlocked;
            const st = C.STAGES[i - 1];
            list.push(B(96 + (i - 1) * 62, open ? 'STAGE ' + i : 'STAGE ' + i + ' #',
              open ? st.nameKo : '이전 단계를 클리어하면 열립니다',
              () => g.startGame(i), { disabled: !open }));
          }
          list.push(B(96 + 5 * 62 + 14, 'BACK', '타이틀로', () => g.goto('title')));
          return list;
        }
        case 'settings':
          return [
            soundBtn(150),
            musicBtn(212),
            fireBtn(274),
            B(336, this.confirmReset ? 'REALLY RESET?' : 'RESET RECORDS',
              this.confirmReset ? '한 번 더 누르면 최고점수·해금 초기화' : '기록 초기화',
              () => {
                if (this.confirmReset) { g.resetRecords(); this.confirmReset = false; } else this.confirmReset = true;
              }),
            B(410, 'BACK', '타이틀로', () => g.goto('title')),
          ];
        case 'paused':
          return [
            B(176, 'RESUME', '계속하기', () => g.resume()),
            soundBtn(238),
            musicBtn(300),
            fireBtn(362),
            B(424, 'QUIT', '타이틀로 나가기', () => g.quitToTitle()),
          ];
        case 'stageclear':
          return this.game.stateTime > 1.2
            ? [B(470, g.stageNum < 5 ? 'NEXT STAGE' : 'CONTINUE', '다음으로', () => g.advanceAfterClear())]
            : [];
        case 'gameover':
          return this.game.stateTime > 1.0
            ? [B(400, 'RETRY', '이 단계 다시 하기', () => g.retry()), B(464, 'TITLE', '타이틀로', () => g.quitToTitle())]
            : [];
        case 'ending':
          return this.game.stateTime > 2.0
            ? [
              B(452, 'LOOP ' + (g.loop + 1) + ' (X1.3)', (g.loop + 1) + '회차 · 속도 1.3배로 이어서 도전', () => g.startNextLoop(), { x: 70, w: 340 }),
              B(516, 'TITLE', '타이틀로', () => g.quitToTitle(), { x: 70, w: 340 }),
            ]
            : [];
        default:
          return [];
      }
    }

    update() {
      const g = this.game, inp = SS.Input;
      if (g.state !== this.lastState) {
        this.lastState = g.state;
        this.sel = 0;
        this.confirmReset = false;
        if (g.state === 'select') this.sel = Math.min(g.save.unlocked, 5) - 1;
        return; // 화면이 바뀐 프레임의 입력은 무시 (연속 탭 방지)
      }

      if (g.state === 'playing') {
        if (inp.wasPressed('KeyP', 'Escape')) { g.pause(); return; }
        for (const t of inp.taps) if (inRect(t, PAUSE_BTN)) { g.pause(); return; }
        return;
      }
      if (g.state === 'paused' && inp.wasPressed('KeyP', 'Escape')) { g.resume(); return; }
      if ((g.state === 'select' || g.state === 'settings') && inp.wasPressed('Escape')) { g.goto('title'); return; }

      const btns = this.buttons();
      if (!btns.length) return;
      if (this.sel >= btns.length) this.sel = btns.length - 1;

      const move = (d) => {
        for (let i = 0; i < btns.length; i++) {
          this.sel = (this.sel + d + btns.length) % btns.length;
          if (!btns[this.sel].disabled) break;
        }
        SS.Audio.play('select');
      };
      if (inp.wasPressed('ArrowUp', 'ArrowLeft', 'KeyW')) move(-1);
      if (inp.wasPressed('ArrowDown', 'ArrowRight', 'KeyS')) move(1);
      if (inp.wasPressed('Enter', 'NumpadEnter', 'Space')) { this.activate(btns[this.sel]); return; }

      for (const t of inp.taps) {
        const i = btns.findIndex((b) => inRect(t, b));
        if (i >= 0) { this.sel = i; this.activate(btns[i]); return; }
      }
    }

    activate(b) {
      if (!b) return;
      if (b.disabled) { SS.Audio.play('denied'); return; }
      SS.Audio.play('confirm');
      b.action();
    }

    // ---------------- 그리기 ----------------
    draw(ctx) {
      const g = this.game;
      switch (g.state) {
        case 'title': this.drawTitle(ctx); break;
        case 'select': this.drawHeader(ctx, 'SELECT STAGE', '클리어한 단계까지 선택할 수 있어요', 36); break;
        case 'settings': this.drawHeader(ctx, 'SETTINGS', '설정은 자동 저장됩니다', 56); this.drawSettingsInfo(ctx); break;
        case 'playing': this.drawHUD(ctx); this.drawPlayOverlays(ctx); break;
        case 'paused': this.drawHUD(ctx); this.dim(ctx, 0.65); this.drawHeader(ctx, 'PAUSED', '일시정지', 92); break;
        case 'stageclear': this.drawHUD(ctx); this.drawStageClear(ctx); break;
        case 'gameover': this.drawHUD(ctx); this.drawGameOver(ctx); break;
        case 'ending': this.drawEnding(ctx); break;
      }
      this.drawButtons(ctx);
    }

    dim(ctx, a) {
      ctx.fillStyle = `rgba(0, 0, 10, ${a})`;
      ctx.fillRect(0, 0, W, H);
    }

    drawButtons(ctx) {
      const btns = this.buttons();
      const blink = Math.floor(this.game.time * 3) % 2 === 0;
      btns.forEach((b, i) => {
        const selected = i === this.sel && !b.disabled;
        const border = b.disabled ? '#3a3a55' : selected ? '#ffe14a' : '#4f6cff';
        const fill = b.disabled ? 'rgba(20,20,34,0.9)' : selected ? 'rgba(52,26,96,0.95)' : 'rgba(12,14,44,0.92)';
        Gfx.frame(ctx, b.x, b.y, b.w, b.h, border, fill);
        Gfx.text(ctx, b.label, b.x + b.w / 2, b.y + (b.sub ? 9 : (b.h - 14) / 2),
          { size: 2, color: b.disabled ? '#666680' : '#ffffff', align: 'center' });
        if (b.sub) Gfx.ktext(ctx, b.sub, b.x + b.w / 2, b.y + b.h - 13, 12, b.disabled ? '#55556a' : '#a9b6ff');
        if (selected && blink && btns.length > 1) Gfx.text(ctx, '>', b.x - 18, b.y + b.h / 2 - 7, { size: 2, color: '#ffe14a' });
      });
    }

    drawHeader(ctx, title, sub, y) {
      Gfx.text(ctx, title, W / 2, y, { size: 4, color: '#ffe14a', align: 'center', shadow: '#c2185b' });
      if (sub) Gfx.ktext(ctx, sub, W / 2, y + 44, 14, '#a9b6ff');
    }

    drawTitle(ctx) {
      const g = this.game, t = g.time;
      Gfx.text(ctx, 'HI-SCORE', W / 2, 18, { size: 2, color: '#ff4f5e', align: 'center' });
      Gfx.text(ctx, Gfx.pad(g.save.hi), W / 2, 38, { size: 2, align: 'center' });

      const word = (str, y, color, shadow) => {
        const s = 8, adv = 6 * s;
        const x0 = W / 2 - Gfx.textWidth(str, s) / 2;
        for (let i = 0; i < str.length; i++) {
          const dy = Math.sin(t * 3 + i * 0.6) * 4;
          Gfx.text(ctx, str[i], x0 + i * adv, y + dy, { size: s, color, shadow });
        }
      };
      word('STAR', 82, '#ffe14a', '#ff5a1f');
      word('SWARM', 150, '#5ef2ff', '#3a3aff');
      Gfx.ktext(ctx, '레트로 편대 슈팅', W / 2, 228, 16, '#ffffff');

      // 점수표
      const spr = SS.Enemy.sprites();
      const rows = [['grunt', '일반형'], ['striker', '돌격형'], ['commander', '지휘관형']];
      rows.forEach(([type, ko], i) => {
        const y = 266 + i * 32;
        const img = spr[type].frames[Math.floor(t * 2.5) % 2];
        ctx.drawImage(img, 120 - img.width / 2, y - img.height / 2);
        const sc = C.SCORE[type];
        Gfx.text(ctx, sc.formation + ' / ' + sc.diving, 150, y - 7, { size: 2, color: '#ffffff' });
        Gfx.ktext(ctx, ko + (type === 'commander' ? ' (2회 피격)' : ''), 330, y, 12, '#a9b6ff', 'left');
      });

      Gfx.ktext(ctx, '대열 / 급강하 중 격추 점수', W / 2, 350, 11, '#7f8bcf');
      Gfx.ktext(ctx, '터치: 드래그로 상하좌우 이동 · BOMB 버튼으로 폭탄', W / 2, 512, 12, '#a9b6ff');
      Gfx.ktext(ctx, '키보드: 방향키 이동 · Space 발사 · X 폭탄 · P 일시정지', W / 2, 532, 12, '#a9b6ff');
      Gfx.ktext(ctx, '1만 점마다 생명 +1 · 캡슐 D=2연발 S=쉴드 R=속사 B=폭탄', W / 2, 552, 12, '#a9b6ff');
      if (g.save.cleared) Gfx.text(ctx, '* ALL CLEAR *', W / 2, 576, { size: 2, color: '#ffd23a', align: 'center' });
      Gfx.text(ctx, 'ORIGINAL GAME  V1.0', W / 2, H - 26, { size: 1, color: '#55608f', align: 'center' });
    }

    drawSettingsInfo(ctx) {
      const lines = [
        '수동 모드: 오른쪽 아래 FIRE 버튼을 누르고 있으면 발사',
        '(가로 화면에서는 오른쪽 검은 여백 전체가 FIRE 버튼)',
        '키보드 Space는 두 모드 모두에서 발사됩니다',
        '폭탄: 왼쪽 아래 BOMB 버튼 또는 X 키 (가로 화면은 왼쪽 여백)',
      ];
      lines.forEach((l, i) => Gfx.ktext(ctx, l, W / 2, 500 + i * 22, 12, '#a9b6ff'));
    }

    drawHUD(ctx) {
      const g = this.game, p = g.player;
      Gfx.text(ctx, '1UP', 12, 6, { size: 2, color: '#ff4f5e' });
      Gfx.text(ctx, Gfx.pad(g.score), 12, 24, { size: 2 });
      Gfx.text(ctx, 'HI-SCORE', W / 2, 6, { size: 2, color: '#ff4f5e', align: 'center' });
      Gfx.text(ctx, Gfx.pad(Math.max(g.save.hi, g.score)), W / 2, 24, { size: 2, align: 'center' });

      // 일시정지 버튼
      Gfx.frame(ctx, PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.w, PAUSE_BTN.h, '#4f6cff', 'rgba(12,14,44,0.7)');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(PAUSE_BTN.x + 13, PAUSE_BTN.y + 10, 5, 16);
      ctx.fillRect(PAUSE_BTN.x + 23, PAUSE_BTN.y + 10, 5, 16);

      // 남은 기체
      if (!this.lifeIcon) this.lifeIcon = Gfx.makeSprite(SS.PLAYER_ART, SS.PLAYER_PALETTE, 1);
      const reserve = Math.max(0, g.lives - 1);
      for (let i = 0; i < Math.min(reserve, 8); i++) ctx.drawImage(this.lifeIcon, 10 + i * 17, H - 18);

      // 스테이지 / 회차
      Gfx.text(ctx, (g.loop > 1 ? 'L' + g.loop + ' ' : '') + 'STAGE ' + g.stageNum, W - 10, H - 16, { size: 2, color: '#ffd23a', align: 'right' });

      // 파워업 남은 시간
      let px = 166;
      const pu = (type, frac) => {
        ctx.fillStyle = PU_COLORS[type];
        ctx.fillRect(px, H - 20, 14, 14);
        Gfx.text(ctx, PU_LETTER[type], px + 4, H - 17, { size: 1, color: '#000000' });
        if (frac !== null) {
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(px + 17, H - 15, 30, 4);
          ctx.fillStyle = PU_COLORS[type];
          ctx.fillRect(px + 17, H - 15, Math.round(30 * frac), 4);
          px += 54;
        } else px += 20;
      };
      if (p.double > 0) pu('double', p.double / C.POWERUP.doubleTime);
      if (p.rapid > 0) pu('rapid', p.rapid / C.POWERUP.rapidTime);
      if (p.shield) pu('shield', null);

      // 보스 체력바
      const boss = g.stage && g.stage.boss;
      if (boss && !boss.dead) {
        const bw = 300, bx = (W - bw) / 2, by = 46;
        Gfx.text(ctx, 'BOSS', bx - 8, by - 1, { size: 1, color: '#ff4f5e', align: 'right' });
        ctx.fillStyle = '#2a0f22';
        ctx.fillRect(bx, by, bw, 8);
        const frac = boss.hp / boss.maxHp;
        ctx.fillStyle = boss.phase === 3 ? '#ff3b4e' : boss.phase === 2 ? '#ff8a2e' : '#ffd23a';
        ctx.fillRect(bx, by, Math.round(bw * frac), 8);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx + bw / 3, by, 1, 8);
        ctx.fillRect(bx + (bw * 2) / 3, by, 1, 8);
      }

      // 폭탄 버튼 + 남은 개수
      if (g.state === 'playing' || g.state === 'paused') {
        const has = g.bombs > 0;
        ctx.fillStyle = has ? 'rgba(255, 138, 46, 0.28)' : 'rgba(120, 120, 140, 0.18)';
        ctx.beginPath();
        ctx.arc(BOMB_BTN.x, BOMB_BTN.y, BOMB_BTN.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = has ? 'rgba(255, 210, 160, 0.7)' : 'rgba(160, 160, 180, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
        Gfx.text(ctx, 'BOMB', BOMB_BTN.x, BOMB_BTN.y - 12, { size: 1, color: has ? '#ffffff' : '#888899', align: 'center' });
        Gfx.text(ctx, 'X' + g.bombs, BOMB_BTN.x, BOMB_BTN.y - 1, { size: 2, color: has ? '#ffd23a' : '#888899', align: 'center' });
      }

      // 수동 발사 버튼
      if (g.save.fireMode === 'manual' && g.state === 'playing') {
        const held = SS.Input.fireHeld || SS.Input.keys.fire;
        ctx.fillStyle = held ? 'rgba(255, 79, 94, 0.45)' : 'rgba(255, 79, 94, 0.22)';
        ctx.beginPath();
        ctx.arc(FIRE_BTN.x, FIRE_BTN.y, FIRE_BTN.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 200, 200, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
        Gfx.text(ctx, 'FIRE', FIRE_BTN.x, FIRE_BTN.y - 7, { size: 2, color: '#ffffff', align: 'center' });
      }
    }

    drawPlayOverlays(ctx) {
      const g = this.game, st = g.stage, t = g.time;
      if (!st) return;
      if (g.stageIntro > 0) {
        Gfx.text(ctx, 'STAGE ' + g.stageNum, W / 2, 250, { size: 4, color: '#5ef2ff', align: 'center', shadow: '#3a3aff' });
        Gfx.text(ctx, st.cfg.name, W / 2, 296, { size: 2, color: '#ffffff', align: 'center' });
        Gfx.ktext(ctx, st.cfg.nameKo, W / 2, 330, 15, '#a9b6ff');
        if (g.loop > 1) Gfx.text(ctx, 'LOOP ' + g.loop + '  SPEED X' + g.speedMul.toFixed(2), W / 2, 356, { size: 2, color: '#ff8a2e', align: 'center' });
        if (Math.floor(t * 3) % 2 === 0) Gfx.text(ctx, 'READY', W / 2, 390, { size: 3, color: '#ffe14a', align: 'center' });
      }
      if (st.warningStarted && !st.bossSpawned && Math.floor(t * 4) % 2 === 0) {
        Gfx.text(ctx, 'WARNING', W / 2, 270, { size: 5, color: '#ff3b4e', align: 'center', shadow: '#5a0010' });
        Gfx.ktext(ctx, '거대 모선 접근 중!', W / 2, 330, 16, '#ffd0d0');
      }
      if (st.cfg.tutorial && g.loop === 1 && g.stageIntro <= 0) this.drawTutorial(ctx, st.t - 2.6);
      if (g.player.alive === false && g.lives <= 0) {
        Gfx.text(ctx, 'GAME OVER', W / 2, 300, { size: 4, color: '#ff3b4e', align: 'center' });
      }
    }

    drawTutorial(ctx, tt) {
      const manual = this.game.save.fireMode === 'manual';
      const kb = SS.Input.usedKeyboard;
      const steps = [
        [kb ? '방향키로 기체를 움직이세요 (↑ 전진 · ↓ 후진)' : '화면을 드래그해 기체를 움직이세요', kb ? 'Space 발사 · P 일시정지' : '위아래로 끌면 전진·후진, 어디서든 드래그 OK'],
        [manual ? '오른쪽 아래 FIRE 버튼을 누르고 있으면 발사' : '지금은 자동 연사 중입니다', manual ? '설정에서 자동 연사로 바꿀 수 있어요' : '설정(SETTINGS)에서 수동 발사 버튼으로 변경 가능'],
        ['적들은 곡선으로 날아와 상단에 대열을 짭니다', '급강하하는 적을 맞히면 점수 2배!'],
        ['위급할 땐 폭탄! ' + (kb ? 'X 키' : '왼쪽 아래 BOMB 버튼'), '주변 적과 적 탄을 한 번에 날려 버립니다'],
        ['캡슐을 먹으면 파워업', 'D 2연발 · S 쉴드 · R 속사 · B 폭탄 +1'],
      ];
      const i = Math.floor(tt / 4);
      if (tt < 0 || i >= steps.length) return;
      const local = tt - i * 4;
      const a = Math.min(1, local * 3, (4 - local) * 3);
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = 'rgba(8, 10, 40, 0.55)';
      ctx.fillRect(30, 384, W - 60, 64);
      ctx.fillStyle = '#4f6cff';
      ctx.fillRect(30, 384, W - 60, 2);
      ctx.fillRect(30, 446, W - 60, 2);
      Gfx.ktext(ctx, steps[i][0], W / 2, 404, 15, '#ffffff');
      Gfx.ktext(ctx, steps[i][1], W / 2, 428, 12, '#a9b6ff');
      ctx.globalAlpha = 1;
    }

    drawStageClear(ctx) {
      const g = this.game, info = g.clearInfo, t = g.stateTime;
      this.dim(ctx, 0.45);
      Gfx.text(ctx, 'STAGE ' + g.stageNum, W / 2, 150, { size: 4, color: '#5ef2ff', align: 'center', shadow: '#3a3aff' });
      Gfx.text(ctx, 'CLEAR!', W / 2, 196, { size: 5, color: '#ffe14a', align: 'center', shadow: '#ff5a1f' });
      const lines = [
        ['CLEAR BONUS', info.base],
        ['NO MISS BONUS', info.noMiss],
        ['HIT RATIO', info.ratio + '%'],
        ['TOTAL', Gfx.pad(g.score)],
      ];
      lines.forEach(([k, v], i) => {
        if (t < 0.3 + i * 0.25) return;
        const y = 282 + i * 34;
        Gfx.text(ctx, k, 80, y, { size: 2, color: i === 3 ? '#ffd23a' : '#a9b6ff' });
        Gfx.text(ctx, v, W - 80, y, { size: 2, align: 'right' });
      });
      if (g.stageNum < 5 && t > 1.2) Gfx.ktext(ctx, `단계 ${g.stageNum + 1} 해금!`, W / 2, 440, 14, '#ffd23a');
    }

    drawGameOver(ctx) {
      const g = this.game, t = g.stateTime;
      this.dim(ctx, 0.55);
      Gfx.text(ctx, 'GAME OVER', W / 2, 200, { size: 5, color: '#ff3b4e', align: 'center', shadow: '#5a0010' });
      Gfx.text(ctx, 'SCORE ' + Gfx.pad(g.score), W / 2, 270, { size: 2, align: 'center' });
      Gfx.text(ctx, 'STAGE ' + g.stageNum + (g.loop > 1 ? '  LOOP ' + g.loop : ''), W / 2, 298, { size: 2, color: '#a9b6ff', align: 'center' });
      if (g.newRecord && Math.floor(t * 4) % 2 === 0) Gfx.text(ctx, 'NEW HI-SCORE!', W / 2, 336, { size: 3, color: '#ffd23a', align: 'center' });
    }

    drawEnding(ctx) {
      const g = this.game, t = g.stateTime;
      Gfx.text(ctx, 'CONGRATULATIONS!', W / 2, 70, { size: 3, color: '#ffe14a', align: 'center', shadow: '#ff5a1f' });
      Gfx.text(ctx, 'THE SWARM IS DEFEATED', W / 2, 112, { size: 2, color: '#5ef2ff', align: 'center' });
      const ko = ['모선 "하이브 마더"를 격파했습니다!', '은하의 항로에 다시 평화가 찾아왔습니다.', '하지만 더 빠른 무리가 다가오고 있습니다…'];
      ko.forEach((l, i) => { if (t > 0.5 + i * 0.6) Gfx.ktext(ctx, l, W / 2, 160 + i * 26, 15, '#ffffff'); });

      // 기체가 위로 날아가는 연출
      if (!this.endShip) this.endShip = Gfx.makeSprite(SS.PLAYER_ART, SS.PLAYER_PALETTE, 3);
      const sy = 380 - Math.min(t, 3) * 20 + Math.sin(t * 2) * 4;
      ctx.drawImage(this.endShip, W / 2 - this.endShip.width / 2, sy - this.endShip.height / 2);
      ctx.fillStyle = Math.floor(t * 20) % 2 ? '#ffe14a' : '#ff8a2e';
      ctx.fillRect(W / 2 - 11, sy + 18, 3, 8);
      ctx.fillRect(W / 2 + 8, sy + 18, 3, 8);

      Gfx.text(ctx, 'SCORE ' + Gfx.pad(g.score), W / 2, 254, { size: 2, align: 'center' });
      Gfx.text(ctx, 'LOOP ' + g.loop + ' CLEAR', W / 2, 280, { size: 2, color: '#ffd23a', align: 'center' });
    }
  }

  UI.PAUSE_BTN = PAUSE_BTN;
  UI.FIRE_BTN = FIRE_BTN;
  UI.BOMB_BTN = BOMB_BTN;
  UI.PU_COLORS = PU_COLORS;
  UI.PU_LETTER = PU_LETTER;
  SS.UI = UI;
})();
