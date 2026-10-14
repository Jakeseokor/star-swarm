'use strict';
/* 적 3종 + 보스 */
(function () {
  const SS = window.SS;
  const C = SS.CONFIG;
  const W = C.WIDTH, H = C.HEIGHT;
  const PI = Math.PI, HALF_PI = PI / 2, TAU = PI * 2;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrapAngle(a) {
    while (a > PI) a -= TAU;
    while (a < -PI) a += TAU;
    return a;
  }
  // 좌우 대칭 픽셀아트: 왼쪽 절반+중앙 열만 적으면 나머지를 거울 복사
  function mirror(rows) {
    return rows.map((r) => r + r.slice(0, -1).split('').reverse().join(''));
  }

  // ---- 오리지널 픽셀아트: 위에서 내려다본 전투기 ----
  // 왼쪽 절반+중앙 열만 적고 거울 복사. 위를 향하게 그린 뒤 뒤집어서 적기는 아래(플레이어 쪽)를 향함.
  // K 외곽선, G/g/d 기체 명암, C/c 조종석 유리, E 엔진 노즐 불빛
  const flip = (rows) => rows.slice().reverse();
  const ART = {
    // 일반형: 녹색 위장 전투기
    grunt: {
      half: ['......K', '.....KG', '.....GC', '.....Gc', '....KGg', '...KGGg', '..KGGGg',
        '.KGGGGg', 'KYGGGGg', 'KKKddGg', '....KGg', '...KGGd', '...KK.E'],
      pals: [
        { K: '#0f1e12', G: '#5fae4a', g: '#3a7a30', d: '#28502a', C: '#ffd75a', c: '#b07a18', Y: '#ffe14a', E: '#ff8a2e' },
        { K: '#0f1e12', G: '#5fae4a', g: '#3a7a30', d: '#28502a', C: '#ffd75a', c: '#b07a18', Y: '#6a5010', E: '#ffe14a' },
      ],
    },
    // 돌격형: 붉은 고속 요격기 (가늘고 날카로운 삼각익)
    striker: {
      half: ['.....K', '.....R', '....KR', '....RC', '....Rc', '...KRr', '...RRr', '..KRRr',
        '.KRRRr', 'KRRRRr', 'KWKKRr', '...KRr', '..KRRr', '..KK.E'],
      pals: [
        { K: '#2a0a14', R: '#e8304a', r: '#981a2e', C: '#4ff0ff', c: '#1f7fa8', W: '#ffffff', E: '#ff8a2e' },
        { K: '#2a0a14', R: '#e8304a', r: '#981a2e', C: '#4ff0ff', c: '#1f7fa8', W: '#ff4fd8', E: '#ffe14a' },
      ],
    },
    // 지휘관형: 4발 엔진 중폭격기 (2회 피격, 피격되면 연기를 뿜음)
    commander: {
      half: ['........K', '.......KP', '.......PC', '.......Pc', '......KPp', 'KKKKKKPPp',
        'KAPPPPPPp', '.KKEKKEPp', '......KPp', '......KPp', '....KKPPp', '....KAAKE'],
      pals: [
        { K: '#140c26', P: '#8f5cf0', p: '#55309e', C: '#ffd75a', c: '#b07a18', A: '#ffb02e', E: '#ff6a2e' },
        { K: '#140c26', P: '#8f5cf0', p: '#55309e', C: '#ffd75a', c: '#b07a18', A: '#ffe7a0', E: '#ffe14a' },
      ],
      hurtPals: [
        { K: '#140c26', P: '#6a6f80', p: '#40444f', C: '#ff5a3a', c: '#802010', A: '#ff8a2e', E: '#ff3b1e' },
        { K: '#140c26', P: '#6a6f80', p: '#40444f', C: '#ff5a3a', c: '#802010', A: '#ffb02e', E: '#ffe14a' },
      ],
    },
  };

  // 보스 "하이브 마더": 포탑을 단 초대형 공중요새 (31×19)
  const BOSS_ART = flip(mirror([
    '...............K', '..............KG', '..............GC', '..............Gc', '.............KGG',
    '.............GGg', '......KKKKKKKGGg', '...KKKGGGGGGGGGg', '.KKGGGGGGGGGGGGg', 'KRGGGGTGGGGTGGGg',
    'KRRGGGGGGGGGGGGg', '.KKdEdKKdEdKKGGg', '...KEK..KEK.KGGg', '............KGGg', '...........KGGGg',
    '........KKKGGGGg', '......KRGGGGGGGg', '.......KKKKKKdEd', '..............E.',
  ]));
  const BOSS_PAL = { K: '#0c1020', G: '#6f7e96', g: '#424e62', d: '#2a3242', C: '#ff2040', c: '#8a1020', R: '#e8394a', T: '#ffd23a', E: '#ff8a2e' };
  const BOSS_RAGE_PAL = Object.assign({}, BOSS_PAL, { G: '#8e5260', g: '#5a2a36', R: '#ff6a2e', T: '#ff3b4e', E: '#ffe14a' });

  let SPR = null;
  function sprites() {
    if (SPR) return SPR;
    const G = SS.Gfx;
    SPR = {};
    for (const type in ART) {
      const a = ART[type];
      const rows = flip(mirror(a.half));
      SPR[type] = {
        frames: a.pals.map((p) => G.makeSprite(rows, p, 2)),
        flash: a.pals.map((p) => G.makeSprite(rows, p, 2, '#ffffff')),
        hurt: a.hurtPals ? a.hurtPals.map((p) => G.makeSprite(rows, p, 2)) : null,
      };
    }
    SPR.boss = {
      normal: G.makeSprite(BOSS_ART, BOSS_PAL, 3),
      rage: G.makeSprite(BOSS_ART, BOSS_RAGE_PAL, 3),
      flash: G.makeSprite(BOSS_ART, BOSS_PAL, 3, '#ffffff'),
    };
    return SPR;
  }

  // ======================= 일반 적 =======================
  class Enemy {
    constructor(stage, type, col, rowCount, row) {
      this.stage = stage;
      this.type = type;
      const t = C.ENEMY[type];
      this.hp = t.hp;
      this.radius = t.radius;
      this.col = col;
      this.rowCount = rowCount;
      this.row = row;
      this.state = 'waiting'; // waiting → entering → formation ⇄ diving → returning
      this.x = -100;
      this.y = -100;
      this.heading = HALF_PI;
      this.rot = 0;
      this.speed = stage.cfg.baseSpeed * t.speedMul * stage.mul;
      this.turnRate = C.TURN_RATE * (this.speed / 150);
      this.wps = [];
      this.wpTime = 0;
      this.delay = 0;
      this.docking = false;
      this.flash = 0;
      this.anim = Math.random() * 10;
      this.dead = false;
      this.diveT = 0;
      this.fireTimes = [];
      this.isMinion = false;
      this.entryPoints = null;
    }

    get active() { return this.state !== 'waiting' && !this.dead; }

    slot() {
      const f = this.stage.formation;
      return { x: f.slotX(this.col, this.rowCount), y: f.slotY(this.row) };
    }

    scheduleEntry(points, delay) {
      this.entryPoints = points;
      this.delay = delay;
    }

    hit() {
      this.hp--;
      if (this.hp > 0) {
        this.flash = 0.1;
        SS.Audio.play('hit');
        return false;
      }
      this.dead = true;
      return true;
    }

    // ---- 급강하 경로 생성 ----
    buildDivePath() {
      const dir = this.x < W / 2 ? -1 : 1;
      const sx = this.x, sy = this.y;
      const wps = [{ x: sx + dir * 45, y: sy - 34 }, { x: sx + dir * 80, y: sy + 26 }];
      if (this.type === 'striker') {
        wps.push({ track: true, y: 300, spread: 30 }, { track: true, y: 470, spread: 14 });
      } else if (this.type === 'commander') {
        wps.push({ track: true, y: 270, spread: 80 }, { x: sx < W / 2 ? W - 70 : 70, y: 400 },
          { track: true, y: 530, spread: 40 });
      } else {
        wps.push({ track: true, y: 320, spread: 70 }, { track: true, y: 520, spread: 60 });
      }
      wps.push({ track: true, y: H + 70, spread: 120, exit: true });
      return wps;
    }

    startDive(game, wps, offX, loud) {
      const cfg = this.stage.cfg;
      this.state = 'diving';
      this.docking = false;
      this.wpTime = 0;
      this.diveT = 0;
      this.wps = (wps || this.buildDivePath()).map((w) => Object.assign({}, w, { offX: offX || 0, x: w.x !== undefined ? w.x + (offX || 0) : undefined }));
      this.heading = this.x < W / 2 ? -HALF_PI - 0.5 : -HALF_PI + 0.5; // 위로 튀어 오르며 이탈
      this.fireTimes = [];
      if (Math.random() < cfg.diveShotChance) {
        const t = rand(0.5, 1.1);
        this.fireTimes.push(t);
        if (cfg.fireMode === 'barrage' || cfg.fireMode === 'spread3') {
          if (Math.random() < 0.6) this.fireTimes.push(t + 0.5);
        }
      }
      if (loud) SS.Audio.play('dive');
    }

    onExit() {
      if (this.isMinion) {
        this.dead = true;
        this.noScore = true;
        return;
      }
      const s = this.slot();
      this.x = s.x;
      this.y = -30;
      this.heading = HALF_PI;
      this.state = 'returning';
      this.wps = [{ slot: true }];
      this.wpTime = 0;
    }

    update(dt, game) {
      this.anim += dt;
      if (this.flash > 0) this.flash -= dt;

      switch (this.state) {
        case 'waiting':
          this.delay -= dt;
          if (this.delay <= 0) {
            const pts = this.entryPoints;
            this.state = 'entering';
            this.x = pts[0].x;
            this.y = pts[0].y;
            this.wps = pts.slice(1).map((p) => ({ x: p.x, y: p.y }));
            this.wps.push({ slot: true });
            this.heading = Math.atan2(this.wps[0].y - this.y, this.wps[0].x - this.x);
            this.rot = this.heading - HALF_PI;
            this.wpTime = 0;
          }
          return;
        case 'formation': {
          const s = this.slot();
          this.x = s.x;
          this.y = s.y;
          this.heading = HALF_PI;
          break;
        }
        default:
          this.followPath(dt, game);
          if (this.state === 'diving') this.updateDiveFire(dt, game);
      }

      // 비행운(급강하·진입 중) / 손상된 폭격기의 연기
      this.trailT = (this.trailT || 0) - dt;
      if (this.trailT <= 0 && this.y > -10) {
        const damaged = this.type === 'commander' && this.hp === 1;
        if (damaged) {
          this.trailT = 0.07;
          game.smoke(this.x + (Math.random() - 0.5) * 10, this.y - 4, 1, '#4a4e58');
          if (Math.random() < 0.4) game.spark(this.x, this.y, '#ff8a2e');
        } else if (this.state === 'diving' || this.state === 'entering') {
          this.trailT = 0.05;
          const bx = -Math.cos(this.heading) * 10, by = -Math.sin(this.heading) * 10;
          game.trail(this.x + bx, this.y + by);
        } else {
          this.trailT = 0.2;
        }
      }

      // 스프라이트 회전은 부드럽게 따라감
      const targetRot = this.state === 'formation' ? 0 : this.heading - HALF_PI;
      const d = wrapAngle(targetRot - this.rot);
      const maxR = 12 * dt;
      this.rot += clamp(d, -maxR, maxR);
    }

    followPath(dt, game) {
      const wp = this.wps[0];
      if (!wp) { this.onExit(); return; }
      let tx, ty;

      if (wp.slot) {
        const s = this.slot();
        tx = s.x; ty = s.y;
        const dx = tx - this.x, dy = ty - this.y;
        const dist = Math.hypot(dx, dy);
        if (this.docking || dist < 40) {
          // 대열 자리에 직선으로 착지
          this.docking = true;
          const step = Math.max(this.speed * 0.8, 70) * dt;
          if (dist <= step) {
            this.x = tx; this.y = ty;
            this.state = 'formation';
            this.docking = false;
            this.wps = [];
            return;
          }
          this.x += (dx / dist) * step;
          this.y += (dy / dist) * step;
          this.heading = Math.atan2(dy, dx);
          return;
        }
      } else {
        if (wp.track && wp.x === undefined) {
          const px = game.player.alive ? game.player.x : W / 2;
          wp.x = clamp(px + rand(-wp.spread, wp.spread) + (wp.offX || 0), 18, W - 18);
        }
        tx = wp.x; ty = wp.y;
      }

      // 일정 속도로 선회하며 목표점을 향함 → 자연스러운 곡선 비행
      this.wpTime += dt;
      const desired = Math.atan2(ty - this.y, tx - this.x);
      const diff = wrapAngle(desired - this.heading);
      const maxT = this.turnRate * (1 + this.wpTime * 1.8) * dt;
      this.heading += clamp(diff, -maxT, maxT);
      this.x += Math.cos(this.heading) * this.speed * dt;
      this.y += Math.sin(this.heading) * this.speed * dt;

      if (wp.exit) {
        if (this.y > H + 30) this.onExit();
        return;
      }
      if (wp.slot) return;
      const dx = tx - this.x, dy = ty - this.y;
      if (dx * dx + dy * dy < 26 * 26 || this.wpTime > 5) {
        this.wps.shift();
        this.wpTime = 0;
      }
    }

    updateDiveFire(dt, game) {
      this.diveT += dt;
      while (this.fireTimes.length && this.diveT >= this.fireTimes[0]) {
        this.fireTimes.shift();
        if (game.player.alive && this.y > 40 && this.y < H * 0.72) {
          SS.Bullet.pattern(game, this.x, this.y + 8, this.stage.cfg.fireMode);
        }
      }
    }

    draw(ctx) {
      if (!this.active) return;
      const spr = sprites()[this.type];
      const frame = Math.floor(this.anim * (this.state === 'formation' ? 2.5 : 6)) % 2;
      let img = spr.frames[frame];
      if (this.flash > 0) img = spr.flash[frame];
      else if (spr.hurt && this.hp === 1) img = spr.hurt[frame];
      ctx.save();
      ctx.translate(Math.round(this.x), Math.round(this.y));
      if (this.rot) ctx.rotate(this.rot);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    }
  }

  Enemy.sprites = sprites;

  // ======================= 보스 =======================
  class Boss {
    constructor(stage) {
      this.stage = stage;
      this.maxHp = C.BOSS.hp;
      this.hp = this.maxHp;
      this.x = W / 2;
      this.y = -70;
      this.homeY = C.BOSS.y;
      this.state = 'enter'; // enter → fight → dying → dead
      this.t = 0;
      this.phase = 1;
      this.flash = 0;
      this.invuln = 0;
      this.dead = false;
      this.dieT = 0;
      this.boomT = 0;
      this.hw = 44;
      this.hh = 25;
      this.resetTimers();
    }

    resetTimers() {
      this.timers = { a: 1.2, b: 2.0, c: 0, d: 3.5 };
      this.burst = 0;
      this.burstT = 0;
      this.spin = 0;
      this.spiralT = 0;
    }

    contains(x, y) {
      return Math.abs(x - this.x) < this.hw && Math.abs(y - this.y) < this.hh;
    }

    // 반환: 'block'(무적), 'hit', 'kill'
    hit(dmg) {
      if (this.state !== 'fight' || this.invuln > 0) return 'block';
      this.hp -= dmg;
      this.flash = 0.05;
      if (this.hp <= 0) {
        this.hp = 0;
        this.state = 'dying';
        return 'kill';
      }
      SS.Audio.play('bossHit');
      return 'hit';
    }

    update(dt, game) {
      this.t += dt;
      if (this.flash > 0) this.flash -= dt;
      if (this.invuln > 0) this.invuln -= dt;

      if (this.state === 'enter') {
        this.y += 45 * dt;
        if (this.y >= this.homeY) { this.y = this.homeY; this.state = 'fight'; }
        return;
      }
      if (this.state === 'dying') {
        this.dieT += dt;
        this.boomT -= dt;
        game.shake = Math.max(game.shake, 0.2);
        if (this.boomT <= 0) {
          this.boomT = 0.09;
          game.explode(this.x + rand(-40, 40), this.y + rand(-22, 22), ['#ffe14a', '#ff8a2e', '#ffffff', '#ff3b6b'], 10, 140);
        }
        if (this.dieT > 2.2 && !this.dead) {
          this.dead = true;
          game.explode(this.x, this.y, ['#ffffff', '#ffe14a', '#4ff0ff', '#ff8a2e'], 70, 260, 1.2);
          game.shake = 0.6;
        }
        return;
      }
      if (this.state !== 'fight') return;

      const frac = this.hp / this.maxHp;
      const np = frac > 2 / 3 ? 1 : frac > 1 / 3 ? 2 : 3;
      if (np !== this.phase) {
        this.phase = np;
        this.invuln = 1.0;
        this.resetTimers();
        game.shake = 0.5;
        game.clearEnemyBullets();
        game.popup(this.x, this.y + 40, 'PHASE ' + np, '#ff4f5e');
        game.dropPowerup(this.x, this.y + 30);
        SS.Audio.play('bossPhase');
      }

      const spd = C.BOSS.moveSpeed[this.phase] * this.stage.mul;
      this.x = W / 2 + Math.sin(this.t * spd) * 140;
      this.y = this.homeY + Math.sin(this.t * spd * 2.1) * (this.phase === 3 ? 22 : 12);

      if (this.invuln > 0 || !game.player.alive) return;
      this.firePatterns(dt, game);
    }

    firePatterns(dt, game) {
      const B = SS.Bullet, T = this.timers;
      const mx = this.x, my = this.y + 26;

      if (this.burst > 0) {
        this.burstT -= dt;
        if (this.burstT <= 0) {
          this.burstT = 0.13;
          this.burst--;
          for (const ox of [-30, 30]) B.enemy(game, mx + ox, my - 6, B.aimAngle(game, mx + ox, my), 240, 0);
        }
      }

      if (this.phase === 1) {
        // 부채꼴 7발 + 조준 3연사
        if ((T.a -= dt) <= 0) {
          T.a = 1.6;
          for (let i = -3; i <= 3; i++) B.enemy(game, mx, my, HALF_PI + i * 0.17, 165, 1);
        }
        if ((T.b -= dt) <= 0) { T.b = 2.3; this.burst = 3; this.burstT = 0; }
      } else if (this.phase === 2) {
        // 회전 나선탄 (2.6초 발사 / 1.2초 휴식) + 조준탄
        this.spiralT += dt;
        if (this.spiralT % 3.8 < 2.6 && (T.c -= dt) <= 0) {
          T.c = 0.1;
          for (let k = 0; k < 3; k++) B.enemy(game, mx, my - 10, this.spin + (k * TAU) / 3, 135, 1);
          this.spin += 0.29;
        }
        if ((T.b -= dt) <= 0) { T.b = 1.5; B.enemy(game, mx, my, B.aimAngle(game, mx, my), 240, 0); }
      } else {
        // 원형 탄막 + 조준 5방향 + 돌격형 호위기 소환
        if ((T.a -= dt) <= 0) {
          T.a = 1.5;
          this.spin = this.spin ? 0 : PI / 18;
          for (let k = 0; k < 18; k++) B.enemy(game, mx, my - 10, this.spin + (k * TAU) / 18, 125, 1);
        }
        if ((T.b -= dt) <= 0) { T.b = 1.15; B.pattern(game, mx, my, 'barrage', 215); }
        if ((T.d -= dt) <= 0) {
          T.d = 5.5;
          this.stage.spawnMinion(game, mx - 34, my);
          this.stage.spawnMinion(game, mx + 34, my);
        }
      }
    }

    draw(ctx, time) {
      if (this.dead) return;
      const s = sprites().boss;
      let img = this.phase === 3 ? s.rage : s.normal;
      if (this.flash > 0 || (this.invuln > 0 && Math.floor(time * 20) % 2 === 0)) img = s.flash;
      let x = Math.round(this.x), y = Math.round(this.y);
      if (this.state === 'dying') { x += Math.round(rand(-3, 3)); y += Math.round(rand(-3, 3)); }
      // 엔진 광원
      const glow = 0.3 + Math.sin(time * 9) * 0.15;
      ctx.fillStyle = `rgba(255, 138, 46, ${glow})`;
      ctx.fillRect(x - 6, y - 36, 12, 8);
      ctx.drawImage(img, x - img.width / 2, y - img.height / 2);
    }
  }

  SS.Enemy = Enemy;
  SS.Boss = Boss;
})();
