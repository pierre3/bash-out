import { GameObject } from '../engine/GameObject';
import type { Renderer } from '../engine/Renderer';

const BARRIER_HEIGHT = 6;

export class Barrier extends GameObject {
  private timer = 0;
  private duration = 0;

  constructor(canvasWidth: number, canvasHeight: number) {
    super(0, canvasHeight - 10, canvasWidth, BARRIER_HEIGHT);
    this.active = false;
  }

  activate(duration: number): void {
    this.timer = duration;
    this.duration = duration;
    this.active = true;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0;
      this.active = false;
    }
  }

  /** 残り時間の割合（0〜1）。フェードアウト表現などに使う */
  get remainingRatio(): number {
    return this.duration > 0 ? this.timer / this.duration : 0;
  }

  draw(renderer: Renderer): void {
    if (!this.active) return;
    const ctx = renderer.ctx;
    // 点滅効果（残り時間が少ないほど速い）
    const alpha = 0.55 + 0.35 * Math.sin(this.timer * 10);
    const r = this.height / 2; // カプセル形

    // 外側のソフトグロー
    ctx.fillStyle = `rgba(100, 200, 255, ${(alpha * 0.35).toFixed(3)})`;
    ctx.beginPath();
    ctx.roundRect(this.x - 4, this.y - 3, this.width + 8, this.height + 6, r + 3);
    ctx.fill();

    // 本体
    ctx.fillStyle = `rgba(100, 200, 255, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.roundRect(this.x, this.y, this.width, this.height, r);
    ctx.fill();

    // 内側ハイライト
    ctx.fillStyle = `rgba(220, 240, 255, ${(alpha * 0.7).toFixed(3)})`;
    ctx.beginPath();
    ctx.roundRect(this.x + 2, this.y + 1, this.width - 4, this.height * 0.35, r);
    ctx.fill();
  }
}
