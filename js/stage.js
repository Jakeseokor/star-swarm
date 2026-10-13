'use strict';
/* 스테이지: 편대 구성, 진입 경로, 급강하 스케줄, 보스 등장 */
(function () {
  const SS = window.SS;
  const C = SS.CONFIG;
  const W = C.WIDTH;

  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  // 화면 밖에서 곡선으로 날아오는 진입 경로 (첫 점 = 출현 위치). 홀수 무리는 좌우 반전.
  const ENTRY_PATHS = [
    [{ x: 300, y: -30 }, { x: 250, y: 120 }, { x: 140, y: 260 }, { x: 90, y: 360 }, { x: 150, y: 440 }, { x: 230, y: 380 }, { x: 220, y: 280 }],
    [{ x: -30, y: 470 }, { x: 120, y: 430 }, { x: 240, y: 380 }, { x: 300, y: 290 }, { x: 250, y: 220 }, { x: 180, y: 250 }],
    [{ x: 120, y: -30 }, { x: 180, y: 150 }, { x: 330, y: 300 }, { x: 380, y: 380 }, { x: 310, y: 430 }, { x: 260, y: 340 }],
    [{ x: -30, y: 250 }, { x: 140, y: 300 }, { x: 260, y: 330 }, { x: 340, y: 270 }, { x: 300, y: 190 }],
  ];

  function pathFor(index, mirrored) {
    return ENTRY_PATHS[index % ENTRY_PATHS.length].map((p) => ({ x: mirrored ? W - p.x : p.x, y: p.y }));
  }

  // 상단 편대: 좌우로 흔들리며 수축·팽창
  class Formation {
    constructor() {
      this.t = 0;
      this.ox = 0;
      this.spread = 1;
    }
    update(dt, mul) {
      const F = C.FORMATION;
      this.t += dt * mul;
      this.ox = Math.sin(this.t * F.swaySpeed) * F.swayAmp;
      this.spread = 1 + Math.sin(this.t * F.breatheSpeed) * F.breathe;
    }
    slotX(col, count) {
      return W / 2 + this.ox + (col - (count - 1) / 2) * C.FORMATION.colSpacing * this.spread;
    }
    slotY(row) {
      return C.FORMATION.top + row * C.FORMATION.rowSpacing * (1 + (this.spread - 1) * 0.6);
    }
  }

  class Stage {
    constructor(game, num) {
      this.game = game;
      this.num = num;
      this.cfg = C.STAGES[num - 1];
      this.mul = game.speedMul;
      this.formation = new Formation();
      this.enemies = [];
      this.boss = null;
      this.bossSpawned = false;
      this.warning = 0;
      this.warningStarted = false;
      this.t = 0;
      this.diveTimer = this.cfg.diveInterval;
      this.fireTimer = 2;
      this.buildEnemies();
    }

    buildEnemies() {
      const cfg = this.cfg;
      this.cfg.rows.forEach(([type, count], row) => {
        for (let c = 0; c < count; c++) this.enemies.push(new SS.Enemy(this, type, c, count, row));
      });
      const groups = [];
      for (let i = 0; i < this.enemies.length; i += cfg.entryGroupSize) {
        groups.push(this.enemies.slice(i, i + cfg.entryGroupSize));
      }
      const intro = 1.6; // "STAGE N" 표시 중에 첫 무리 출발
      const interval = cfg.entryInterval / this.mul;
      groups.forEach((grp, gi) => {
        const wave = cfg.entryPairs ? Math.floor(gi / 2) : gi;
        const path = pathFor(wave, gi % 2 === 1);
        const start = intro + wave * interval;
        grp.forEach((e, k) => e.scheduleEntry(path, start + (k * 0.17) / this.mul));
      });
    }

    entryDone() {
      return this.enemies.every((e) => e.state !== 'waiting' && e.state !== 'entering');
    }

    regularCount() {
      let n = 0;
      for (const e of this.enemies) if (!e.isMinion) n++;
      return n;
    }

    update(dt) {
      const g = this.game;
      this.t += dt;
      this.formation.update(dt, this.mul);
      for (const e of this.enemies) e.update(dt, g);
      if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);

      if (this.entryDone() && g.player.alive) {
        this.updateDives(dt);
        this.updateFormationFire(dt);
      }

      if (this.cfg.boss) this.updateBoss(dt);
    }

    updateDives(dt) {
      const cfg = this.cfg;
      const remaining = this.regularCount();
      if (!remaining) return;
      // 적이 얼마 남지 않으면 더 자주 급강하
      this.diveTimer -= dt * this.mul * (remaining <= 5 ? 2 : 1);
      if (this.diveTimer > 0) return;
      this.diveTimer = cfg.diveInterval * (0.7 + Math.random() * 0.6);

      const diving = this.enemies.filter((e) => e.state === 'diving' && !e.isMinion).length;
      const room = cfg.divers[1] + 1 - diving; // 동시에 급강하 중인 기체 상한
      if (room <= 0) return;
      const cand = this.enemies.filter((e) => e.state === 'formation');
      if (!cand.length) return;

      // 리더 선택: 지휘관형/돌격형이 조금 더 자주 나섬
      let leader = null;
      const pref = cand.filter((e) => e.type !== 'grunt');
      if (pref.length && Math.random() < 0.45) leader = pref[randInt(0, pref.length - 1)];
      else leader = cand[randInt(0, cand.length - 1)];

      const n = Math.min(room, randInt(cfg.divers[0], cfg.divers[1]));
      const wps = leader.buildDivePath();
      leader.startDive(this.game, wps, 0, true);

      if (n > 1) {
        // 가까운 기체들이 호위하며 함께 급강하 (2~3기 동시)
        const escorts = cand
          .filter((e) => e !== leader)
          .sort((a, b) => Math.hypot(a.x - leader.x, a.y - leader.y) - Math.hypot(b.x - leader.x, b.y - leader.y))
          .slice(0, n - 1);
        escorts.forEach((e, i) => {
          const off = (i % 2 === 0 ? 1 : -1) * 26 * (1 + Math.floor(i / 2));
          e.startDive(this.game, wps, off, false);
        });
      }
    }

    updateFormationFire(dt) {
      const rate = this.cfg.formationFireRate * this.mul;
      if (rate <= 0) return;
      this.fireTimer -= dt;
      if (this.fireTimer > 0) return;
      this.fireTimer = (1 / rate) * (0.5 + Math.random());
      const cand = this.enemies.filter((e) => e.state === 'formation');
      if (!cand.length) return;
      const e = cand[randInt(0, cand.length - 1)];
      SS.Bullet.pattern(this.game, e.x, e.y + 10, 'aimed', C.ENEMY_BULLET_SPEED * 0.9);
    }

    updateBoss(dt) {
      if (!this.bossSpawned) {
        if (!this.warningStarted && this.regularCount() === 0) {
          this.warningStarted = true;
          this.warning = 3.0;
          SS.Audio.play('warning');
        }
        if (this.warningStarted) {
          this.warning -= dt;
          if (this.warning <= 0) {
            this.bossSpawned = true;
            this.boss = new SS.Boss(this);
          }
        }
        return;
      }
      if (this.boss) this.boss.update(dt, this.game);
      if (this.boss && this.boss.dead && this.enemies.length) {
        // 보스 격파 시 남은 호위기도 함께 폭발
        for (const e of this.enemies) {
          this.game.explode(e.x, e.y, ['#ff4fd8', '#ffffff'], 10, 100);
          e.dead = true;
        }
        this.enemies.length = 0;
      }
    }

    spawnMinion(game, x, y) {
      const e = new SS.Enemy(this, 'striker', 0, 1, 0);
      e.isMinion = true;
      e.x = x;
      e.y = y;
      e.state = 'diving';
      e.heading = Math.PI / 2;
      e.wps = [
        { track: true, y: 330, spread: 40 },
        { track: true, y: 500, spread: 20 },
        { track: true, y: C.HEIGHT + 70, spread: 80, exit: true },
      ];
      e.fireTimes = Math.random() < 0.6 ? [0.5] : [];
      this.enemies.push(e);
    }

    isComplete() {
      if (this.cfg.boss) return this.bossSpawned && this.boss && this.boss.dead && this.enemies.length === 0;
      return this.enemies.length === 0;
    }

    draw(ctx, time) {
      for (const e of this.enemies) e.draw(ctx);
      if (this.boss) this.boss.draw(ctx, time);
    }
  }

  SS.Stage = Stage;
  SS.Formation = Formation;
})();
