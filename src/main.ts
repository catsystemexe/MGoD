import { Game } from "./Game";

const world = document.getElementById("game") as HTMLCanvasElement;
const ui = document.getElementById("ui") as HTMLCanvasElement;

const game = new Game(world, ui);
game.start();

