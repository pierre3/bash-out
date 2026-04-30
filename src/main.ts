import { Game } from './engine/Game';
import { GameScene } from './game/GameScene';
import { TitleScene } from './game/TitleScene';
import { SoundEngine } from './engine/SoundEngine';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new Game(canvas);
const sound = new SoundEngine();

game.setScene(new TitleScene(sound, () => {
  game.setScene(new GameScene(sound));
}));
game.start();
