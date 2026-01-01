import { Game } from "./Game";
const canvas = document.getElementById("game") as HTMLCanvasElement;
const game = new Game(canvas);
game.start();
window.addEventListener('resize', () => game.onResize());
