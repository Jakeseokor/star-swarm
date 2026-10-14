'use strict';
/* 탄환: 아군 탄 / 적 탄 / 적 사격 패턴 */
(function () {
  const SS = window.SS;
  const C = SS.CONFIG;
  let W = C.WIDTH, H = C.HEIGHT;
  SS.onView(() => { W = C.WIDTH; H = C.HEIGHT; });
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
      const glow = SS.FX.sprite('tracer');
      ctx.globalCompositeOperation = 'lighter';
      for (const b of list) ctx.drawImage(glow, b.x - 6, b.y - 12, 12, 26);
      ctx.globalCompositeOperation = 'source-over';
      for (const b of list) {
        // 예광탄: 꼬리가 긴 노란 탄
        const gr = ctx.createLinearGradient(0, b.y - 8, 0, b.y + 14);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, '#ffe14a'); gr.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(b.x - 1.2, b.y - 8, 2.4, 22);
      }
    },

    drawEnemy(ctx, list, time) {
      const orange = SS.FX.sprite('bullet'), pink = SS.FX.sprite('plasma');
      // 밝은 배경(사막·설원)에서도 보이도록 어두운 테두리 먼저
      ctx.fillStyle = 'rgba(20,6,4,0.75)';
      ctx.beginPath();
      for (const b of list) { ctx.moveTo(b.x + b.r + 2, b.y); ctx.arc(b.x, b.y, b.r + 2, 0, Math.PI * 2); }
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 1 + Math.sin(time * 20) * 0.12;
      for (const b of list) {
        const s = (b.style === 1 ? 22 : 16) * pulse;
        ctx.drawImage(b.style === 1 ? pink : orange, b.x - s / 2, b.y - s / 2, s, s);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff6dc';
      ctx.beginPath();
      for (const b of list) { ctx.moveTo(b.x + 1.6, b.y); ctx.arc(b.x, b.y, 1.6, 0, Math.PI * 2); }
      ctx.fill();
    },
  };

  SS.Bullet = Bullet;

  // ---- 빛 번짐 스프라이트 (폭발·탄환·불꽃·연기) ----
  const FXS = {};
  function radial(size, stops) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  }
  SS.FX = {
    sprite(name) {
      if (FXS[name]) return FXS[name];
      const defs = {
        fire: [[0, 'rgba(255,255,240,1)'], [0.2, 'rgba(255,230,120,0.95)'], [0.45, 'rgba(255,130,30,0.7)'], [0.75, 'rgba(200,40,10,0.25)'], [1, 'rgba(120,10,0,0)']],
        smoke: [[0, 'rgba(70,70,76,0.75)'], [0.6, 'rgba(60,60,66,0.35)'], [1, 'rgba(50,50,56,0)']],
        trail: [[0, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']],
        bullet: [[0, 'rgba(255,250,220,1)'], [0.3, 'rgba(255,150,40,0.9)'], [1, 'rgba(255,60,0,0)']],
        plasma: [[0, 'rgba(255,240,255,1)'], [0.3, 'rgba(255,80,220,0.9)'], [1, 'rgba(160,0,140,0)']],
        tracer: [[0, 'rgba(255,240,160,0.8)'], [1, 'rgba(255,170,40,0)']],
        spark: [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,220,120,0.8)'], [1, 'rgba(255,160,40,0)']],
        shield: [[0, 'rgba(120,240,255,0)'], [0.7, 'rgba(120,240,255,0.08)'], [0.9, 'rgba(160,250,255,0.55)'], [1, 'rgba(120,240,255,0)']],
      };
      FXS[name] = radial(64, defs[name]);
      return FXS[name];
    },
  };
})();
