import { Game } from './engine/Game';
import { GameScene } from './game/GameScene';
import { TitleScene } from './game/TitleScene';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new Game(canvas);
game.setScene(new TitleScene(() => {
  game.setScene(new GameScene());
}));
game.start();
