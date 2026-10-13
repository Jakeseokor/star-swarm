'use strict';
/* 플레이어 기체 */
(function () {
  const SS = window.SS;
  const C = SS.CONFIG;
  const P = C.PLAYER;

  // 오리지널 픽셀아트 (13×12). W 흰색, B 파랑, C 시안(조종석), R 빨강
  SS.PLAYER_ART = [
    '......W......',
    '......W......',
    '.....WCW.....',
    '.....WCW.....',
    '....WWCWW....',
    '..R.WBBBW.R..',
    '..R.WBWBW.R..',
    '.RWWWWWWWWWR.',
    'RWWBWWWWWBWWR',
    'RW.BWWRWWB.WR',
    'R...WRRRW...R',
    '....R...R....',
  ];
  SS.PLAYER_PALETTE = { W: '#f4f4ff', B: '#3a7bff', C: '#5ef2ff', R: '#ff3b4e' };

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
      if (this.double > 0) {
        SS.Bullet.player(this.game, this.x - 7, this.y - 8);
        SS.Bullet.player(this.game, this.x + 7, this.y - 8);
      } else {
        SS.Bullet.player(this.game, this.x, this.y - 14);
      }
      SS.Audio.play('shoot');
    }

    draw(ctx, time) {
      if (!this.alive) return;
      if (!this.sprite) this.sprite = SS.Gfx.makeSprite(SS.PLAYER_ART, SS.PLAYER_PALETTE, 2);
      const x = Math.round(this.x), y = Math.round(this.y);
      const blinkOff = this.invuln > 0 && Math.floor(time * 16) % 2 === 0;

      if (!blinkOff) {
        // 엔진 불꽃 (전진 중엔 길게, 후진 중엔 짧게)
        const f = Math.floor(time * 30) % 3;
        const len = 3 + f + (this.vy < -20 ? 5 : this.vy > 20 ? -2 : 0);
        ctx.fillStyle = f === 0 ? '#ffe14a' : '#ff8a2e';
        ctx.fillRect(x - 7, y + 12, 2, len);
        ctx.fillRect(x + 5, y + 12, 2, len);
        ctx.drawImage(this.sprite, x - 13, y - 12);
      }

      if (this.shield) {
        const r = 20 + Math.sin(time * 8) * 1.5;
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
