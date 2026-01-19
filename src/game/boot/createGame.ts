import { EventBus } from "../../engine/core/EventBus";
import { DevHotkeys } from "../../ui/DevHotkeys";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { Loop } from "../../engine/core/Loop";
import type { CMEventMap } from "../../engine/core/events";
import { LootDropSystem } from "../systems/LootDropSystem";
import { PowerupSystem } from "../systems/PowerupSystem";
import { PickupSystem } from "../systems/PickupSystem";
import { DIRECTOR_DEFS_MVP } from "../defs/DirectorDefs";
import { EntityStore } from "../../engine/ecs/EntityStore";
import { makeSessionState } from "../data/SessionState";
import { WEAPON_DB } from "../defs/WeaponDB";
import { FlowDispatcher } from "../systems/FlowDispatcher";
import { FlowSystem } from "../systems/FlowSystem";
import { ScoreSystem } from "../systems/ScoreSystem";
import { createWorldState } from "../data/WorldState";
import { WorldScrollSystem } from "../systems/WorldScrollSystem";
import { SpawnSystem } from "../systems/SpawnSystem";
import { DirectorSystem } from "../systems/DirectorSystem";
import { DirectorPhaseSystem } from "../systems/DirectorPhaseSystem";

import { CollisionSystem } from "../systems/CollisionSystem";
import { InputManager } from "../../engine/input/InputManager";
import { makeInputRuntime } from "../data/InputRuntime";
import { CAImpactSystem } from "../impact/CAImpactSystem";
import { RespawnSystem } from "../systems/RespawnSystem";
import { DamageSystem } from "../systems/DamageSystem";
import { ImpactPhaseSystem } from "../systems/ImpactPhaseSystem";
import type { WorldEntity } from "../systems/CollisionSystem";
import { EnemySystem } from "../systems/EnemySystem";
import { PlayerSystem } from "../systems/PlayerSystem";
import { WeaponSystem } from "../systems/WeaponSystem";
import { ProjectileSystem } from "../systems/ProjectileSystem";
import { VFXSystem } from "../vfx/VFXSystem";



const WEAPONS_FALLBACK: any = {
  primary: "w1.basic",
  secondary: "w2.basic",
  bomb: "b1.basic",
  bombCooldownSec: 0.8,
};

export async function createGame(
  getCanvas: () => HTMLCanvasElement,
  logicW: number,
  logicH: number,
) {
  const LOGIC_W = logicW;
  const LOGIC_H = logicH;

  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  // IMPORTANT: keep references stable (main holds them)
  const session = makeSessionState();
  const inputRt = makeInputRuntime();
  const inputMgr = new InputManager(getCanvas);

  const store = new EntityStore<any>(256);

   const vfx = new VFXSystem(64);

  // ---- VFX (cosmetic, per-frame)
  // In browser we expose it for debugging; in Node (smokes) there is no window.
      if (typeof window !== "undefined") {
        (window as any).__CM = (window as any).__CM || {};
        (window as any).__CM.vfx = vfx;

// --- Spawn PLAYER (capture reference to the real entity object)
  let playerEnt: any = null;
  const playerRef = store.spawn((ent) => {
    ent.kind = "player";
    ent.pos = { x: LOGIC_W * 0.5, y: LOGIC_H * 0.85 };
    ent.vel = { x: 0, y: 0 };
   
    ent.speed = 140;
    ent.radius = 3;
    ent.pendingKill = false;

    ent.energyMax = 5;
    ent.energy = 5;
    ent.bombs = 1;

    ent.invulnT = 0;
    ent.deadT = 0;
    ent.hitFlashT = 0;

    playerEnt = ent;
  });

  if (!playerEnt) throw new Error("[createGame] playerEnt not captured");

        // ---- World scroll (autoscroll + Y follow)
        const world = createWorldState();
        const worldScroll = new WorldScrollSystem(
          world,
          playerEnt,
          LOGIC_W,
          LOGIC_H
        );

        
  // ---- Flow
  const score = new ScoreSystem(session, { pointsPerCell: 1, pointsPerEntityKill: 10 });

  const respawn = new RespawnSystem(
    session as any,
    store as any,
    () => playerRef,
    LOGIC_W,
    LOGIC_H,
    {
      respawnDelayTicks: 60,
      invulnSec: 1.0,
      spawnEnergy: 5,
    }
  );

  // ⚠️ MUSÍ BÝT PŘED FlowDispatcher
  const lootDrop = new LootDropSystem(
    bus as any,
    store as any,
    { dropChance: 0.25, rng01: Math.random }
  );

  const powerups = new PowerupSystem(
    session as any,
    store as any,
    () => playerRef
  );

  const flowDispatcher = new FlowDispatcher([
    score,
    respawn,
    lootDrop,
    powerups,
  ]);

  const flow = new FlowSystem(flowDispatcher);
  // ---- Spawn system (Director-owned requests are applied here)
        const spawnCfg = {
          rng01: Math.random,
          logicSize: { w: LOGIC_W, h: LOGIC_H },
          weaponDb: WEAPON_DB,
        };

 
  const pickupSystem = new PickupSystem(store as any);

  
        const spawn = new SpawnSystem(store as any, spawnCfg, world as any);

  // ---- Alive counting for caps
  function countAliveEnemies(): number {
    let n = 0;
    store.debugForEachAlive((_ref, e: any) => {
      if (e?.kind === "enemy" && !e.pendingKill) n++;
      // DEV only
      // console.log("[DBG] enemy missing waveId", { id: e.id, typeId: e.typeId, spriteId: e.spriteId });
    });
    return n;
  }

  function countAliveEnemiesForWave(waveId: string): number {
    let n = 0;
    store.debugForEachAlive((_ref, e: any) => {
      if (e?.kind !== "enemy" || e.pendingKill) return;
      if (e.waveId === waveId) n++;
    });
    return n;
  }


        function killEnemiesForWave(waveId: string): void {
          // mark alive enemies of this wave to be cleaned up in Cleanup phase
          store.debugForEachAlive((_ref: any, e: any) => {
            if (e?.kind !== "enemy") return;
            if (e.pendingKill) return;
            if (e.waveId !== waveId) return;
            e.pendingKill = true;
          });
        }

        



        

        const director = new DirectorSystem(
          bus as any,
          DIRECTOR_DEFS_MVP as any,
          {
            getAliveEnemies: countAliveEnemies,
            getAliveEnemiesForWave: countAliveEnemiesForWave,
            killEnemiesForWave,
          }
        );

        // ✅ DEV: force wave.test immediately on boot (bypasses respawn)
        if ((globalThis as any).__DEV__) {
          director.forceWave("wave.test", { solo: true, reset: true });
          console.log("[DEV] forceWave(wave.test) on boot");
        }


        
      if (typeof window !== "undefined") {
        (window as any).__CM = (window as any).__CM || {};
        (window as any).__CM.director = director;
      }
      

        // ---- DEV hotkeys: Digit1..9 -> forceWave
        const DEV_WAVE_KEYS = [
          "wave.test",         // 1
          "wave.red",          // 2
          "wave.green",        // 3
          "wave.blue",         // 4
          "wave.orbit.tight",  // 5
          "wave.orbit.wide",   // 6
          "wave.zigzag.basic", // 7
          "wave.zigzag.fast",  // 8
          "wave.zigzag.wide",  // 9
        ] as const;

        if (typeof window !== "undefined") {
          (window as any).__CM = (window as any).__CM || {};
          (window as any).__CM.director = director;

          // expose mapping for overlay
          (window as any).__CM.devWaveHotkeys = DEV_WAVE_KEYS.map((id, i) => ({
            key: String(i + 1),
            id,
          }));

          // minimal overlay (non-blocking)
          const devHotkeys = new DevHotkeys({ defaultVisible: false, top: "50vh", left: "8px" });
          devHotkeys.refresh();

          window.addEventListener("keydown", (e) => {
            if (e.repeat) return;
            if (e.altKey || e.ctrlKey || e.metaKey) return;

            const key = (e as any).key as string | undefined;
            const code = (e as any).code as string | undefined;

            let n = -1;


            // Toggle preset list visibility (I)
            if (key === "i" || key === "I") {
              devHotkeys.toggle();
              return;
            }

            
            // ✅ primary: e.key ("1".."9") – funguje i na iOS/BT klávesnicích častěji než code
            if (typeof key === "string" && key.length === 1) {
              const k = key.charCodeAt(0) - 48; // '1' => 1
              if (k >= 1 && k <= 9) n = k;
            }

            // fallback: e.code ("Digit1" / "Numpad1")
            if (n < 0 && typeof code === "string") {
              if (code.startsWith("Digit")) n = Number(code.slice(5));
              else if (code.startsWith("Numpad")) n = Number(code.slice(6));
            }

            if (!(n >= 1 && n <= 9)) return;

            const waveId = (DEV_WAVE_KEYS as any)[n - 1] as string | undefined;
            if (!waveId) return;

            e.preventDefault();
            e.stopPropagation();

            // SOLO+RESET for rapid testing
            director.forceWave(waveId, { solo: true, reset: true });

            // ensure loop is running if main left it paused
            const cm = (window as any).__CM;
            if (cm?.loop?.setPaused) cm.loop.setPaused(false);
          });
        }
    


  const directorPhase = new DirectorPhaseSystem(session as any, director as any);

  // ---- Simulation systems
  const playerSystem = new PlayerSystem(bus as any, playerEnt, {
    bounds: { minX: 0, minY: 0, maxX: LOGIC_W, maxY: LOGIC_H },
  });

  let weaponsCfg: any = WEAPONS_FALLBACK;
  try {
    const mod: any = await import("../defs/Weapons");
    weaponsCfg = mod.WEAPONS_MVP ?? WEAPONS_FALLBACK;
  } catch (_e) {
    weaponsCfg = WEAPONS_FALLBACK;
  }

        const weaponSystem = new WeaponSystem(bus as any, weaponsCfg, WEAPON_DB as any, {
          onSpawnProjectile: (p: any) => vfx.onSpawnProjectile(p), // muzzle
          onTracer: (p: any) => vfx.onTracer(p), // tracer
        });
        const projectileSystem = new ProjectileSystem(bus as any, store as any);
        const enemySystem = new EnemySystem(store, LOGIC_W, LOGIC_H);
        
  // ---- Impact
  const ca = { applyExplosion: (_x: number, _y: number, _r: number) => 0 };
  const caImpact = new CAImpactSystem(bus, ca, { explosionRadius: 3 });

  const damage = new DamageSystem<WorldEntity>(bus as any, store as any, {
    projectileHitEnemyDamage: 3,
    playerHitEnemyDamage: 1,
    onHitSpark: (p: any) => vfx.onHitSpark(p),
  });

  const impact = new ImpactPhaseSystem(damage, caImpact);
  const collision = new CollisionSystem(bus, store as any);

  // ---- Soft reset (no reload), keeps refs stable
  const RESET_CFG = {
    startLives: 3,
    startEnergy: 5,
    startBombs: 1,
    invulnSec: 1.0,
  };

  function resetGame(): void {
    // session (in place)
    session.score = 0;
    session.lives = RESET_CFG.startLives;
    session.wave = 1;
    session.gameOver = false;
    session.tick = 0;
    session.timeSec = 0;
    (session as any).lastDeathPos = undefined;

    // clear world except player slot (keeps playerRef valid)
    if ((store as any).killAllExceptSlots) {
      (store as any).killAllExceptSlots([playerRef.slot]);
    } else {
      store.debugForEachAlive((ref, e: any) => {
        if (ref.slot === playerRef.slot) return;
        e.pendingKill = true;
      });
      store.cleanup();
    }

    // reset player entity (same object)
    playerEnt.kind = "player";
    playerEnt.pos = { x: LOGIC_W * 0.5, y: LOGIC_H * 0.85 };
    (playerEnt as any).posPrev = { x: playerEnt.pos.x, y: playerEnt.pos.y };
    playerEnt.vel = { x: 0, y: 0 };
    
    playerEnt.speed = Number(playerEnt.speed ?? 140);
    playerEnt.radius = Number(playerEnt.radius ?? 3);
    playerEnt.pendingKill = false;

    playerEnt.energyMax = RESET_CFG.startEnergy;
    playerEnt.energy = RESET_CFG.startEnergy;
    playerEnt.bombs = RESET_CFG.startBombs;

    playerEnt.invulnT = RESET_CFG.invulnSec;
    playerEnt.deadT = 0;
    playerEnt.hitFlashT = 0;
    (playerEnt as any).aimDir = (playerEnt as any).aimDir ?? { x: 1, y: 0 };
    (playerEnt as any).rot = 0;
    
    // input (release buffered/held actions)
    try {
      inputRt.actions.firePrimary = false as any;
      inputRt.actions.fireSecondary = false as any;
      (inputRt.actions as any).bombPressed = false;
    } catch {}

    // director runtime reset (keeps same instance)
    director.reset();

    // ✅ DEV: always restart wave.test after respawn for target practice
    director.forceWave("wave.test", { solo: true, reset: true });
  }

  const loop = new Loop<CMEventMap>({
    eventBus: bus,

    input: {
      sample: (_ctx) => {
        inputMgr.sample(inputRt.actions, LOGIC_W, LOGIC_H);
      },
    },

    director: {
      update: (ctx, events) => {
        if (session.gameOver) return;

        const w = director.getHUDInfo().current;
        if (typeof w === "number" && Number.isFinite(w)) session.wave = w;
      },
    },

    simulation: {
      update: (ctx, events) => {
        if (session.gameOver) return;

        respawn.tick();
        pickupSystem.update(ctx.dt);
        playerSystem.update(ctx.dt, inputRt.actions as any);
        worldScroll.update(ctx.dt);
        if (Number(playerEnt.deadT ?? 0) <= 0) {
          weaponSystem.update(ctx.dt, inputRt.actions as any, {
            shipPos: { x: playerEnt.pos.x, y: playerEnt.pos.y },
            shipVel: { x: playerEnt.vel?.x ?? 0, y: playerEnt.vel?.y ?? 0 },
            shipRef: playerRef,
          });
        }

        // ✅ Director must run in Simulation because it emits SPAWN_* (Simulation-owned)
        directorPhase.update(ctx, events as any);

      
        
        spawn.update(ctx, events as any);
        projectileSystem.update(ctx.dt);
        enemySystem.update(ctx);
      },
    },

    collision: {
      update: (_ctx, _events) => {
        if (session.gameOver) return;
        collision.update();
      },
    },

    impact: {
      update: (ctx, events) => {
        if (session.gameOver) return;
        (impact as any).update(ctx, events as any);
      },
    },

    flow: {
      update: (ctx, events) => {
        flow.update(ctx, events as any);
      },
    },

    cleanup: {
      update: (_ctx, _events) => {
        store.cleanup();
      },
    },
  });

  return {
    bus,
    loop,
    store,
    session,
    director, // ✅ devui needs director
    vfx,
    inputRt,
    playerRef,
    inputMgr,
    playerEnt,
    world,
  };
  }
}