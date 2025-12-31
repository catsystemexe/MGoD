import { SnakeSeg, PlayerState } from "../types";
import { Config } from "../../core/Config";

export class SnakeSystem {
  private snake: SnakeSeg[] = [];
  private snakePrev: SnakeSeg[] = [];
  private snakeLen = 5;
  private lastSpeed = 0;

  constructor() {
    this.snakeLen = (Config as any).SNAKE_INITIAL_LEN ?? 5;
  }

  resetAt(x: number, y: number) {
    const baseD = (Config as any).SNAKE_SEG_MIN_DIST ?? 3;
    this.snakeLen = (Config as any).SNAKE_INITIAL_LEN ?? 5;
    this.snake = [];
    for (let i = this.snakeLen - 1; i >= 0; i--) {
      this.snake.push({ x: x - i * baseD, y });
    }
    this.snakePrev = this.snake.map((s) => ({ x: s.x, y: s.y }));
  }

  getHead(): SnakeSeg | null {
    return this.snake.length > 0 ? this.snake[this.snake.length - 1] : null;
  }

  getLength(): number {
    return this.snake.length;
  }

  getAllSegments(): SnakeSeg[] {
    return this.snake;
  }

  grow() {
    if (this.snake.length < 1) return;
    // Přidáváme na konec (tail)
    const tail = this.snake[0];
    // Pokud je jen jeden, přidáme za něj, jinak ve směru posledního segmentu
    const prev = this.snake.length > 1 ? this.snake[1] : tail;

    const dx = tail.x - prev.x;
    const dy = tail.y - prev.y;
    const d = Math.hypot(dx, dy) || 1;
    const baseD = (Config as any).SNAKE_SEG_MIN_DIST ?? 3;

    const newTail = { 
        x: tail.x + (dx/d) * baseD, 
        y: tail.y + (dy/d) * baseD 
    };

    this.snake.unshift(newTail);
    this.snakePrev.unshift({ x: newTail.x, y: newTail.y });
    this.snakeLen = this.snake.length;
  }

  shrink() {
    if (this.snake.length <= 1) return; // Hlavu (1. bombu) neničíme
    this.snake.shift();
    this.snakePrev.shift();
    this.snakeLen = this.snake.length;
  }

  update(dtSec: number, player: PlayerState, facing: number) {
    if (this.snake.length < 1) return;

    const headIdx = this.snake.length - 1;
    const head = this.snake[headIdx];
    const prevHead = this.snakePrev[headIdx] ?? { x: head.x, y: head.y };

    // 1. KOTVA (První bomba je pevně za raketkou)
    // Zvětšíme offset, aby bomba nebyla "v motoru", ale těsně za ním
    const offsetDist = 4.5; 
    const anchorX = player.cur.x - Math.cos(facing) * offsetDist;
    const anchorY = player.cur.y - Math.sin(facing) * offsetDist;

    head.x = anchorX;
    head.y = anchorY;
    this.snakePrev[headIdx] = { x: head.x, y: head.y };

    const damping = 0.92; // Menší drag = rychlejší ustálení

    // 2. VERLET + STRAIGHTENING (Rovnání ocasu)
    // Vypočítáme vektor "dozadu" podle natočení hráče
    const backX = -Math.cos(facing);
    const backY = -Math.sin(facing);
    const straightenStrength = 2.5 * dtSec; // Síla rovnání

    for (let i = 0; i < headIdx; i++) {
      const p = this.snake[i];
      const pp = this.snakePrev[i] ?? { x: p.x, y: p.y };

      let vx = (p.x - pp.x) * damping;
      let vy = (p.y - pp.y) * damping;

      // Aplikace síly pro rovnání (tlačí segmenty do linie za lodí)
      // Čím dále od hlavy, tím slabší vliv (aby se ocas vlnil)
      // Ale pro "klidový stav" to pomůže dorovnat
      vx += backX * straightenStrength;
      vy += backY * straightenStrength;

      this.snakePrev[i] = { x: p.x, y: p.y };
      p.x += vx;
      p.y += vy;

      // Clamp
      p.x = Math.max(0, Math.min(Config.WORLD_W - 1, p.x));
      p.y = Math.max(0, Math.min(Config.WORLD_H - 1, p.y));
    }

    // 3. CONSTRAINTS (Pevná délka)
    const baseD = (Config as any).SNAKE_SEG_MIN_DIST ?? 3.0;
    const iters = 20; // Hodně iterací = tvrdé lano (nepruží tolik)

    for (let iter = 0; iter < iters; iter++) {
      for (let i = headIdx - 1; i >= 0; i--) {
        const a = this.snake[i];     // Child
        const b = this.snake[i + 1]; // Parent (blíž k lodi)

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy) || 0.1;

        const diff = (d - baseD) / d;

        // Parent (b) je těžší/fixní, hýbeme hlavně childem (a)
        const bIsHead = (i + 1 === headIdx);

        if (bIsHead) {
          // Hlava je skála (přibitá k lodi)
          a.x -= dx * diff;
          a.y -= dy * diff;
        } else {
          // Ocas následuje
          const share = 0.1; // Parent se hýbe málo, child hodně -> efekt "tažení"
          a.x -= dx * diff * (1 - share);
          a.y -= dy * diff * (1 - share);
          b.x += dx * diff * share;
          b.y += dy * diff * share;
        }
      }
    }
  }
}
