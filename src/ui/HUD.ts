import type { Renderer } from '../engine/Renderer';
import type { Input } from '../engine/Input';
import { EnergySystem } from '../game/EnergySystem';

const GAUGE_WIDTH = 200;
const GAUGE_HEIGHT = 14;
const GAUGE_MARGIN = 10;
const TANK_SIZE = 18;
const TANK_GAP = 6;

const SKILL_NAMES: Record<number, string> = {
  1: 'PADDLE EXPAND',
  2: 'BALL SPLIT',
  3: 'BARRIER',
};

export class HUD {
  /** 直近の draw で配置した吹き出しの矩形（タップ判定用）。スキル無効時は null */
  private skillBubbleBounds: { x: number; y: number; w: number; h: number } | null = null;

  /** 基本技発動の吹き出し領域。GameScene がタップ判定に使う */
  getSkillBubbleBounds(): { x: number; y: number; w: number; h: number } | null {
    return this.skillBubbleBounds;
  }

  draw(
    renderer: Renderer,
    energy: EnergySystem,
    starsCollected: number,
    starsRequired: number,
    input: Input | null,
  ): void {
    const x = (renderer.width - GAUGE_WIDTH) / 2;
    const y = renderer.height - GAUGE_MARGIN - GAUGE_HEIGHT;

    if (input) this.drawTouchButtons(renderer, input);
    this.drawGauge(renderer, energy, x, y);
    this.drawTanks(renderer, energy, x, y - TANK_SIZE - 6);
    this.drawSkillBubble(renderer, energy, x, y - TANK_SIZE - 24);
    this.drawStarCounter(renderer, starsCollected, starsRequired);
  }

  /** 左右の仮想方向ボタン（タッチUI / マウスクリックでも動く） */
  private drawTouchButtons(renderer: Renderer, input: Input): void {
    const { left, right } = input.getTouchButtonBounds();
    this.drawTouchButton(renderer.ctx, left, '◀', input.isLeftButtonHeld());
    this.drawTouchButton(renderer.ctx, right, '▶', input.isRightButtonHeld());
  }

  private drawTouchButton(
    ctx: CanvasRenderingContext2D,
    rect: { x: number; y: number; w: number; h: number },
    label: string,
    pressed: boolean,
  ): void {
    const radius = 16;

    // 背景: 通常時はパステルミント寄り、押下時はパステルピンクで切り替え
    ctx.fillStyle = pressed
      ? 'rgba(255, 190, 220, 0.50)'   // パステルピンク
      : 'rgba(180, 230, 220, 0.22)';  // パステルミント
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    ctx.fill();

    // 上面ハイライト
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    ctx.clip();
    const hi = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h * 0.55);
    hi.addColorStop(0, pressed ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.18)');
    hi.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = hi;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();

    // 縁取り
    ctx.strokeStyle = pressed
      ? 'rgba(255, 140, 195, 0.90)'   // ピンクの濃いめ縁
      : 'rgba(160, 220, 210, 0.55)';  // ミントの縁
    ctx.lineWidth = pressed ? 2 : 1.4;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    ctx.stroke();

    // 矢印
    ctx.fillStyle = pressed
      ? 'rgba(255, 255, 255, 1.0)'
      : 'rgba(225, 250, 240, 0.80)';  // ミントに馴染む白
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  private drawStarCounter(renderer: Renderer, collected: number, required: number): void {
    // 画面右上にアイコン＋カウントで配置
    const margin = 12;
    const iconR = 10;
    const x = renderer.width - margin - iconR;
    const y = margin + iconR;

    // 集めた数だけ実体の星、未収集分は淡い枠線で表示
    for (let i = 0; i < required; i++) {
      const sx = x - i * (iconR * 2 + 4);
      const sy = y;
      if (i < collected) {
        renderer.drawStar(sx, sy, iconR, '#ffd700', '#5a3a00', 1.5);
      } else {
        renderer.drawStar(sx, sy, iconR, 'rgba(255, 215, 0, 0.12)', '#7a6a30', 1);
      }
    }
  }

  private drawSkillBubble(renderer: Renderer, energy: EnergySystem, x: number, y: number): void {
    // 発動可能なタンクがない時は吹き出しを出さず、タップ領域もクリア
    if (energy.tanks <= 0) {
      this.skillBubbleBounds = null;
      return;
    }
    const skillId = Math.min(energy.tanks, EnergySystem.MAX_SKILL_TANKS);
    const name = SKILL_NAMES[skillId];
    if (!name) {
      this.skillBubbleBounds = null;
      return;
    }

    const ctx = renderer.ctx;
    const cx = x + GAUGE_WIDTH / 2;
    const cy = y;

    // テキストの幅から吹き出しサイズを決定（文字数によって伸縮）
    ctx.font = 'bold 12px monospace';
    const textWidth = ctx.measureText(name).width;
    const baseHw = textWidth / 2 + 14;
    const baseHh = 12;

    // 注意を引くため軽く脈動
    const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.05;
    const hw = baseHw * pulse;
    const hh = baseHh * pulse;

    // ギザギザ吹き出しを描画（黄色塗り＋濃い縁取り）
    this.drawJaggedBurst(ctx, cx, cy, hw, hh, '#ffd54f', '#5d3a00');

    // 中のテキスト
    ctx.fillStyle = '#3e2700';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, cx, cy + 1);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    // タップ判定領域（控えめ目に少し大きめにする）
    const padding = 2;
    this.skillBubbleBounds = {
      x: cx - hw - padding,
      y: cy - hh - padding,
      w: (hw + padding) * 2,
      h: (hh + padding) * 2,
    };
  }

  /** ギザギザのバースト/吹き出し形状（楕円ベースの星型ポリゴン） */
  private drawJaggedBurst(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    hw: number,
    hh: number,
    fillStyle: string,
    strokeStyle: string,
  ): void {
    const spikes = 14;
    const innerRatio = 0.78;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 1 : innerRatio;
      const px = cx + Math.cos(angle) * hw * r;
      const py = cy + Math.sin(angle) * hh * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  private drawGauge(renderer: Renderer, energy: EnergySystem, x: number, y: number): void {
    const ctx = renderer.ctx;
    const r = GAUGE_HEIGHT / 2; // カプセル形

    // 背景
    ctx.fillStyle = '#2a2438';
    ctx.beginPath();
    ctx.roundRect(x, y, GAUGE_WIDTH, GAUGE_HEIGHT, r);
    ctx.fill();

    // ゲージ
    const ratio = energy.gauge / energy.maxGauge;
    if (ratio > 0) {
      const color = energy.isCharging ? '#00e676' : (energy.isConsuming ? '#ff5252' : '#ffc107');
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, GAUGE_WIDTH * ratio, GAUGE_HEIGHT, r);
      ctx.fill();
    }

    // 枠線
    ctx.strokeStyle = '#9a8fb0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, GAUGE_WIDTH, GAUGE_HEIGHT, r);
    ctx.stroke();
  }

  private drawTanks(renderer: Renderer, energy: EnergySystem, x: number, y: number): void {
    const ctx = renderer.ctx;
    const totalWidth = energy.maxTanks * (TANK_SIZE + TANK_GAP) - TANK_GAP;
    const startX = x + (GAUGE_WIDTH - totalWidth) / 2;
    const consumeCount = Math.min(energy.tanks, EnergySystem.MAX_SKILL_TANKS);
    const tankRadius = 5;

    for (let i = 0; i < energy.maxTanks; i++) {
      const tx = startX + i * (TANK_SIZE + TANK_GAP);
      const filled = i < energy.tanks;
      const willConsume = i < consumeCount;

      if (filled) {
        // 発動で消費されるタンクはコーラルピンク、それ以外はパステルアンバー
        ctx.fillStyle = willConsume ? '#ff8fa3' : '#ffd966';
      } else {
        ctx.fillStyle = '#322a44';
      }
      ctx.beginPath();
      ctx.roundRect(tx, y, TANK_SIZE, TANK_SIZE, tankRadius);
      ctx.fill();

      // ハイライト（充填済みのみ、上面に光沢）
      if (filled) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(tx, y, TANK_SIZE, TANK_SIZE, tankRadius);
        ctx.clip();
        const hi = ctx.createLinearGradient(0, y, 0, y + TANK_SIZE * 0.55);
        hi.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
        hi.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = hi;
        ctx.fillRect(tx, y, TANK_SIZE, TANK_SIZE);
        ctx.restore();
      }

      ctx.strokeStyle = filled ? (willConsume ? '#d63b6b' : '#e8a000') : '#7a6c98';
      ctx.lineWidth = willConsume && filled ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(tx, y, TANK_SIZE, TANK_SIZE, tankRadius);
      ctx.stroke();
    }
  }
}
