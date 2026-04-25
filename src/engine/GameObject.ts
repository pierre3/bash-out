import type { Renderer } from './Renderer';

export abstract class GameObject {
  x: number;
  y: number;
  width: number;
  height: number;
  vx = 0;
  vy = 0;
  active = true;

  constructor(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  abstract update(dt: number): void;
  abstract draw(renderer: Renderer): void;
}
