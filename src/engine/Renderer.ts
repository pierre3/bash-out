export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private _width: number;
  private _height: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;
    this._width = canvas.width;
    this._height = canvas.height;
  }

  get width(): number { return this._width; }
  get height(): number { return this._height; }

  /**
   * 論理サイズを設定する。バッキングストアは devicePixelRatio 倍の解像度を持ち、
   * ctx.setTransform で論理座標から物理座標への変換を組み込む。
   * これにより呼び出し側は (width, height) の論理座標で描画でき、
   * 高DPI端末でもクリスプに表示される。
   */
  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this._width = width;
    this._height = height;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    // canvas.width/height を変更すると変換行列がリセットされるので、ここで再設定
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear(color = '#1a1428'): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this._width, this._height);
  }

  drawRect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  drawCircle(x: number, y: number, radius: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawText(text: string, x: number, y: number, color: string, font = '16px monospace'): void {
    this.ctx.fillStyle = color;
    this.ctx.font = font;
    this.ctx.fillText(text, x, y);
  }

  /** 5角星を描画。strokeColorを指定すると外周に線を引く（背景に映える） */
  drawStar(
    cx: number,
    cy: number,
    radius: number,
    color: string,
    strokeColor?: string,
    strokeWidth = 1,
  ): void {
    const ctx = this.ctx;
    const spikes = 5;
    const innerR = radius * 0.45;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? radius : innerR;
      const a = -Math.PI / 2 + (i * Math.PI) / spikes;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }
}
