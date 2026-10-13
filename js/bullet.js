'use strict';
/* 탄환: 아군 탄 / 적 탄 / 적 사격 패턴 */
(function () {
  const SS = window.SS;
  const C = SS.CONFIG;
  const W = C.WIDTH, H = C.HEIGHT;
  const HALF_PI = Math.PI / 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  const Bullet = {
    player(game, x, y) {
      game.pBullets.push({ x, y, vx: 0, vy: -C.PLAYER.bulletSpeed, r: 3 });
    },

    // angle: 라디안 (PI/2 = 아래), speed는 회차 배율이 자동 적용됨
    enemy(game, x, y, angle, speed, style) {
      if (game.eBullets.length >= C.MAX_ENEMY_BULLETS) return;
      const s = speed * game.speedMul;
      game.eBullets.push({
        x, y, vx: Math.cos(angle) * s, vy: Math.sin(angle) * s,
        r: style === 1 ? 4 : 3, style: style || 0,
      });
    },

    aimAngle(game, x, y) {
      const p = game.player;
      return Math.atan2(p.y - y, p.x - x);
    },

    // 적 사격 패턴
    pattern(game, x, y, mode, speed) {
      speed = speed || C.ENEMY_BULLET_SPEED;
      // 위쪽 적이 옆으로 쏘지 않도록 조준 각도를 아래쪽 원뿔로 제한
      const aim = clamp(this.aimAngle(game, x, y), HALF_PI - 0.8, HALF_PI + 0.8);
      switch (mode) {
        case 'straight':
          this.enemy(game, x, y, HALF_PI, speed);
          break;
        case 'aimed':
          this.enemy(game, x, y, aim, speed * 1.05);
          break;
        case 'spread3':
          for (let i = -1; i <= 1; i++) this.enemy(game, x, y, aim + i * 0.26, speed);
          break;
        case 'barrage':
          for (let i = -2; i <= 2; i++) this.enemy(game, x, y, aim + i * 0.18, speed * 1.05);
          break;
      }
    },

    update(list, dt) {
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.y > -20 && b.y < H + 20 && b.x > -20 && b.x < W + 20) list[n++] = b;
      }
      list.length = n;
    },

    drawPlayer(ctx, list) {
      for (const b of list) {
        const x = Math.round(b.x), y = Math.round(b.y);
        ctx.fillStyle = '#5ef2ff';
        ctx.fillRect(x - 1, y - 6, 3, 11);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y - 5, 1, 7);
      }
    },

    drawEnemy(ctx, list, time) {
      const blink = Math.floor(time * 12) % 2 === 0;
      for (const b of list) {
        const x = Math.round(b.x), y = Math.round(b.y);
        if (b.style === 1) { // 보스 탄: 둥근 오브
          ctx.fillStyle = blink ? '#ffb02e' : '#ff5a1f';
          ctx.fillRect(x - 3, y - 4, 6, 8);
          ctx.fillRect(x - 4, y - 3, 8, 6);
          ctx.fillStyle = '#fff6c0';
          ctx.fillRect(x - 1, y - 2, 2, 4);
        } else { // 일반 탄: 마름모
          ctx.fillStyle = blink ? '#ff4fd8' : '#ffffff';
          ctx.fillRect(x - 1, y - 4, 2, 8);
          ctx.fillRect(x - 3, y - 1, 6, 2);
          ctx.fillStyle = blink ? '#ffffff' : '#ff4fd8';
          ctx.fillRect(x - 1, y - 1, 2, 2);
        }
      }
    },
  };

  SS.Bullet = Bullet;
})();
