import type { Renderer } from './Renderer';
import type { Input } from './Input';

export abstract class Scene {
  abstract update(dt: number, input: Input): void;
  abstract draw(renderer: Renderer): void;
  onEnter(): void {}
  onExit(): void {}
}
