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
import { ParticleStore } from "../../engine/fx/ParticleStore";
import { ImpactPhaseSystem } from "../systems/ImpactPhaseSystem";
import type { WorldEntity } from "../systems/CollisionSystem";
import { EnemySystem } from "../systems/EnemySystem";
import { EnemyGroupRegistry } from "../enemies/EnemyGroups";
import { PlayerSystem } from "../systems/PlayerSystem";
import { WeaponSystem } from "../systems/WeaponSystem";
import { ProjectileSystem } from "../systems/ProjectileSystem";
import { VFXSystem } from "../vfx/VFXSystem";



const WEAPONS_FALLBACK: any = {
  primary: "w1.basic",
  secondary: "w2.laser",
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
  const particleStore = new ParticleStore();

  // ---- Audio (output concern; synth-only v1). Dynamic import ONLY so the Node
  // smoke runner never transitively pulls Tone.js. No-op until first gesture.
  let audio: import("../../audio/AudioSystem").AudioSystem | null = null;
  if (typeof window !== "undefined") {
    const audioMod = await import("../../audio/AudioSystem");
    audio = audioMod.createAudioSystem();
  }

  // ---- VFX (cosmetic, per-frame)
  // In browser we expose it for debugging; in Node (smokes) there is no window.
      if (typeof window !== "undefined") {
        (window as any).__CM = (window as any).__CM || {};
        (window as any).__CM.vfx = vfx;



         const world = createWorldState();
        
// --- Spawn PLAYER (capture reference to the real entity object)
  let playerEnt: any = null;
  const playerRef = store.spawn((ent) => {
    ent.kind = "player";
    const START_X = 100;           // px od levého okraje (tweak)
    const START_Y = LOGIC_H * 0.5; // střed výšky
    ent.pos = { x: START_X, y: START_Y };
    ent.vel = { x: 0, y: 0 };
   
    ent.speed = 700;
    ent.radius = 3;
    ent.pendingKill = false;

    ent.energyMax = 5;
    ent.energy = 5;
    ent.bombs = 1;

    // HP-ratio source for the SDF deform/redshift (player tracks energy as life).
    ent.maxHp = 5;

    ent.invulnT = 0;
      ent.deadT = 0;
      ent.hitFlashT = 0;

      // ── PLAYER VISUAL CONFIG ─────────────────
      // shape: see SHAPE_CATALOG in SdfPass.ts
      // color: hex string
      // size:  visual scale multiplier (default 1.0)
      // ─────────────────────────────────────────
      ent.render = {
        mesh: {
          modelId:   'player_ship_1',
          paletteId: 'player',
          scale:     40,
          rotX:    0,
          rotY:    Math.PI / 2,
          rotZ:    0,
        },
      };

      playerEnt = ent;
});

  if (!playerEnt) throw new Error("[createGame] playerEnt not captured");

        // ---- World scroll (autoscroll + Y follow)
       
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

  // â ï¸ MUSÃ BÃT PÅED FlowDispatcher
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
        // Bomb tuning (see docs/audit). BOMB_DAMAGE=8 one-shots the weaker/mid enemy
        // types (hp 5..8) but spares the 3 toughest (crown 9, obelisk 10, mandala 11).
        // EXPLOSION_RADIUS=48 is a true area effect (~7x the largest enemy radius).
        const BOMB_DAMAGE = 8;
        const EXPLOSION_RADIUS = 48;

        const spawnCfg = {
          rng01: Math.random,
          logicSize: { w: LOGIC_W, h: LOGIC_H },
          weaponDb: WEAPON_DB,
          bomb: {
            travelSec: 0.45,            // time to reach bombTarget
            ttlSec: 0.9,               // safety detonation if target never reached (~2x travel)
            damage: BOMB_DAMAGE,
            radius: 6,                 // bomb sprite/collision radius (NOT the blast)
            explosionRadius: EXPLOSION_RADIUS,
          },
        };

 
  const pickupSystem = new PickupSystem(store as any);

  
        const enemyGroups = new EnemyGroupRegistry();
        const spawn = new SpawnSystem(store as any, spawnCfg, world as any, enemyGroups);

  // ---- Alive counting for caps
  function countAliveEnemies(): number {
    let n = 0;
    store.debugForEachAlive((_ref, e: any) => {
      if (e?.kind === "enemy" && !e.pendingKill) n++;
      // DEV only
      // console.log("[DBG] enemy missing waveId", { id: e.id, typeId: e.typeId });
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
            // global alive (fallback / safety)
            getAliveEnemies: () => {
              let n = 0;
              store.debugForEachAlive((_ref, e: any) => {
                if (!e || e.pendingKill) return;
                if (e.kind === "enemy") n++;
              });
              return n;
            },

            // ✅ per-wave alive (KRITICKÉ pro další waves)
            getAliveEnemiesForWave: (waveId: string) => {
              let n = 0;
              store.debugForEachAlive((_ref, e: any) => {
                if (!e || e.pendingKill) return;
                if (e.kind !== "enemy") return;
                if (String((e as any).waveId ?? "") === waveId) n++;
              });
              return n;
            },

            // optional – využije se při forceWave/reset
            killEnemiesForWave: (waveId: string) => {
              store.debugForEachAlive((_ref, e: any) => {
                if (!e || e.pendingKill) return;
                if (e.kind !== "enemy") return;
                if (String((e as any).waveId ?? "") === waveId) {
                  e.pendingKill = true;
                }
              });
            },
          }
        );

        

      

        const devWaveKeys = DIRECTOR_DEFS_MVP.waves.map((w: any) => String(w.id)).slice(0, 9);

        // expose mapping for overlay (DEV only)
        let devHotkeys: any = null;

        if ((globalThis as any).__DEV__) {
          (window as any).__CM.devWaveHotkeys = devWaveKeys.map((id, i) => ({
            n: i + 1,
            waveId: id,
          }));

          devHotkeys = new DevHotkeys({ defaultVisible: false, top: "50vh", left: "8px" });
          devHotkeys.refresh();
        }

        // ALWAYS register keydown so it works in popup/build too
        window.addEventListener("keydown", (e) => {
          const key = (e as any).key as string | undefined;
          const code = (e as any).code as string | undefined;
          
        
          // Toggle preset list visibility (DEV UI only)
          if (devHotkeys && (key === "i" || key === "I")) {
            devHotkeys.toggle();
            return;
          }

          let n = -1;

          // primary: e.key ("1".."9") – often more reliable on iOS/BT keyboards
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

          const waveId = devWaveKeys[n - 1] as string | undefined;
          if (!waveId) return;

          e.preventDefault();
          e.stopPropagation();

          // Force wave for testing
          director.forceWave(waveId, { solo: true, reset: true });

          // Update HUD immediately (so number changes even before next director tick)
          session.wave = n;

          // ensure loop is running if main left it paused
          const cm = (window as any).__CM;
          if (cm?.loop?.setPaused) cm.loop.setPaused(false);
          },
          { capture: true }
        );


  const directorPhase = new DirectorPhaseSystem(session as any, director as any);

  // ---- Simulation systems
        const playerSystem = new PlayerSystem(bus as any, playerEnt, {
          bounds: { minX: 0, minY: 0, maxX: LOGIC_W, maxY: LOGIC_H },
          world,
        });

  let weaponsCfg: any = WEAPONS_FALLBACK;
  try {
    const mod: any = await import("../defs/Weapons");
    weaponsCfg = mod.WEAPONS_MVP ?? WEAPONS_FALLBACK;
  } catch (_e) {
    weaponsCfg = WEAPONS_FALLBACK;
  }

        let laserEnt: any = null;
        const weaponSystem = new WeaponSystem(bus as any, weaponsCfg, WEAPON_DB as any, world as any, {
          onSpawnProjectile: (p: any) => { audio?.noteFire(); },
          onTracer: (_p: any) => {},
          onConsumeBomb: () => { playerEnt.bombs = Math.max(0, Number(playerEnt.bombs ?? 0) - 1); audio?.noteBomb(); },
          onLaserStart: (args: { originY: number }) => {
            laserEnt = store.spawn((e: any) => {
              e.kind   = 'laser';
              e.pos    = { x: 0, y: args.originY };
              e.render = { sdf: { shape: 'laser', color: '#ffffff', size: 1 } };
              e.radius = LOGIC_W / 2;
              e.ttl    = 6.0;
            });
          },
          onLaserEnd: () => {
            if (laserEnt) {
              store.markKill(laserEnt);
              laserEnt = null;
            }
          },
        });
        const projectileSystem = new ProjectileSystem(bus as any, store as any, LOGIC_W, LOGIC_H, world as any);
        const enemySystem = new EnemySystem(store, LOGIC_W, LOGIC_H, world as any, enemyGroups);
        
  // ---- Impact
  const ca = { applyExplosion: (_x: number, _y: number, _r: number) => 0 };
  const caImpact = new CAImpactSystem(bus, ca, { explosionRadius: 3 });

  const damage = new DamageSystem<WorldEntity>(bus as any, store as any, particleStore, {
    projectileHitEnemyDamage: 3,
    playerHitEnemyDamage: 1,
    // Legacy VFX hit spark temporarily disabled; audio remains.
    onHitSpark: (_p: any) => { audio?.noteHit(); },
    // Legacy VFX explosion temporarily disabled; audio remains.
    onExplosion: (p: any) => { audio?.noteExplosion(p); },
  });

  const impact = new ImpactPhaseSystem(damage, caImpact);
  const collision = new CollisionSystem(bus, store as any, world);

  // ---- Soft reset (no reload), keeps refs stable
  const RESET_CFG = {
    startLives: 3,
    startEnergy: 5,
    startBombs: 1,
    invulnSec: 1.0,
  };

        function resetGame(): void {
        
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

    enemyGroups.reset();

    // reset player entity (same object)
    playerEnt.kind = "player";
    const START_X = 16;            // px od levého okraje (tweak)
    const START_Y = LOGIC_H * 0.5; // střed výšky
    playerEnt.pos = { x: START_X, y: START_Y };
    (playerEnt as any).posPrev = { x: playerEnt.pos.x, y: playerEnt.pos.y };
    playerEnt.vel = { x: 0, y: 0 };
    
    playerEnt.speed = Number(playerEnt.speed ??700);
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

    //  DEV: always restart wave.test after respawn for target practice
    // director.forceWave("wave.test", { solo: true, reset: true });
        }

  const loop = new Loop<CMEventMap>({
    eventBus: bus,

    input: {
      sample: (_ctx) => {
        inputMgr.sample(inputRt.actions, LOGIC_W, LOGIC_H);
      },
    },

    director: {
      update: (_ctx, _events) => {
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

          // ✅ decay i-frames here (single authority, dt-stable)
          if (Number(playerEnt.invulnT ?? 0) > 0) {
            playerEnt.invulnT = Math.max(0, Number(playerEnt.invulnT) - ctx.dt);
          }

          worldScroll.update(ctx.dt);
        if (Number(playerEnt.deadT ?? 0) <= 0) {
          weaponSystem.update(ctx.dt, inputRt.actions as any, {
            shipPos: { x: playerEnt.pos.x, y: playerEnt.pos.y },
            shipVel: { x: playerEnt.vel?.x ?? 0, y: playerEnt.vel?.y ?? 0 },
            shipRef: playerRef,
            bombs: Number(playerEnt.bombs ?? 0),
          });
        }

        // Mirror W2 (laser) state onto the player entity so the DOM HUD can read it.
        const weaponSnapshot = weaponSystem.getSnapshot();
        const w2 = { active: weaponSnapshot.slots.w2.active, charge01: weaponSnapshot.slots.w2.charge01 };
        (playerEnt as any).weapons = weaponSnapshot;
        (playerEnt as any).w2 = w2;
        (playerEnt as any).weapon = w2.active ? "W2" : "W1";

        // Laser sleduje pozici lodi
        if (laserEnt) {
          const le = store.get(laserEnt);
          if (le && (le as any).alive) {
            (le as any).pos.y = playerEnt.pos.y;
            (le as any).pos.x = playerEnt.pos.x;
          }
        }

        // â Director must run in Simulation because it emits SPAWN_* (Simulation-owned)
         directorPhase.update(ctx, events as any);

      
        
        spawn.update(ctx, events as any);
        projectileSystem.update(ctx.dt);
        enemySystem.update(ctx);
        particleStore.update(ctx.dt);
      },
    },

    collision: {
      update: (_ctx, _events) => {
        if (session.gameOver) return;
        collision.update(_ctx.dt);
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
  director,
  vfx,
  particleStore,
  audio,
  inputRt,
  playerRef,
  inputMgr,
  playerEnt,
  world,
};
}
}