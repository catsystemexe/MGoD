import { Config } from "./core/Config";
import { Loop } from "./core/Loop";
import { Input } from "./input/Input";
import { Renderer } from "./render/Renderer";
import { Camera } from "./render/Camera";
import { CAWorld } from "./ca/CAWorld";
import { v2, lerpV2 } from "./utils/math";
import { LOGIC_WIDTH, LOGIC_HEIGHT } from "./core/Config";

// Systems
import { ParticleSystem } from "./game/systems/ParticleSystem";
import { ProjectileSystem } from "./game/systems/ProjectileSystem";
import { SnakeSystem } from "./game/systems/SnakeSystem";
import { WeaponsSystem } from "./game/systems/WeaponsSystem";
import { EnemySystem } from "./game/systems/EnemySystem";
import { DirectorSystem } from "./game/systems/DirectorSystem";
import { LootSystem } from "./game/systems/LootSystem";
import { EffectSystem } from "./game/systems/EffectSystem";
import { HUD } from "./ui/HUD";
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
  private ui!: UIOverlay;

 
  private uiVisible = true; 
  private eventLog = new EventLog();
  private debugTickAcc = 0;
  private bus = new EventBus<GameEvents>();

  private virtualW = 640;
  private virtualH = 360;

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
  };

  constructor(private canvas: HTMLCanvasElement, private uiCanvas: HTMLCanvasElement) {
    this.ui = new UIOverlay(this.hud, this.eventLog, this.devUI);

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

    this.resetGame();
    this.applyCrtState();
  }

  private applyCrtState() {
    const overlay = document.getElementById("crt-overlay");
    if (overlay) overlay.style.display = this.devParams.crt ? "block" : "none";
  }

  private setupUiCanvasHiRes() {
    this.uiDpr = window.devicePixelRatio || 1;

    // UI overlay má mít CSS velikost stejnou jako world canvas (virtualW/H)
    this.uiCanvas.style.width = `${this.virtualW}px`;
    this.uiCanvas.style.height = `${this.virtualH}px`;

    // backing store v hi-res
    this.uiCanvas.width = Math.floor(this.virtualW * this.uiDpr);
    this.uiCanvas.height = Math.floor(this.virtualH * this.uiDpr);

    // kresli v CSS pixelech (virtualW/H) do hi-res bufferu
    this.uiCtx.setTransform(this.uiDpr, 0, 0, this.uiDpr, 0, 0);
    this.uiCtx.imageSmoothingEnabled = false;
  }

  onResize() {
    const dpr = window.devicePixelRatio || 1;

    // Renderer si sám nastaví display canvas + letterbox parametry
    this.renderer.resize(window.innerWidth, window.innerHeight, dpr);

    // UI overlay (zatím necháme tak jak je — jen ho nastavíme na velikost okna)
    this.virtualW = window.innerWidth;
    this.virtualH = window.innerHeight;
    this.setupUiCanvasHiRes();
    console.log("CANVAS backing:", this.canvas.width, this.canvas.height,
      "UI backing:", this.uiCanvas.width, this.uiCanvas.height);
  }

  private initHandlers() {
    // Prevent Context Menu
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.canvas.focus();

      if (this.state !== "PLAY") return;

      // PRIMARY (weapon 1)
      if (e.button === 0) {
        this.lmbDown = true;
        this.bus.emit("weapon.primary.trigger", { down: true });
      }

      // SECONDARY (weapon 2)
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
    // Toggle Dev Mode using 'B' key
    if (this.input.wasPressed("KeyB")) {
      this.isDevOpen = !this.isDevOpen;
    }

    if (this.input.wasPressed("KeyI")) {
      this.devParams.godMode = !this.devParams.godMode;
    }

    
    
    // devUI input (klidně nech i když je zavřené, ale tady minimal)
    this.devUI.updateInput(this.input, this.devParams, {
      onSizeChange: () => this.reinitializeWorld(),
      onSpeedChange: () => this.loop.setCAHz(this.devParams.genSpeed),
      onCrtChange: (val) => {
        const overlay = document.getElementById("crt-overlay");
        if (overlay) overlay.style.display = val ? "block" : "none";
      },
    });

    if (this.state === "GAME_OVER") {
      if (this.input.wasPressed("KeyY")) this.resetGame();
      this.input.postUpdate();
      return;
    }

    const scaledDt = dt * this.devParams.timeScale;

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
      return;
    }

    this.handleMovement(scaledDt);
    this.director.update(scaledDt, this.enemies);

    this.weapons.update(scaledDt);
    this.weapons.updatePrimary(scaledDt, this.lmbDown, this.projectiles, this.player.cur, this.aim, this.effects);

    const takeDamage = (damage: number) => {
      if (this.devParams.godMode) return;

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
        const m = this.input.getMouse?.();
        if (m) {
          const lp = this.renderer.screenToLogic(m.x, m.y);
          if (lp) {
            this.aim.x = this.player.cur.x + (lp.x - LOGIC_WIDTH * 0.5);
            this.aim.y = this.player.cur.y + (lp.y - LOGIC_HEIGHT * 0.5);
          }
        }

        this.facing = Math.atan2(
          this.aim.y - this.player.cur.y,
          this.aim.x - this.player.cur.x
        );
      
    
      this.facing = Math.atan2(this.aim.y - this.player.cur.y, this.aim.x - this.player.cur.x);
    }

    // Movement
    let dx = 0, dy = 0;
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

  private render(alpha: number, dt: number) {
    void dt;

    // --- WORLD ---
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

    this.renderer.drawPlayer(p, cam, this.facing, this.state, this.explosionTimer, turnState);
    this.renderer.drawAim(this.aim, cam);
    this.renderer.drawDamageVignette(this.damageFlash);

    if (this.state === "GAME_OVER") {
      this.renderer.drawGameOver(this.score);
    }
    
    this.renderer.present();
    
    // --- UI (HI-RES overlay) ---
    this.uiCtx.clearRect(0, 0, this.virtualW, this.virtualH);

    
    if (this.uiVisible) {
      this.ui.render({
        ctx: this.uiCtx,
        dpr: window.devicePixelRatio || 1,
        virtualW: this.virtualW,
        virtualH: this.virtualH,
        energy: this.energy,
        maxEnergy: 100,
        score: this.score,
        hudInfo: this.director.getHUDInfo(),
        snakeLen: this.snake.getLength(),
        weaponsStatus: this.weapons.getStatus(),
        spinCooldown: this.spinCooldown,
        devParams: this.devParams,
        isDevOpen: this.isDevOpen,
      
      });
    }
  }}
