import { Renderer } from './Renderer';
import { Input } from './Input';
import type { Scene } from './Scene';

const FIXED_DT = 1 / 60; // 固定タイムステップ (60fps)
const MAX_FRAME_TIME = 0.25; // スパイラル防止の上限

// 内部論理解像度（9:16）。ゲームロジックは常にこのサイズの座標系で動作する。
const BASE_WIDTH = 540;
const BASE_HEIGHT = 960;
const TARGET_ASPECT = BASE_WIDTH / BASE_HEIGHT;

export class Game {
  readonly renderer: Renderer;
  readonly input: Input;
  private scene: Scene | null = null;
  private accumulator = 0;
  private lastTime = 0;
  private running = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    // 論理解像度を一度だけ確定。以降は CSS のみ変更する
    this.renderer.resize(BASE_WIDTH, BASE_HEIGHT);
    this.input = new Input(canvas);
    this.fitToScreen();
    window.addEventListener('resize', () => this.fitToScreen());
  }

  /**
   * 内部解像度は固定し、CSS の表示サイズだけウィンドウに合わせる。
   * 画面のアスペクト比に応じて上下 or 左右に余白（レターボックス）が出る。
   */
  private fitToScreen(): void {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const screenAspect = screenW / screenH;

    let w: number, h: number;
    if (screenAspect > TARGET_ASPECT) {
      // 画面が横に広い → 高さ基準
      h = screenH;
      w = h * TARGET_ASPECT;
    } else {
      // 画面が縦に長い → 幅基準
      w = screenW;
      h = w / TARGET_ASPECT;
    }

    this.renderer.canvas.style.width = `${Math.floor(w)}px`;
    this.renderer.canvas.style.height = `${Math.floor(h)}px`;
  }

  setScene(scene: Scene): void {
    this.scene?.onExit();
    this.scene = scene;
    this.scene.onEnter();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now() / 1000;
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(timeMs: number): void {
    if (!this.running) return;

    const time = timeMs / 1000;
    let frameTime = time - this.lastTime;
    this.lastTime = time;

    // スパイラル防止
    if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;

    this.accumulator += frameTime;

    // 固定タイムステップで物理更新
    while (this.accumulator >= FIXED_DT) {
      this.scene?.update(FIXED_DT, this.input);
      this.input.endFrame();
      this.accumulator -= FIXED_DT;
    }

    // 描画
    this.renderer.clear();
    this.scene?.draw(this.renderer);

    requestAnimationFrame((t) => this.loop(t));
  }
}
