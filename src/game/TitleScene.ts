import { Scene } from '../engine/Scene';
import type { Renderer } from '../engine/Renderer';
import type { Input } from '../engine/Input';
import type { SoundEngine } from '../engine/SoundEngine';

const FADE_DURATION = 0.35;

const BG_BRICK_COLORS = [
  '#ff6b9d', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#b197fc',
];

interface BgBrick {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
}

/**
 * タイトル画面。任意のキー/タップで GameScene にフェード遷移する。
 * ゲーム本体と統一感のあるパステル + ポップ調ビジュアル。
 */
export class TitleScene extends Scene {
  private animTime = 0;
  private fadingOut = false;
  private fadeTimer = 0;
  private bricks: BgBrick[] = [];
  private readonly onStart: () => void;
  private readonly sound: SoundEngine;

  constructor(sound: SoundEngine, onStart: () => void) {
    super();
    this.sound = sound;
    this.onStart = onStart;
    this.spawnBgBricks();
  }

  override onEnter(): void {
    this.animTime = 0;
    this.fadingOut = false;
    this.fadeTimer = 0;
  }

  private spawnBgBricks(): void {
    this.bricks = [];
    const count = 11;
    for (let i = 0; i < count; i++) {
      this.bricks.push({
        x: Math.random() * 540,
        y: Math.random() * 960,
        vx: (Math.random() - 0.5) * 8,
        vy: -8 - Math.random() * 14,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.6,
        size: 28 + Math.random() * 26,
        color: BG_BRICK_COLORS[Math.floor(Math.random() * BG_BRICK_COLORS.length)],
      });
    }
  }

  update(dt: number, input: Input): void {
    this.animTime += dt;
    this.updateBricks(dt);

    // M キーでミュートトグル（タイトル中も切替可）
    if (input.isKeyPressed('KeyM')) {
      this.sound.ensureStarted();
      this.sound.toggleMute();
    }

    if (this.fadingOut) {
      this.fadeTimer -= dt;
      if (this.fadeTimer <= 0) this.onStart();
      return;
    }

    const anyKey = input.isKeyPressed('ArrowUp')
      || input.isKeyPressed('Space')
      || input.isKeyPressed('Enter')
      || input.isKeyPressed('ArrowLeft')
      || input.isKeyPressed('ArrowRight');
    const anyTap = input.hasFreshPointerDown();
    if (anyKey || anyTap) {
      // 初回ユーザー操作で AudioContext を起動
      this.sound.ensureStarted();
      this.fadingOut = true;
      this.fadeTimer = FADE_DURATION;
    }
  }

  private updateBricks(dt: number): void {
    for (const b of this.bricks) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vrot * dt;
      // 上に抜けたら下から再投入
      if (b.y < -60) {
        b.y = 1020;
        b.x = Math.random() * 540;
        b.color = BG_BRICK_COLORS[Math.floor(Math.random() * BG_BRICK_COLORS.length)];
      }
      if (b.x < -60) b.x = 600;
      if (b.x > 600) b.x = -60;
    }
  }

  draw(renderer: Renderer): void {
    const ctx = renderer.ctx;
    const W = renderer.width;
    const H = renderer.height;

    // 背景グラデ
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#1a1428');
    bgGrad.addColorStop(1, '#2a1f3e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    this.drawBricks(ctx);
    this.drawTitle(ctx, W, H);
    this.drawInstructions(ctx, W, H);
    this.drawStartPrompt(ctx, W, H);

    // フェードアウト
    if (this.fadingOut) {
      const a = 1 - (this.fadeTimer / FADE_DURATION);
      ctx.fillStyle = `rgba(0, 0, 0, ${a.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private drawBricks(ctx: CanvasRenderingContext2D): void {
    for (const b of this.bricks) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = b.color;
      const w = b.size;
      const h = b.size * 0.45;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 6);
      ctx.fill();
      // ハイライト
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 3, -h / 2 + 2, w - 6, h * 0.35, 4);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawTitle(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const cx = W / 2;
    const baseY = H * 0.27;
    const bob = Math.sin(this.animTime * 1.5) * 5;
    const y = baseY + bob;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    // 外側の濃い縁
    ctx.strokeStyle = '#3a1a30';
    ctx.lineWidth = 14;
    ctx.strokeText('BashOut', cx, y);

    // 中の白縁
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.strokeText('BashOut', cx, y);

    // 黄→ピンクの縦グラデで塗り
    const grad = ctx.createLinearGradient(0, y - 50, 0, y + 50);
    grad.addColorStop(0, '#ffe066');
    grad.addColorStop(0.55, '#ff85a3');
    grad.addColorStop(1, '#ff5a8a');
    ctx.fillStyle = grad;
    ctx.fillText('BashOut', cx, y);

    // 文字上部のハイライト（クリップで上半分のみ）
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y - 60, W, 30);
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillText('BashOut', cx, y);
    ctx.restore();

    ctx.restore();

    // サブタイトル
    ctx.save();
    ctx.fillStyle = '#c4a8ff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('— BOSS BATTLE BREAKOUT —', cx, y + 70);
    ctx.restore();

    this.drawSparkles(ctx, cx, y);
  }

  private drawSparkles(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    const positions: Array<{ x: number; y: number }> = [
      { x: -190, y: -50 },
      { x: 200,  y: -45 },
      { x: -210, y: 35 },
      { x: 220,  y: 25 },
      { x: -130, y: 95 },
      { x: 150,  y: 100 },
    ];
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const t = this.animTime * 2.4 + i * 0.8;
      const alpha = 0.45 + 0.55 * (Math.sin(t) * 0.5 + 0.5);
      const size = 4 + Math.sin(t * 1.4) * 2.5;
      ctx.fillStyle = `rgba(255, 235, 102, ${alpha.toFixed(3)})`;
      const sx = cx + p.x;
      const sy = cy + p.y;
      ctx.beginPath();
      ctx.moveTo(sx, sy - size * 2);
      ctx.lineTo(sx + size * 0.5, sy - size * 0.5);
      ctx.lineTo(sx + size * 2, sy);
      ctx.lineTo(sx + size * 0.5, sy + size * 0.5);
      ctx.lineTo(sx, sy + size * 2);
      ctx.lineTo(sx - size * 0.5, sy + size * 0.5);
      ctx.lineTo(sx - size * 2, sy);
      ctx.lineTo(sx - size * 0.5, sy - size * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawInstructions(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const panelX = 40;
    const panelY = H * 0.46;
    const panelW = W - 80;
    const panelH = 268;

    // パネル背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 18);
    ctx.fill();
    // 上面ハイライト
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 18);
    ctx.clip();
    const hi = ctx.createLinearGradient(0, panelY, 0, panelY + panelH * 0.4);
    hi.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
    hi.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = hi;
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.restore();
    // 縁
    ctx.strokeStyle = 'rgba(180, 230, 220, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 18);
    ctx.stroke();

    // セクションタイトル
    ctx.fillStyle = '#ffd966';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('そうさ', W / 2, panelY + 34);

    // 操作リスト
    const lines: Array<[string, string]> = [
      ['移動',     '← →  /  画面下の左右ボタン'],
      ['ダッシュ', '同方向を 2連打'],
      ['チャージ', '左右 同時押し'],
      ['基本技',   '↑キー  /  吹き出しをタップ'],
      ['必殺技',   '★を 3つ集めると自動発動'],
      ['ミュート', 'M キー で 切替'],
    ];
    let y = panelY + 76;
    const labelX = panelX + 28;
    const descX = panelX + 120;
    for (const [label, desc] of lines) {
      ctx.fillStyle = '#ff85a3';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, labelX, y);
      ctx.fillStyle = '#f0e8ff';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(desc, descX, y);
      y += 30;
    }
  }

  private drawStartPrompt(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const t = this.animTime * 3.5;
    const alpha = 0.55 + 0.45 * (Math.sin(t) * 0.5 + 0.5);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('TAP TO START', W / 2, H * 0.86);

    ctx.fillStyle = `rgba(220, 200, 255, ${(alpha * 0.7).toFixed(3)})`;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('画面タップ または スペース / エンター', W / 2, H * 0.86 + 26);
    ctx.restore();
  }
}
