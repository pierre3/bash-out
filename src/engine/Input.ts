const DOUBLE_TAP_THRESHOLD = 0.30; // 秒。前回のフレッシュ押下からこの時間内に再押下でダブルタップ判定

export type BoostDirection = 'left' | 'right';

export interface ButtonRect { x: number; y: number; w: number; h: number }

// 仮想方向ボタンの矩形（論理座標）。HUD 左右の余白に配置（中央のゲージ群と被らない）
const TOUCH_LEFT_BUTTON: ButtonRect = { x: 10, y: 878, w: 142, h: 72 };
const TOUCH_RIGHT_BUTTON: ButtonRect = { x: 388, y: 878, w: 142, h: 72 };

export class Input {
  private keys = new Set<string>();
  private prevKeys = new Set<string>();
  private lastFreshPress: Record<string, number> = {};
  private boostTrigger: BoostDirection | null = null;
  private pointerDownPos: { x: number; y: number } | null = null;
  /** 仮想ボタンを押している pointer ID 一覧（マルチタッチ対応） */
  private leftPointerIds = new Set<number>();
  private rightPointerIds = new Set<number>();

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      // フレッシュ押下のみ（リピート除外）でダブルタップ判定
      if (!e.repeat && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        const now = performance.now() / 1000;
        const last = this.lastFreshPress[e.code] ?? 0;
        if (now - last < DOUBLE_TAP_THRESHOLD) {
          this.boostTrigger = e.code === 'ArrowLeft' ? 'left' : 'right';
        }
        this.lastFreshPress[e.code] = now;
      }
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    // タップ・クリックを論理座標に変換して、仮想ボタン → スキル吹き出しなどへ振り分け
    canvas.addEventListener('pointerdown', (e) => {
      const pos = this.toLogicalCoords(canvas, e);

      // 仮想方向ボタンに当たれば、そちらを優先処理（pointerDownPos には記録しない）
      if (Input.inRect(pos, TOUCH_LEFT_BUTTON)) {
        this.handleVirtualButtonPress('left', e.pointerId);
        e.preventDefault();
        return;
      }
      if (Input.inRect(pos, TOUCH_RIGHT_BUTTON)) {
        this.handleVirtualButtonPress('right', e.pointerId);
        e.preventDefault();
        return;
      }

      // それ以外（HUDの基本技吹き出しなど）は consumePointerDownIn で消費される
      this.pointerDownPos = pos;
    });

    // 指が離れた / キャンセル / canvasの外に出た場合に確実に解放するため window で受ける
    const releasePointer = (e: PointerEvent) => {
      if (this.leftPointerIds.delete(e.pointerId) || this.rightPointerIds.delete(e.pointerId)) {
        // ボタン解放系イベントはここで完結
      }
    };
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
  }

  private toLogicalCoords(canvas: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const logicalW = canvas.width / dpr;
    const logicalH = canvas.height / dpr;
    return {
      x: (e.clientX - rect.left) * (logicalW / rect.width),
      y: (e.clientY - rect.top) * (logicalH / rect.height),
    };
  }

  private static inRect(p: { x: number; y: number }, r: ButtonRect): boolean {
    return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  }

  /**
   * 仮想ボタンを押下した時の処理。状態が「未押下→押下」へ遷移したフレッシュな
   * 押下のみダブルタップ判定対象とする（多指同時押しの2本目では発火しない）。
   */
  private handleVirtualButtonPress(dir: BoostDirection, pointerId: number): void {
    const set = dir === 'left' ? this.leftPointerIds : this.rightPointerIds;
    const wasEmpty = set.size === 0;
    set.add(pointerId);
    if (wasEmpty) {
      const key = dir === 'left' ? 'VirtualLeft' : 'VirtualRight';
      const now = performance.now() / 1000;
      const last = this.lastFreshPress[key] ?? 0;
      if (now - last < DOUBLE_TAP_THRESHOLD) {
        this.boostTrigger = dir;
      }
      this.lastFreshPress[key] = now;
    }
  }

  /** Call at the end of each frame to snapshot state */
  endFrame(): void {
    this.prevKeys = new Set(this.keys);
    this.boostTrigger = null;
    this.pointerDownPos = null;
  }

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  isKeyPressed(code: string): boolean {
    return this.keys.has(code) && !this.prevKeys.has(code);
  }

  // --- Action-based API ---

  isLeft(): boolean {
    return this.isKeyDown('ArrowLeft') || this.leftPointerIds.size > 0;
  }

  isRight(): boolean {
    return this.isKeyDown('ArrowRight') || this.rightPointerIds.size > 0;
  }

  isCharging(): boolean {
    return this.isLeft() && this.isRight();
  }

  /** 仮想ボタンの矩形（HUDが描画位置を取得するため） */
  getTouchButtonBounds(): { left: ButtonRect; right: ButtonRect } {
    return { left: TOUCH_LEFT_BUTTON, right: TOUCH_RIGHT_BUTTON };
  }

  isLeftButtonHeld(): boolean { return this.leftPointerIds.size > 0; }
  isRightButtonHeld(): boolean { return this.rightPointerIds.size > 0; }

  isSkillActivate(): boolean {
    return this.isKeyPressed('ArrowUp');
  }

  /** ダブルタップ（同方向の素早い連打）でブーストトリガを取得。1フレームに1度だけ取得可 */
  consumeBoostTrigger(): BoostDirection | null {
    const t = this.boostTrigger;
    this.boostTrigger = null;
    return t;
  }

  /**
   * 指定された矩形領域内にポインタダウンがあったかを判定し、あればトリガを消費する。
   * 領域外の場合は false を返し、ポインタは残るので別の領域でも判定可能。
   */
  consumePointerDownIn(x: number, y: number, w: number, h: number): boolean {
    const p = this.pointerDownPos;
    if (!p) return false;
    if (p.x >= x && p.x < x + w && p.y >= y && p.y < y + h) {
      this.pointerDownPos = null;
      return true;
    }
    return false;
  }

  /** 単に座標の有無を見たい場合（消費しない） */
  getPointerDownPos(): { x: number; y: number } | null {
    return this.pointerDownPos;
  }
}
