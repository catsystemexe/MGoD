// src/game/systems/CollisionScrollInvariance.smoke.ts
//
// Regression guard for the world-space unification (scroll≠0 invariance).
//
// Two independent bugs were fixed by the unification, so this guards BOTH:
//
//   Part A — CollisionSystem math: collisions used to add camX/camY to the player
//            & projectile to convert SCREEN->WORLD. After unification every entity
//            is WORLD space, so collisions compare pos.x/pos.y directly and must be
//            INVARIANT to camera scroll. Part A fires a projectile that overlaps an
//            enemy in WORLD space and asserts the hit registers at scrollX/Y != 0.
//
//   Part B — ProjectileSystem X-cull timing: the cull used screen-space X bounds
//            (x < -margin || x > W+margin) while projectile.x became WORLD. With a
//            scrolled camera that wrongly culls every shot on spawn. Part B advances
//            the camera far to the right and asserts that an on-screen projectile is
//            NOT culled, while a genuinely off-screen one still IS. The old logic
//            would cull the on-screen shot -> this guard fails if camX is dropped.
//
// None of the pre-existing 19 smokes ever set scroll != 0 — which is exactly why
// both bugs survived unnoticed.

import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import type { TickContext } from "../../engine/core/Loop";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

import { CollisionSystem, type WorldEntity } from "./CollisionSystem";
import { DamageSystem } from "./DamageSystem";
import { ProjectileSystem } from "./ProjectileSystem";

import { FlowDispatcher } from "../systems/FlowDispatcher";
import { FlowSystem } from "../systems/FlowSystem";
import { ScoreSystem } from "../systems/ScoreSystem";
import { makeSessionState } from "../data/SessionState";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function newBus() {
  return new EventBus(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });
}

// --- Part A: collision math is invariant to camera scroll ---------------------
function partA_collisionInvariance() {
  const bus = newBus();
  const store = new EntityStore<WorldEntity>(32);
  const ship: EntityRef = { slot: 1, gen: 1 };

  // Camera scrolled away from the origin on BOTH axes.
  const world = { scrollX: 120, scrollY: 90 };

  // Enemy lives in WORLD space, far from the screen origin.
  const enemy = store.spawn(e => {
    (e as any).kind = "enemy";
    (e as any).pos = { x: 200, y: 150 };
    (e as any).radius = 3;
    (e as any).hp = 3;
    (e as any).pendingKill = false;
  });

  // Projectile overlaps the enemy in WORLD space (same coords).
  // Old logic added camX=120 to the projectile X => 320 vs 200 => MISS.
  // New logic compares directly => 200 vs 200 => HIT.
  const proj = store.spawn(e => {
    (e as any).kind = "projectile";
    (e as any).owner = ship;
    (e as any).weapon = "primary";
    (e as any).pos = { x: 200, y: 150 };
    (e as any).vel = { x: 0, y: 0 };
    (e as any).ttl = 1;
    (e as any).damage = 3;
    (e as any).radius = 2;
    (e as any).pendingKill = false;
    (e as any).consumed = false;
  });

  const collision = new CollisionSystem(bus as any, store as any, world as any);
  const damage = new DamageSystem(bus as any, store as any, {
    projectileHitEnemyDamage: 3,
    playerHitEnemyDamage: 999,
  });

  const session = makeSessionState();
  const score = new ScoreSystem(session, { pointsPerCell: 1, pointsPerEntityKill: 10 });
  const flowDispatcher = new FlowDispatcher([score]);
  const flow = new FlowSystem(flowDispatcher);

  const ctx: TickContext = { tick: 0, dt: 1 / 60 };

  bus.beginTick(0);
  bus.enterPhase(Phase.Collision); collision.update();
  bus.enterPhase(Phase.Impact); damage.update();
  bus.enterPhase(Phase.Flow);
  const flowEvents = bus.drainPhase(Phase.Flow) as any[];
  flow.update(ctx, flowEvents as any);
  bus.enterPhase(Phase.Cleanup); store.cleanup();
  bus.endTickAndSwap();

  assert(store.get(enemy) === null, "A: enemy should be removed after cleanup (hit must register at scroll!=0)");
  assert(session.score === 10, "A: score should increase by kill points (hit must register at scroll!=0)");
  const p = store.get(proj) as any;
  assert(p === null || p.consumed === true, "A: projectile should be consumed (or removed)");
}

// --- Part B: projectile X-cull timing is invariant to camera scroll -----------
function partB_cullTiming() {
  const bus = newBus();
  const store = new EntityStore<any>(32);

  const W = 960, H = 540;
  // Camera scrolled FAR to the right — far beyond one screen width, the regime
  // where the old screen-space X-cull would cull everything on spawn.
  const world = { scrollX: 2000, scrollY: 300 };
  const camX = world.scrollX, camY = world.scrollY;

  // Projectile fully ON-SCREEN in WORLD space (center of the visible band).
  // NEW world cull: inside [camX-.., camX+W+..] => survives.
  // OLD screen cull: 2480 > W+margin(=~985) => wrongly culled.
  const onScreen = store.spawn(e => {
    e.kind = "projectile";
    e.pos = { x: camX + W * 0.5, y: camY + H * 0.5 };
    e.vel = { x: 0, y: 0 };
    e.ttl = 5;            // long TTL so only the cull can kill it
    e.radius = 1;
    e.pendingKill = false;
    e.consumed = false;
  });

  // Projectile genuinely OFF-SCREEN to the right (positive control): must still
  // be culled, proving the cull actually fires (not just disabled).
  const offScreen = store.spawn(e => {
    e.kind = "projectile";
    e.pos = { x: camX + W + 200, y: camY + H * 0.5 };
    e.vel = { x: 0, y: 0 };
    e.ttl = 5;
    e.radius = 1;
    e.pendingKill = false;
    e.consumed = false;
  });

  const projectiles = new ProjectileSystem(bus as any, store as any, W, H, world as any);
  projectiles.update(1 / 60);

  const on = store.get(onScreen) as any;
  const off = store.get(offScreen) as any;

  assert(on && on.pendingKill === false,
    "B: on-screen projectile must NOT be culled at scrollX!=0 (X-cull must be world-relative)");
  assert(off && off.pendingKill === true,
    "B: off-screen projectile must still be culled (cull must remain active)");
}

function main() {
  partA_collisionInvariance();
  partB_cullTiming();
  console.log("[SMOKE] CollisionScrollInvariance OK ✅");
}

main();
