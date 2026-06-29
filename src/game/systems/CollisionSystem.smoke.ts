/**
 * CollisionSystem smoke test – CM v3.1+
 * Run: tsx src/game/systems/CollisionSystem.smoke.ts
 */

import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

import { CollisionSystem, type WorldEntity } from "./CollisionSystem";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

type AnyEvent = { type: keyof CMEventMap; payload: CMEventMap[keyof CMEventMap] };

function makeBus(): EventBus<CMEventMap> {
  return new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });
}

function drainCollision(store: EntityStore<WorldEntity>, bus = makeBus()): { impact: AnyEvent[]; flow: AnyEvent[] } {
  const col = new CollisionSystem(bus, store, { scrollY: 0 });
  bus.beginTick(0);
  bus.enterPhase(Phase.Collision);
  col.update(1 / 60);
  bus.enterPhase(Phase.Impact);
  const impact = bus.drainPhase(Phase.Impact) as AnyEvent[];
  bus.enterPhase(Phase.Flow);
  const flow = bus.drainPhase(Phase.Flow) as AnyEvent[];
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();
  return { impact, flow };
}

function spawnPlayer(store: EntityStore<WorldEntity>, x: number, y: number): EntityRef {
  return store.spawn((e) => {
    const ent = e as Extract<WorldEntity, { kind: "player" }> & { bodyRadius?: number };
    ent.kind = "player";
    ent.pos = { x, y };
    ent.radius = 3;
    ent.bodyRadius = 20;
    ent.pendingKill = false;
    ent.invulnT = 0;
  });
}

function testProjectileHitsEnemy(): void {
  const store = new EntityStore<WorldEntity>(16);
  const owner: EntityRef = { slot: 1, gen: 1 };

  const enemy = store.spawn((e) => {
    const ent = e as Extract<WorldEntity, { kind: "enemy" }>;
    ent.kind = "enemy";
    ent.pos = { x: 10, y: 0 };
    ent.radius = 3;
    ent.hp = 5;
    ent.pendingKill = false;
  });

  const proj = store.spawn((e) => {
    const ent = e as Extract<WorldEntity, { kind: "projectile" }>;
    ent.kind = "projectile";
    ent.owner = owner;
    ent.weapon = "primary";
    ent.pos = { x: 8, y: 0 };
    ent.vel = { x: 0, y: 0 };
    ent.ttl = 1;
    ent.damage = 3;
    ent.radius = 2;
    ent.consumed = false;
    ent.pendingKill = false;
  });

  const { impact } = drainCollision(store);
  const hit = impact.find((e) => e.type === EventType.PROJECTILE_HIT_ENEMY) as any;
  assert(hit, "should emit PROJECTILE_HIT_ENEMY");
  assert(hit.payload.enemy.slot === enemy.slot, "payload.enemy ref matches");
  assert(hit.payload.projectile.slot === proj.slot, "payload.projectile ref matches");
}

function testPlayerRadiusSeparation(): void {
  const store = new EntityStore<WorldEntity>(16);
  const player = spawnPlayer(store, 0, 0);
  const p = store.get(player) as any;
  assert(p.radius === 3, "player combat radius remains 3");
  assert(p.bodyRadius === 20, "player body radius is 20");

  store.spawn((e: any) => {
    e.kind = "enemyProjectile";
    e.pos = { x: 10, y: 0 };
    e.radius = 4;
    e.damage = 1;
    e.pendingKill = false;
    e.consumed = false;
  });

  const { impact } = drainCollision(store);
  assert(!impact.some((e) => e.type === EventType.ENEMY_PROJECTILE_HIT_PLAYER), "enemy projectile outside combat radius must miss even inside bodyRadius");
}

function testPlayerBodyRadiusHitsEnemyBody(): void {
  const store = new EntityStore<WorldEntity>(16);
  spawnPlayer(store, 0, 0);
  store.spawn((e) => {
    const ent = e as Extract<WorldEntity, { kind: "enemy" }>;
    ent.kind = "enemy";
    ent.pos = { x: 25 - 0.01, y: 0 };
    ent.radius = 5;
    ent.hp = 5;
    ent.pendingKill = false;
  });

  const { impact } = drainCollision(store);
  assert(impact.some((e) => e.type === EventType.PLAYER_HIT_ENEMY), "player bodyRadius + enemy radius should trigger body contact");
}

function testPlayerBodyRadiusCollectsPickup(): void {
  const store = new EntityStore<WorldEntity>(16);
  const pickup = store.spawn((e) => {
    const ent = e as Extract<WorldEntity, { kind: "pickup" }>;
    ent.kind = "pickup";
    ent.defId = "w1";
    ent.pos = { x: 27.5 - 0.01, y: 0 };
    ent.radius = 7.5;
    ent.pendingKill = false;
  });
  spawnPlayer(store, 0, 0);

  const { flow } = drainCollision(store);
  assert(flow.filter((e) => e.type === EventType.PLAYER_PICKUP).length === 1, "player bodyRadius + pickup radius should collect once");
  assert((store.get(pickup) as any)?.pendingKill === true, "pickup pendingKill protects one-shot collection");
}

function testBodyRadiusFallsBackToCombatRadius(): void {
  const store = new EntityStore<WorldEntity>(16);
  const player = spawnPlayer(store, 0, 0);
  delete (store.get(player) as any).bodyRadius;
  store.spawn((e) => {
    const ent = e as Extract<WorldEntity, { kind: "enemy" }>;
    ent.kind = "enemy";
    ent.pos = { x: 8 - 0.01, y: 0 };
    ent.radius = 5;
    ent.hp = 5;
    ent.pendingKill = false;
  });

  const { impact } = drainCollision(store);
  assert(impact.some((e) => e.type === EventType.PLAYER_HIT_ENEMY), "missing bodyRadius should fall back to combat radius");
}

function main() {
  testProjectileHitsEnemy();
  testPlayerRadiusSeparation();
  testPlayerBodyRadiusHitsEnemyBody();
  testPlayerBodyRadiusCollectsPickup();
  testBodyRadiusFallsBackToCombatRadius();
  console.log("[SMOKE] CollisionSystem OK ✅");
}

main();
