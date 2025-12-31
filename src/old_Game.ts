import { Config } from "./core/Config";
import { Loop } from "./core/Loop";
import { Input } from "./input/Input";
import { Renderer } from "./render/Renderer";
import { Camera } from "./render/Camera";
import { CAWorld } from "./ca/CAWorld";
import { Overlay } from "./debug/Overlay";
import { Perf } from "./debug/Perf";
import { Vec2, v2, lerpV2 } from "./utils/math";

// Systems
import { ParticleSystem } from "./game/systems/ParticleSystem";
import { ProjectileSystem } from "./game/systems/ProjectileSystem";
import { SnakeSystem } from "./game/systems/SnakeSystem";
import { WeaponsSystem } from "./game/systems/WeaponsSystem";
import { PlayerState } from "./game/types";

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

export class Game {
  private loop = new Loop(Config.FIXED_HZ, Config.CA_HZ);
  private input: Input;
  private renderer: Renderer;
  private camera = new Camera();
  private overlay = new Overlay();
  private perf = new Perf();

  // --- Systems ---
  private particles = new ParticleSystem();
  private projectiles = new ProjectileSystem();
  private snake = new SnakeSystem();
  private weapons = new WeaponsSystem();

  // --- GAME STATE ---
  private state: "PLAY" | "GAME_OVER" = "PLAY";
  private gameOverReason = "";
  
  private energy = 100;
  private energyMax = 100;
  private damagePerSec = 30; 
  private invuln = 0; 
  private score = 0;

  private paused = false;
  private stepFixed = 0;
  private stepCA = 0;

  private aim = { x: 0, y: 0 };
  private facing = 0; 
  private seed: number;
  private r: () => number;

  private player: PlayerState = { prev: v2(100, 100), cur: v2(100, 100) };
  private camPrev = v2(0, 0);
  private camCur = v2(0, 0);

  private ca = new CAWorld(Config.WORLD_W, Config.WORLD_H);

  private fixedTicks = 0;
  private caTicks = 0;

  private pickups: { x: number; y: number }[] = [];
  private lmbDown = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.renderer.setCellSize(4);
    this.input = new Input(window, canvas);

    const style = document.createElement('style');
    style.innerHTML = `
      html, body {
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: #000;
        width: 100%;
        height: 100%;
      }
      canvas {
        display: block;
        width: 100vw;
        height: 100vh;
        touch-action: none;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        outline: none;
      }
    `;
    document.head.appendChild(style);
    
    const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
    };
    window.addEventListener('resize', resize);
    resize(); 

    window.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, { passive: false });

    this.canvas.addEventListener("pointerdown", (e) => {
      this.canvas.focus();
      if (e.button === 0) this.lmbDown = true;
      if (e.button === 2) {
        e.preventDefault();
        this.weapons.tryFireSecondary(this.projectiles, this.player.cur, this.aim);
      }
    });

    this.canvas.addEventListener("pointerup", (e) => {
      if (e.button === 0) this.lmbDown = false;
    });

    this.canvas.addEventListener("pointerleave", () => {
      this.lmbDown = false;
    });

    this.seed = (Date.now() >>> 0) ^ 0xc0ffee;
    this.r = mulberry32(this.seed);
    this.ca.seedTestPattern(this.seed);
    this.snake.resetAt(this.player.cur.x, this.player.cur.y);

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
      render: (alpha, frameDtSec) => this.render(alpha, frameDtSec),
    });
  }

  stop(): void {
    this.loop.stop();
    this.input.detach();
  }

  private setGameOver(reason: string): void {
      this.state = "GAME_OVER";
      this.gameOverReason = reason;
      console.log("GAME OVER:", reason);
  }

  private resetGame(): void {
      this.state = "PLAY";
      this.energy = this.energyMax;
      this.score = 0;
      this.invuln = 2.0; 
      
      this.projectiles.reset();
      this.particles.reset();
      this.weapons.reset();
      
      this.player.cur = v2(100, 100);
      this.player.prev = { ...this.player.cur };
      this.camCur = { ...this.player.cur };
      this.camPrev = { ...this.player.cur };
      
      this.snake.resetAt(this.player.cur.x, this.player.cur.y);
      this.pickups = [];
      
      this.seed = (Date.now() >>> 0) ^ 0xc0ffee;
      this.r = mulberry32(this.seed);
      this.ca.seedTestPattern(this.seed);
      
      if (Config.ENABLE_PHASE2) {
          const target = (Config as any).PICKUP_MAX_ACTIVE ?? 6;
          for (let i = 0; i < target; i++) this.spawnOnePickupNearStable();
      }
  }

  private spawnOnePickupNearStable(): void {
    const chunks = this.ca.getStableChunks();
    const clamp = (x: number, y: number) => ({
      x: Math.max(0, Math.min(Config.WORLD_W - 1, x)),
      y: Math.max(0, Math.min(Config.WORLD_H - 1, y)),
    });
    const fallback = () =>
      clamp(randInt(this.r, 0, Config.WORLD_W - 1), randInt(this.r, 0, Config.WORLD_H - 1));

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
    if (this.input.wasPressed("KeyP")) this.paused = !this.paused;
    if (this.input.wasPressed("Period")) this.stepFixed++;
    if (this.input.wasPressed("Comma")) this.stepCA++;

    // --- GAME OVER ---
    if (this.state === "GAME_OVER") {
        this.particles.update(dtSec);
        if (this.input.wasPressed("KeyY")) this.resetGame();
        if (this.input.wasPressed("KeyN")) this.stop();
        return; 
    }

    if (this.paused) {
      if (this.stepFixed <= 0) return;
      this.stepFixed--;
    }

    const t0 = performance.now();
    this.fixedTicks++;

    this.player.prev = { ...this.player.cur };
    this.camPrev = { ...this.camCur };

    // --- Movement ---
    let dx = 0, dy = 0;
    if (this.input.isDown("KeyA") || this.input.isDown("ArrowLeft")) dx -= 1;
    if (this.input.isDown("KeyD") || this.input.isDown("ArrowRight")) dx += 1;
    if (this.input.isDown("KeyW") || this.input.isDown("ArrowUp")) dy -= 1;
    if (this.input.isDown("KeyS") || this.input.isDown("ArrowDown")) dy += 1;

    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;

    this.player.cur.x += dx * Config.PLAYER_SPEED * dtSec;
    this.player.cur.y += dy * Config.PLAYER_SPEED * dtSec;
    this.player.cur.x = Math.max(0, Math.min(Config.WORLD_W - 1, this.player.cur.x));
    this.player.cur.y = Math.max(0, Math.min(Config.WORLD_H - 1, this.player.cur.y));

    this.camCur = { x: this.player.cur.x, y: this.player.cur.y };

    const mouse = this.input.getMouse?.();
    if (mouse && (mouse as any).inside) {
      const rd = this.renderer.getDebug();
      const cell = (this.renderer as any).getCellSize?.() ?? 4;
      this.aim.x = this.camCur.x + (mouse.x - rd.w * 0.5) / cell;
      this.aim.y = this.camCur.y + (mouse.y - rd.h * 0.5) / cell;
    } else {
      this.aim.x = this.player.cur.x;
      this.aim.y = this.player.cur.y;
    }

    this.facing = Math.atan2(this.aim.y - this.player.cur.y, this.aim.x - this.player.cur.x);

    // --- Damage Logic ---
    if (this.invuln > 0) {
        this.invuln -= dtSec;
    } else {
        const px = Math.floor(this.player.cur.x);
        const py = Math.floor(this.player.cur.y);
        
        if (this.ca.isAlive(px, py)) {
            this.energy -= this.damagePerSec * dtSec;
            if (Math.random() < 0.3) {
                 this.particles.spawnParticles(this.player.cur.x, this.player.cur.y, 1, "#FF0000", 50, 2);
            }
            if (this.energy <= 0) {
                this.energy = 0;
                this.setGameOver("ENERGY DEPLETED");
                this.particles.spawnSymmetricalRing(this.player.cur.x, this.player.cur.y, 50, "#FF0000", 60, 4);
            }
        }
    }

    // --- Systems Updates ---
    this.weapons.update(dtSec, this.lmbDown, this.projectiles, this.player.cur, this.aim);
    
    if (this.input.wasPressed("Space")) {
        const score = this.weapons.tryFireBomb(this.aim, this.ca, this.particles, this.snake);
        this.score += score;
    }

    if (this.input.wasPressed("KeyT")) {
        const x = Math.floor(this.player.cur.x);
        const y = Math.floor(this.player.cur.y);
        const alive = this.ca.isAlive(x, y);
        this.ca.setAlive(x, y, !alive);
    }

    if (Config.ENABLE_PHASE2) {
      this.snake.update(dtSec, this.player);
      this.checkPickups();
    }

    this.score += this.projectiles.update(dtSec, this.ca, this.particles);
    this.particles.update(dtSec);

    const t1 = performance.now();
    this.perf.onFixed(t1 - t0);
  }

  private checkPickups(): void {
    const head = this.player.cur;
    const r = (Config as any).PICKUP_R ?? (Config as any).PICKUP_RADIUS ?? 10;
    for (let i = 0; i < this.pickups.length; i++) {
      const p = this.pickups[i];
      const d2 = (p.x - head.x) * (p.x - head.x) + (p.y - head.y) * (p.y - head.y);
      if (d2 <= r * r) {
        this.pickups.splice(i, 1);
        this.snake.grow();
        this.spawnOnePickupNearStable();
        break;
      }
    }
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
    const t1 = performance.now();
    this.perf.onCA(t1 - t0);
  }

  private render(alpha: number, frameDtSec: number): void {
    this.perf.onFrameDelta(frameDtSec * 1000);
    this.overlay.onRenderFrame(frameDtSec);
    this.input.beginFrame();
    const t0 = performance.now();
    this.renderer.clear();

    const p = lerpV2(this.player.prev, this.player.cur, alpha);
    const cam = this.camera.follow(this.camPrev, this.camCur, alpha);

    (this.renderer as any).drawGrid?.(cam);
    this.renderer.drawStableChunks(this.ca.getStableChunks(), cam);
    this.renderer.drawCA(this.ca, cam);
    this.renderer.drawBullets(this.projectiles.getBullets(), cam);

    if (Config.ENABLE_PHASE2) {
      this.renderer.drawPickups(this.pickups, cam);
      this.renderer.drawSnake(this.snake.getAllSegments(), cam);
    }

    this.particles.render(this.renderer, cam);

    this.renderer.drawPlayer(p, cam, this.facing);
    this.renderer.drawAim(this.aim as any, cam);

    const ctx = this.renderer.getContext();
    const rd = this.renderer.getDebug();

    this.overlay.draw(ctx, [
      `STATE: ${this.state}`,
      `ENERGY: ${this.energy.toFixed(0)} / ${this.energyMax}`,
      `SCORE: ${this.score}`,
      `----------------`,
      this.state === "GAME_OVER" ? `GAME OVER: ${this.gameOverReason}` : "",
      this.state === "GAME_OVER" ? `PRESS 'Y' TO RESTART` : "",
      `----------------`,
      `FPS: ${(1000/this.perf.lastFrameMs).toFixed(0)}`,
      `Snake segs: ${this.snake.getLength()} (Need 2 for Bomb)`,
      `Speed: ${this.lastSpeed.toFixed(2)}`,
      `LMB: Shredder | RMB: Shotgun`,
      `Space: Pixel Bomb (-1 segment)`,
    ]);

    const t1 = performance.now();
    this.perf.onRender(t1 - t0);
  }
}
