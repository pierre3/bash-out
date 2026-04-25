import { GameObject } from '../engine/GameObject';
import type { Renderer } from '../engine/Renderer';

const STAR_SIZE = 20;
const FALL_SPEED = 160;

export class StarItem extends GameObject {
  private spinAngle = 0;

  constructor(cx: number, cy: number) {
    super(cx - STAR_SIZE / 2, cy - STAR_SIZE / 2, STAR_SIZE, STAR_SIZE);
    this.vy = FALL_SPEED;
  }

  update(dt: number): void {
    this.y += this.vy * dt;
    this.spinAngle += dt * 3;
  }

  isBelowScreen(maxY: number): boolean {
    return this.y > maxY;
  }

  draw(renderer: Renderer): void {
    if (!this.active) return;
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;

    // ふんわりしたグロー
    const ctx = renderer.ctx;
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, this.width * 0.9);
    grad.addColorStop(0, 'rgba(255, 235, 130, 0.55)');
    grad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, this.width * 0.9, 0, Math.PI * 2);
    ctx.fill();

    // 軽い回転で目を引く
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(this.spinAngle) * 0.25);
    renderer.drawStar(0, 0, this.width * 0.5, '#ffd700', '#5a3a00', 1.5);
    ctx.restore();
  }
}
