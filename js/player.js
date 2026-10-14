'use strict';
/* 플레이어 기체 */
(function () {
  const SS = window.SS;
  const C = SS.CONFIG;
  const P = C.PLAYER;

  // 오리지널 픽셀아트: 위에서 본 쌍발 제공 전투기 (17×21)
  // 왼쪽 절반+중앙 열만 적고 거울 복사. K 외곽선, G/g/d 기체 명암, C/c 캐노피, R 날개 표식, E 엔진 노즐
  SS.PLAYER_ART = [
    '........K', '.......KG', '.......GG', '.......Gg', '......KGC', '......GgC', '......Ggc',
    '......Ggg', '.....KGgd', '....KGGgd', '...KGGGgd', '..KGGGGgd', '.KGGGGGgd', 'KRGGGGGgd',
    'KRRdddGgd', '.KK...Kgd', '......Kgd', '.....KGgd', '....KGGgd', '...KRGdEd', '...KKK.E.',
  ].map((r) => r + r.slice(0, -1).split('').reverse().join(''));
  SS.PLAYER_PALETTE = { K: '#141a28', G: '#d2dbe8', g: '#8a97ad', d: '#56627a', C: '#5ef2ff', c: '#1f7fa8', R: '#e8394a', E: '#3a3f4b' };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  class Player {
    constructor(game) {
      this.game = game;
      this.sprite = null;
      this.resetFull();
    }

    resetFull() {
      this.x = C.WIDTH / 2;
      this.y = P.y;
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
      this.y = P.y;
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
      this.y = clamp(this.y + dy, P.minY, P.maxY);
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
        SS.Bullet.player(this.game, this.x - 9, this.y - 6);
        SS.Bullet.player(this.game, this.x + 9, this.y - 6);
      } else {
        SS.Bullet.player(this.game, this.x, this.y - 22);
      }
      SS.Audio.play('shoot');
    }

    draw(ctx, time) {
      if (!this.alive) return;
      if (!this.sprite) this.sprite = SS.Gfx.makeSprite(SS.PLAYER_ART, SS.PLAYER_PALETTE, 2);
      const x = Math.round(this.x), y = Math.round(this.y);
      const blinkOff = this.invuln > 0 && Math.floor(time * 16) % 2 === 0;

      if (!blinkOff) {
        const w = this.sprite.width, h = this.sprite.height;
        // 애프터버너 (전진 중엔 길게, 후진 중엔 짧게)
        const f = Math.floor(time * 30) % 3;
        const len = 5 + f * 2 + (this.vy < -20 ? 8 : this.vy > 20 ? -3 : 0);
        const ny = y + h / 2 - 2;
        for (const nx of [x - 3, x + 1]) {
          ctx.fillStyle = 'rgba(255, 120, 40, 0.75)';
          ctx.fillRect(nx - 1, ny, 4, len);
          ctx.fillStyle = '#ffe14a';
          ctx.fillRect(nx, ny, 2, Math.max(2, len - 3));
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(nx, ny, 2, 2);
        }
        ctx.drawImage(this.sprite, x - w / 2, y - h / 2);
        // 기관포 발사 섬광
        if (this.muzzle > 0) {
          ctx.fillStyle = '#fff6c0';
          if (this.double > 0) {
            ctx.fillRect(x - 11, y - 10, 4, 4);
            ctx.fillRect(x + 7, y - 10, 4, 4);
          } else {
            ctx.fillRect(x - 2, y - 26, 4, 5);
            ctx.fillStyle = '#ffd23a';
            ctx.fillRect(x - 4, y - 24, 8, 2);
          }
        }
      }

      if (this.shield) {
        const r = 25 + Math.sin(time * 8) * 1.5;
        ctx.strokeStyle = `rgba(79, 240, 255, ${0.55 + Math.sin(time * 10) * 0.25})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  SS.Player = Player;
})();
