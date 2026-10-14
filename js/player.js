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
    }

    respawn() {
      this.x = C.WIDTH / 2;
      this.y = homeY();
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

      let dx = drag.x, dy = drag.y;
      if (inp.keys.left) dx -= P.speed * dt;
      if (inp.keys.right) dx += P.speed * dt;
      if (inp.keys.up) dy -= P.vSpeed * dt;   // 전진
      if (inp.keys.down) dy += P.vSpeed * dt; // 후진
      this.x = clamp(this.x + dx, P.margin, C.WIDTH - P.margin);
      const oldY = this.y;
      this.y = clamp(this.y + dy, minY(), maxY());
      this.vy = dt > 0 ? (this.y - oldY) / dt : 0;

      if (!canFire) return;
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
      SS.Aircraft.drawShadow(ctx, 'player', this.x, this.y, this.bank * 0.3, 16);
    }

    draw(ctx, time) {
      if (!this.alive) return;
      // 좌우 이동 시 살짝 기울어짐 (뱅크)
      const target = Math.max(-1, Math.min(1, (this.x - (this.lastX || this.x)) / 4));
      this.bank = (this.bank || 0) + (target - (this.bank || 0)) * 0.2;
      this.lastX = this.x;
      const x = this.x, y = this.y;
      const blinkOff = this.invuln > 0 && Math.floor(time * 16) % 2 === 0;

      if (!blinkOff) {
        // 애프터버너 (전진 중엔 길게, 후진 중엔 짧게)
        const f = 0.85 + Math.sin(time * 40) * 0.1 + Math.random() * 0.1;
        const len = (14 + (this.vy < -20 ? 12 : this.vy > 20 ? -6 : 0)) * f;
        const fire = SS.FX.sprite('fire');
        ctx.globalCompositeOperation = 'lighter';
        for (const nx of [-2.3, 2.3]) {
          const gr = ctx.createLinearGradient(0, y + 22, 0, y + 22 + len);
          gr.addColorStop(0, 'rgba(255,255,255,0.95)');
          gr.addColorStop(0.25, 'rgba(120,200,255,0.85)');
          gr.addColorStop(0.6, 'rgba(255,150,60,0.6)');
          gr.addColorStop(1, 'rgba(255,80,20,0)');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.moveTo(x + nx - 1.7, y + 22);
          ctx.lineTo(x + nx + 1.7, y + 22);
          ctx.lineTo(x + nx, y + 22 + len);
          ctx.closePath();
          ctx.fill();
          ctx.drawImage(fire, x + nx - 5, y + 18, 10, 10);
        }
        ctx.globalCompositeOperation = 'source-over';
        SS.Aircraft.draw(ctx, 'player', x, y, this.bank * 0.12);
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
