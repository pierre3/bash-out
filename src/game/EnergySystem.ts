const MAX_GAUGE = 100;
const MAX_TANKS = 5;
const CHARGE_RATE = 30;        // 1秒あたりのゲージ増加量（後で調整）
const SPEED_BOOST_COST = 15;   // スピードアップ1秒あたりの消費量

export class EnergySystem {
  gauge = 0;
  tanks = 0;
  private _isCharging = false;
  private _isConsuming = false;

  get maxGauge(): number { return MAX_GAUGE; }
  get maxTanks(): number { return MAX_TANKS; }
  get isCharging(): boolean { return this._isCharging; }
  get isConsuming(): boolean { return this._isConsuming; }

  /** チャージ処理（毎フレーム呼ぶ） */
  charge(dt: number): void {
    this._isCharging = true;
    this._isConsuming = false;

    if (this.tanks >= MAX_TANKS) return; // タンク満タン

    this.gauge += CHARGE_RATE * dt;

    if (this.gauge >= MAX_GAUGE) {
      this.gauge = 0;
      this.tanks = Math.min(this.tanks + 1, MAX_TANKS);
    }
  }

  /** スピードアップによるエネルギー消費（毎フレーム呼ぶ） */
  consumeForSpeedBoost(dt: number): boolean {
    this._isConsuming = true;
    const cost = SPEED_BOOST_COST * dt;

    if (this.gauge >= cost) {
      this.gauge -= cost;
      return true;
    }
    // ゲージが足りない場合はスピードアップ不可
    this.gauge = 0;
    return false;
  }

  /**
   * タンクを1個消費してゲージを満タンにする。
   * ダッシュ時にゲージが不足した場合の自動補充に使う。
   */
  tryConsumeTankToFillGauge(): boolean {
    if (this.tanks <= 0) return false;
    this.tanks -= 1;
    this.gauge = MAX_GAUGE;
    return true;
  }

  /**
   * ダッシュ用に固定量のゲージを消費する。
   * ゲージが不足する場合はタンクを1個消費してゲージを満タンにしてから差し引く。
   * 必要なエネルギーが確保できなかった場合は false を返す。
   */
  tryConsumeForDash(cost: number): boolean {
    if (this.gauge < cost) {
      if (!this.tryConsumeTankToFillGauge()) return false;
    }
    this.gauge = Math.max(0, this.gauge - cost);
    this._isConsuming = true;
    return true;
  }

  /** 基本技の発動可能な最大タンク数（将来拡張可能） */
  static readonly MAX_SKILL_TANKS = 3;

  /**
   * 基本技発動。現在のタンク数に応じたスキルIDを返す（= 消費タンク数）。
   * 3より多く持っていても、現在は3タンク技までしか実装されていないため3を上限とする。
   * 発動できなかった場合は0を返す。
   */
  activateSkill(): number {
    if (this.tanks <= 0) return 0;
    const skillId = Math.min(this.tanks, EnergySystem.MAX_SKILL_TANKS);
    this.tanks -= skillId;
    return skillId;
  }

  /** フレーム開始時にリセット（charge/consumeが呼ばれなかった場合のフラグ管理） */
  resetFrameState(): void {
    this._isCharging = false;
    this._isConsuming = false;
  }
}
