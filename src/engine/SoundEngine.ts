/**
 * Web Audio API でゲーム内SFXを合成・再生するエンジン。
 * 音源ファイル不要で、各SFXを発振器・ノイズ・フィルタの組み合わせで生成する。
 *
 * 使い方:
 *  1. インスタンスを作成（ctx はまだ生成されない）
 *  2. 最初のユーザー操作（タップ/キー押下）で `ensureStarted()` を呼ぶ
 *  3. 以降、各SFXメソッドを呼ぶだけ
 */

const MASTER_VOLUME = 0.7;

/** 制御可能な持続音（必殺技チャージ等）の停止コールバック */
export interface SoundHandle {
  stop(): void;
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  /** 最初のユーザー操作で呼ぶ。AudioContext を作成し、suspended なら resume する */
  ensureStarted(): void {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        ?? window.AudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      // 戻り値の Promise は気にしない（再開が遅延しても発音スケジュールは積める）
      void this.ctx.resume();
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    return this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  // ===== SFX presets =====

  /** ボール → パドル */
  ballPaddle(): void {
    this.playBeep('square', 700, 500, 0.07, 0.18);
  }

  /** ボール → ブロック（バウンドのみ。破壊時は blockBreak も別途鳴らす） */
  ballBlock(): void {
    this.playBeep('square', 950, 700, 0.05, 0.13);
  }

  /** ブロック破壊（ノイズバースト+ローパス掃引） */
  blockBreak(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const noise = this.makeNoise(0.18);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, t);
    filter.frequency.exponentialRampToValueAtTime(280, t + 0.18);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(t);
  }

  /** ボス被弾（低い衝撃音） */
  bossHit(): void {
    this.playBeep('sine', 140, 50, 0.18, 0.5);
  }

  /** 必殺技弾の直撃（ボス大ダメージ）— ベース＋高音の二重 */
  bossUltHit(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    // 低音インパクト
    this.playBeep('sine', 180, 40, 0.30, 0.55);
    // 高音シンバル風ノイズ
    const noise = this.makeNoise(0.25);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 3500;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.30, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(t);
  }

  /** ボス怒り突入 */
  enrage(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    // 重ねノコギリ波で迫力
    const a = this.ctx.createOscillator();
    const b = this.ctx.createOscillator();
    a.type = 'sawtooth';
    b.type = 'sawtooth';
    a.frequency.setValueAtTime(180, t);
    a.frequency.exponentialRampToValueAtTime(520, t + 0.55);
    b.frequency.setValueAtTime(184, t); // detune
    b.frequency.exponentialRampToValueAtTime(530, t + 0.55);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.30, t + 0.10);
    gain.gain.linearRampToValueAtTime(0.30, t + 0.45);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    a.connect(gain);
    b.connect(gain);
    gain.connect(this.master);
    a.start(t);
    b.start(t);
    a.stop(t + 0.6);
    b.stop(t + 0.6);
  }

  /** 基本技発動（タンク数によらず共通の上昇アルペジオ） */
  skillActivate(): void {
    if (!this.ctx || !this.master) return;
    const notes = [523, 659, 784]; // C5 E5 G5
    const t0 = this.ctx.currentTime;
    notes.forEach((freq, i) => {
      this.scheduleBeep('triangle', freq, freq, 0.18, 0.22, t0 + i * 0.06);
    });
  }

  /** 必殺技チャージ（持続音、3秒で立ち上がる）。返り値で途中停止可能 */
  ultCharge(durationSec: number): SoundHandle | null {
    if (!this.ctx || !this.master) return null;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(720, t + durationSec);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.20, t + durationSec * 0.5);
    gain.gain.linearRampToValueAtTime(0.20, t + durationSec - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + durationSec);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + durationSec + 0.05);

    let stopped = false;
    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        try {
          const now = ctx.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.stop(now + 0.09);
        } catch { /* already stopped */ }
      },
    };
  }

  /** 必殺技発射 */
  ultFire(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1300, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.35);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4500, t);
    filter.frequency.exponentialRampToValueAtTime(700, t + 0.35);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.40, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  /** ★獲得（ベル風） */
  starGet(): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    this.scheduleBeep('sine', 880, 880, 0.18, 0.25, t0);
    this.scheduleBeep('sine', 1320, 1320, 0.18, 0.22, t0 + 0.05);
  }

  /** バリア膜が破壊された時のガラス風 ping */
  barrierBreak(): void {
    this.playBeep('triangle', 1500, 1100, 0.08, 0.16);
  }

  /** ゲームオーバー（下降する不協和音） */
  gameOver(): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const notes = [440, 349, 277];
    notes.forEach((freq, i) => {
      this.scheduleBeep('triangle', freq, freq * 0.7, 0.7, 0.22, t0 + i * 0.18);
    });
  }

  /** 勝利（上昇する明るいコード） */
  win(): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047]; // C E G C
    notes.forEach((freq, i) => {
      this.scheduleBeep('triangle', freq, freq, 0.6, 0.20, t0 + i * 0.10);
    });
  }

  // ===== 内部ヘルパー =====

  private playBeep(
    type: OscillatorType,
    freqStart: number,
    freqEnd: number,
    duration: number,
    peakGain: number,
  ): void {
    if (!this.ctx) return;
    this.scheduleBeep(type, freqStart, freqEnd, duration, peakGain, this.ctx.currentTime);
  }

  private scheduleBeep(
    type: OscillatorType,
    freqStart: number,
    freqEnd: number,
    duration: number,
    peakGain: number,
    startTime: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, startTime);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);
    }
    gain.gain.setValueAtTime(0.001, startTime);
    const attack = Math.min(0.01, duration * 0.2);
    gain.gain.exponentialRampToValueAtTime(peakGain, startTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain).connect(this.master);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  /** ホワイトノイズ単発バッファソース（再生は caller が start するが、長さは事前確定） */
  private makeNoise(durationSec: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * durationSec), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }
}
