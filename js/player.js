'use strict';
/* 플레이어 기체 */
(function () {
  const SS = window.SS;
  const C = SS.CONFIG;
  const P = C.PLAYER;

  // 기체 그래픽은 aircraft.js (SS.Aircraft 'player')
  const homeY = () => C.HEIGHT - P.homeFromBottom - SS.view.safeBottom;
  const minY = () => C.HEIGHT * P.minYFrac;
  const maxY = () => C.HEIGHT - P.maxFromBottom - SS.view.safeBottom;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  class Player {
    constructor(game) {
      this.game = game;
      this.sprite = null;
      this.resetFull();
    }

    resetFull() {
      this.x = C.WIDTH / 2;
      this.y = homeY();
      this.vy = 0;
      this.alive = true;
      this.invuln = P.invulnTime;
      this.cool = 0.4;
      this.double = 0;
      this.rapid = 0;
      this.shield = false;
      this.respawnTimer = 0;
      this.alt = 0;          // 현재 고도 (-1 하강 ~ 0 평상 ~ +1 상승)
      this.altTarget = 0;
      this.altGauge = 100;
    }

    // 적과 다른 고도에 있으면 회피 중
    get evading() { return this.alive && Math.abs(this.alt) > 0.6; }

    requestAlt(dir) {
      if (!this.alive) return;
      if (this.altTarget === 0) {
        if (this.altGauge < P.altMinToStart) { SS.Audio.play('bombEmpty'); return; }
        this.altTarget = dir;
        SS.Audio.play(dir > 0 ? 'climb' : 'dive');
      } else if (this.altTarget !== dir) {
        this.altTarget = 0;
        SS.Audio.play(dir > 0 ? 'climb' : 'dive');
      }
    }

    updateAlt(dt) {
      const d = this.altTarget - this.alt, step = P.altChangeRate * dt;
      this.alt += Math.abs(d) <= step ? d : Math.sign(d) * step;
      if (this.altTarget !== 0) {
        this.altGauge -= P.altDrain * dt;
        if (this.altGauge <= 0) { this.altGauge = 0; this.altTarget = 0; }
      } else if (Math.abs(this.alt) < 0.05) {
        this.altGauge = Math.min(100, this.altGauge + P.altRecharge * dt);
      }
    }

    respawn() {
      this.x = C.WIDTH / 2;
      this.y = homeY();
      this.alt = this.altTarget = 0;
      this.altGauge = 100;
      this.alive = true;
      this.invuln = P.invulnTime;
      this.cool = 0.3;
    }

    die() {
      this.alive = false;
      this.double = 0;
      this.rapid = 0;
      this.shield = false;
      this.respawnTimer = P.respawnDelay;
    }

    get maxBullets() {
      let n = this.rapid > 0 ? P.rapidMaxBullets : P.maxBullets;
      if (this.double > 0) n *= 2;
      return n;
    }

    update(dt, canFire) {
      const inp = SS.Input;
      if (this.invuln > 0) this.invuln -= dt;
      if (this.double > 0) this.double = Math.max(0, this.double - dt);
      if (this.rapid > 0) this.rapid = Math.max(0, this.rapid - dt);
      if (this.cool > 0) this.cool -= dt;
      if (this.muzzle > 0) this.muzzle -= dt;

      const drag = inp.takeDrag(); // 죽어 있어도 누적분은 버림
      if (!this.alive) return;
      if (inp.altUpPressed || inp.wasPressed('KeyQ', 'PageUp')) this.requestAlt(1);
      if (inp.altDnPressed || inp.wasPressed('KeyE', 'PageDown')) this.requestAlt(-1);
      this.updateAlt(dt);

      let dx = drag.x, dy = drag.y;
      if (inp.keys.left) dx -= P.speed * dt;
      if (inp.keys.right) dx += P.speed * dt;
      if (inp.keys.up) dy -= P.vSpeed * dt;   // 전진
      if (inp.keys.down) dy += P.vSpeed * dt; // 후진
      // 조그셔틀: 기울인 만큼 그 방향으로 (가운데 12%는 무시)
      const jl = Math.hypot(inp.joyX, inp.joyY);
      if (jl > 0.12) {
        const k = Math.min(1, (jl - 0.12) / 0.88) / jl;
        dx += inp.joyX * k * P.speed * P.joySpeed * dt;
        dy += inp.joyY * k * P.vSpeed * P.joySpeed * dt;
      }
      this.x = clamp(this.x + dx, P.margin, C.WIDTH - P.margin);
      const oldY = this.y;
      this.y = clamp(this.y + dy, minY(), maxY());
      this.vy = dt > 0 ? (this.y - oldY) / dt : 0;

      if (!canFire || this.evading) return; // 다른 고도에서는 사격이 닿지 않음
      const auto = this.game.save.fireMode === 'auto';
      const want = auto || inp.keys.fire || inp.fireHeld;
      if (want && this.cool <= 0 && this.game.pBullets.length < this.maxBullets) this.fire();
    }

    fire() {
      this.cool = this.rapid > 0 ? P.rapidCooldown : P.fireCooldown;
      this.muzzle = 0.06;
      if (this.double > 0) {
        SS.Bullet.player(this.game, this.x - 11, this.y - 4);
        SS.Bullet.player(this.game, this.x + 11, this.y - 4);
      } else {
        SS.Bullet.player(this.game, this.x, this.y - 26);
      }
      SS.Audio.play('shoot');
    }

    // 화면 회전 등으로 영역이 바뀌면 범위 안으로
    clampToView() {
      this.x = clamp(this.x, P.margin, C.WIDTH - P.margin);
      this.y = clamp(this.y, minY(), maxY());
    }

    drawShadow(ctx) {
      if (!this.alive) return;
      // 상승하면 그림자가 멀어지고, 하강하면 가까워짐
      SS.Aircraft.drawShadow(ctx, 'player', this.x, this.y, this.bank * 0.3, 16 + this.alt * 18, 1 - this.alt * 0.12);
    }

    draw(ctx, time) {
      if (!this.alive) return;
      // 좌우 이동 시 살짝 기울어짐 (뱅크)
      const target = Math.max(-1, Math.min(1, (this.x - (this.lastX || this.x)) / 4));
      this.bank = (this.bank || 0) + (target - (this.bank || 0)) * 0.2;
      this.lastX = this.x;
      const x = this.x, y = this.y;
      const sc = 1 + this.alt * 0.24;      // 상승: 크게 / 하강: 작게
      const roll = Math.cos(this.bank * 0.55); // 기울면 날개폭이 짧아 보임
      const blinkOff = this.invuln > 0 && Math.floor(time * 16) % 2 === 0;

      if (!blinkOff) {
        // 애프터버너 (전진 중엔 길게, 후진 중엔 짧게 / 고도에 따른 기체 크기에 맞춤)
        const f = 0.85 + Math.sin(time * 40) * 0.1 + Math.random() * 0.1;
        const len = (14 + (this.vy < -20 ? 12 : this.vy > 20 ? -6 : 0)) * f * sc;
        const fire = SS.FX.sprite('fire');
        const ny = y + 24 * sc;
        ctx.globalCompositeOperation = 'lighter';
        for (const n0 of [-2.3, 2.3]) {
          const nx = n0 * sc * roll;
          const gr = ctx.createLinearGradient(0, ny, 0, ny + len);
          gr.addColorStop(0, 'rgba(255,255,255,0.95)');
          gr.addColorStop(0.25, 'rgba(120,200,255,0.85)');
          gr.addColorStop(0.6, 'rgba(255,150,60,0.6)');
          gr.addColorStop(1, 'rgba(255,80,20,0)');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.moveTo(x + nx - 1.7 * sc, ny);
          ctx.lineTo(x + nx + 1.7 * sc, ny);
          ctx.lineTo(x + nx, ny + len);
          ctx.closePath();
          ctx.fill();
          ctx.drawImage(fire, x + nx - 5 * sc, ny - 4 * sc, 10 * sc, 10 * sc);
        }
        ctx.globalCompositeOperation = 'source-over';
        SS.Aircraft.draw(ctx, 'player', x, y, this.bank * 0.12, { scale: sc, scaleX: roll, roll: this.bank });
        // 기관포 발사 섬광
        if (this.muzzle > 0) {
          const sp = SS.FX.sprite('spark');
          ctx.globalCompositeOperation = 'lighter';
          if (this.double > 0) {
            ctx.drawImage(sp, x - 17, y - 10, 12, 12);
            ctx.drawImage(sp, x + 5, y - 10, 12, 12);
          } else ctx.drawImage(sp, x - 7, y - 33, 14, 14);
          ctx.globalCompositeOperation = 'source-over';
        }
      }

      if (this.shield) {
        const r = 30 + Math.sin(time * 8) * 1.5;
        ctx.drawImage(SS.FX.sprite('shield'), x - r, y - r, r * 2, r * 2);
      }
    }
  }

  SS.Player = Player;
})();
