import { Config } from "./core/Config";
import { Loop } from "./core/Loop";
import { Input } from "./input/Input";
import { Renderer } from "./render/Renderer";
import { Camera } from "./render/Camera";
import { CAWorld } from "./ca/CAWorld";
import { v2, lerpV2 } from "./utils/math";

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
import { DevUI, DevParams } from "./ui/DevUI";

export class Game {
  private loop = new Loop(Config.FIXED_HZ, Config.CA_HZ);
  private input: Input;
  private renderer: Renderer;
  private camera = new Camera();
  private hud = new HUD(); 
  private devUI = new DevUI();

  private virtualW = 640;
  private virtualH = 360;

  // CA World dimensions are now scaled down by CELL_SIZE
  private ca = new CAWorld(Math.ceil(Config.WORLD_W / Config.CELL_SIZE), Math.ceil(Config.WORLD_H / Config.CELL_SIZE));
  private effects = new EffectSystem();
  
  private particles = new ParticleSystem();
  private projectiles = new ProjectileSystem();
  private snake = new SnakeSystem();
  private weapons = new WeaponsSystem();
  private enemies = new EnemySystem();
  private director = new DirectorSystem();
  private loot = new LootSystem(); 

  private energy = 100;
  private score = 0;
  private state: "PLAY" | "GAME_OVER" = "PLAY";
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
      timeScale: Config.TIME_SCALE
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new Input(window, canvas);
    this.onResize();
    this.initHandlers();
    this.resetGame();
  }

  onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    this.virtualH = Config.RETRO_HEIGHT;
    this.virtualW = Math.round(this.virtualH * aspect);
    
    this.canvas.width = this.virtualW;
    this.canvas.height = this.virtualH;
  }

  private initHandlers() {
    // Prevent Context Menu
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.canvas.addEventListener("pointerdown", (e) => {
      // CRITICAL FIX: Prevent default browser behavior (text selection, focus loss) immediately
      e.preventDefault(); 
      this.canvas.focus();
      
      if (this.state !== "PLAY") return;
      if (e.button === 0) {
          this.lmbDown = true;
      }
      if (e.button === 2) {
        this.weapons.tryFireSecondary(this.projectiles, this.player.cur, this.aim, this.effects);
      }
    });
    this.canvas.addEventListener("pointerup", (e) => {
      e.preventDefault();
      if (e.button === 0) this.lmbDown = false;
    });
  }

  private resetGame() {
    this.energy = 100;
    this.score = 0;
    this.state = "PLAY";
    this.ca.seedTestPattern(Date.now());
    this.player.cur = v2(512, 512);
    this.player.prev = v2(512, 512);
    this.camPos.cur = v2(512, 512);
    this.camPos.prev = v2(512, 512);
    this.snake.reset(512, 512); // Start with 3 bombs
    this.director.reset(this.enemies);
    this.damageFlash = 0;
    this.velocity = v2(0,0);
    this.spinCooldown = 0;
    this.isSpinning = false;
  }

  private reinitializeWorld() {
      // Called when Cell Size changes
      this.ca = new CAWorld(Math.ceil(Config.WORLD_W / Config.CELL_SIZE), Math.ceil(Config.WORLD_H / Config.CELL_SIZE));
      this.ca.seedTestPattern(Date.now());
      // Clear bullets/enemies to prevent visual glitching
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
    // Toggle Dev Mode using 'B' key
    if (this.input.wasPressed("KeyB")) { 
        this.isDevOpen = !this.isDevOpen;
    }

    if (this.input.wasPressed("KeyI")) {
        this.devParams.godMode = !this.devParams.godMode;
    }

    if (this.isDevOpen) {
        this.devUI.updateInput(this.input, this.devParams, {
            onSizeChange: () => this.reinitializeWorld(),
            onSpeedChange: () => this.loop.setCAHz(this.devParams.genSpeed)
        });
    }

    if (this.state === "GAME_OVER") {
      if (this.input.wasPressed("KeyY")) this.resetGame();
      this.input.postUpdate();
      return;
    }

    // Apply Time Scale
    const scaledDt = dt * this.devParams.timeScale;

    this.handleMovement(scaledDt);
    this.director.update(scaledDt, this.enemies);
    this.weapons.update(scaledDt);
    this.weapons.updatePrimary(scaledDt, this.lmbDown, this.projectiles, this.player.cur, this.aim, this.effects);
    
    const takeDamage = (damage: number) => {
          if (this.devParams.godMode) return; // Invincibility check

          this.energy -= damage;
          this.damageFlash = 1.0;
          if (this.energy <= 0) {
              this.energy = 0;
              this.state = "GAME_OVER";
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
      this.projectiles // Pass projectile system for turrets to fire
    );
    
    this.score += this.projectiles.update(scaledDt, this.ca, this.particles, this.loot, this.camera, this.effects, this.enemies, this.player.cur, takeDamage);
    const upgrades = this.loot.update(scaledDt, this.player.cur);

    // Throw Bomb (Consume Tail)
    if (this.input.wasPressed("Space")) {
        if (this.snake.hasBombs()) {
            this.snake.removeBomb();
            this.weapons.throwBomb(this.projectiles, this.player.cur, this.aim);
        }
    }

    // Snake Update
    this.snake.update(scaledDt, this.player.cur, this.velocity);

    // Spin Attack Collision
    if (this.isSpinning) {
        this.snake.checkWhipCollision(this.enemies, this.particles);
    }

    // Powerups
    if (upgrades) {
            if (upgrades.w1) this.weapons.upgradePrimary();
            if (upgrades.w2) this.weapons.upgradeSecondary();
            if (upgrades.hp) this.energy = Math.min(100, this.energy + 20);
            if (upgrades.bomb) { 
                this.snake.addBomb(); 
                this.score += 200; 
            }
            this.score += 500;
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
        this.spinTimer = 0.4; // Duration of spin
        this.spinCooldown = 1.5; // Cooldown
    }

    if (this.isSpinning) {
        this.spinTimer -= dt;
        // Forced rotation during spin (approx 2 full rotations)
        this.facing += 30.0 * dt; 
        if (this.spinTimer <= 0) {
            this.isSpinning = false;
        }
    } else {
        // Normal Aiming
        const mouse = this.input.getMouse?.();
        if (mouse) {
            const rect = this.canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const scaleX = this.virtualW / rect.width;
                const scaleY = this.virtualH / rect.height;
                const mx = (mouse.x - rect.left) * scaleX;
                const my = (mouse.y - rect.top) * scaleY;
                
                this.aim.x = this.player.cur.x + (mx - this.virtualW * 0.5);
                this.aim.y = this.player.cur.y + (my - this.virtualH * 0.5);
            }
        }
        this.facing = Math.atan2(this.aim.y - this.player.cur.y, this.aim.x - this.player.cur.x);
    }

    // Movement
    let dx = 0, dy = 0;
    if (this.input.isDown("KeyA")) dx -= 1;
    if (this.input.isDown("KeyD")) dx += 1;
    if (this.input.isDown("KeyW")) dy -= 1;
    if (this.input.isDown("KeyS")) dy += 1;
    
    // Update velocity for elasticity
    const speed = Config.PLAYER_SPEED;
    if (dx !== 0 || dy !== 0) {
        const l = Math.hypot(dx, dy);
        this.velocity.x = (dx/l) * speed;
        this.velocity.y = (dy/l) * speed;
        
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
    this.renderer.clear();
    const p = lerpV2(this.player.prev, this.player.cur, alpha);
    const cam = lerpV2(this.camPos.prev, this.camPos.cur, alpha);

    this.renderer.drawCA(this.ca, cam);
    this.renderer.drawBullets(this.projectiles.getBullets(), cam);
    
    // Draw Snake (Bomb Tail)
    this.renderer.drawSnake(this.snake.getSegments(), cam);

    const ctx = this.renderer.getContext();
    this.enemies.render(ctx, cam);
    this.loot.render(ctx, cam);
    this.particles.render(this.renderer, cam);
    this.renderer.drawPlayer(p, cam, this.facing);
    this.renderer.drawAim(this.aim, cam);
    this.renderer.drawShootingOverlay(this.lmbDown); // Blue shooting tint
    this.renderer.drawDamageVignette(this.damageFlash);

    if (this.state === "GAME_OVER") {
        this.renderer.drawGameOver(this.score);
    } else {
        this.hud.render(ctx, this.virtualW, this.virtualH, this.energy, 100, this.score, this.director.getHUDInfo(), this.snake.getLength(), this.weapons.getStatus(), this.spinCooldown);
        this.devUI.render(ctx, this.virtualW, this.virtualH, this.devParams, this.isDevOpen);
    }
  }
}
