'use strict';
/* 입력: 터치(Pointer Events) + 블루투스 키보드 */
(function () {
  const SS = window.SS;
  const C = SS.CONFIG;

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'fire', KeyZ: 'fire',
  };
  const BLOCK_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab'];

  const Input = {
    keys: { left: false, right: false, fire: false },
    pressed: [],          // 이번 프레임에 새로 눌린 키 코드
    taps: [],             // 이번 프레임의 터치 시작 지점 (게임 좌표)
    dragId: null,
    dragLastX: 0,
    dragDX: 0,            // 다음 프레임에 기체가 이동할 누적량 (게임 좌표)
    fireId: null,
    fireHeld: false,
    fireButton: null,     // 수동 발사 모드일 때 {x, y, r}
    usedKeyboard: false,
    canvas: null,

    init(canvas) {
      this.canvas = canvas;
      const opt = { passive: false };

      document.addEventListener('pointerdown', (e) => this.onDown(e), opt);
      document.addEventListener('pointermove', (e) => this.onMove(e), opt);
      document.addEventListener('pointerup', (e) => this.onUp(e), opt);
      document.addEventListener('pointercancel', (e) => this.onUp(e), opt);

      // 사파리 바운스·확대·롱프레스 메뉴·텍스트 선택 차단
      const block = (e) => e.preventDefault();
      document.addEventListener('touchstart', block, opt);
      document.addEventListener('touchmove', block, opt);
      document.addEventListener('touchend', (e) => { SS.Audio.unlock(); e.preventDefault(); }, opt);
      ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'selectstart', 'dblclick']
        .forEach((t) => document.addEventListener(t, block, opt));

      window.addEventListener('keydown', (e) => {
        SS.Audio.unlock();
        this.usedKeyboard = true;
        if (BLOCK_KEYS.includes(e.code)) e.preventDefault();
        if (!e.repeat) this.pressed.push(e.code);
        const k = KEYMAP[e.code];
        if (k) this.keys[k] = true;
      });
      window.addEventListener('keyup', (e) => {
        const k = KEYMAP[e.code];
        if (k) this.keys[k] = false;
      });
      window.addEventListener('blur', () => this.reset());
    },

    reset() {
      this.keys.left = this.keys.right = this.keys.fire = false;
      this.dragId = this.fireId = null;
      this.fireHeld = false;
      this.dragDX = 0;
    },

    toGame(cx, cy) {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: ((cx - r.left) / r.width) * C.WIDTH,
        y: ((cy - r.top) / r.height) * C.HEIGHT,
      };
    },

    inFireButton(p) {
      const b = this.fireButton;
      if (!b) return false;
      if (p.x > C.WIDTH) return true; // 가로 모드: 오른쪽 레터박스 영역 전체가 발사 버튼
      const dx = p.x - b.x, dy = p.y - b.y, r = b.r + 14;
      return dx * dx + dy * dy <= r * r;
    },

    onDown(e) {
      e.preventDefault();
      SS.Audio.unlock();
      const p = this.toGame(e.clientX, e.clientY);
      this.taps.push(p);
      if (this.inFireButton(p)) {
        this.fireId = e.pointerId;
        this.fireHeld = true;
        return;
      }
      if (this.dragId === null) {
        this.dragId = e.pointerId;
        this.dragLastX = p.x;
      }
    },

    onMove(e) {
      if (e.pointerId !== this.dragId) return;
      e.preventDefault();
      const p = this.toGame(e.clientX, e.clientY);
      this.dragDX += (p.x - this.dragLastX) * C.PLAYER.dragSensitivity;
      this.dragLastX = p.x;
    },

    onUp(e) {
      if (e.pointerId === this.dragId) this.dragId = null;
      if (e.pointerId === this.fireId) {
        this.fireId = null;
        this.fireHeld = false;
      }
    },

    takeDrag() {
      const d = this.dragDX;
      this.dragDX = 0;
      return d;
    },

    wasPressed(...codes) {
      return codes.some((c) => this.pressed.includes(c));
    },

    endFrame() {
      this.pressed.length = 0;
      this.taps.length = 0;
    },
  };

  SS.Input = Input;
})();
