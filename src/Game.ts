// src/Game.ts
import { Config } from "./core/Config";
import { Loop } from "./core/Loop";
import { Input } from "./input/Input";
import { Renderer } from "./render/Renderer";
import { Camera } from "./render/Camera";
import { CAWorld } from "./ca/CAWorld";
import { Overlay } from "./debug/Overlay";
import { Perf } from "./debug/Perf";
import { Vec2, v2, lerpV2 } from "./utils/math";

// deterministic PRNG (Mulberry32) for game-side randoms (pickups etc.)
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randInt(r: () => number, min: number, max: number): number {
  if (max < min) [min, max] = [max, min];
  const u = r();
  return Math.floor(min + u * (max - min + 1));
}

type PlayerState = { prev: Vec2; cur: Vec2 };
type SnakeSeg = { x: number; y: number };

type Bullet = { x:number; y:number; vx:number; vy:number; life:number; r:number; dmg:number };


export class Game {
  private loop = new Loop(Config.FIXED_HZ, Config.CA_HZ);
  private input: Input;
  private renderer: Renderer;
  private camera = new Camera();
  private overlay = new Overlay();
  private perf = new Perf();

  private paused = false;
  private stepFixed = 0;
  private stepCA = 0;


  private aim = { x: 0, y: 0 };
  private bombIndex = 0;
  private lastShot = "-";
  private facing = 0; // radians
  private seed: number;
  private r: () => number;

  private player: PlayerState = { prev: v2(100, 100), cur: v2(100, 100) };
  private camPrev = v2(0, 0);
  private camCur = v2(0, 0);

  private ca = new CAWorld(Config.WORLD_W, Config.WORLD_H);

  private fixedTicks = 0;
  private caTicks = 0;

  // Phase2 snake: 1 segment = 1 point
  private snake: SnakeSeg[] = [];       // current positions (tail -> head)
  private snakePrev: SnakeSeg[] = [];   // previous positions for Verlet (same indexing)
  private snakeLen = (Config as any).SNAKE_INITIAL_LEN ?? 5;

  private lastDeath = "-"; // debug only

  private pickups: { x: number; y: number }[] = [];
  private spaceLock = false;

  // speed estimate for “stretch”
  private lastSpeed = 0;

  private bullets: Bullet[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.renderer.setCellSize(4);
    this.input = new Input(window, canvas);
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.seed = (Date.now() >>> 0) ^ 0xc0ffee;
    this.r = mulberry32(this.seed);

    this.ca.seedTestPattern(this.seed);

    // init snake segments behind player (tail -> head)
    this.resetSnakeAt(this.player.cur.x, this.player.cur.y);

    if (Config.ENABLE_PHASE2) {
      const target = (Config as any).PICKUP_MAX_ACTIVE ?? 6;
      for (let i = 0; i < target; i++) this.spawnOnePickupNearStable();
    }
  }

  start(): void {
    this.input.attach();
    this.loop.start({
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      caUpdate: () => this.caUpdate(),
      render: (alpha, frameDtSec) => this.render(alpha, frameDtSec)
    });
  }

  stop(): void {
    this.loop.stop();
    this.input.detach();
  }

  private resetSnakeAt(x: number, y: number): void {
    const baseD = (Config as any).SNAKE_SEG_MIN_DIST ?? 8;
    const len = (Config as any).SNAKE_INITIAL_LEN ?? this.snakeLen ?? 5;
    this.snakeLen = len;

    this.snake = [];
    // tail -> head: head ends at (x,y)
    for (let i = len - 1; i >= 0; i--) {
      this.snake.push({ x: x - i * baseD, y });
    }
    // prev = current (no initial velocity)
    this.snakePrev = this.snake.map(s => ({ x: s.x, y: s.y }));
  }

  private spawnOnePickupNearStable(): void {
    const chunks = this.ca.getStableChunks();

    const clamp = (x: number, y: number) => ({
      x: Math.max(0, Math.min(Config.WORLD_W - 1, x)),
      y: Math.max(0, Math.min(Config.WORLD_H - 1, y))
    });

    const fallback = () =>
      clamp(
        randInt(this.r, 0, Config.WORLD_W - 1),
        randInt(this.r, 0, Config.WORLD_H - 1)
      );

    if (chunks.length === 0) {
      this.pickups.push(fallback());
      return;
    }

    const c = chunks[randInt(this.r, 0, chunks.length - 1)];
    const x0 = c.cx * (Config as any).CHUNK_SIZE;
    const y0 = c.cy * (Config as any).CHUNK_SIZE;

    const tries = (Config as any).PICKUP_SPAWN_TRIES ?? 60;

    for (let t = 0; t < tries; t++) {
      const x = x0 + randInt(this.r, 1, (Config as any).CHUNK_SIZE - 2);
      const y = y0 + randInt(this.r, 1, (Config as any).CHUNK_SIZE - 2);
      if (this.ca.isAlive(x, y)) {
        this.pickups.push(clamp(x, y));
        return;
      }
    }

    const x = x0 + randInt(this.r, 2, (Config as any).CHUNK_SIZE - 3);
    const y = y0 + randInt(this.r, 2, (Config as any).CHUNK_SIZE - 3);
    this.pickups.push(clamp(x, y));
  }

  private fixedUpdate(dtSec: number): void {
    // debug controls
    if (this.input.wasPressed("KeyP")) this.paused = !this.paused;
    if (this.input.wasPressed("Period")) this.stepFixed++;
    if (this.input.wasPressed("Comma")) this.stepCA++;

    // --- PAUSE / STEP gate ---
    if (this.paused) {
      if (this.stepFixed <= 0) return;
      this.stepFixed--;
    }

    const t0 = performance.now();
    this.fixedTicks++;

    // store prev
    this.player.prev = { ...this.player.cur };
    this.camPrev = { ...this.camCur };

    // --- AIM (mouse -> world) ---
    // --- facing: always towards aim ---
  
    // --- movement: WASD only (strafe allowed) ---
    let dx = 0, dy = 0;

    if (this.input.isDown("KeyA") || this.input.isDown("ArrowLeft")) dx -= 1;
    if (this.input.isDown("KeyD") || this.input.isDown("ArrowRight")) dx += 1;
    if (this.input.isDown("KeyW") || this.input.isDown("ArrowUp")) dy -= 1;
    if (this.input.isDown("KeyS") || this.input.isDown("ArrowDown")) dy += 1;

    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;

    // apply movement
    this.player.cur.x += dx * Config.PLAYER_SPEED * dtSec;
    this.player.cur.y += dy * Config.PLAYER_SPEED * dtSec;

    // apply movement
    this.player.cur.x += dx * Config.PLAYER_SPEED * dtSec;
    this.player.cur.y += dy * Config.PLAYER_SPEED * dtSec;

    // clamp world
    this.player.cur.x = Math.max(0, Math.min(Config.WORLD_W - 1, this.player.cur.x));
    this.player.cur.y = Math.max(0, Math.min(Config.WORLD_H - 1, this.player.cur.y));

    // camera follow
    this.camCur = { x: this.player.cur.x, y: this.player.cur.y };
    
    // --- weapons / bombs (input -> debug state) ---
    if (this.input.wasMousePressed(0)) this.lastShot = "weapon1"; // LMB
    if (this.input.wasMousePressed(2)) this.lastShot = "weapon2"; // RMB
    if (this.input.wasMousePressed(1)) this.lastShot = "bomb";    // MMB


    if (this.input.wasMousePressed(0)) this.spawnBullet("w1");
    if (this.input.wasMousePressed(2)) this.spawnBullet("w2");
    if (this.input.wasMousePressed(1)) this.applyBomb();

    const wheel = this.input.consumeWheel();
    if (wheel !== 0) {
      // deltaY: >0 obvykle dolů, <0 nahoru
      const dir = wheel > 0 ? 1 : -1;
      this.bombIndex = Math.max(0, this.bombIndex + dir);
    }
    
    // Shift+Space toggles CA cell under player (debug)
    const shift = this.input.isDown("ShiftLeft") || this.input.isDown("ShiftRight");
    if (shift && this.input.isDown("Space")) {
      if (!this.spaceLock) {
        const x = Math.floor(this.player.cur.x);
        const y = Math.floor(this.player.cur.y);
        const alive = this.ca.isAlive(x, y);
        this.ca.setAlive(x, y, !alive);
        this.spaceLock = true;
      }
    } else {
      this.spaceLock = false;
    }

    if (Config.ENABLE_PHASE2) {
      this.updateSnake(dtSec);
      this.checkPickups();
    }

        this.updateBullets(dtSec);

const t1 = performance.now();
    this.perf.onFixed(t1 - t0);
  }

  // 1 segment = 1 point, Verlet rope with dynamic segment distance
  private updateSnake(_dtSec: number): void {
    if (this.snake.length < 2) return;

    // head is last segment
    const headIdx = this.snake.length - 1;
    const head = this.snake[headIdx];

    // speed estimate based on how much head target moved since last frame
    const prevHead = this.snakePrev[headIdx] ?? { x: head.x, y: head.y };
    const headMoved = Math.hypot(this.player.cur.x - prevHead.x, this.player.cur.y - prevHead.y);
    this.lastSpeed = this.lastSpeed * 0.85 + headMoved * 0.15;

    // 1) pin head to player, and also pin its prev to same spot (no head inertia)
    head.x = this.player.cur.x;
    head.y = this.player.cur.y;
    this.snakePrev[headIdx] = { x: head.x, y: head.y };

    // 2) Verlet integrate other points (inertia)
    const damping = (Config as any).SNAKE_DAMPING ?? 0.95;

    for (let i = 0; i < headIdx; i++) {
      const p = this.snake[i];
      const pp = this.snakePrev[i] ?? { x: p.x, y: p.y };

      const vx = (p.x - pp.x) * damping;
      const vy = (p.y - pp.y) * damping;

      this.snakePrev[i] = { x: p.x, y: p.y };
      p.x += vx;
      p.y += vy;

      p.x = Math.max(0, Math.min(Config.WORLD_W - 1, p.x));
      p.y = Math.max(0, Math.min(Config.WORLD_H - 1, p.y));
    }

    // 3) dynamic segment target distance (stretch/shrink with speed)
    const baseD = (Config as any).SNAKE_SEG_MIN_DIST ?? 8;
    const speedNorm = Math.min(1, this.lastSpeed / ((Config as any).SNAKE_SPEED_NORM ?? 1.2));

    const stretchMin = (Config as any).SNAKE_STRETCH_MIN ?? 0.85;
    const stretchMax = (Config as any).SNAKE_STRETCH_MAX ?? 1.25;
    const segD = baseD * (stretchMin + (stretchMax - stretchMin) * speedNorm);

  
    
    // 4) satisfy constraints (head -> tail pull)
    const iters = (Config as any).SNAKE_CONSTRAINT_ITERS ?? 6;

    for (let iter = 0; iter < iters; iter++) {
      for (let i = headIdx - 1; i >= 0; i--) {
        const a = this.snake[i];       // older (towards tail)
        const b = this.snake[i + 1];   // newer (towards head)

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy) || 1;

        const diff = (d - segD) / d;

        const bIsHead = (i + 1) === headIdx;

        if (bIsHead) {
          // move only a
          a.x -= dx * diff;
          a.y -= dy * diff;
        } else {
          const half = 0.5;
          a.x -= dx * diff * half;
          a.y -= dy * diff * half;
          b.x += dx * diff * half;
          b.y += dy * diff * half;
        }

        a.x = Math.max(0, Math.min(Config.WORLD_W - 1, a.x));
        a.y = Math.max(0, Math.min(Config.WORLD_H - 1, a.y));
        if (!bIsHead) {
          b.x = Math.max(0, Math.min(Config.WORLD_W - 1, b.x));
          b.y = Math.max(0, Math.min(Config.WORLD_H - 1, b.y));
        }
      }
    }

    // ratchet mode: no self-hit, no death
  }

  private checkPickups(): void {
    const head = this.player.cur;
    const r = (Config as any).PICKUP_R ?? (Config as any).PICKUP_RADIUS ?? 10;

    for (let i = 0; i < this.pickups.length; i++) {
      const p = this.pickups[i];
      const d2 = (p.x - head.x) * (p.x - head.x) + (p.y - head.y) * (p.y - head.y);
      if (d2 <= r * r) {
        this.pickups.splice(i, 1);

        // grow by ONE segment (1 segment = 1 point)
        this.growSnakeByOne();

        this.spawnOnePickupNearStable();
        break;
      }
    }
  }

  private growSnakeByOne(): void {
    if (this.snake.length < 2) {
      this.snake.push({ x: this.player.cur.x, y: this.player.cur.y });
      this.snakePrev.push({ x: this.player.cur.x, y: this.player.cur.y });
      this.snakeLen = this.snake.length;
      return;
    }

    const baseD = (Config as any).SNAKE_SEG_MIN_DIST ?? 8;

    const tail = this.snake[0];
    const next = this.snake[1];

    // direction from next -> tail (points outward)
    const dx = tail.x - next.x;
    const dy = tail.y - next.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d;
    const ny = dy / d;

    const newTail = { x: tail.x + nx * baseD, y: tail.y + ny * baseD };

    // insert at tail, and keep prev aligned (no initial velocity for the new segment)
    this.snake.unshift(newTail);
    this.snakePrev.unshift({ x: newTail.x, y: newTail.y });

    this.snakeLen = this.snake.length;
  }

  private caUpdate(): void {
    if (this.paused) {
      if (this.stepCA <= 0) return;
      this.stepCA--;
    }

    
    const t0 = performance.now();
    this.caTicks++;
    this.ca.tick();

    const every = (Config as any).INJECT_EVERY_CA_TICKS ?? 200;
    if (Config.ENABLE_PHASE2 && this.caTicks % every === 0) {
      this.ca.injectGlider(((this.seed ^ this.caTicks) >>> 0));
    }

        this.updateBullets(dtSec);

const t1 = performance.now();
    this.perf.onCA(t1 - t0);
  }

  
  // 1 segment = 1 point
  private getSnakeBody(): { x: number; y: number }[] {
    return this.snake;
  }

  //
  //
  //
  //

  private render(alpha: number, frameDtSec: number): void {
    this.perf.onFrameDelta(frameDtSec * 1000);
    this.overlay.onRenderFrame(frameDtSec);

    this.input.beginFrame();

    const t0 = performance.now();

    this.renderer.clear();

    const p = lerpV2(this.player.prev, this.player.cur, alpha);

      const facing = Math.atan2(this.aim.y - p.y, this.aim.x - p.x);
    const cam = this.camera.follow(this.camPrev, this.camCur, alpha);

    this.renderer.drawGrid(cam);

      const mouse = this.input.getMouse();
      if (mouse && mouse.inside) {
        const rd = this.renderer.getDebug();
        const cell = this.renderer.getCellSize();
        this.aim.x = cam.x + (mouse.x - rd.w * 0.5) / cell;
        this.aim.y = cam.y + (mouse.y - rd.h * 0.5) / cell;
      } else {
        this.aim.x = p.x;
        this.aim.y = p.y;
      }


    this.renderer.drawStableChunks(this.ca.getStableChunks(), cam);
    this.renderer.drawCA(this.ca, cam);


    this.renderer.drawBullets(this.bullets, cam);

    if (Config.ENABLE_PHASE2) {
      this.renderer.drawPickups(this.pickups, cam);
      this.renderer.drawSnake(this.getSnakeBody(), cam);
    }

    this.renderer.drawPlayer(p, cam, facing);
    
    const ctx = this.renderer.getContext();
    const rd = this.renderer.getDebug();

    this.overlay.draw(ctx, [
      `PHASE: ${Config.ENABLE_PHASE2 ? "2" : "1"}`,
      `Seed: ${this.seed >>> 0}`,
      `Paused: ${this.paused ? "YES" : "no"}  (P)`,
      `Step: fixed '.' | CA ','`,
      `Frame: ${this.perf.lastFrameMs.toFixed(1)}ms  worst: ${this.perf.worstFrameMs.toFixed(1)}ms`,
      `Canvas: ${rd.w}x${rd.h} dpr=${rd.dpr.toFixed(2)} resizes=${rd.resizes}`,
      `Fixed: ${this.perf.lastFixedMs.toFixed(2)}ms (avg ${this.perf.avgFixedMs.toFixed(2)})`,
      `CA: ${this.perf.lastCaMs.toFixed(2)}ms (avg ${this.perf.avgCaMs.toFixed(2)})`,
      `Render: ${this.perf.lastRenderMs.toFixed(2)}ms (avg ${this.perf.avgRenderMs.toFixed(2)})`,
      `Ticks: fixed ${this.fixedTicks} | CA ${this.caTicks} | Alive ${this.ca.getAliveCount()}`,
      `Snake segs: ${this.snake.length}  baseD: ${(Config as any).SNAKE_SEG_MIN_DIST ?? 8}`,
      `Speed: ${this.lastSpeed.toFixed(2)}`,
      `Pickups: ${this.pickups.length}`,
      `Move: WASD/arrows  Shift+Space: toggle cell`,
      `Aim: ${this.aim.x.toFixed(1)},${this.aim.y.toFixed(1)}`,
      `Shot: ${this.lastShot}  BombIndex: ${this.bombIndex}`,
      `Input: ${(this.input.getMouse?.()?.inside) ? "MOUSE" : "WASD"}`,

    ]);

        this.updateBullets(dtSec);

const t1 = performance.now();
    this.perf.onRender(t1 - t0);
  }
}