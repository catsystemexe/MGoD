import { Config, LOGIC_WIDTH, LOGIC_HEIGHT } from "./core/Config";
import { Loop } from "./core/Loop";
import { Input } from "./input/Input";
import { Renderer } from "./render/Renderer";
import { Camera } from "./render/Camera";
import { CAWorld } from "./ca/CAWorld";
import { v2, lerpV2 } from "./utils/math";

import { loadSpriteAtlas } from "./render/sprite/loader";
import type { SpriteAtlas } from "./render/sprite/types";
import { Animator } from "./render/sprite/animator";
import { drawAtlasFrame } from "./render/sprite/draw";

// Systems
import { ParticleSystem } from "./game/systems/ParticleSystem";
import { ProjectileSystem } from "./game/systems/ProjectileSystem";
import { SnakeSystem } from "./game/systems/SnakeSystem";
import { WeaponsSystem } from "./game/systems/WeaponsSystem";
import { EnemySystem } from "./game/systems/EnemySystem";
import { DirectorSystem } from "./game/systems/DirectorSystem";
import { LootSystem } from "./game/systems/LootSystem";
import { EffectSystem } from "./game/systems/EffectSystem";
import { HUD, type HUDWeapon } from "./ui/HUD";
import { UIOverlay } from "./ui/UIOverlay";
import { DevUI, DevParams } from "./ui/DevUI";
import { EventLog } from "./debug/EventLog";
import { EventBus } from "./core/EventBus";
import type { GameEvents } from "./core/events";

export class Game {
  // canvases / render
  private renderer: Renderer;
  private uiCtx: CanvasRenderingContext2D;
  private uiDpr = 1;

  private loop = new Loop(Config.FIXED_HZ, Config.CA_HZ);
  private input: Input;
  private camera = new Camera();

  private hud = new HUD();
  private devUI = new DevUI();
  private ui: UIOverlay;

  private uiVisible = true;
  private eventLog = new EventLog();
  private debugTickAcc = 0;
  private bus = new EventBus<GameEvents>();

  private virtualW = 640;
  private virtualH = 360;

  // --- Sprite Atlases ---
  private spritesReady = false;
  private shipAtlas: SpriteAtlas | null = null;
  private explosionAtlas: SpriteAtlas | null = null;

  private shipAnim = new Animator();
  private explosionAnim = new Animator();

  // CA World dimensions are now scaled down by CELL_SIZE
  private ca = new CAWorld(
    Math.ceil(Config.WORLD_W / Config.CELL_SIZE),
    Math.ceil(Config.WORLD_H / Config.CELL_SIZE)
  );
  private effects = new EffectSystem();

  private particles = new ParticleSystem();
  private projectiles = new ProjectileSystem();
  private snake = new SnakeSystem();
  private weapons = new WeaponsSystem();
  private enemies = new EnemySystem();
  private director = new DirectorSystem();
  private loot = new LootSystem(this.bus);

  private energy = 100;
  private score = 0;
  private state: "PLAY" | "EXPLODING" | "GAME_OVER" = "PLAY";
  private explosionTimer = 0;

  private player = { prev: v2(512, 512), cur: v2(512, 512) };
  private camPos = { prev: v2(512, 512), cur: v2(512, 512) };
  private aim = v2(0, 0);
  private facing = 0;
  private velocity = v2(0, 0);
  private lmbDown = false;
  private damageFlash = 0;

  // Spin Logic
  private spinTimer = 0;
  private isSpinning = false;
  private spinCooldown = 0;

  // Dev Logic
  private isDevOpen = false;
  private devParams: DevParams = {
    godMode: false,
    cellSize: Config.CELL_SIZE,
    genSpeed: Config.CA_HZ,
    spawnRate: Config.SPAWN_RATE_MULT,
    timeScale: Config.TIME_SCALE,
    crt: true,
    cover: false,
  };

  constructor(private canvas: HTMLCanvasElement, private uiCanvas: HTMLCanvasElement) {
    this.ui = new UIOverlay(this.hud);

    // init world renderer + input
    this.renderer = new Renderer(this.canvas);
    this.input = new Input(window, this.canvas);

    // init ui ctx
    this.uiCtx = this.uiCanvas.getContext("2d")!;
    this.uiCtx.imageSmoothingEnabled = false;

    // handlers + initial sizing
    this.initHandlers();
    this.onResize();
    window.addEventListener("resize", () => this.onResize());
    const host = this.getHostEl(); // nebo getHostEl(), co máš teď
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => this.onResize());
      ro.observe(host);
    }
    window.addEventListener("focus", () => this.canvas.focus());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.canvas.focus();
    });

    this.resetGame();
    this.applyCrtState();

    // load sprite atlases (non-blocking)
    void this.loadSprites();
  }

  private async loadSprites() {
    try {
      this.shipAtlas = await loadSpriteAtlas("/assets/ship_atlas.json");
      this.explosionAtlas = await loadSpriteAtlas("/assets/explosion_atlas.json");

      this.shipAnim.set("idle");
      this.explosionAnim.set("explode");

      this.spritesReady = true;
    } catch (e) {
      console.warn("Sprite atlas load failed, using procedural fallback.", e);
      this.spritesReady = false;
      this.shipAtlas = null;
      this.explosionAtlas = null;
    }
  }

  private applyCrtState() {
    const overlay = document.getElementById("crt-overlay");
    if (overlay) overlay.style.display = this.devParams.crt ? "block" : "none";
  }

  private setupUiCanvasHiRes() {
    this.uiDpr = window.devicePixelRatio || 1;

    const dbg = this.renderer.getDebug();
    const cssW = dbg.cssW;
    const cssH = dbg.cssH;

    this.uiCanvas.style.width = `${cssW}px`;
    this.uiCanvas.style.height = `${cssH}px`;

    this.uiCanvas.width = Math.floor(cssW * this.uiDpr);
    this.uiCanvas.height = Math.floor(cssH * this.uiDpr);

    this.uiCtx.setTransform(this.uiDpr, 0, 0, this.uiDpr, 0, 0);
    this.uiCtx.imageSmoothingEnabled = false;
  }

  private getHostEl(): HTMLElement {
    return (
      (this.canvas.parentElement as HTMLElement | null) ||
      (this.canvas.closest("#game-host") as HTMLElement | null) ||
      (this.canvas.closest(".preview") as HTMLElement | null) ||
      (this.canvas.closest(".replit-host") as HTMLElement | null) ||
      (this.canvas.closest("#app") as HTMLElement | null) ||
      document.body
    );
  }

  onResize() {
    const dpr = window.devicePixelRatio || 1;
    const host = this.getHostEl();

    const cssW = Math.max(1, host.clientWidth | 0);
    const cssH = Math.max(1, host.clientHeight | 0);

    this.renderer.resize(cssW, cssH, dpr);
    this.virtualW = cssW;
    this.virtualH = cssH;
    this.setupUiCanvasHiRes();
  }
  
  private initHandlers() {
    // Prevent Context Menu
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.canvas.focus();

      if (this.state !== "PLAY") return;

      if (e.button === 0) {
        this.lmbDown = true;
        this.bus.emit("weapon.primary.trigger", { down: true });
      }

      if (e.button === 2) {
        this.bus.emit("weapon.secondary.trigger", {});
        this.weapons.tryFireSecondary(this.projectiles, this.player.cur, this.aim, this.effects);
      }
    });

    this.canvas.addEventListener("pointerup", (e) => {
      e.preventDefault();
      if (e.button === 0) {
        this.lmbDown = false;
        this.bus.emit("weapon.primary.trigger", { down: false });
      }
    });
  }

  private resetGame() {
    this.energy = 100;
    this.score = 0;
    this.state = "PLAY";
    this.explosionTimer = 0;

    this.ca.seedTestPattern(Date.now());

    this.player.cur = v2(512, 512);
    this.player.prev = v2(512, 512);
    this.camPos.cur = v2(512, 512);
    this.camPos.prev = v2(512, 512);

    this.snake.reset(512, 512);
    this.director.reset(this.enemies);

    this.damageFlash = 0;
    this.velocity = v2(0, 0);

    this.spinCooldown = 0;
    this.isSpinning = false;
  }

  private reinitializeWorld() {
    this.ca = new CAWorld(
      Math.ceil(Config.WORLD_W / Config.CELL_SIZE),
      Math.ceil(Config.WORLD_H / Config.CELL_SIZE)
    );
    this.ca.seedTestPattern(Date.now());

    this.projectiles = new ProjectileSystem();
    this.enemies = new EnemySystem();
    this.particles = new ParticleSystem();
  }

  start() {
    this.input.attach();
    this.loop.start({
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      caUpdate: () => this.caUpdate(),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
    });
  }

  private fixedUpdate(dt: number) {
    if (this.input.wasPressed("KeyL")) {
      this.ui.toggle();
      this.uiVisible = this.ui.isVisible();
    }

    if (this.input.wasPressed("KeyC")) {
      this.devParams.cover = !this.devParams.cover;
      console.log("COVER:", this.devParams.cover);
    }

    if (this.input.wasPressed("KeyB")) {
      this.isDevOpen = !this.isDevOpen;
    }

    if (this.input.wasPressed("KeyI")) {
      this.devParams.godMode = !this.devParams.godMode;
    }

    if (this.state === "GAME_OVER") {
      if (this.input.wasPressed("KeyY")) this.resetGame();
      this.input.postUpdate();
      return;
    }

    const scaledDt = dt;

    // Debug tick ~1x/sec
    this.debugTickAcc += scaledDt;
    if (this.debugTickAcc >= 1) {
      this.debugTickAcc = 0;
      this.bus.emit("debug.tick", { dt: scaledDt });
    }

    // --- EXPLOSION STATE LOGIC ---
    if (this.state === "EXPLODING") {
      this.explosionTimer += scaledDt;

      this.player.prev = { ...this.player.cur };
      this.player.cur.x += this.velocity.x * scaledDt * 0.1;
      this.player.cur.y += this.velocity.y * scaledDt * 0.1;

      this.particles.update(scaledDt);
      this.projectiles.update(
        scaledDt,
        this.ca,
        this.particles,
        this.loot,
        this.camera,
        this.effects,
        this.enemies,
        undefined,
        undefined
      );

      this.camPos.prev = { ...this.camPos.cur };
      this.camPos.cur = { ...this.player.cur };

      if (this.explosionTimer > 1.2) this.state = "GAME_OVER";
      this.input.postUpdate();
      return;
    }

    this.handleMovement(scaledDt);
    this.director.update(scaledDt, this.enemies);

    this.weapons.update(scaledDt);
    this.weapons.updatePrimary(scaledDt, this.lmbDown, this.projectiles, this.player.cur, this.aim, this.effects);

    const takeDamage = (damage: number) => {
      this.energy -= damage;
      this.damageFlash = 1.0;

      this.bus.emit("player.damage", {
        dmg: damage,
        energyAfter: Math.max(0, this.energy),
      });

      if (this.energy <= 0) {
        this.energy = 0;
        this.state = "EXPLODING";
        this.explosionTimer = 0;
        this.particles.add(this.player.cur, { x: 0, y: 0 }, 1.0, "#FFFFFF");
      }
    };

    // Enemy Update
    this.score += this.enemies.update(
      scaledDt,
      this.player,
      this.ca,
      this.particles,
      this.projectiles.getBullets(),
      this.loot,
      takeDamage,
      this.projectiles
    );

    this.score += this.projectiles.update(
      scaledDt,
      this.ca,
      this.particles,
      this.loot,
      this.camera,
      this.effects,
      this.enemies,
      this.player.cur,
      takeDamage
    );

    this.loot.update(scaledDt, this.player.cur);

    // Throw Bomb (Consume Tail)
    if (this.input.wasPressed("Space")) {
      if (this.snake.hasBombs()) {
        this.snake.removeBomb();
        this.bus.emit("bomb.throw", {});
        this.weapons.throwBomb(this.projectiles, this.player.cur, this.aim);
      }
    }

    this.snake.update(scaledDt, this.player.cur, this.velocity, this.facing);

    if (this.isSpinning) {
      this.snake.checkWhipCollision(this.enemies, this.particles);
    }

    this.particles.update(scaledDt);
    if (this.damageFlash > 0) this.damageFlash -= scaledDt * 3;

    this.input.postUpdate();
  }

  private handleMovement(dt: number) {
    this.player.prev = { ...this.player.cur };

    // Spin Logic
    if (this.spinCooldown > 0) this.spinCooldown -= dt;

    if (this.input.isDown("ShiftLeft") && this.spinCooldown <= 0 && !this.isSpinning) {
      this.isSpinning = true;
      this.spinTimer = 0.4;
      this.spinCooldown = 1.5;
    }

    if (this.isSpinning) {
      this.spinTimer -= dt;
      this.facing += 30.0 * dt;
      if (this.spinTimer <= 0) this.isSpinning = false;
    } else {
      // aim mapping: screen -> LOGIC -> world
      const m = this.input.getMouse?.();
      if (m) {
        const lp = this.renderer.screenToLogic(m.x, m.y);
        if (lp) {
          this.aim.x = this.player.cur.x + (lp.x - LOGIC_WIDTH * 0.5);
          this.aim.y = this.player.cur.y + (lp.y - LOGIC_HEIGHT * 0.5);
        }
      }

      this.facing = Math.atan2(this.aim.y - this.player.cur.y, this.aim.x - this.player.cur.x);
    }

    // Movement
    let dx = 0,
      dy = 0;
    if (this.input.isDown("KeyA")) dx -= 1;
    if (this.input.isDown("KeyD")) dx += 1;
    if (this.input.isDown("KeyW")) dy -= 1;
    if (this.input.isDown("KeyS")) dy += 1;

    const speed = Config.PLAYER_SPEED;
    if (dx !== 0 || dy !== 0) {
      const l = Math.hypot(dx, dy);
      this.velocity.x = (dx / l) * speed;
      this.velocity.y = (dy / l) * speed;

      this.player.cur.x += this.velocity.x * dt;
      this.player.cur.y += this.velocity.y * dt;
    } else {
      this.velocity.x = 0;
      this.velocity.y = 0;
    }

    this.camPos.prev = { ...this.camPos.cur };
    this.camPos.cur = { ...this.player.cur };
  }

  private caUpdate() {
    this.effects.process(this.ca);
    this.ca.tick();
  }

  private render(alpha: number, frameDt: number) {
    // --- WORLD (LOW) ---
    this.renderer.clear();

    const p = lerpV2(this.player.prev, this.player.cur, alpha);
    const cam = lerpV2(this.camPos.prev, this.camPos.cur, alpha);

    this.renderer.drawCA(this.ca, cam);
    this.renderer.drawBullets(this.projectiles.getBullets(), cam);
    this.renderer.drawSnake(this.snake.getSegments(), cam);

    const worldCtx = this.renderer.getContext();
    this.enemies.render(worldCtx, cam);
    this.loot.render(worldCtx, cam);
    this.particles.render(this.renderer, cam);

    let turnState = 0;
    if (this.input.isDown("KeyA")) turnState = -1;
    if (this.input.isDown("KeyD")) turnState = 1;

    // sprite anim update (použij frameDt)
    if (this.spritesReady && this.shipAtlas) {
      const animName = turnState === -1 ? "left" : turnState === 1 ? "right" : "idle";
      this.shipAnim.set(animName);
      this.shipAnim.update(frameDt, this.shipAtlas.meta);
    }

    if (this.spritesReady && this.explosionAtlas) {
      this.explosionAnim.update(frameDt, this.explosionAtlas.meta);
    }

    // world -> screen(LOGIC)
    const camX = Math.floor(cam.x);
    const camY = Math.floor(cam.y);
    const offX = camX - LOGIC_WIDTH / 2;
    const offY = camY - LOGIC_HEIGHT / 2;

    const sx = Math.floor(p.x - offX);
    const sy = Math.floor(p.y - offY);

    if (this.spritesReady && this.shipAtlas && this.state !== "EXPLODING") {
      const frame = this.shipAnim.frame(this.shipAtlas.meta);
      drawAtlasFrame(worldCtx, this.shipAtlas, frame, sx, sy, this.facing + Math.PI / 2);
    } else if (this.spritesReady && this.explosionAtlas && this.state === "EXPLODING") {
      const frame = this.explosionAnim.frame(this.explosionAtlas.meta);
      drawAtlasFrame(worldCtx, this.explosionAtlas, frame, sx, sy, 0);
    } else {
      // fallback = procedural
      this.renderer.drawPlayer(p, cam, this.facing, this.state, this.explosionTimer, turnState);
    }

    this.renderer.drawAim(this.aim, cam);
    this.renderer.drawDamageVignette(this.damageFlash);

    if (this.state === "GAME_OVER") {
      this.renderer.drawGameOver(this.score);
    }

    // LOW -> DISPLAY (letterbox + integer scale)
    // ⚠️ mode musí být jen "cover" | "contain" (ne "coverX")
    this.renderer.present(this.devParams.cover ? "coverX" : "contain");

    // --- UI overlay (anchored to game area) ---
    const dbg = this.renderer.getDebug();
    const { ox, oy, dw, dh, scale } = dbg.present;
    // clear UI canvas in display space
    this.uiCtx.setTransform(this.uiDpr, 0, 0, this.uiDpr, 0, 0);
    this.uiCtx.clearRect(0, 0, dbg.cssW, dbg.cssH);

    if (this.uiVisible) {
      this.uiCtx.save();

      // clip to game area
      this.uiCtx.beginPath();
      this.uiCtx.rect(ox, oy, dw, dh);
      this.uiCtx.clip();

      // display->logic transform
      this.uiCtx.translate(ox, oy);
      this.uiCtx.scale(scale, scale);

      const weaponsHUD: HUDWeapon[] = [
        ...this.weapons.getHUDStatus(),
        { name: "BMB", cooldown01: 0, ammo: this.snake.getBombs() },
      ];

      this.ui.render({
        ctx: this.uiCtx,
        virtualW: LOGIC_WIDTH,
        virtualH: LOGIC_HEIGHT,
        energy: this.energy,
        maxEnergy: 100,
        mana: 100,
        maxMana: 100,
        score: this.score,
        weapons: weaponsHUD,
      });

      this.uiCtx.restore();
    }
  }
}