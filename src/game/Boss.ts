import type { Renderer } from '../engine/Renderer';

const BOSS_WIDTH_RATIO = 0.36;     // canvas幅に対するボス幅の割合
const BOSS_MIN_W = 120;
const BOSS_MAX_W = 170;
const BOSS_AR = 0.85;              // height / width
const BOSS_MARGIN_RIGHT = 10;
const BOSS_MARGIN_TOP = 8;

const HP_BAR_HEIGHT = 14;
const HP_BAR_TOP = 10;
const HP_BAR_LEFT = 12;
const HP_BAR_GAP_FROM_BOSS = 12;

const HIT_FLASH_DURATION = 0.2;
const HIT_RECOIL_DURATION = 0.25;

// 攻撃タイミング
const TELEGRAPH_DURATION = 1.5;
const ACTIVE_DURATION: Record<AttackKind, number> = {
  lightning: 0.35,
  ballBoost: 0.5,
  reinforce: 0.35,
  bodySlam: 0.5,                    // 落下→着地までの時間
};
const COOLDOWN_DURATION = 0.7;
const IDLE_WAIT_FULL = 5;          // HP100%時の攻撃間アイドル時間（秒）
const IDLE_WAIT_NEAR_DEAD = 2;     // HP寸前

// ボディアタック専用の数値
const SLAM_PEAK_OFFSET_Y = -55;    // ジャンプ最高点（負=上方向）
const SLAM_IMPACT_OFFSET_Y = 28;   // 着地時のめり込み量（正=下方向）
const SLAM_IMPACT_PROGRESS = 0.5;  // active 内で着地が起きるタイミング（0..1）

export type AttackKind = 'lightning' | 'ballBoost' | 'reinforce' | 'bodySlam';
export type AttackPhase = 'idle' | 'telegraph' | 'active' | 'cooldown';

export class Boss {
  readonly maxHp: number;
  hp: number;

  // レイアウト（setLayoutで決定）
  private bossX = 0;
  private bossY = 0;
  private bossW = 0;
  private bossH = 0;
  private hpBarX = 0;
  private hpBarW = 0;

  // アニメーション状態
  private idleTime = 0;
  private hitFlash = 0;
  private hitRecoil = 0;

  // 攻撃ステートマシン
  private phase: AttackPhase = 'idle';
  private phaseTimer = 0;
  private idleWaitTimer = IDLE_WAIT_FULL;
  private attackKind: AttackKind | null = null;
  private justActivated: AttackKind | null = null;
  /** ボディアタックの着地（=ブロック追加発火）が今回の攻撃で済んだか */
  private slamImpactFired = false;

  constructor(maxHp = 60) {
    this.maxHp = maxHp;
    this.hp = maxHp;
  }

  /**
   * ボールや必殺技弾の衝突判定用の AABB。
   * ボディアタック中は slamOffsetY で位置が下がり、
   * プレイ領域に降りてきた瞬間にボールが当たる隙が生まれる。
   */
  get collisionRect(): { x: number; y: number; width: number; height: number } {
    const slamY = this.computeSlamOffsetY();
    return {
      x: this.bossX,
      y: this.bossY + slamY,
      width: this.bossW,
      height: this.bossH,
    };
  }

  /** 現在の攻撃種別（telegraph/active/cooldown中のみ有効） */
  get currentAttackKind(): AttackKind | null {
    return this.attackKind;
  }

  get attackPhase(): AttackPhase {
    return this.phase;
  }

  /** 現在フェーズの進行度（0=開始 → 1=終了直前） */
  get attackPhaseProgress(): number {
    let dur = 0;
    if (this.phase === 'telegraph') dur = TELEGRAPH_DURATION;
    else if (this.phase === 'active' && this.attackKind) dur = ACTIVE_DURATION[this.attackKind];
    else if (this.phase === 'cooldown') dur = COOLDOWN_DURATION;
    return dur > 0 ? 1 - this.phaseTimer / dur : 0;
  }

  /** active フェーズに遷移した瞬間に1回だけ攻撃種別を返す。GameSceneが効果適用に使う */
  pollActivation(): AttackKind | null {
    const a = this.justActivated;
    this.justActivated = null;
    return a;
  }

  /** canvas幅に応じてボス枠とHPバーの配置を計算する */
  setLayout(canvasWidth: number): void {
    this.bossW = Math.max(BOSS_MIN_W, Math.min(BOSS_MAX_W, canvasWidth * BOSS_WIDTH_RATIO));
    this.bossH = this.bossW * BOSS_AR;
    this.bossX = canvasWidth - BOSS_MARGIN_RIGHT - this.bossW;
    this.bossY = BOSS_MARGIN_TOP;

    this.hpBarX = HP_BAR_LEFT;
    this.hpBarW = Math.max(60, this.bossX - HP_BAR_GAP_FROM_BOSS - HP_BAR_LEFT);
  }

  /** ブロック配置の上端を決めるための基準（ボス下端 y） */
  get bottomY(): number {
    return this.bossY + this.bossH;
  }

  /** 頭の中心位置（雷攻撃の起点に使う） */
  get headPosition(): { x: number; y: number } {
    const cx = this.bossX + this.bossW / 2;
    const cy = this.bossY + this.bossH / 2;
    return { x: cx - this.bossW * 0.28, y: cy - this.bossW * 0.04 + this.headBobY() };
  }

  /** 鼻先位置（息吹き攻撃の起点） */
  get snoutPosition(): { x: number; y: number } {
    const head = this.headPosition;
    return { x: head.x - this.bossW * 0.20 * 0.85, y: head.y + this.bossW * 0.18 * 0.25 };
  }

  /** 目の位置（ビーム攻撃の起点） */
  get eyePosition(): { x: number; y: number } {
    const head = this.headPosition;
    return { x: head.x - this.bossW * 0.20 * 0.25, y: head.y - this.bossW * 0.18 * 0.15 };
  }

  /** アイドル/予兆中の頭の上下動オフセット */
  private headBobY(): number {
    let y = Math.sin(this.idleTime * 2.2) * 1.5;
    // 雷予兆: 頭を高く上げる
    if (this.phase === 'telegraph' && this.attackKind === 'lightning') {
      y -= 10 * this.attackPhaseProgress;
    } else if ((this.phase === 'active' || this.phase === 'cooldown') && this.attackKind === 'lightning') {
      y -= 10;
    }
    return y;
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  get hpRatio(): number {
    return Math.max(0, this.hp / this.maxHp);
  }

  damage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this.hitFlash = HIT_FLASH_DURATION;
    this.hitRecoil = HIT_RECOIL_DURATION;
  }

  update(dt: number): void {
    this.idleTime += dt;
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.hitRecoil > 0) this.hitRecoil = Math.max(0, this.hitRecoil - dt);

    if (this.isDead) {
      this.phase = 'idle';
      this.attackKind = null;
      return;
    }

    if (this.phase === 'idle') {
      this.idleWaitTimer -= dt;
      if (this.idleWaitTimer <= 0) {
        this.startAttack();
      }
    } else {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.advancePhase();
      }
    }

    // ボディアタックは active 中盤の着地タイミングで発火する
    if (
      this.attackKind === 'bodySlam' &&
      this.phase === 'active' &&
      !this.slamImpactFired &&
      this.attackPhaseProgress >= SLAM_IMPACT_PROGRESS
    ) {
      this.slamImpactFired = true;
      this.justActivated = 'bodySlam';
    }
  }

  private currentIdleWait(): number {
    // HPが減るほど攻撃頻度UP
    const r = this.hpRatio;
    return IDLE_WAIT_NEAR_DEAD + (IDLE_WAIT_FULL - IDLE_WAIT_NEAR_DEAD) * r;
  }

  private startAttack(): void {
    this.attackKind = this.pickAttackKind();
    this.phase = 'telegraph';
    this.phaseTimer = TELEGRAPH_DURATION;
    this.slamImpactFired = false;
  }

  private advancePhase(): void {
    if (this.phase === 'telegraph') {
      this.phase = 'active';
      this.phaseTimer = ACTIVE_DURATION[this.attackKind!];
      // bodySlam は着地タイミングで遅延発火するため、ここでは通知しない
      if (this.attackKind !== 'bodySlam') {
        this.justActivated = this.attackKind;
      }
    } else if (this.phase === 'active') {
      this.phase = 'cooldown';
      this.phaseTimer = COOLDOWN_DURATION;
    } else if (this.phase === 'cooldown') {
      this.phase = 'idle';
      this.attackKind = null;
      this.idleWaitTimer = this.currentIdleWait();
    }
  }

  private pickAttackKind(): AttackKind {
    // bodySlam を他より少し多めに（ブロック追加ペースを保つため）
    const weighted: AttackKind[] = [
      'lightning',
      'ballBoost',
      'reinforce',
      'bodySlam', 'bodySlam', // weight 2
    ];
    return weighted[Math.floor(Math.random() * weighted.length)];
  }

  /**
   * ボスエリアの背景パネル。本体描画より先（一番下のレイヤ）で呼ぶ。
   * 暖色の放射グラデーションでボス陣地らしさを出す。
   */
  drawBackdrop(renderer: Renderer): void {
    if (this.bossW === 0) return;
    const ctx = renderer.ctx;
    const cx = this.bossX + this.bossW / 2;
    const cy = this.bossY + this.bossH / 2;
    const radius = Math.max(this.bossW, this.bossH) * 0.85;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, 'rgba(110, 75, 50, 0.55)');
    grad.addColorStop(0.55, 'rgba(70, 45, 30, 0.30)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(
      cx - radius,
      cy - radius,
      radius * 2,
      radius * 2,
    );
  }

  draw(renderer: Renderer): void {
    this.drawHpBar(renderer);
    this.drawCharacter(renderer);
  }

  private drawHpBar(renderer: Renderer): void {
    const ctx = renderer.ctx;
    const x = this.hpBarX;
    const y = HP_BAR_TOP;
    const w = this.hpBarW;
    const h = HP_BAR_HEIGHT;
    const r = h / 2; // カプセル形

    // 背景
    ctx.fillStyle = '#2a0000';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();

    // バー本体
    const ratio = this.hpRatio;
    if (ratio > 0) {
      const fillColor = ratio > 0.5
        ? '#66bb6a'
        : ratio > 0.25
          ? '#ffb300'
          : '#ef5350';
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.roundRect(x, y, w * ratio, h, r);
      ctx.fill();

      // 上面ハイライト（ジェリー感）
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w * ratio, h, r);
      ctx.clip();
      const hi = ctx.createLinearGradient(0, y, 0, y + h * 0.6);
      hi.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
      hi.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = hi;
      ctx.fillRect(x, y, w * ratio, h);
      ctx.restore();
    }

    // 枠線
    ctx.strokeStyle = '#aa6666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.stroke();

    // HP数値
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${this.hp} / ${this.maxHp}`, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  /** 攻撃状態に応じた体スケール（ballBoostで膨らむ） */
  private computeBodyScale(): number {
    if (this.attackKind === 'ballBoost') {
      if (this.phase === 'telegraph') return 1 + 0.18 * this.attackPhaseProgress;
      if (this.phase === 'active') return 1.18 - 0.18 * this.attackPhaseProgress;
    }
    return 1;
  }

  /**
   * ボディアタック時のY位置オフセット。
   * telegraph で squash → 上昇 → ホバー、active で落下 → 着地、cooldown で復帰。
   */
  private computeSlamOffsetY(): number {
    if (this.attackKind !== 'bodySlam') return 0;
    const p = this.attackPhaseProgress;
    if (this.phase === 'telegraph') {
      // 0..0.27: しゃがむ（Y方向の動きなし）
      if (p < 0.27) return 0;
      // 0.27..0.66: 上昇（ease-out で頂点に近づくほど減速）
      if (p < 0.66) {
        const t = (p - 0.27) / 0.39;
        const eased = 1 - (1 - t) * (1 - t);
        return SLAM_PEAK_OFFSET_Y * eased;
      }
      // 0.66..1.00: ホバー（最高点）
      return SLAM_PEAK_OFFSET_Y;
    }
    if (this.phase === 'active') {
      // 0..0.5: 落下（ease-in で加速）
      if (p < SLAM_IMPACT_PROGRESS) {
        const t = p / SLAM_IMPACT_PROGRESS;
        const eased = t * t;
        return SLAM_PEAK_OFFSET_Y + (SLAM_IMPACT_OFFSET_Y - SLAM_PEAK_OFFSET_Y) * eased;
      }
      // 0.5..1.0: 着地後の小バウンド
      const t = (p - SLAM_IMPACT_PROGRESS) / (1 - SLAM_IMPACT_PROGRESS);
      const bounce = Math.sin(t * Math.PI) * 6; // 小さく跳ね返る
      return SLAM_IMPACT_OFFSET_Y - bounce;
    }
    if (this.phase === 'cooldown') {
      // 着地位置から元の位置に戻る
      const eased = p * p;
      return SLAM_IMPACT_OFFSET_Y * (1 - eased);
    }
    return 0;
  }

  /** ボディアタック時の squash & stretch スケール（X, Y別々） */
  private computeSlamScale(): { x: number; y: number } {
    if (this.attackKind !== 'bodySlam') return { x: 1, y: 1 };
    const p = this.attackPhaseProgress;
    if (this.phase === 'telegraph') {
      if (p < 0.27) {
        // しゃがむ: Y潰し、X広がり
        const t = p / 0.27;
        return { x: 1 + 0.25 * t, y: 1 - 0.30 * t };
      }
      if (p < 0.66) {
        // 上昇: 縦に伸びる
        const t = (p - 0.27) / 0.39;
        return { x: 1.25 - 0.35 * t, y: 0.70 + 0.50 * t }; // 終点 x=0.90, y=1.20
      }
      // ホバー
      return { x: 0.90, y: 1.20 };
    }
    if (this.phase === 'active') {
      if (p < SLAM_IMPACT_PROGRESS) {
        // 落下中: 縦に伸びたまま
        return { x: 0.90, y: 1.20 };
      }
      // 着地: 縦潰し
      const t = (p - SLAM_IMPACT_PROGRESS) / (1 - SLAM_IMPACT_PROGRESS);
      return { x: 0.90 + 0.45 * t, y: 1.20 - 0.55 * t }; // 終点 x=1.35, y=0.65
    }
    if (this.phase === 'cooldown') {
      // 潰しから元に戻る
      const eased = p * p;
      return { x: 1.35 - 0.35 * eased, y: 0.65 + 0.35 * eased };
    }
    return { x: 1, y: 1 };
  }

  /** 攻撃状態に応じた頭の前方オフセット（reinforceで前傾） */
  private computeHeadLeanX(): number {
    if (this.attackKind === 'reinforce') {
      if (this.phase === 'telegraph') return -6 * this.attackPhaseProgress;
      if (this.phase === 'active' || this.phase === 'cooldown') return -6;
    }
    return 0;
  }

  /** 攻撃状態に応じた目の色 */
  private currentEyeColor(): string {
    if (this.attackKind === 'lightning' && this.phase !== 'idle') {
      // 雷予兆: 黄色く強く光る（点滅）
      const flicker = 0.7 + Math.sin(this.idleTime * 28) * 0.3;
      return `rgba(255, 245, 90, ${flicker})`;
    }
    if (this.attackKind === 'reinforce' && this.phase !== 'idle') {
      return '#ff3333';
    }
    return '#ffeb3b';
  }

  /** 猪を Canvas プリミティブで描画。画面左（プレイエリア側）を向く */
  private drawCharacter(renderer: Renderer): void {
    const ctx = renderer.ctx;

    // 被弾時の右方向のけぞり（左を向いているので右に下がる）
    const recoilX = this.hitRecoil > 0
      ? Math.sin((1 - this.hitRecoil / HIT_RECOIL_DURATION) * Math.PI) * 6
      : 0;

    const idleBounce = Math.sin(this.idleTime * 2.2) * 1.5;
    const slamOffsetY = this.computeSlamOffsetY();
    const slamScale = this.computeSlamScale();
    const cx = this.bossX + this.bossW / 2 + recoilX;
    const cy = this.bossY + this.bossH / 2 + idleBounce + slamOffsetY;
    const w = this.bossW;
    const h = this.bossH;
    const bodyScale = this.computeBodyScale();
    const headLeanX = this.computeHeadLeanX();
    const headRaiseY = this.attackKind === 'lightning'
      ? (this.phase === 'telegraph' ? -10 * this.attackPhaseProgress
          : (this.phase === 'active' || this.phase === 'cooldown') ? -10 : 0)
      : 0;

    // 影（地面に固定。ジャンプの高さに応じて拡縮）
    const shadowScale = Math.max(0.4, 1 + slamOffsetY * 0.005);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.35 * shadowScale})`;
    ctx.beginPath();
    ctx.ellipse(
      this.bossX + this.bossW / 2 + recoilX * 0.3,
      this.bossY + h - 4,
      w * 0.32 * shadowScale,
      5 * shadowScale,
      0, 0, Math.PI * 2,
    );
    ctx.fill();

    // ボス本体は slam の squash/stretch を全体に適用
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(slamScale.x, slamScale.y);
    ctx.translate(-cx, -cy);

    // ボス全体の輝き（攻撃予兆オーラ）
    this.drawAttackAura(ctx, cx, cy, w, h);

    // 脚
    this.drawLegs(ctx, cx, cy, w, h);

    // 体・剛毛は bodyScale で更に拡大縮小（ballBoost用）
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(bodyScale, bodyScale);
    ctx.translate(-cx, -cy);
    this.drawBody(ctx, cx, cy, w, h);
    this.drawBristlySpine(ctx, cx, cy, w, h);
    ctx.restore();

    // 頭（攻撃に応じてオフセット）
    this.drawHead(ctx, cx + headLeanX, cy + headRaiseY, w);

    // 雷の火花エフェクト（頭周辺）
    this.drawLightningSparks(ctx, w);

    ctx.restore();

    // 被弾フラッシュ（全身に白オーバーレイ）
    if (this.hitFlash > 0) {
      const alpha = (this.hitFlash / HIT_FLASH_DURATION) * 0.6;
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(this.bossX - 10, this.bossY - 10, this.bossW + 20, this.bossH + 20);
      ctx.restore();
    }
  }

  /** 攻撃予兆中の全身オーラ（雷=黄、reinforce=赤） */
  private drawAttackAura(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, _h: number): void {
    if (this.phase === 'idle') return;
    let color: [number, number, number] | null = null;
    if (this.attackKind === 'lightning') color = [255, 230, 80];
    else if (this.attackKind === 'reinforce') color = [255, 60, 60];
    if (!color) return;

    const intensity = this.phase === 'telegraph'
      ? this.attackPhaseProgress
      : this.phase === 'active' ? 1
      : (1 - this.attackPhaseProgress) * 0.5;

    const grad = ctx.createRadialGradient(cx, cy, w * 0.15, cx, cy, w * 0.55);
    grad.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${0.20 * intensity})`);
    grad.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(this.bossX - 30, this.bossY - 30, this.bossW + 60, this.bossH + 60);
  }

  /** 雷予兆/発動中、頭周辺に火花パーティクル */
  private drawLightningSparks(ctx: CanvasRenderingContext2D, w: number): void {
    if (this.attackKind !== 'lightning') return;
    if (this.phase === 'idle' || this.phase === 'cooldown') return;
    const intensity = this.phase === 'active' ? 1 : this.attackPhaseProgress;

    const head = this.headPosition;
    const sparkCount = Math.floor(10 * intensity);
    for (let i = 0; i < sparkCount; i++) {
      const angle = this.idleTime * 6 + (i / 10) * Math.PI * 2;
      const r = 14 + Math.sin(this.idleTime * 9 + i * 1.7) * 6;
      const sx = head.x + Math.cos(angle) * r;
      const sy = head.y + Math.sin(angle) * r;
      const radius = 1.4 + (Math.sin(this.idleTime * 14 + i) * 0.5 + 0.5) * 1.2;
      ctx.fillStyle = `rgba(255, 245, 100, ${0.7 * intensity})`;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    // 短い稲妻ジグザグを頭周辺にランダム配置（idleTime ベースで決定論的）
    const boltCount = Math.floor(3 * intensity);
    ctx.strokeStyle = `rgba(255, 250, 200, ${0.8 * intensity})`;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < boltCount; i++) {
      const a = this.idleTime * 3 + i * 2.1;
      const baseX = head.x + Math.cos(a) * w * 0.18;
      const baseY = head.y + Math.sin(a) * w * 0.18;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(baseX + Math.sin(a * 3) * 4, baseY + 4);
      ctx.lineTo(baseX + Math.sin(a * 3) * 4 - 3, baseY + 8);
      ctx.lineTo(baseX + Math.sin(a * 3) * 4 + 2, baseY + 12);
      ctx.stroke();
    }
  }

  private drawLegs(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
    ctx.fillStyle = '#2a1808';
    const legW = w * 0.06;
    const legH = h * 0.22;
    const legY = cy + h * 0.18;
    // 4本：後ろ2本（奥）、前2本（手前）。奥は少し細く・暗く
    // 奥の脚
    ctx.fillStyle = '#1f1106';
    ctx.fillRect(cx - w * 0.14, legY, legW, legH);
    ctx.fillRect(cx + w * 0.18, legY, legW, legH);
    // 手前の脚
    ctx.fillStyle = '#2a1808';
    ctx.fillRect(cx - w * 0.20, legY + 2, legW, legH);
    ctx.fillRect(cx + w * 0.10, legY + 2, legW, legH);
  }

  private drawBody(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
    // 胴体（楕円、左右にやや長い）
    ctx.fillStyle = '#5d3a1a';
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.05, w * 0.35, h * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();

    // 腹（明るい色のハイライト）
    ctx.fillStyle = '#7a5230';
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.18, w * 0.22, h * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    // しっぽ（右側、小さい曲線）
    ctx.strokeStyle = '#3a230d';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.32, cy);
    ctx.quadraticCurveTo(cx + w * 0.42, cy - h * 0.05, cx + w * 0.40, cy + h * 0.08);
    ctx.stroke();
  }

  private drawBristlySpine(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
    // 背中の剛毛（ギザギザの帯）— 猪らしさの要
    ctx.fillStyle = '#1a0e04';
    const spineY = cy - h * 0.22;
    const spikeCount = 7;
    const spineLeft = cx - w * 0.28;
    const spineRight = cx + w * 0.20;
    const span = spineRight - spineLeft;
    ctx.beginPath();
    ctx.moveTo(spineLeft, spineY + 6);
    for (let i = 0; i <= spikeCount; i++) {
      const t = i / spikeCount;
      const x = spineLeft + span * t;
      const isSpike = i % 2 === 1;
      ctx.lineTo(x, isSpike ? spineY - 7 : spineY + 4);
    }
    ctx.lineTo(spineRight, spineY + 6);
    ctx.closePath();
    ctx.fill();
  }

  private drawHead(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number): void {
    // 頭は左寄り（プレイエリア側を向く）
    const headCX = cx - w * 0.28;
    const headCY = cy - w * 0.04;
    const headRX = w * 0.20;
    const headRY = w * 0.18;

    // 頭本体
    ctx.fillStyle = '#5d3a1a';
    ctx.beginPath();
    ctx.ellipse(headCX, headCY, headRX, headRY, 0, 0, Math.PI * 2);
    ctx.fill();

    // 鼻面（さらに左に突き出る）
    const snoutCX = headCX - headRX * 0.85;
    const snoutCY = headCY + headRY * 0.25;
    ctx.fillStyle = '#3a230d';
    ctx.beginPath();
    ctx.ellipse(snoutCX, snoutCY, headRX * 0.55, headRY * 0.50, 0, 0, Math.PI * 2);
    ctx.fill();

    // 鼻孔
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(snoutCX - headRX * 0.30, snoutCY - 2, 2, 0, Math.PI * 2);
    ctx.arc(snoutCX - headRX * 0.30, snoutCY + 4, 2, 0, Math.PI * 2);
    ctx.fill();

    // 牙（上下2本、白い三角形）
    ctx.fillStyle = '#fff5e0';
    ctx.strokeStyle = '#aa8855';
    ctx.lineWidth = 1;
    // 下牙（前向き上向き）
    ctx.beginPath();
    ctx.moveTo(snoutCX - headRX * 0.05, snoutCY + headRY * 0.30);
    ctx.lineTo(snoutCX - headRX * 0.20, snoutCY - headRY * 0.10);
    ctx.lineTo(snoutCX + headRX * 0.10, snoutCY + headRY * 0.20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 反対側の牙
    ctx.beginPath();
    ctx.moveTo(snoutCX - headRX * 0.10, snoutCY + headRY * 0.40);
    ctx.lineTo(snoutCX - headRX * 0.30, snoutCY + headRY * 0.05);
    ctx.lineTo(snoutCX + headRX * 0.05, snoutCY + headRY * 0.30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 耳（三角形2つ）
    ctx.fillStyle = '#3a230d';
    // 手前の耳
    ctx.beginPath();
    ctx.moveTo(headCX - headRX * 0.15, headCY - headRY * 0.85);
    ctx.lineTo(headCX - headRX * 0.45, headCY - headRY * 1.35);
    ctx.lineTo(headCX - headRX * 0.55, headCY - headRY * 0.65);
    ctx.closePath();
    ctx.fill();
    // 奥の耳
    ctx.fillStyle = '#2a1808';
    ctx.beginPath();
    ctx.moveTo(headCX + headRX * 0.10, headCY - headRY * 0.80);
    ctx.lineTo(headCX + headRX * 0.30, headCY - headRY * 1.25);
    ctx.lineTo(headCX + headRX * 0.45, headCY - headRY * 0.55);
    ctx.closePath();
    ctx.fill();

    // 目（攻撃に応じて色が変わる、瞳は黒）
    const eyeX = headCX - headRX * 0.25;
    const eyeY = headCY - headRY * 0.15;
    ctx.fillStyle = this.currentEyeColor();
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(eyeX - 1.5, eyeY, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // 怒り眉（V字）
    ctx.strokeStyle = '#1a0a04';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(headCX - headRX * 0.55, headCY - headRY * 0.55);
    ctx.lineTo(headCX - headRX * 0.10, headCY - headRY * 0.30);
    ctx.stroke();
  }
}
