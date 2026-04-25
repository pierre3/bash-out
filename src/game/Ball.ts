import { GameObject } from '../engine/GameObject';
import type { Renderer } from '../engine/Renderer';

const BALL_RADIUS = 6;
const INITIAL_SPEED = 300;

export class Ball extends GameObject {
  radius = BALL_RADIUS;
  speed = INITIAL_SPEED;
  private baseSpeed = INITIAL_SPEED;
  /** ベース速度に対する加算量（0=加速なし、0.5=+50%）。減衰しない */
  private boostAmount = 0;
  /** ヒートアップエフェクト用の軌跡 */
  private trail: { x: number; y: number }[] = [];

  constructor(x: number, y: number, angle?: number) {
    super(x - BALL_RADIUS, y - BALL_RADIUS, BALL_RADIUS * 2, BALL_RADIUS * 2);
    const a = angle ?? (-Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3));
    this.vx = Math.cos(a) * this.speed;
    this.vy = Math.sin(a) * this.speed;
  }

  /** 現在の速度ベクトルを指定角度差で複製する。ブースト状態も継承する */
  cloneWithAngleOffset(deltaAngle: number): Ball {
    const currentAngle = Math.atan2(this.vy, this.vx);
    const ball = new Ball(this.cx, this.cy, currentAngle + deltaAngle);
    ball.baseSpeed = this.baseSpeed;
    ball.boostAmount = this.boostAmount;
    ball.speed = this.speed;
    ball.vx = Math.cos(currentAngle + deltaAngle) * this.speed;
    ball.vy = Math.sin(currentAngle + deltaAngle) * this.speed;
    return ball;
  }

  /**
   * ベース速度に対する加算量を設定する（永続）。
   * 速度ベクトルもリスケールして即座に反映する。
   */
  setBoost(amount: number): void {
    this.boostAmount = Math.max(0, amount);
    const newSpeed = this.baseSpeed * (1 + this.boostAmount);
    if (this.speed > 0 && (this.vx !== 0 || this.vy !== 0)) {
      const scale = newSpeed / this.speed;
      this.vx *= scale;
      this.vy *= scale;
    }
    this.speed = newSpeed;
  }

  get isBoosted(): boolean {
    return this.boostAmount > 0;
  }

  /** 現在の加算量（外部からはグロー強度の決定などに使う） */
  get boostStrength(): number {
    return this.boostAmount;
  }

  get cx(): number { return this.x + this.radius; }
  get cy(): number { return this.y + this.radius; }

  update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // ブースト時のみ軌跡を記録（速度が高いほど長く残る）
    if (this.boostAmount > 0) {
      this.trail.push({ x: this.cx, y: this.cy });
      const heat = Math.min(1, this.boostAmount / 1.5);
      const maxLen = Math.floor(3 + heat * 8); // 3〜11
      while (this.trail.length > maxLen) this.trail.shift();
    } else if (this.trail.length > 0) {
      this.trail.length = 0;
    }
  }

  /** 壁での反射 (左右・上) */
  bounceWalls(minX: number, maxX: number, minY: number): void {
    if (this.cx - this.radius < minX) {
      this.x = minX;
      this.vx = Math.abs(this.vx);
    }
    if (this.cx + this.radius > maxX) {
      this.x = maxX - this.width;
      this.vx = -Math.abs(this.vx);
    }
    if (this.cy - this.radius < minY) {
      this.y = minY;
      this.vy = Math.abs(this.vy);
    }
  }

  /** パドルでの曲面反射 */
  bounceOffPaddle(paddleX: number, paddleWidth: number): void {
    // パドル上の当たった位置 (-1 ~ 1) で角度を決定
    const hitPos = ((this.cx - paddleX) / paddleWidth) * 2 - 1;
    // -60度 ~ -120度 の範囲でリマップ
    const angle = -Math.PI / 2 + hitPos * (Math.PI / 3);
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
  }

  /** 画面下に落ちたか */
  isBelowScreen(maxY: number): boolean {
    return this.cy - this.radius > maxY;
  }

  draw(renderer: Renderer): void {
    const ctx = renderer.ctx;
    const heat = Math.min(1, this.boostAmount / 1.5); // 0..1

    // 軌跡（trail）— 古いほど薄く・小さく・暗い色
    if (heat > 0 && this.trail.length > 1) {
      for (let i = 0; i < this.trail.length; i++) {
        const p = this.trail[i];
        const t = (i + 1) / this.trail.length; // 0..1（先頭=古い、末尾=新しい）
        const alpha = t * 0.55 * heat;
        const r = this.radius * (0.35 + t * 0.65);
        ctx.fillStyle = this.heatColor(heat * t, alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 外側のグロー（炎のように広がる）
    if (heat > 0) {
      const glowR = this.radius * (1.5 + heat * 2.2);
      const grad = ctx.createRadialGradient(this.cx, this.cy, this.radius * 0.5, this.cx, this.cy, glowR);
      grad.addColorStop(0, this.heatColor(heat, 0.6));
      grad.addColorStop(0.5, this.heatColor(heat, 0.25));
      grad.addColorStop(1, this.heatColor(heat, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, glowR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 本体（白→黄→橙→赤）
    ctx.fillStyle = heat > 0 ? this.heatColor(heat, 1) : '#ffffff';
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // 立体感のハイライト（左上に小さな白い光点）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(this.cx - this.radius * 0.35, this.cy - this.radius * 0.35, this.radius * 0.30, 0, Math.PI * 2);
    ctx.fill();
  }

  /** ヒート度（0..1）を白→黄→橙→赤の色にマッピング */
  private heatColor(h: number, alpha: number): string {
    const hh = Math.max(0, Math.min(1, h));
    let r = 255, g: number, b: number;
    if (hh < 0.5) {
      // 白→黄
      const t = hh * 2;
      g = 255 - t * 70;   // 255 → 185
      b = 255 - t * 200;  // 255 →  55
    } else {
      // 黄→赤
      const t = (hh - 0.5) * 2;
      g = 185 - t * 145;  // 185 →  40
      b = 55 - t * 25;    //  55 →  30
    }
    return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`;
  }
}
