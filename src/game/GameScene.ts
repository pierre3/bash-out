import { Scene } from '../engine/Scene';
import type { Renderer } from '../engine/Renderer';
import type { Input } from '../engine/Input';
import { checkCircleAABB } from '../engine/Collision';
import { Paddle } from './Paddle';
import { Ball } from './Ball';
import { Block } from './Block';
import { Barrier } from './Barrier';
import { StarItem } from './StarItem';
import { Boss, type AttackKind } from './Boss';
import { EnergySystem } from './EnergySystem';
import { HUD } from '../ui/HUD';

const BLOCK_ROWS = 3;                 // 初期段数（追加で下にずれていく前提で薄め）
const BLOCK_COLS = 8;
const BLOCK_HEIGHT = 20;
const BLOCK_GAP = 4;
const BLOCK_ROW_PITCH = BLOCK_HEIGHT + BLOCK_GAP;
const BLOCK_TOP_GAP_FROM_BOSS = 8;    // ボス下端からブロック上端までの余白
const BLOCK_SIDE_PADDING = 10;

const PADDLE_EXPAND_DURATION = 8;     // 秒
const BARRIER_DURATION = 8;           // 秒
const MAX_BALLS = 8;                  // 分裂上限
const SPLIT_SPREAD_ANGLE = Math.PI / 12; // 分裂時の角度差

const STAR_BLOCK_RATIO = 0.3;         // 全ブロック中で★を持つ割合
const STARS_REQUIRED = 3;             // 必殺技発動に必要な★数

const INITIAL_LIVES = 3;              // ライフ機数
const REACH_LINE_OFFSET = 30;         // パドル上端から何px上を到達ラインにするか
const BLOCK_DAMAGE = 1;               // ブロック1個破壊で敵HPに与えるダメージ

// 敵の攻撃パラメータ
const STUN_DURATION = 1.0;            // 電撃: パドル停止秒数
const BALL_BOOST_INCREMENT = 0.30;    // 1回の加速攻撃でベース速度に加算される割合
const BALL_BOOST_CAP = 1.5;           // 加算量の上限（+150% = 最大2.5倍速）
const REINFORCE_MIN = 1;              // ブロック強化の対象数 min
const REINFORCE_MAX = 2;              // 対象数 max

// ダッシュ
const DASH_GAUGE_COST = 25;           // 1回のダッシュで消費するゲージ量（最大ゲージの1/4）

// 必殺技「貫通弾」のパラメータ
const ULT_CHARGE_DURATION = 3.0;      // チャージ秒数（発射までの時間）
const ULT_ORB_OFFSET_Y = -28;         // パドル上端からエネルギー塊までの距離
const ULT_ORB_MAX_RADIUS = 18;        // チャージ完了時のエネルギー塊の半径
const ULT_BULLET_WIDTH = 24;          // 貫通弾の幅
const ULT_BULLET_HEIGHT = 50;         // 貫通弾の高さ
const ULT_BULLET_SPEED = 2200;        // 貫通弾の速度（px/秒、上方向）

type UltPhase = 'idle' | 'charging' | 'firing';

export class GameScene extends Scene {
  private paddle!: Paddle;
  private balls: Ball[] = [];
  private blocks: Block[] = [];
  private barrier!: Barrier;
  private stars: StarItem[] = [];
  private starsCollected = 0;
  private energy!: EnergySystem;
  private boss!: Boss;
  private lives = INITIAL_LIVES;
  private blockTopOffset = 0;
  private reinforceTargets: Block[] = []; // 強化攻撃のビーム描画用に保持
  private cumulativeBallBoost = 0;        // ボール加速の蓄積量（永続）
  // 必殺技「貫通弾」
  private ultPhase: UltPhase = 'idle';
  private ultChargeTimer = 0;
  private ultBulletX = 0;
  private ultBulletY = 0;                 // 弾の上端y
  /** draw 時に HUD のタッチボタン描画で使うため、最後の update の Input を保持 */
  private lastInput: Input | null = null;
  private hud = new HUD();
  private canvasWidth = 0;
  private canvasHeight = 0;
  private gameOver = false;
  private cleared = false;

  override onEnter(): void {
    // サイズはdrawの際にrendererから取得して初期化
  }

  private init(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.paddle = new Paddle(width, height);
    this.balls = [this.spawnBallOnPaddle()];
    this.barrier = new Barrier(width, height);
    this.stars = [];
    this.starsCollected = 0;
    this.energy = new EnergySystem();
    this.boss = new Boss();
    this.boss.setLayout(width);
    this.blockTopOffset = this.boss.bottomY + BLOCK_TOP_GAP_FROM_BOSS;
    this.blocks = this.createInitialBlocks(width);
    this.lives = INITIAL_LIVES;
    this.reinforceTargets = [];
    this.cumulativeBallBoost = 0;
    this.ultPhase = 'idle';
    this.ultChargeTimer = 0;
    this.gameOver = false;
    this.cleared = false;
  }

  private spawnBallOnPaddle(): Ball {
    const ball = new Ball(this.paddle.x + this.paddle.width / 2, this.paddle.y - 12);
    if (this.cumulativeBallBoost > 0) ball.setBoost(this.cumulativeBallBoost);
    return ball;
  }

  private createInitialBlocks(canvasWidth: number): Block[] {
    const blocks: Block[] = [];
    for (let row = 0; row < BLOCK_ROWS; row++) {
      const y = this.blockTopOffset + row * BLOCK_ROW_PITCH;
      blocks.push(...this.createBlockRow(canvasWidth, y));
    }
    return blocks;
  }

  private createBlockRow(canvasWidth: number, y: number): Block[] {
    const row: Block[] = [];
    const totalWidth = canvasWidth - BLOCK_SIDE_PADDING * 2;
    const blockWidth = totalWidth / BLOCK_COLS;
    for (let col = 0; col < BLOCK_COLS; col++) {
      const hasStar = Math.random() < STAR_BLOCK_RATIO;
      row.push(new Block(
        BLOCK_SIDE_PADDING + col * blockWidth,
        y,
        blockWidth,
        BLOCK_HEIGHT,
        1,
        hasStar,
      ));
    }
    return row;
  }

  /** ブロック群が触れたら敗北となる到達ラインの y 座標 */
  private get reachLineY(): number {
    return this.paddle.y - REACH_LINE_OFFSET;
  }

  update(dt: number, input: Input): void {
    this.lastInput = input;
    if (this.canvasWidth === 0) return;

    if (this.gameOver || this.cleared) {
      if (input.isSkillActivate()) {
        this.init(this.canvasWidth, this.canvasHeight);
      }
      return;
    }

    // エネルギーフレーム状態リセット
    this.energy.resetFrameState();

    // エネルギー: チャージ判定
    if (input.isCharging()) {
      this.energy.charge(dt);
    }

    // ダブルタップでダッシュ発動（固定コストをゲージ/タンクから消費）
    const boostTrigger = input.consumeBoostTrigger();
    if (boostTrigger && this.energy.tryConsumeForDash(DASH_GAUGE_COST)) {
      this.paddle.triggerDash(boostTrigger);
    }

    // パドル入力
    this.paddle.handleInput(input, dt);

    // 基本技発動: ↑キー or スキル名吹き出しのタップ
    const bubbleBounds = this.hud.getSkillBubbleBounds();
    const skillTriggered = input.isSkillActivate() ||
      (bubbleBounds !== null && input.consumePointerDownIn(
        bubbleBounds.x, bubbleBounds.y, bubbleBounds.w, bubbleBounds.h,
      ));
    if (skillTriggered) {
      const skillId = this.energy.activateSkill();
      if (skillId > 0) {
        this.executeSkill(skillId);
      }
    }

    // 更新処理
    this.paddle.update(dt);
    this.paddle.clamp(0, this.canvasWidth);
    this.barrier.update(dt);
    this.boss.update(dt);

    // ブロック内部状態（強化フラッシュ等）
    for (const b of this.blocks) b.update(dt);

    // ボスの攻撃発動を検出して効果を適用
    const activation = this.boss.pollActivation();
    if (activation) this.applyAttack(activation);

    // 必殺技（チャージ → 自動発射 → 衝突）
    this.updateUltimate(dt);

    // HPバー(y=8〜24)に重ならないよう、ボールの上壁は HP バー直下とする
    const ballTopWall = 28;

    // サブステッピング: 高速ボールがブロックをすり抜けるのを防ぐ。
    // 1ステップあたりの最大移動量を半径以下に保てば、衝突判定が見逃されない。
    const stepLimit = 6;
    let maxSpeed = 0;
    for (const b of this.balls) maxSpeed = Math.max(maxSpeed, b.speed);
    const steps = Math.max(1, Math.ceil((maxSpeed * dt) / stepLimit));
    const subDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      for (const ball of this.balls) {
        ball.update(subDt);
        ball.bounceWalls(0, this.canvasWidth, ballTopWall);
      }
      this.handleCollisions();
    }

    // ボール落下 / バリア処理 / ライフ消費
    this.handleBallFalls();

    if (this.gameOver) return;

    // ★アイテム更新・キャッチ判定
    this.updateStars(dt);

    // 到達ライン判定（ブロックがパドル付近まで来たら敗北）
    if (this.blocks.some(b => b.active && b.y + b.height >= this.reachLineY)) {
      this.gameOver = true;
      return;
    }

    // 勝利判定（ボスHPゼロ）
    if (this.boss.isDead) {
      this.cleared = true;
    }
  }

  private applyAttack(kind: AttackKind): void {
    switch (kind) {
      case 'lightning':
        this.paddle.stun(STUN_DURATION);
        break;
      case 'ballBoost':
        this.cumulativeBallBoost = Math.min(this.cumulativeBallBoost + BALL_BOOST_INCREMENT, BALL_BOOST_CAP);
        for (const b of this.balls) b.setBoost(this.cumulativeBallBoost);
        break;
      case 'reinforce':
        this.reinforceTargets = this.pickReinforceTargets();
        for (const b of this.reinforceTargets) b.reinforce();
        break;
      case 'bodySlam':
        // 着地タイミングで Boss 側から通知される。新しい段を最上段に追加し既存を下にずらす
        this.spawnBlockRowFromTop();
        break;
    }
  }

  private pickReinforceTargets(): Block[] {
    const candidates = this.blocks.filter(b => b.active && b.maxHp < 3);
    if (candidates.length === 0) return [];
    const count = Math.min(
      candidates.length,
      REINFORCE_MIN + Math.floor(Math.random() * (REINFORCE_MAX - REINFORCE_MIN + 1)),
    );
    // ランダムに count 個選ぶ
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }

  /** 既存ブロック群を1段下にずらし、最上段に新しい段を追加する */
  private spawnBlockRowFromTop(): void {
    for (const b of this.blocks) {
      if (b.active) b.y += BLOCK_ROW_PITCH;
    }
    this.blocks.push(...this.createBlockRow(this.canvasWidth, this.blockTopOffset));
  }

  private updateStars(dt: number): void {
    const remaining: StarItem[] = [];
    for (const star of this.stars) {
      star.update(dt);

      // 画面下に落ちたら消失（取り逃し）
      if (star.isBelowScreen(this.canvasHeight)) continue;

      // パドルとの当たり判定（AABB）
      const overlapX = Math.min(star.x + star.width, this.paddle.x + this.paddle.width)
                     - Math.max(star.x, this.paddle.x);
      const overlapY = Math.min(star.y + star.height, this.paddle.y + this.paddle.height)
                     - Math.max(star.y, this.paddle.y);
      if (overlapX > 0 && overlapY > 0) {
        this.collectStar();
        continue;
      }

      remaining.push(star);
    }
    this.stars = remaining;
  }

  private collectStar(): void {
    this.starsCollected++;
    this.tryActivateUltimate();
  }

  /** ★が3つ以上溜まり、かつ ult が idle なら発動。蓄積分は次回に持ち越し */
  private tryActivateUltimate(): void {
    if (this.starsCollected >= STARS_REQUIRED && this.ultPhase === 'idle') {
      this.starsCollected -= STARS_REQUIRED;
      this.startUltimateCharge();
    }
  }

  private startUltimateCharge(): void {
    this.ultPhase = 'charging';
    this.ultChargeTimer = ULT_CHARGE_DURATION;
  }

  private updateUltimate(dt: number): void {
    if (this.ultPhase === 'charging') {
      this.ultChargeTimer = Math.max(0, this.ultChargeTimer - dt);
      if (this.ultChargeTimer === 0) {
        this.fireUltimate();
      }
    } else if (this.ultPhase === 'firing') {
      this.ultBulletY -= ULT_BULLET_SPEED * dt;
      this.checkUltBulletCollisions();
      // 画面上端を完全に通過したら終了
      if (this.ultBulletY + ULT_BULLET_HEIGHT < 0) {
        this.ultPhase = 'idle';
        // チャージ・発射中に蓄積していた★があればすぐ次の発動へ
        this.tryActivateUltimate();
      }
    }
  }

  private fireUltimate(): void {
    this.ultPhase = 'firing';
    this.ultBulletX = this.paddle.x + this.paddle.width / 2;
    // 弾の下端がパドル上端から出る形で開始
    this.ultBulletY = this.paddle.y - ULT_BULLET_HEIGHT;
  }

  /** 貫通弾と現在のブロック群の衝突判定（HP無視で破壊） */
  private checkUltBulletCollisions(): void {
    const left = this.ultBulletX - ULT_BULLET_WIDTH / 2;
    const right = this.ultBulletX + ULT_BULLET_WIDTH / 2;
    const top = this.ultBulletY;
    const bottom = this.ultBulletY + ULT_BULLET_HEIGHT;

    for (const b of this.blocks) {
      if (!b.active) continue;
      const hit = right > b.x && left < b.x + b.width
                && bottom > b.y && top < b.y + b.height;
      if (!hit) continue;

      // HPに関係なく破壊
      b.hp = 0;
      b.active = false;
      this.boss.damage(BLOCK_DAMAGE);
      if (b.hasStar) {
        this.stars.push(new StarItem(
          b.x + b.width / 2,
          b.y + b.height / 2,
        ));
      }
    }
  }

  private handleBallFalls(): void {
    const remainingBalls: Ball[] = [];
    for (const ball of this.balls) {
      if (!ball.isBelowScreen(this.canvasHeight)) {
        remainingBalls.push(ball);
        continue;
      }
      // バリアが有効ならボールを跳ね返す
      if (this.barrier.active) {
        ball.y = this.barrier.y - ball.height;
        ball.vy = -Math.abs(ball.vy);
        remainingBalls.push(ball);
      }
      // バリアなしの場合はボールを消す（落下）
    }
    this.balls = remainingBalls;

    // 全ボール落下時のみライフ消費し、パドル上に即スポーン
    if (this.balls.length === 0) {
      this.lives -= 1;
      if (this.lives <= 0) {
        this.lives = 0;
        this.gameOver = true;
        return;
      }
      // ミス時はボール加速の蓄積をリセット（リスポーン後のボールを通常速度に戻す）
      this.cumulativeBallBoost = 0;
      this.balls = [this.spawnBallOnPaddle()];
    }
  }

  private handleCollisions(): void {
    for (const ball of this.balls) {
      // ボール vs パドル（実体）
      const paddleResult = checkCircleAABB(
        ball.cx, ball.cy, ball.radius, this.paddle
      );
      if (paddleResult.hit && ball.vy > 0) {
        ball.bounceOffPaddle(this.paddle.x, this.paddle.width);
        ball.y -= paddleResult.overlap;
      } else if (ball.vy > 0) {
        // ボール vs ダッシュ残像（実体に当たっていない時だけチェック）
        for (const af of this.paddle.getAfterimageBoxes()) {
          const r = checkCircleAABB(ball.cx, ball.cy, ball.radius, af);
          if (r.hit) {
            ball.bounceOffPaddle(af.x, af.width);
            ball.y -= r.overlap;
            break;
          }
        }
      }

      // ボール vs ブロック
      for (const block of this.blocks) {
        if (!block.active) continue;
        const result = checkCircleAABB(
          ball.cx, ball.cy, ball.radius, block
        );
        if (result.hit) {
          block.hit();
          // 破壊した瞬間にボスにダメージ + ★ドロップ
          if (!block.active) {
            this.boss.damage(BLOCK_DAMAGE);
            if (block.hasStar) {
              this.stars.push(new StarItem(
                block.x + block.width / 2,
                block.y + block.height / 2,
              ));
            }
          }
          if (Math.abs(result.nx) > Math.abs(result.ny)) {
            ball.vx = Math.abs(ball.vx) * result.nx;
          } else {
            ball.vy = Math.abs(ball.vy) * result.ny;
          }
          ball.x += result.nx * result.overlap;
          ball.y += result.ny * result.overlap;
          break;
        }
      }
    }
  }

  private executeSkill(skillId: number): void {
    switch (skillId) {
      case 1:
        // パドル拡大
        this.paddle.startExpand(PADDLE_EXPAND_DURATION);
        break;
      case 2:
        // ボール分裂: 既存ボールを±分裂
        this.splitBalls();
        break;
      case 3:
        // バリア
        this.barrier.activate(BARRIER_DURATION);
        break;
    }
  }

  private splitBalls(): void {
    const newBalls: Ball[] = [];
    for (const ball of this.balls) {
      if (this.balls.length + newBalls.length >= MAX_BALLS) break;
      newBalls.push(ball.cloneWithAngleOffset(SPLIT_SPREAD_ANGLE));
      if (this.balls.length + newBalls.length >= MAX_BALLS) break;
      newBalls.push(ball.cloneWithAngleOffset(-SPLIT_SPREAD_ANGLE));
    }
    this.balls.push(...newBalls);
  }

  draw(renderer: Renderer): void {
    if (this.canvasWidth === 0) {
      this.init(renderer.width, renderer.height);
    }

    // ボスエリアの背景パネル（最背面）
    this.boss.drawBackdrop(renderer);

    // 到達ライン（薄い破線で警告表示）
    this.drawReachLine(renderer);

    // ブロック
    for (const block of this.blocks) {
      block.draw(renderer);
    }

    // バリア
    this.barrier.draw(renderer);

    // パドル
    this.paddle.draw(renderer);

    // 必殺技チャージ中のエネルギー塊（パドル直上に集まる）
    this.drawUltimateCharge(renderer);

    // ボール
    for (const ball of this.balls) {
      ball.draw(renderer);
    }

    // ★アイテム
    for (const star of this.stars) {
      star.draw(renderer);
    }

    // ボス（HPバー）
    this.boss.draw(renderer);

    // 攻撃の外部エフェクト（雷・息・ビーム）
    this.drawAttackEffects(renderer);

    // 必殺技の発射弾（ボスより前面で目立つ）
    this.drawUltimateBullet(renderer);

    // HUD（タッチボタンも HUD 内で描画）
    this.hud.draw(renderer, this.energy, this.starsCollected, STARS_REQUIRED, this.lastInput);

    // ライフ表示（左上）
    this.drawLives(renderer);

    // ゲームオーバー / クリア表示
    if (this.gameOver) {
      renderer.drawText('GAME OVER', renderer.width / 2 - 70, renderer.height / 2, '#ff4444', '28px monospace');
      renderer.drawText('Press ↑ to restart', renderer.width / 2 - 90, renderer.height / 2 + 40, '#888', '16px monospace');
    }
    if (this.cleared) {
      renderer.drawText('YOU WIN!', renderer.width / 2 - 60, renderer.height / 2, '#44ff44', '28px monospace');
      renderer.drawText('Press ↑ to restart', renderer.width / 2 - 90, renderer.height / 2 + 40, '#888', '16px monospace');
    }
  }

  private drawAttackEffects(renderer: Renderer): void {
    const phase = this.boss.attackPhase;
    const kind = this.boss.currentAttackKind;
    if (!kind || phase !== 'active') return;

    if (kind === 'lightning') this.drawLightningBolt(renderer);
    else if (kind === 'ballBoost') this.drawPuffCloud(renderer);
    else if (kind === 'reinforce') this.drawReinforceBeams(renderer);
  }

  private drawLightningBolt(renderer: Renderer): void {
    const head = this.boss.headPosition;
    const targetX = this.paddle.x + this.paddle.width / 2;
    const targetY = this.paddle.y;
    const progress = this.boss.attackPhaseProgress;
    const alpha = Math.sin(progress * Math.PI); // 中盤でピーク

    const ctx = renderer.ctx;
    ctx.save();
    ctx.shadowColor = '#fff8a0';
    ctx.shadowBlur = 12;

    // パスを1度だけ作って、2回 stroke（外側=太く色付き、内側=細く白）
    const segments = 9;
    ctx.beginPath();
    ctx.moveTo(head.x, head.y);
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const baseX = head.x + (targetX - head.x) * t;
      const baseY = head.y + (targetY - head.y) * t;
      const offset = (Math.random() - 0.5) * 22;
      ctx.lineTo(baseX + offset, baseY);
    }
    ctx.lineTo(targetX, targetY);

    ctx.strokeStyle = `rgba(255, 240, 130, ${alpha * 0.9})`;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 255, 240, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  private drawPuffCloud(renderer: Renderer): void {
    const snout = this.boss.snoutPosition;
    const progress = this.boss.attackPhaseProgress;
    const ctx = renderer.ctx;
    const puffCount = 6;
    for (let i = 0; i < puffCount; i++) {
      const offset = i / (puffCount - 1);
      const distance = 18 + offset * 60 + progress * 90;
      const cx = snout.x - distance;
      const cy = snout.y + Math.sin(offset * 5 + progress * 3) * 5;
      const r = 5 + offset * 7 + progress * 6;
      const alpha = (1 - progress * 0.8) * 0.55 * (1 - offset * 0.4);
      ctx.fillStyle = `rgba(220, 230, 240, ${alpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawReinforceBeams(renderer: Renderer): void {
    if (this.reinforceTargets.length === 0) return;
    const eye = this.boss.eyePosition;
    const progress = this.boss.attackPhaseProgress;
    const alpha = Math.sin(progress * Math.PI);
    const ctx = renderer.ctx;

    for (const block of this.reinforceTargets) {
      if (!block.active) continue;
      const tx = block.x + block.width / 2;
      const ty = block.y + block.height / 2;

      // 外側のグロー
      ctx.strokeStyle = `rgba(255, 60, 60, ${alpha * 0.35})`;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(eye.x, eye.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      // 内側のビーム
      ctx.strokeStyle = `rgba(255, 220, 220, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(eye.x, eye.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
  }

  /** チャージ中のエネルギー塊をパドル直上に描画 */
  private drawUltimateCharge(renderer: Renderer): void {
    if (this.ultPhase !== 'charging') return;
    const ctx = renderer.ctx;
    const cx = this.paddle.x + this.paddle.width / 2;
    const cy = this.paddle.y + ULT_ORB_OFFSET_Y;
    const progress = 1 - this.ultChargeTimer / ULT_CHARGE_DURATION; // 0..1
    const baseRadius = 3 + progress * (ULT_ORB_MAX_RADIUS - 3);
    // 細かく脈動
    const pulse = 1 + Math.sin(performance.now() * 0.018) * 0.18;
    const r = baseRadius * pulse;

    // 外側のグロー
    const glowGrad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 2.8);
    glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    glowGrad.addColorStop(0.4, 'rgba(150, 230, 255, 0.55)');
    glowGrad.addColorStop(1, 'rgba(150, 230, 255, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.8, 0, Math.PI * 2);
    ctx.fill();

    // 中心の白いコア
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // パーティクルが外側からコアに向かって収束
    const particleCount = 8;
    const t = performance.now() * 0.001;
    const inflowRadius = 50 + (1 - progress) * 30;
    for (let i = 0; i < particleCount; i++) {
      const phase = (t * 1.4 + i / particleCount) % 1; // 0..1（再生周期）
      const dist = (1 - phase) * inflowRadius;
      const angle = i / particleCount * Math.PI * 2 + t * 0.7;
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      const alpha = phase * 0.85;
      const psize = 1.2 + phase * 1.8;
      ctx.fillStyle = `rgba(180, 240, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px, py, psize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 発射中の貫通弾を描画 */
  private drawUltimateBullet(renderer: Renderer): void {
    if (this.ultPhase !== 'firing') return;
    const ctx = renderer.ctx;
    const x = this.ultBulletX - ULT_BULLET_WIDTH / 2;
    const y = this.ultBulletY;
    const w = ULT_BULLET_WIDTH;
    const h = ULT_BULLET_HEIGHT;

    // 後方の余韻（弾の下からパドル付近まで残るトレイル）
    const trailLength = 140;
    const trailGrad = ctx.createLinearGradient(0, y + h, 0, y + h + trailLength);
    trailGrad.addColorStop(0, 'rgba(180, 235, 255, 0.55)');
    trailGrad.addColorStop(1, 'rgba(180, 235, 255, 0)');
    ctx.fillStyle = trailGrad;
    ctx.fillRect(x + 3, y + h, w - 6, trailLength);

    // 外側のソフトグロー
    ctx.save();
    ctx.shadowColor = '#80e0ff';
    ctx.shadowBlur = 22;
    ctx.fillStyle = 'rgba(150, 230, 255, 0.55)';
    ctx.beginPath();
    ctx.roundRect(x - 3, y - 3, w + 6, h + 6, w / 2 + 3);
    ctx.fill();
    ctx.restore();

    // 弾本体（白いコア + シアンの縁取り）
    const bodyGrad = ctx.createLinearGradient(x, 0, x + w, 0);
    bodyGrad.addColorStop(0, '#80c8ff');
    bodyGrad.addColorStop(0.5, '#ffffff');
    bodyGrad.addColorStop(1, '#80c8ff');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, w / 2);
    ctx.fill();

    // 中央の輝線
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(x + w / 2 - 1.5, y + 4, 3, h - 8);
  }

  private drawReachLine(renderer: Renderer): void {
    const ctx = renderer.ctx;
    const y = this.reachLineY;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 80, 80, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(this.canvasWidth, y);
    ctx.stroke();
    ctx.restore();
  }

  private drawLives(renderer: Renderer): void {
    const ctx = renderer.ctx;
    const margin = 12;
    const r = 6;
    const top = 32; // HPバーの下
    for (let i = 0; i < INITIAL_LIVES; i++) {
      const x = margin + r + i * (r * 2 + 6);
      const filled = i < this.lives;
      ctx.beginPath();
      ctx.arc(x, top + r, r, 0, Math.PI * 2);
      ctx.fillStyle = filled ? '#4fc3f7' : 'rgba(79, 195, 247, 0.15)';
      ctx.fill();
      ctx.strokeStyle = filled ? '#0288d1' : '#3a5a6a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
