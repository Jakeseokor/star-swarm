'use strict';
/* 적 3종 + 보스 */
(function () {
  const SS = window.SS;
  const C = SS.CONFIG;
  let W = C.WIDTH, H = C.HEIGHT;
  SS.onView(() => { W = C.WIDTH; H = C.HEIGHT; });
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

  // 기체 그래픽은 aircraft.js (SS.Aircraft) — 벡터로 그린 전투기·폭격기·공중요새

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

    drawShadow(ctx) {
      if (!this.active || this.y < -40) return;
      SS.Aircraft.drawShadow(ctx, this.type, this.x, this.y, this.rot, this.state === 'formation' ? 26 : 20);
    }

    draw(ctx, time) {
      if (!this.active) return;
      // 엔진 불빛 (기수 반대쪽)
      const back = this.rot + Math.PI / 2 + Math.PI;
      const len = this.type === 'commander' ? 0 : this.type === 'striker' ? 20 : 18;
      if (len) {
        const ex = this.x + Math.cos(back) * len, ey = this.y + Math.sin(back) * len;
        const s = (this.state === 'formation' ? 7 : 11) * (0.85 + Math.sin(time * 37 + this.anim) * 0.15);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(SS.FX.sprite('fire'), ex - s / 2, ey - s / 2, s, s);
        ctx.globalCompositeOperation = 'source-over';
      }
      SS.Aircraft.draw(ctx, this.type, this.x, this.y, this.rot, {
        hurt: this.type === 'commander' && this.hp === 1,
        flash: this.flash > 0,
      });
    }
  }

  // ======================= 보스 =======================
  class Boss {
    constructor(stage) {
      this.stage = stage;
      this.maxHp = C.BOSS.hp;
      this.hp = this.maxHp;
      this.x = W / 2;
      this.y = -70;
      this.homeY = C.BOSS.y + SS.view.safeTop;
      this.state = 'enter'; // enter → fight → dying → dead
      this.t = 0;
      this.phase = 1;
      this.flash = 0;
      this.invuln = 0;
      this.dead = false;
      this.dieT = 0;
      this.boomT = 0;
      this.hw = 74;
      this.hh = 30;
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
          game.explode(this.x + rand(-70, 70), this.y + rand(-26, 26), ['#ffe14a', '#ff8a2e', '#ffffff', '#ff3b6b'], 10, 140);
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
      this.x = W / 2 + Math.sin(this.t * spd) * Math.min(W / 2 - 95, 230);
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
          this.stage.spawnMinion(game, mx - 50, my);
          this.stage.spawnMinion(game, mx + 50, my);
        }
      }
    }

    drawShadow(ctx) {
      if (this.dead) return;
      SS.Aircraft.drawShadow(ctx, 'boss', this.x, this.y, 0, 40);
    }

    draw(ctx, time) {
      if (this.dead) return;
      let x = this.x, y = this.y;
      if (this.state === 'dying') { x += rand(-3, 3); y += rand(-3, 3); }
      // 배기구 불빛 (꼬리 = 화면 위쪽)
      const fire = SS.FX.sprite('fire');
      const s = 16 + Math.sin(time * 30) * 2;
      ctx.globalCompositeOperation = 'lighter';
      for (const ox of [-24, 24]) ctx.drawImage(fire, x + ox - s / 2, y - 12 - s / 2, s, s);
      ctx.globalCompositeOperation = 'source-over';
      const flash = this.flash > 0 || (this.invuln > 0 && Math.floor(time * 20) % 2 === 0);
      SS.Aircraft.draw(ctx, 'boss', x, y, 0, { hurt: this.phase === 3, flash });
      if (this.state === 'dying') { // 불타는 연기
        ctx.globalAlpha = 0.6;
        ctx.drawImage(SS.FX.sprite('smoke'), x - 40 + rand(-10, 10), y - 30, 80, 60);
        ctx.globalAlpha = 1;
      }
    }
  }

  SS.Enemy = Enemy;
  SS.Boss = Boss;
})();
