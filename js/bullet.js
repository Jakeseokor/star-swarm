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
        // 예광탄: 꼬리가 긴 노란 탄
        ctx.fillStyle = 'rgba(255, 170, 40, 0.55)';
        ctx.fillRect(x - 1, y - 2, 3, 14);
        ctx.fillStyle = '#ffe14a';
        ctx.fillRect(x - 1, y - 7, 3, 9);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y - 7, 1, 5);
      }
    },

    drawEnemy(ctx, list, time) {
      const blink = Math.floor(time * 12) % 2 === 0;
      for (const b of list) {
        const x = Math.round(b.x), y = Math.round(b.y);
        if (b.style === 1) { // 보스 탄: 분홍 플라스마 탄
          ctx.fillStyle = blink ? '#ff4fd8' : '#c0208a';
          ctx.fillRect(x - 3, y - 4, 6, 8);
          ctx.fillRect(x - 4, y - 3, 8, 6);
          ctx.fillStyle = '#fff6c0';
          ctx.fillRect(x - 1, y - 2, 2, 4);
        } else { // 일반 탄: 붉게 달아오른 기관포탄
          ctx.fillStyle = blink ? '#ff3b1e' : '#ff8a2e';
          ctx.fillRect(x - 2, y - 3, 4, 6);
          ctx.fillRect(x - 3, y - 2, 6, 4);
          ctx.fillStyle = '#fff2c0';
          ctx.fillRect(x - 1, y - 1, 2, 2);
        }
      }
    },
  };

  SS.Bullet = Bullet;
})();
