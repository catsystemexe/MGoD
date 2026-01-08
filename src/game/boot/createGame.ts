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

import { SpawnSystem, type SpawnableEntity } from "../systems/SpawnSystem";
import { DirectorSystem } from "../systems/DirectorSystem";
import { DirectorPhaseSystem } from "../systems/DirectorPhaseSystem"; // wrapper (viz výše)

import { CollisionSystem, type WorldEntity } from "../systems/CollisionSystem";

import { CAImpactSystem } from "../impact/CAImpactSystem";
// TODO: udělej Impact wrapper, aby CAImpactSystem nevolal drainPhase (viz poznámka níže)

export function createGame() {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  const session = makeSessionState();

  // Store (pro MVP sjednoť typy, klidně any -> pak zpevníme)
  const store = new EntityStore<any>(256);

  // ---- Flow pipeline
  const score = new ScoreSystem(session, { pointsPerCell: 1, pointsPerEntityKill: 10 });
  const gameOver = new GameOverSystem(session);
  const flowDispatcher = new FlowDispatcher([score, gameOver]);
  const flow = new FlowSystem(flowDispatcher);

  // ---- Director + Spawn
  const spawn = new SpawnSystem(store as any, {
    rng01: Math.random,
    logicSize: { w: 224, h: 256 },
    projectile: {
      primary: { speed: 220, ttlSec: 1.2, damage: 3, radius: 2 },
      secondary: { speed: 200, ttlSec: 1.0, damage: 2, radius: 2 },
    },
    bomb: { travelSec: 0.4, damage: 10, radius: 10, ttlSec: 0.4 },
  });

  // DirectorDefs sem doplníš z ../defs/DirectorDefs
  const director = new DirectorSystem(bus, store as any, DIRECTOR_DEFS_MVP);
  const directorPhase = new DirectorPhaseSystem(session, director, spawn);

  // ---- Collision
  const collision = new CollisionSystem(bus, store as any);

  // ---- Impact (POZOR: CAImpactSystem teď drainuje sám -> musíš ho převést na “events-in”)
  // MVP dočasně: udělej wrapper, který mu předá events a v CAImpactSystemu zruš drainPhase.
  const ca = {
    applyExplosion: (x: number, y: number, r: number) => 0, // TODO napoj skutečný CAWorld
  };
  const impact = new CAImpactSystem(bus, ca, { explosionRadius: 3 });

  const loop = new Loop<CMEventMap>({
    eventBus: bus,

    // Input: TODO napoj InputManager a plň WeaponRuntime.actions
    input: { sample: (_ctx) => {} },
   
    
    
    director: {
      update: (ctx, events) => {
        directorPhase.update(ctx, events);
      },
    },

    simulation: { update: (_ctx, _events) => { /* TODO PlayerSystem + WeaponPhaseSystem + ProjectileSystem */ } },

    collision: { update: (_ctx, _events) => collision.update() },

    impact: { update: (ctx, events) => impact.update(ctx, events as any) },

    flow: { update: (ctx, events) => flow.update(ctx, events as any) },

    cleanup: { update: (_ctx, _events) => store.cleanup() },
  });

  return { loop, bus, store, session };
}