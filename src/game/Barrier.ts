import type { Renderer } from '../engine/Renderer';

const MEMBRANE_HEIGHT = 5;            // ブロック高さ20の約1/4
const MEMBRANE_COLS = 8;
const MEMBRANE_SIDE_PADDING = 10;
const MEMBRANE_GAP_FROM_PADDLE = 16;  // 膜の下端からパドル上端までの距離

export interface Membrane {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
}

/**
 * バリア。パドル上に薄い透明膜が一列に並ぶ防御スキル。
 *  - ボールに当たると膜が1個ずつ破壊される
 *  - 時間で消えない。全部破壊されるまで残る
 *  - 再発動で全列リセット
 */
export class Barrier {
  private membranes: Membrane[] = [];
  private canvasWidth: number;

  constructor(canvasWidth: number, _canvasHeight: number) {
    this.canvasWidth = canvasWidth;
  }

  /** 指定したパドル上端 y を基準に膜を一列展開（既存は置き換え） */
  activate(paddleY: number): void {
    this.membranes = [];
    const totalWidth = this.canvasWidth - MEMBRANE_SIDE_PADDING * 2;
    const w = totalWidth / MEMBRANE_COLS;
    const y = paddleY - MEMBRANE_GAP_FROM_PADDLE - MEMBRANE_HEIGHT;
    for (let i = 0; i < MEMBRANE_COLS; i++) {
      this.membranes.push({
        x: MEMBRANE_SIDE_PADDING + i * w,
        y,
        width: w,
        height: MEMBRANE_HEIGHT,
        active: true,
      });
    }
  }

  /** 1つでも生きている膜があれば true（全破壊されるまで active） */
  get active(): boolean {
    for (const m of this.membranes) if (m.active) return true;
    return false;
  }

  /** 衝突判定対象の膜配列。caller は !active をスキップする想定 */
  getMembranes(): readonly Membrane[] {
    return this.membranes;
  }

  update(_dt: number): void {
    // 時間で消えないので何もしない
  }

  draw(renderer: Renderer): void {
    const ctx = renderer.ctx;
    for (const m of this.membranes) {
      if (!m.active) continue;
      this.drawMembrane(ctx, m);
    }
  }

  private drawMembrane(ctx: CanvasRenderingContext2D, m: Membrane): void {
    // 周囲の薄いグロー（膜を浮かせる）
    ctx.fillStyle = 'rgba(150, 220, 255, 0.18)';
    ctx.beginPath();
    ctx.roundRect(m.x - 1.5, m.y - 1.5, m.width + 3, m.height + 3, 3);
    ctx.fill();

    // 本体: 透明感のある縦グラデ
    const grad = ctx.createLinearGradient(0, m.y, 0, m.y + m.height);
    grad.addColorStop(0, 'rgba(225, 245, 255, 0.70)');
    grad.addColorStop(0.5, 'rgba(150, 220, 255, 0.42)');
    grad.addColorStop(1, 'rgba(100, 200, 255, 0.55)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(m.x, m.y, m.width, m.height, 2.5);
    ctx.fill();

    // 上部のハイライト（ガラスっぽい光沢）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fillRect(m.x + 2, m.y + 0.8, m.width - 4, 0.8);

    // 縁
    ctx.strokeStyle = 'rgba(190, 235, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(m.x, m.y, m.width, m.height, 2.5);
    ctx.stroke();
  }
}
