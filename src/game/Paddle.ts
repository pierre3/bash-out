import { GameObject } from '../engine/GameObject';
import type { Renderer } from '../engine/Renderer';
import type { Input } from '../engine/Input';

const PADDLE_SPEED = 400;
const DASH_SPEED_MULTIPLIER = 4.0;   // ダッシュ時の速度倍率（ベースの4倍）
const DASH_DURATION = 0.10;          // ダッシュ継続時間（秒）→ 約160px移動
const AFTERIMAGE_FADE = 0.20;        // ダッシュ残像のフェード時間（秒）
const BASE_WIDTH = 100;
const EXPAND_WIDTH = 180;
const ROTATION_SPEED = 3.2; // rad/sec — UFO リムライトの回転速度
/**
 * 画面下端からのパドルY位置のオフセット（px）。
 * UFOのドーム(上)と下グロー(下)、およびHUD（スキル名/タンク/ゲージ）と
 * 視覚的に重ならない値に設定。HUD最上端は約 y=canvasH-78 付近。
 */
const PADDLE_Y_OFFSET = 115;

export class Paddle extends GameObject {
  private baseSpeed = PADDLE_SPEED;
  private boosted = false;
  private expandTimer = 0;
  private stunnedTimer = 0;
  private stunnedDuration = 0;
  /** ダッシュ残り時間（秒）。> 0 の間は dashDirection 方向に高速移動 */
  private dashTimer = 0;
  private dashDirection: -1 | 1 = 1;
  /** ダッシュ中・直後の残像。boost のカバー範囲を広げる */
  private afterimages: { x: number; y: number; width: number; age: number }[] = [];
  /** UFOリムライトの回転位相（rad） */
  private rotation = 0;

  constructor(canvasWidth: number, canvasHeight: number) {
    const h = 16;
    super(
      (canvasWidth - BASE_WIDTH) / 2,
      canvasHeight - PADDLE_Y_OFFSET,
      BASE_WIDTH,
      h
    );
  }

  /** パドル拡大効果を開始する */
  startExpand(duration: number): void {
    // 拡大中に発動した場合は残り時間を更新
    this.expandTimer = Math.max(this.expandTimer, duration);
    // 中央基準で拡大
    const cx = this.x + this.width / 2;
    this.width = EXPAND_WIDTH;
    this.x = cx - this.width / 2;
  }

  get isExpanded(): boolean {
    return this.expandTimer > 0;
  }

  /** 電撃で麻痺させる。指定秒間、入力が無視される */
  stun(duration: number): void {
    this.stunnedTimer = Math.max(this.stunnedTimer, duration);
    this.stunnedDuration = Math.max(this.stunnedDuration, duration);
  }

  get isStunned(): boolean {
    return this.stunnedTimer > 0;
  }

  /** 麻痺残り時間の比率（0..1）。エフェクト演出に使う */
  get stunRatio(): number {
    return this.stunnedDuration > 0 ? this.stunnedTimer / this.stunnedDuration : 0;
  }

  handleInput(input: Input, _dt: number): void {
    this.vx = 0;
    this.boosted = false;

    // 麻痺中は入力を完全に無視
    if (this.isStunned) return;

    // ダッシュ中は通常入力を上書きし、固定方向に高速移動
    if (this.dashTimer > 0) {
      this.vx = this.dashDirection * this.baseSpeed * DASH_SPEED_MULTIPLIER;
      this.boosted = true;
      return;
    }

    // チャージ中は移動不可
    if (input.isCharging()) return;

    // 現在の入力方向を判定（同時押しはチャージで処理済みなのでここでは片方のみ想定）
    const left = input.isLeft();
    const right = input.isRight();
    let dir: -1 | 0 | 1 = 0;
    if (left && !right) dir = -1;
    else if (right && !left) dir = 1;

    if (dir !== 0) this.vx = dir * this.baseSpeed;
  }

  /** ダブルタップで呼ばれ、指定方向に短いダッシュを行う */
  triggerDash(direction: 'left' | 'right'): void {
    if (this.isStunned) return;
    this.dashDirection = direction === 'left' ? -1 : 1;
    this.dashTimer = DASH_DURATION;
  }

  /**
   * ダッシュ残像のヒットボックス一覧。GameScene の衝突処理で
   * 実体パドル同様に反射を取るために使う。
   */
  getAfterimageBoxes(): { x: number; y: number; width: number; height: number }[] {
    return this.afterimages.map(a => ({
      x: a.x,
      y: a.y,
      width: a.width,
      height: this.height,
    }));
  }

  get isBoosted(): boolean {
    return this.boosted;
  }

  update(dt: number): void {
    this.x += this.vx * dt;

    // UFOリムライトの回転（麻痺中は止める）
    if (!this.isStunned) {
      this.rotation += ROTATION_SPEED * dt;
      if (this.rotation > Math.PI * 2) this.rotation -= Math.PI * 2;
    }

    // ダッシュタイマー + 残像記録
    if (this.dashTimer > 0) {
      // 毎フレーム残像を1つ追加（フェード時間で消える）
      this.afterimages.push({ x: this.x, y: this.y, width: this.width, age: 0 });
      this.dashTimer = Math.max(0, this.dashTimer - dt);
    }
    // 残像のエージング → フェード超過分は削除
    if (this.afterimages.length > 0) {
      for (const a of this.afterimages) a.age += dt;
      this.afterimages = this.afterimages.filter(a => a.age < AFTERIMAGE_FADE);
    }

    // 拡大効果の継続時間管理
    if (this.expandTimer > 0) {
      this.expandTimer -= dt;
      if (this.expandTimer <= 0) {
        this.expandTimer = 0;
        const cx = this.x + this.width / 2;
        this.width = BASE_WIDTH;
        this.x = cx - this.width / 2;
      }
    }

    // 麻痺タイマー
    if (this.stunnedTimer > 0) {
      this.stunnedTimer = Math.max(0, this.stunnedTimer - dt);
      if (this.stunnedTimer === 0) this.stunnedDuration = 0;
    }
  }

  /** 画面内に収める */
  clamp(minX: number, maxX: number): void {
    if (this.x < minX) this.x = minX;
    if (this.x + this.width > maxX) this.x = maxX - this.width;
  }

  draw(renderer: Renderer): void {
    const ctx = renderer.ctx;

    // 残像（実体より先に描画して背景側に）
    for (const a of this.afterimages) {
      const alpha = (1 - a.age / AFTERIMAGE_FADE) * 0.55;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(a.x - this.x, a.y - this.y);
      this.drawUFOBody(ctx);
      ctx.restore();
    }

    // 実体パドル
    this.drawUFOBody(ctx);

    // 麻痺アークは実体のみに重ねる
    if (this.isStunned) {
      this.drawStunArcs(ctx);
    }
  }

  /** UFO 本体を this.x / this.y を基準に描画（残像でも translate して再利用） */
  private drawUFOBody(ctx: CanvasRenderingContext2D): void {
    const palette = this.currentPalette();

    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    const saucerRX = this.width / 2;
    const saucerRY = this.height / 2;

    // アンチグラビティ光（円盤の真下、地面に向かって淡く）
    const glowGrad = ctx.createRadialGradient(cx, cy + saucerRY + 4, 1, cx, cy + saucerRY + 4, saucerRX * 0.85);
    glowGrad.addColorStop(0, palette.glow);
    glowGrad.addColorStop(1, palette.glowFade);
    ctx.fillStyle = glowGrad;
    ctx.fillRect(this.x - 6, cy, this.width + 12, saucerRY + 14);

    // 円盤本体（楕円・縦グラデで立体感）
    const bodyGrad = ctx.createLinearGradient(0, this.y, 0, this.y + this.height);
    bodyGrad.addColorStop(0, palette.bodyTop);
    bodyGrad.addColorStop(1, palette.bodyBottom);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, saucerRX, saucerRY, 0, 0, Math.PI * 2);
    ctx.fill();

    // 円盤の赤道に沿った白い帯
    ctx.fillStyle = palette.stripe;
    ctx.fillRect(this.x + 3, cy - 1, this.width - 6, 2);

    // ドーム（コックピット）— コリジョン枠の上にはみ出して描く
    const domeRX = this.width * 0.22;
    const domeRY = this.height * 0.75;
    const domeCY = this.y - this.height * 0.05;
    ctx.fillStyle = palette.dome;
    ctx.beginPath();
    ctx.ellipse(cx, domeCY, domeRX, domeRY, 0, 0, Math.PI * 2);
    ctx.fill();
    // ドームのハイライト（ガラス感）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.ellipse(cx - domeRX * 0.4, domeCY - domeRY * 0.35, domeRX * 0.22, domeRY * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();

    // 回転するリムライト（円盤の外周を周回）
    const lightCount = 7;
    const rimRX = saucerRX * 0.88;
    const rimY = cy + saucerRY * 0.30;
    for (let i = 0; i < lightCount; i++) {
      const angle = this.rotation + (i / lightCount) * Math.PI * 2;
      const depth = Math.sin(angle); // -1（後ろ）..1（手前）
      if (depth < -0.25) continue; // 後ろ側は本体に隠れる想定で非表示

      const lx = cx + Math.cos(angle) * rimRX;
      const visibility = (depth + 0.25) / 1.25; // 0..1
      const alpha = 0.4 + visibility * 0.55;
      const r = 1.6 + visibility * 1.6;
      const [lr, lg, lb] = palette.lightRGB;

      // 光本体
      ctx.fillStyle = `rgba(${lr}, ${lg}, ${lb}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(lx, rimY, r, 0, Math.PI * 2);
      ctx.fill();
      // 周囲のグロー
      ctx.fillStyle = `rgba(${lr}, ${lg}, ${lb}, ${alpha * 0.25})`;
      ctx.beginPath();
      ctx.arc(lx, rimY, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

  }

  /** 麻痺中の電気アーク（実体パドルにのみ重ねる） */
  private drawStunArcs(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = `rgba(255, 230, 80, ${0.6 + Math.sin(performance.now() * 0.04) * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    const arcCount = 4;
    const t = performance.now() * 0.012;
    for (let i = 0; i < arcCount; i++) {
      const sx = this.x + ((i + 0.5) / arcCount) * this.width;
      const baseY = this.y - 2;
      ctx.beginPath();
      ctx.moveTo(sx - 6, baseY);
      ctx.lineTo(sx - 2, baseY - 5 + Math.sin(t + i * 1.7) * 2);
      ctx.lineTo(sx + 3, baseY - 1 + Math.sin(t * 1.3 + i) * 2);
      ctx.lineTo(sx + 7, baseY - 6 + Math.sin(t * 1.5 + i * 0.8) * 2);
      ctx.stroke();
    }
  }

  /** 状態に応じたUFOカラーパレット */
  private currentPalette(): {
    bodyTop: string;
    bodyBottom: string;
    stripe: string;
    dome: string;
    lightRGB: [number, number, number];
    glow: string;
    glowFade: string;
  } {
    if (this.isStunned) {
      return {
        bodyTop: '#aaa',
        bodyBottom: '#666',
        stripe: 'rgba(220, 220, 220, 0.5)',
        dome: 'rgba(180, 180, 180, 0.75)',
        lightRGB: [200, 200, 200],
        glow: 'rgba(150, 150, 150, 0.20)',
        glowFade: 'rgba(150, 150, 150, 0)',
      };
    }
    if (this.boosted) {
      return {
        bodyTop: '#ffd180',
        bodyBottom: '#ff7043',
        stripe: 'rgba(255, 240, 200, 0.7)',
        dome: 'rgba(255, 224, 130, 0.85)',
        lightRGB: [255, 255, 200],
        glow: 'rgba(255, 224, 130, 0.40)',
        glowFade: 'rgba(255, 224, 130, 0)',
      };
    }
    return {
      bodyTop: '#a5e2f7',
      bodyBottom: '#4fc3f7',
      stripe: 'rgba(255, 255, 255, 0.6)',
      dome: 'rgba(255, 128, 171, 0.85)',
      lightRGB: [255, 235, 59],
      glow: 'rgba(174, 213, 234, 0.35)',
      glowFade: 'rgba(174, 213, 234, 0)',
    };
  }
}
