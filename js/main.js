'use strict';
/* 메인: 게임 루프, 상태 전환, 충돌, 이펙트, 저장 */
(function () {
  const SS = window.SS;
  const C = SS.CONFIG;
  const W = C.WIDTH, H = C.HEIGHT;

  function rand(a, b) { return a + Math.random() * (b - a); }

  const DEFAULT_SAVE = { hi: 0, unlocked: 1, sound: true, music: true, fireMode: 'auto', cleared: false };

  function loadSave() {
    try {
      const raw = JSON.parse(localStorage.getItem(C.STORAGE_KEY) || '{}');
      return Object.assign({}, DEFAULT_SAVE, raw);
    } catch (e) {
      return Object.assign({}, DEFAULT_SAVE);
    }
  }

  const ENEMY_COLORS = {
    grunt: ['#38d86b', '#ffe14a', '#ffffff'],
    striker: ['#ff4fd8', '#ff2a3d', '#ffa531'],
    commander: ['#9b5cff', '#ffb02e', '#ffffff'],
  };
  const WORLD_STATES = ['playing', 'paused', 'stageclear', 'gameover'];

  class Game {
    constructor() {
      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d');
      this.wrap = document.getElementById('wrap');
      this.save = loadSave();
      SS.Audio.setEnabled(this.save.sound);
      SS.Audio.setMusicEnabled(this.save.music);
      SS.Input.init(this.canvas);

      this.ui = new SS.UI(this);
      this.player = new SS.Player(this);
      this.pBullets = [];
      this.eBullets = [];
      this.particles = [];
      this.popups = [];
      this.powerups = [];
      this.stage = null;
      this.state = 'title';
      this.stateTime = 0;
      this.time = 0;
      this.shake = 0;
      this.score = 0;
      this.lives = C.START_LIVES;
      this.bombs = C.BOMB.start;
      this.bombWave = null;
      this.flash = 0;
      this.nextExtra = C.EXTRA_LIFE_EVERY;
      this.loop = 1;
      this.speedMul = 1;
      this.stageNum = 1;
      this.stageIntro = 0;
      this.clearDelay = -1;
      this.gameOverDelay = -1;
      this.clearInfo = null;
      this.newRecord = false;
      this.runStartHi = 0;
      this.shots = 0;
      this.hits = 0;
      this.deaths = 0;
      this.stars = this.makeStars();
      this.showFps = /debug/.test(location.search);
      this.fps = 60;

      this.resize();
      const onResize = () => this.resize();
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
      if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this.state === 'playing') this.pause();
          SS.Audio.suspend();
        } else {
          SS.Audio.resume();
        }
      });

      this.last = performance.now();
      const frame = (ts) => {
        requestAnimationFrame(frame);
        let dt = (ts - this.last) / 1000;
        this.last = ts;
        if (!(dt > 0)) dt = 0;
        if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
        this.update(Math.min(dt, C.MAX_DT));
        this.render();
        SS.Input.endFrame();
      };
      requestAnimationFrame(frame);
    }

    // ---------------- 화면 크기 / 레터박스 ----------------
    resize() {
      const cs = getComputedStyle(this.wrap);
      const aw = this.wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const ah = this.wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const scale = Math.max(0.1, Math.min(aw / W, ah / H));
      const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
      this.canvas.style.width = cssW + 'px';
      this.canvas.style.height = cssH + 'px';
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      this.canvas.width = Math.round(cssW * dpr);
      this.canvas.height = Math.round(cssH * dpr);
    }

    // ---------------- 저장 ----------------
    persist() {
      try { localStorage.setItem(C.STORAGE_KEY, JSON.stringify(this.save)); } catch (e) { /* 사생활 보호 모드 등 */ }
    }

    updateHi() {
      if (this.score > this.save.hi) {
        this.save.hi = this.score;
        this.persist();
      }
    }

    toggleSound() {
      this.save.sound = !this.save.sound;
      SS.Audio.setEnabled(this.save.sound);
      this.persist();
    }

    toggleMusic() {
      this.save.music = !this.save.music;
      SS.Audio.setMusicEnabled(this.save.music);
      this.persist();
    }

    toggleFireMode() {
      this.save.fireMode = this.save.fireMode === 'auto' ? 'manual' : 'auto';
      this.persist();
    }

    resetRecords() {
      this.save.hi = 0;
      this.save.unlocked = 1;
      this.save.cleared = false;
      this.persist();
    }

    // ---------------- 상태 전환 ----------------
    goto(state) {
      this.state = state;
      this.stateTime = 0;
      SS.Input.fireButton = state === 'playing' && this.save.fireMode === 'manual' ? SS.UI.FIRE_BTN : null;
      SS.Input.bombButton = state === 'playing' ? SS.UI.BOMB_BTN : null;
    }

    startGame(stageNum) {
      this.loop = 1;
      this.speedMul = 1;
      this.score = 0;
      this.lives = C.START_LIVES;
      this.bombs = C.BOMB.start;
      this.nextExtra = C.EXTRA_LIFE_EVERY;
      this.runStartHi = this.save.hi;
      this.newRecord = false;
      this.startStage(stageNum);
    }

    startStage(n) {
      this.stageNum = n;
      this.speedMul = Math.pow(C.LOOP_SPEED_MULT, this.loop - 1);
      this.stage = new SS.Stage(this, n);
      this.pBullets.length = 0;
      this.eBullets.length = 0;
      this.powerups.length = 0;
      this.popups.length = 0;
      this.bombWave = null;
      this.flash = 0;
      this.player.resetFull();
      this.deaths = 0;
      this.shots = 0;
      this.hits = 0;
      this.stageIntro = 2.6;
      this.clearDelay = -1;
      this.gameOverDelay = -1;
      this.goto('playing');
      SS.Audio.play('stageStart');
    }

    pause() {
      if (this.state !== 'playing') return;
      this.goto('paused');
      SS.Input.reset();
      SS.Audio.play('pause');
    }

    resume() { this.goto('playing'); }

    retry() {
      const loop = this.loop;
      this.startGame(this.stageNum);
      if (loop > 1) { this.loop = loop; this.startStage(this.stageNum); }
    }

    quitToTitle() {
      this.updateHi();
      this.stage = null;
      this.goto('title');
    }

    stageClear() {
      const base = C.SCORE.stageClearBase * this.stageNum;
      const noMiss = this.deaths === 0 ? C.SCORE.noMissBonus : 0;
      const ratio = this.shots ? Math.round((this.hits / this.shots) * 100) : 0;
      this.clearInfo = { base, noMiss, ratio };
      this.addScore(base + noMiss);
      this.save.unlocked = Math.max(this.save.unlocked, Math.min(5, this.stageNum + 1));
      this.updateHi();
      this.persist();
      this.clearEnemyBullets();
      this.goto('stageclear');
      SS.Audio.play('stageClear');
    }

    advanceAfterClear() {
      if (this.state !== 'stageclear') return;
      if (this.stageNum < 5) {
        this.startStage(this.stageNum + 1);
      } else {
        this.save.cleared = true;
        this.updateHi();
        this.persist();
        this.goto('ending');
        SS.Audio.play('ending');
      }
    }

    startNextLoop() {
      this.loop++;
      this.startStage(1);
    }

    gameOver() {
      this.newRecord = this.score > this.runStartHi;
      this.updateHi();
      this.goto('gameover');
      SS.Audio.play('gameOver');
    }

    // ---------------- 점수 / 이펙트 ----------------
    addScore(pts) {
      this.score += pts;
      while (this.score >= this.nextExtra) {
        this.nextExtra += C.EXTRA_LIFE_EVERY;
        if (this.lives < C.MAX_LIVES) {
          this.lives++;
          this.popup(W / 2, 330, '1UP!', '#38d86b');
          SS.Audio.play('extraLife');
        }
      }
    }

    explode(x, y, colors, count, speed, life) {
      count = count || 14;
      speed = speed || 120;
      life = life || 0.6;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.3 + Math.random() * 0.7);
        this.particles.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: life * (0.5 + Math.random() * 0.5), max: life,
          color: colors[i % colors.length], size: Math.random() < 0.3 ? 3 : 2,
        });
      }
      if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
    }

    popup(x, y, text, color) {
      this.popups.push({ x, y, text: String(text), color: color || '#ffffff', life: 0.9 });
    }

    clearEnemyBullets() {
      for (const b of this.eBullets) this.explode(b.x, b.y, ['#ffffff'], 2, 40, 0.3);
      this.eBullets.length = 0;
    }

    makeStars() {
      const cols = ['#ffffff', '#9fb0ff', '#ffe14a', '#ff8ad8', '#5ef2ff'];
      const stars = [];
      for (let i = 0; i < 90; i++) {
        const layer = i % 3;
        stars.push({
          x: Math.random() * W, y: Math.random() * H,
          speed: [18, 40, 80][layer], size: layer === 2 ? 2 : 1,
          color: cols[Math.floor(Math.random() * cols.length)], phase: Math.random() * 10,
        });
      }
      return stars;
    }

    // ---------------- 업데이트 ----------------
    update(dt) {
      this.time += dt;
      this.stateTime += dt;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
      SS.Audio.setMusic(this.musicFor());
      SS.Audio.updateMusic();

      const warp = this.state === 'playing' && this.stageIntro > 0 ? 3 : this.state === 'paused' ? 0 : 1;
      for (const s of this.stars) {
        s.y += s.speed * dt * warp;
        if (s.y > H) { s.y -= H; s.x = Math.random() * W; }
      }

      this.ui.update(dt);

      if (this.state === 'playing') this.updatePlaying(dt);
      else if (this.state === 'stageclear') {
        this.player.update(dt, false);
        this.updateEffects(dt);
        if (this.stateTime > 6) this.advanceAfterClear();
      } else if (this.state === 'gameover') {
        if (this.stage) this.stage.update(dt);
        SS.Bullet.update(this.eBullets, dt);
        this.updateEffects(dt);
      }
    }

    // 화면 상태에 맞는 배경음악
    musicFor() {
      switch (this.state) {
        case 'title': case 'select': case 'settings': case 'ending':
          return 'title';
        case 'playing': {
          if (this.stageIntro > 0.6 || !this.player.alive && this.lives <= 0) return null; // 시작 징글 중 / 게임오버 직전
          const st = this.stage;
          return st && (st.warningStarted || st.bossSpawned) && !(st.boss && st.boss.dead) ? 'boss' : 'stage';
        }
        default:
          return null; // 일시정지·클리어·게임오버: 정지
      }
    }

    // ---------------- 폭탄 ----------------
    useBomb() {
      const p = this.player;
      if (!p.alive || this.bombWave || this.stageIntro > 0) return;
      if (this.bombs <= 0) { SS.Audio.play('bombEmpty'); return; }
      this.bombs--;
      this.bombWave = { x: p.x, y: p.y, t: 0, r: 0 };
      p.invuln = Math.max(p.invuln, C.BOMB.invuln);
      this.flash = 0.35;
      this.shake = 0.6;
      this.clearEnemyBullets();
      const boss = this.stage.boss;
      if (boss && !boss.dead && boss.state === 'fight' && boss.invuln <= 0) {
        if (boss.hit(C.BOMB.bossDamage) === 'kill') this.onBossKilled(boss);
      }
      SS.Audio.play('bomb');
    }

    updateBomb(dt) {
      const w = this.bombWave;
      if (!w) return;
      w.t += dt;
      w.r = C.BOMB.radius * Math.min(1, w.t / C.BOMB.duration);
      const r2 = w.r * w.r;
      for (const e of this.stage.enemies) {
        if (!e.active || e.y < -10) continue;
        const dx = e.x - w.x, dy = e.y - w.y;
        if (dx * dx + dy * dy < r2) {
          e.hp = 1;
          e.hit();
          this.onEnemyKilled(e);
        }
      }
      for (let i = this.eBullets.length - 1; i >= 0; i--) {
        const b = this.eBullets[i], dx = b.x - w.x, dy = b.y - w.y;
        if (dx * dx + dy * dy < r2) this.eBullets.splice(i, 1);
      }
      if (w.t >= C.BOMB.duration + 0.25) this.bombWave = null;
    }

    updatePlaying(dt) {
      const p = this.player;
      if (this.stageIntro > 0) this.stageIntro -= dt;
      this.stage.update(dt);
      if (SS.Input.bombPressed || SS.Input.wasPressed('KeyX', 'KeyB')) this.useBomb();
      this.updateBomb(dt);

      const before = this.pBullets.length;
      p.update(dt, true);
      this.shots += Math.max(0, this.pBullets.length - before);

      if (!p.alive) {
        if (this.lives > 0) {
          p.respawnTimer -= dt;
          if (p.respawnTimer <= 0) p.respawn();
        } else if (this.gameOverDelay < 0) {
          this.gameOverDelay = 2.2;
        }
      }
      if (this.gameOverDelay >= 0) {
        this.gameOverDelay -= dt;
        if (this.gameOverDelay < 0) { this.gameOver(); return; }
      }

      SS.Bullet.update(this.pBullets, dt);
      SS.Bullet.update(this.eBullets, dt);
      this.updatePowerups(dt);
      this.collisions();
      this.updateEffects(dt);

      if (this.stage.isComplete() && p.alive) {
        if (this.clearDelay < 0) this.clearDelay = this.stage.cfg.boss ? 1.8 : 1.0;
        this.clearDelay -= dt;
        if (this.clearDelay <= 0) this.stageClear();
      }
    }

    updateEffects(dt) {
      let n = 0;
      for (const q of this.particles) {
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vx *= 0.97;
        q.vy *= 0.97;
        q.life -= dt;
        if (q.life > 0) this.particles[n++] = q;
      }
      this.particles.length = n;
      this.popups = this.popups.filter((t) => { t.life -= dt; t.y -= 30 * dt; return t.life > 0; });
    }

    updatePowerups(dt) {
      const p = this.player;
      this.powerups = this.powerups.filter((u) => {
        u.y += C.POWERUP.fallSpeed * dt;
        u.t += dt;
        if (p.alive && Math.abs(u.x - p.x) < 20 && Math.abs(u.y - p.y) < 18) {
          this.applyPowerup(u.type);
          return false;
        }
        return u.y < H + 20;
      });
    }

    dropPowerup(x, y) {
      const w = C.POWERUP.weights;
      const total = w.double + w.shield + w.rapid + w.bomb;
      let r = Math.random() * total;
      let type = 'double';
      for (const k of ['double', 'shield', 'rapid', 'bomb']) { if ((r -= w[k]) < 0) { type = k; break; } }
      this.powerups.push({ x, y, type, t: 0 });
    }

    applyPowerup(type) {
      const p = this.player, P = C.POWERUP;
      if (type === 'double') { p.double = P.doubleTime; this.popup(p.x, p.y - 30, 'DOUBLE!', '#ffd23a'); }
      if (type === 'rapid') { p.rapid = P.rapidTime; this.popup(p.x, p.y - 30, 'RAPID!', '#ff5ad1'); }
      if (type === 'shield') { p.shield = true; this.popup(p.x, p.y - 30, 'SHIELD!', '#4ff0ff'); }
      this.addScore(100);
      if (type === 'bomb') {
        this.bombs = Math.min(C.BOMB.max, this.bombs + 1);
        this.popup(p.x, p.y - 30, 'BOMB +1', '#ff8a2e');
        SS.Audio.play('bombGet');
        return;
      }
      SS.Audio.play('powerup');
    }

    // ---------------- 충돌 ----------------
    collisions() {
      const p = this.player, st = this.stage;

      for (let i = this.pBullets.length - 1; i >= 0; i--) {
        const b = this.pBullets[i];
        let used = false;
        for (const e of st.enemies) {
          if (!e.active) continue;
          const dx = e.x - b.x, dy = e.y - b.y, rr = e.radius + b.r;
          if (dx * dx + dy * dy < rr * rr) {
            used = true;
            this.hits++;
            if (e.hit()) this.onEnemyKilled(e);
            else this.explode(b.x, b.y, ['#ffffff', '#5ef2ff'], 5, 80, 0.25);
            break;
          }
        }
        const boss = st.boss;
        if (!used && boss && !boss.dead && boss.state !== 'dying' && boss.contains(b.x, b.y)) {
          used = true;
          const r = boss.hit(1);
          if (r === 'block') this.explode(b.x, b.y, ['#9fb0ff'], 3, 60, 0.2);
          else {
            this.hits++;
            this.explode(b.x, b.y, ['#ffe14a', '#ffffff'], 4, 90, 0.25);
            if (r === 'kill') this.onBossKilled(boss);
          }
        }
        if (used) this.pBullets.splice(i, 1);
      }

      if (!p.alive || p.invuln > 0) return;

      const hr = C.PLAYER.hitRadius;
      for (let i = this.eBullets.length - 1; i >= 0; i--) {
        const b = this.eBullets[i];
        const dx = b.x - p.x, dy = b.y - p.y, rr = hr + b.r;
        if (dx * dx + dy * dy < rr * rr) {
          this.eBullets.splice(i, 1);
          this.playerHit();
          return;
        }
      }

      for (const e of st.enemies) {
        if (!e.active || e.state === 'formation') continue;
        const dx = e.x - p.x, dy = e.y - p.y, rr = e.radius * 0.8 + 9;
        if (dx * dx + dy * dy < rr * rr) {
          e.dead = true;
          this.onEnemyKilled(e);
          this.playerHit();
          return;
        }
      }
    }

    onBossKilled(boss) {
      this.addScore(C.SCORE.boss);
      this.popup(boss.x, boss.y + 30, C.SCORE.boss, '#ffd23a');
      this.clearEnemyBullets();
      SS.Audio.play('bossDie');
    }

    onEnemyKilled(e) {
      const diving = e.state !== 'formation';
      const pts = C.SCORE[e.type][diving ? 'diving' : 'formation'];
      this.addScore(pts);
      if (diving) this.popup(e.x, e.y, pts, '#ffffff');
      this.explode(e.x, e.y, ENEMY_COLORS[e.type], 16, 130);
      SS.Audio.play('enemyDie');
      const P = C.POWERUP;
      const chance = P.dropChance + (diving ? P.divingDropBonus : 0);
      if (this.powerups.length < P.maxOnScreen && Math.random() < chance) this.dropPowerup(e.x, e.y);
    }

    playerHit() {
      const p = this.player;
      if (p.shield) {
        p.shield = false;
        p.invuln = 1.2;
        this.explode(p.x, p.y, ['#4ff0ff', '#ffffff'], 18, 160, 0.5);
        SS.Audio.play('shieldBreak');
        return;
      }
      p.die();
      this.lives--;
      this.bombs = Math.max(this.bombs, C.BOMB.minAfterDeath);
      this.deaths++;
      this.shake = 0.5;
      this.explode(p.x, p.y, ['#ffffff', '#ff3b4e', '#ffe14a', '#3a7bff'], 40, 200, 1.0);
      SS.Audio.play('playerDie');
    }

    // ---------------- 렌더 ----------------
    render() {
      const ctx = this.ctx, cv = this.canvas;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#03030f';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
      ctx.imageSmoothingEnabled = false;

      ctx.save();
      if (this.shake > 0) ctx.translate(Math.round(rand(-4, 4) * this.shake * 2), Math.round(rand(-4, 4) * this.shake * 2));

      for (const s of this.stars) {
        if (Math.sin(this.time * 3 + s.phase) < -0.6) continue; // 반짝임
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
      }

      if (this.stage && WORLD_STATES.includes(this.state)) this.drawWorld(ctx);
      ctx.restore();

      if (this.flash > 0) {
        ctx.fillStyle = `rgba(255, 240, 210, ${Math.min(0.75, this.flash * 2.2)})`;
        ctx.fillRect(0, 0, W, H);
      }

      this.ui.draw(ctx);

      if (this.showFps) SS.Gfx.text(ctx, Math.round(this.fps) + 'FPS', 4, H - 34, { size: 1, color: '#38d86b' });
    }

    drawWorld(ctx) {
      const t = this.time;
      this.stage.draw(ctx, t);

      for (const u of this.powerups) {
        const x = Math.round(u.x), y = Math.round(u.y);
        const c = SS.UI.PU_COLORS[u.type];
        const on = Math.floor(u.t * 6) % 2 === 0;
        ctx.fillStyle = on ? c : '#ffffff';
        ctx.fillRect(x - 8, y - 6, 16, 12);
        ctx.fillRect(x - 6, y - 8, 12, 16);
        ctx.fillStyle = '#10102a';
        ctx.fillRect(x - 5, y - 5, 10, 10);
        SS.Gfx.text(ctx, SS.UI.PU_LETTER[u.type], x - 2, y - 3, { size: 1, color: c });
      }

      const w = this.bombWave;
      if (w) {
        const fade = Math.max(0, 1 - w.t / (C.BOMB.duration + 0.25));
        ctx.lineWidth = 6;
        ctx.strokeStyle = `rgba(255, 138, 46, ${fade})`;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(255, 255, 255, ${fade})`;
        ctx.beginPath();
        ctx.arc(w.x, w.y, Math.max(0, w.r - 10), 0, Math.PI * 2);
        ctx.stroke();
      }

      SS.Bullet.drawPlayer(ctx, this.pBullets);
      SS.Bullet.drawEnemy(ctx, this.eBullets, t);
      this.player.draw(ctx, t);

      for (const q of this.particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, q.life / q.max * 1.5));
        ctx.fillStyle = q.color;
        ctx.fillRect(Math.round(q.x), Math.round(q.y), q.size, q.size);
      }
      ctx.globalAlpha = 1;
      for (const p of this.popups) {
        SS.Gfx.text(ctx, p.text, p.x, p.y, { size: 1, color: p.color, align: 'center' });
      }
    }
  }

  window.addEventListener('load', () => {
    SS.game = new Game();
    // PWA 오프라인 캐시 (http/https에서만. Capacitor 등 앱 래핑 환경에서는 건너뜀)
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('service-worker.js').catch(() => { /* 무시 */ });
    }
  });
})();
