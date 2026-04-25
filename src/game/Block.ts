import { GameObject } from '../engine/GameObject';
import type { Renderer } from '../engine/Renderer';

// ポップな配色（やや明るめ・彩度高め）
const BLOCK_COLORS = ['#ff6b9d', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#b197fc'];
const MAX_BLOCK_HP = 3;

export class Block extends GameObject {
  color: string;
  hp: number;
  maxHp: number;
  hasStar: boolean;
  /** 強化された瞬間からのフラッシュ残り時間（白く光る） */
  reinforceFlash = 0;
  /** 岩テクスチャの斑点を決定論的に配置するためのシード */
  private textureSeed: number;

  constructor(x: number, y: number, w: number, h: number, hp = 1, hasStar = false) {
    super(x, y, w, h);
    this.hp = hp;
    this.maxHp = hp;
    this.color = BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)];
    this.hasStar = hasStar;
    this.textureSeed = Math.random() * 1000;
  }

  hit(): void {
    this.hp--;
    if (this.hp <= 0) {
      this.active = false;
    }
  }

  /** ボスのブロック強化攻撃で呼ばれる。HP+1（最大3）。返り値は強化に成功したかどうか */
  reinforce(): boolean {
    if (this.maxHp >= MAX_BLOCK_HP) return false;
    this.maxHp += 1;
    this.hp = this.maxHp;
    this.reinforceFlash = 0.4;
    return true;
  }

  update(dt: number): void {
    if (this.reinforceFlash > 0) {
      this.reinforceFlash = Math.max(0, this.reinforceFlash - dt);
    }
  }

  draw(renderer: Renderer): void {
    if (!this.active) return;
    const ctx = renderer.ctx;
    const x = this.x + 1;
    const y = this.y + 1;
    const w = this.width - 2;
    const h = this.height - 2;
    const radius = Math.min(5, h / 2 - 1);

    // 角丸の中だけに描画する（ヒビや影が外にはみ出ないようクリップ）
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.clip();

    if (this.maxHp > 1) {
      this.drawRockBody(ctx, x, y, w, h);
    } else {
      this.drawNormalBody(ctx, x, y, w, h);
    }

    // 被ダメ分のヒビ（maxHp - hp 本）
    const cracks = this.maxHp - this.hp;
    if (cracks >= 1) this.drawCrack(ctx, 0);
    if (cracks >= 2) this.drawCrack(ctx, 1);

    // 強化直後のフラッシュ（白く光る）
    if (this.reinforceFlash > 0) {
      const alpha = (this.reinforceFlash / 0.4) * 0.7;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(x, y, w, h);
    }

    ctx.restore();

    // ★アイコンはクリップの外で描画（縁取りも含めて見せる）
    if (this.hasStar) {
      const cx = this.x + this.width / 2;
      const cy = this.y + this.height / 2;
      const r = Math.min(this.height, this.width) * 0.32;
      renderer.drawStar(cx, cy, r, '#fff8dc', '#222', 1);
    }
  }

  /** 通常ブロック: ベース色 + 上面の白いハイライト + 下端の影でジェリー感 */
  private drawNormalBody(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    // ベース色
    ctx.fillStyle = this.color;
    ctx.fillRect(x, y, w, h);

    // 上面ハイライト（縦グラデで光沢）
    const hi = ctx.createLinearGradient(0, y, 0, y + h * 0.7);
    hi.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    hi.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = hi;
    ctx.fillRect(x, y, w, h);

    // 下端の影（厚み感）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(x, y + h - 3, w, 3);
  }

  /** 強化ブロック用の岩テクスチャ。HP2=明るめ灰、HP3=暗め灰 */
  private drawRockBody(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const isHp3 = this.maxHp >= 3;

    // ベース色（少し起伏のあるグラデーションで岩らしさ）
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    if (isHp3) {
      grad.addColorStop(0, '#5a5a5e');
      grad.addColorStop(1, '#3a3a3e');
    } else {
      grad.addColorStop(0, '#7e7e82');
      grad.addColorStop(1, '#5e5e62');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    // 上端ハイライト
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(x, y, w, 1.5);
    // 下端の影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(x, y + h - 1.5, w, 1.5);

    // 斑点（凹凸感）— textureSeed で決定論的に配置
    const speckleCount = 6;
    for (let i = 0; i < speckleCount; i++) {
      const a = this.textureSeed + i * 1.7;
      const sx = x + w * 0.5 + Math.cos(a) * w * 0.38;
      const sy = y + h * 0.5 + Math.sin(a * 1.3) * h * 0.32;
      const dark = i % 2 === 0;
      ctx.fillStyle = dark ? 'rgba(0, 0, 0, 0.30)' : 'rgba(255, 255, 255, 0.14)';
      ctx.beginPath();
      ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCrack(ctx: CanvasRenderingContext2D, index: number): void {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (index === 0) {
      ctx.moveTo(this.x + 4, this.y + 3);
      ctx.lineTo(this.x + this.width * 0.40, this.y + this.height * 0.50);
      ctx.lineTo(this.x + this.width * 0.55, this.y + this.height * 0.35);
      ctx.lineTo(this.x + this.width * 0.85, this.y + this.height * 0.85);
    } else {
      ctx.moveTo(this.x + this.width - 4, this.y + 3);
      ctx.lineTo(this.x + this.width * 0.62, this.y + this.height * 0.55);
      ctx.lineTo(this.x + this.width * 0.45, this.y + this.height * 0.40);
      ctx.lineTo(this.x + this.width * 0.15, this.y + this.height * 0.80);
    }
    ctx.stroke();
  }
}
