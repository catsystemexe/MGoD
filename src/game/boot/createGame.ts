import { EventBus } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { Loop } from "../../engine/core/Loop";
import type { CMEventMap } from "../../engine/core/events";
import { DIRECTOR_DEFS_MVP } from "../defs/DirectorDefs";
import { EntityStore } from "../../engine/ecs/EntityStore";
import { makeSessionState } from "../data/SessionState";

import { FlowDispatcher } from "../systems/FlowDispatcher";
import { FlowSystem } from "../systems/FlowSystem";
import { ScoreSystem } from "../systems/ScoreSystem";
import { GameOverSystem } from "../systems/GameOverSystem";

import { SpawnSystem } from "../systems/SpawnSystem";
import { DirectorSystem } from "../systems/DirectorSystem";
import { DirectorPhaseSystem } from "../systems/DirectorPhaseSystem";

import { CollisionSystem } from "../systems/CollisionSystem";
import { Phase } from "../../engine/core/EventBus";
import { InputManager } from "../../engine/input/InputManager";
import { makeInputRuntime } from "../data/InputRuntime";
import { CAImpactSystem } from "../impact/CAImpactSystem";
import { EnemySystem } from "../systems/EnemySystem";
import { PlayerSystem } from "../systems/PlayerSystem";
import { WeaponSystem } from "../systems/WeaponSystem";
import { ProjectileSystem } from "../systems/ProjectileSystem";

// fallback config kdybys neměl WEAPONS_MVP
const WEAPONS_FALLBACK: any = {
  primary: { cooldownSec: 0.12 },
  secondary: { cooldownSec: 0.25 },
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

  const session = makeSessionState();

  const inputRt = makeInputRuntime();
  const inputMgr = new InputManager(getCanvas);

  const store = new EntityStore<any>(256);

  // --- Spawn PLAYER (capture reference to the real entity object)
  let playerEnt: any = null;
  const playerRef = store.spawn((ent) => {
    ent.kind = "player";
    ent.pos = { x: LOGIC_W * 0.5, y: LOGIC_H * 0.85 };
    ent.vel = { x: 0, y: 0 };
    ent.aimDir = { x: 1, y: 0 }; // důležité
    ent.speed = 140;
    ent.radius = 3;
    ent.pendingKill = false;

    playerEnt = ent;
  });

  if (!playerEnt) throw new Error("[createGame] playerEnt not captured");

  // ---- Flow
  const score = new ScoreSystem(session, { pointsPerCell: 1, pointsPerEntityKill: 10 });
  const gameOver = new GameOverSystem(session);
  const flowDispatcher = new FlowDispatcher([score, gameOver]);
  const flow = new FlowSystem(flowDispatcher);

  // ---- Spawn system (Director-owned requests are applied here)
  const spawn = new SpawnSystem(store as any, {
    rng01: Math.random,
    logicSize: { w: LOGIC_W, h: LOGIC_H },
    projectile: {
      primary: { speed: 220, ttlSec: 0.8, damage: 3, radius: 2 },
      secondary: { speed: 200, ttlSec: 0.8, damage: 2, radius: 2 },
    },
    bomb: { travelSec: 0.4, damage: 10, radius: 10, ttlSec: 0.4 },
  });

  const director = new DirectorSystem(bus, store as any, DIRECTOR_DEFS_MVP);
  const directorPhase = new DirectorPhaseSystem(session, director, spawn);

  // ---- Collision
  const collision = new CollisionSystem(bus, store as any);

  // ---- Simulation systems
  const playerSystem = new PlayerSystem(bus as any, playerEnt, {
    // klidně 0..LOGIC (radius clamp řeší PlayerSystem)
    bounds: { minX: 0, minY: 0, maxX: LOGIC_W, maxY: LOGIC_H },
  });

  // použij WEAPONS_MVP pokud existuje, jinak fallback
  let weaponsCfg: any = WEAPONS_FALLBACK;
  try {
    const mod: any = await import("../defs/Weapons");
    weaponsCfg = mod.WEAPONS_MVP ?? WEAPONS_FALLBACK;
  } catch (_e) {
    weaponsCfg = WEAPONS_FALLBACK;
  }

  const weaponSystem = new WeaponSystem(bus as any, weaponsCfg);
  const projectileSystem = new ProjectileSystem(bus as any, store as any);
  const enemySystem = new EnemySystem(store as any, LOGIC_W, LOGIC_H);
  // ---- Impact
  const ca = { applyExplosion: (_x: number, _y: number, _r: number) => 0 };
  const impact = new CAImpactSystem(bus, ca, { explosionRadius: 3 });

    const loop = new Loop<CMEventMap>({
      eventBus: bus,

      input: {
        sample: (_ctx) => {
          inputMgr.sample(inputRt.actions, LOGIC_W, LOGIC_H);
        },
      },

      director: {
        update: (ctx, events) => {
          directorPhase.update(ctx, events);
        },
      },

      simulation: {
        update: (ctx, events) => {
          // 1) player
          playerSystem.update(ctx.dt, inputRt.actions as any);

          // 2) weapons emit spawn requests (next tick)
          weaponSystem.update(ctx.dt, inputRt.actions as any, {
            shipPos: { ...playerEnt.pos },
            aimDir: { ...playerEnt.aimDir },
            shipRef: playerRef,
          } as any);

          // 3) apply spawns that arrived for this phase (events are provided by Loop)
          spawn.update(ctx, events as any);

          // 4) move projectiles
          projectileSystem.update(ctx.dt);

          // 5) move + cull enemies
          enemySystem.update(ctx.dt);
        },
      },

      collision: { update: (_ctx, _events) => collision.update() },

      impact: { update: (ctx, events) => (impact as any).update(ctx, events as any) },

      flow: { update: (ctx, events) => flow.update(ctx, events as any) },

      cleanup: { update: (_ctx, _events) => store.cleanup() },
    });
  return { loop, bus, store, session, inputRt, playerRef, inputMgr, playerEnt, logicW: LOGIC_W, logicH: LOGIC_H };
}