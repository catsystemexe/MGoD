// src/game/systems/LootPickupChain.smoke.ts
//
// End-to-end guard for the FULL production loot/pickup chain — the same wiring
// createGame.ts builds, exercised across two ticks:
//
//   enemy killed (projectile -> DamageSystem)            [tick 0, Impact]
//     -> ENTITY_KILLED                                    [tick 0, Flow]
//       -> LootDropSystem (forced drop) -> SPAWN_PICKUP   [emitNext -> tick 1]
//   SpawnSystem materializes the pickup entity            [tick 1, Simulation]
//     -> player overlaps it -> CollisionSystem -> PLAYER_PICKUP  [tick 1, Flow]
//       -> PowerupSystem applies the effect               [tick 1, Flow]
//
// This is the link that was dead until the SPAWN_PICKUP handler was un-commented:
// every other system in the chain was already wired in createGame.ts, but
// SpawnSystem silently dropped SPAWN_PICKUP, so no pickup entity ever existed.
//
// We assert the CONCRETE end effect (player.energy goes 0 -> 1 for an "energy"
// drop), not merely that "something happened".

import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import type { TickContext } from "../../engine/core/Loop";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

import { CollisionSystem } from "./CollisionSystem";
import { DamageSystem } from "./DamageSystem";
import { SpawnSystem } from "./SpawnSystem";
import { PickupSystem } from "./PickupSystem";
import { LootDropSystem } from "./LootDropSystem";
import { PowerupSystem } from "./PowerupSystem";

import { FlowDispatcher } from "../systems/FlowDispatcher";
import { FlowSystem } from "../systems/FlowSystem";
import { ScoreSystem } from "../systems/ScoreSystem";
import { makeSessionState } from "../data/SessionState";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function main() {
  const bus = new EventBus(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  const store = new EntityStore<any>(64);
  const ship: EntityRef = { slot: 1, gen: 1 };
  const world = { scrollX: 0, scrollY: 0 };

  // Player starts AWAY from the enemy so it does not take contact damage on tick 0.
  const playerRef = store.spawn((e: any) => {
    e.kind = "player";
    e.pos = { x: 500, y: 500 };
    e.radius = 3;
    e.energy = 0;
    e.energyMax = 5;
    e.invulnT = 0;
    e.pendingKill = false;
  });

  // Enemy: hp == projectile damage => dies this tick (drops loot at its world pos).
  const enemy = store.spawn((e: any) => {
    e.kind = "enemy";
    e.pos = { x: 10, y: 0 };
    e.radius = 3;
    e.hp = 3;
    e.pendingKill = false;
  });

  const proj = store.spawn((e: any) => {
    e.kind = "projectile";
    e.owner = ship;
    e.pos = { x: 10, y: 0 };
    e.vel = { x: 0, y: 0 };
    e.ttl = 1;
    e.damage = 3;
    e.radius = 2;
    e.pendingKill = false;
    e.consumed = false;
  });

  const collision = new CollisionSystem(bus as any, store as any, world as any);
  const damage = new DamageSystem(bus as any, store as any, {
    projectileHitEnemyDamage: 3,
    playerHitEnemyDamage: 999,
  });

  const session = makeSessionState();
  const score = new ScoreSystem(session, { pointsPerCell: 1, pointsPerEntityKill: 10 });

  // Forced drop: dropChance=1 + rng01()=>0 => passes the drop gate, and the weighted
  // type roll (r < 0.50) deterministically yields "energy".
  const lootDrop = new LootDropSystem(bus as any, store as any, { dropChance: 1, rng01: () => 0 });
  const powerups = new PowerupSystem(session as any, store as any, () => playerRef);

  const flowDispatcher = new FlowDispatcher([score, lootDrop, powerups]);
  const flow = new FlowSystem(flowDispatcher);

  const pickupSystem = new PickupSystem(store as any);

  const spawnCfg = {
    rng01: () => 0,
    logicSize: { w: 960, h: 540 },
    weaponDb: {} as any,
  };
  const spawn = new SpawnSystem(store as any, spawnCfg as any, world as any);

  // ===================== TICK 0: kill enemy -> emit SPAWN_PICKUP =====================
  const ctx0: TickContext = { tick: 0, dt: 1 / 60 };
  bus.beginTick(0);

  bus.enterPhase(Phase.Collision); collision.update();
  bus.enterPhase(Phase.Impact); damage.update();
  bus.enterPhase(Phase.Flow);
  flow.update(ctx0, bus.drainPhase(Phase.Flow) as any);
  bus.enterPhase(Phase.Cleanup); store.cleanup();
  bus.endTickAndSwap();

  assert(store.get(enemy) === null, "tick0: enemy should be removed after cleanup");
  assert(session.score === 10, "tick0: score should increase by kill points");

  // Player flies to the drop location (the enemy's world position).
  (store.get(playerRef) as any).pos = { x: 10, y: 0 };

  // ============ TICK 1: materialize pickup -> collect -> apply powerup ============
  const ctx1: TickContext = { tick: 1, dt: 1 / 60 };
  bus.beginTick(1);

  // Simulation: SpawnSystem drains the (emitNext'd) SPAWN_PICKUP and creates the entity.
  bus.enterPhase(Phase.Simulation);
  pickupSystem.update(ctx1.dt); // production order: pickups move before spawn (no-op here)
  spawn.update(ctx1, bus.drainPhase(Phase.Simulation) as any);

  // Sanity: the pickup entity actually materialized as an "energy" pickup.
  let pickupCount = 0;
  let pickupDefId = "";
  store.debugForEachAlive((_ref: any, e: any) => {
    if (e?.kind === "pickup" && !e.pendingKill) { pickupCount++; pickupDefId = String(e.defId); }
  });
  assert(pickupCount === 1, "tick1: exactly one pickup entity should be materialized (got " + pickupCount + ")");
  assert(pickupDefId === "energy", 'tick1: pickup defId should be "energy" (got "' + pickupDefId + '")');

  // Collision: player overlaps the pickup -> PLAYER_PICKUP (Flow-owned).
  bus.enterPhase(Phase.Collision); collision.update();

  // Flow: PowerupSystem applies the energy effect.
  bus.enterPhase(Phase.Flow);
  flow.update(ctx1, bus.drainPhase(Phase.Flow) as any);

  bus.enterPhase(Phase.Cleanup); store.cleanup();
  bus.endTickAndSwap();

  // ===================== Concrete end-effect assertions =====================
  const player = store.get(playerRef) as any;
  assert(player && player.energy === 1,
    "tick1: energy pickup must raise player.energy 0 -> 1 (got " + (player ? player.energy : "no player") + ")");
  assert(session.score === 10,
    "tick1: an energy pickup must NOT change score (got " + session.score + ")");

  console.log("[SMOKE] LootPickupChain OK ✅");
}

main();
