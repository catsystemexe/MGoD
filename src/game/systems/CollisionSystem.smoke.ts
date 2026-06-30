/**
 * CollisionSystem smoke test – CM v3.1+
 * Run: tsx src/game/systems/CollisionSystem.smoke.ts
 */

import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

import {
  CollisionSystem,
  W1_PROJECTILE_COLLISION_OFFSETS,
  W1_PROJECTILE_VISUAL_FRONT_OFFSET,
  projectileCollisionCircles,
  projectileHitsEnemy,
  type WorldEntity,
} from "./CollisionSystem";

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

function makeProjectile(x: number, y: number, vx: number, vy: number, radius: number, weaponTypeId?: string): Extract<WorldEntity, { kind: "projectile" }> {
  return {
    kind: "projectile",
    owner: { slot: 1, gen: 1 },
    weapon: "primary",
    weaponTypeId,
    pos: { x, y },
    vel: { x: vx, y: vy },
    ttl: 1,
    damage: 3,
    radius,
    consumed: false,
    pendingKill: false,
  } as any;
}

function makeEnemy(x: number, y: number, radius: number): Extract<WorldEntity, { kind: "enemy" }> {
  return { kind: "enemy", pos: { x, y }, radius, hp: 5, pendingKill: false } as any;
}

function testW1ProjectileChainCoverage(): void {
  const proj = makeProjectile(0, 0, 1, 0, 5, "w1.basic");
  const circles = projectileCollisionCircles(proj);
  const radius = 5;
  const [rearOffset, frontOffset] = W1_PROJECTILE_COLLISION_OFFSETS;

  assert(circles.length === 2, "W1 should use exactly 2 collision circles");
  assert(circles.every((circle) => circle.radius === radius), "W1 collision circles should keep projectile radius 5");
  assert(rearOffset === W1_PROJECTILE_VISUAL_FRONT_OFFSET / 2, "W1 rear circle should be derived from visual-front geometry");
  assert(frontOffset === W1_PROJECTILE_VISUAL_FRONT_OFFSET - radius, "W1 front circle should sit one radius inside the visual front");
  assert(circles[0].x === rearOffset && circles[1].x === frontOffset, "W1 forward offsets should match derived visual-front geometry");
  assert(frontOffset + radius === W1_PROJECTILE_VISUAL_FRONT_OFFSET, "W1 front circle should touch but not exceed the visual front edge");
  assert(rearOffset >= W1_PROJECTILE_VISUAL_FRONT_OFFSET / 2, "W1 rear circle should remain in the front half of the active body");

  const visualTipContact = makeEnemy(W1_PROJECTILE_VISUAL_FRONT_OFFSET + 2.99, 0, 3);
  assert(projectileHitsEnemy(proj, visualTipContact), "W1 should hit an enemy touching the visual tip");

  const trailBehindBody = makeEnemy(-8.01, 0, 3);
  assert(!projectileHitsEnemy(proj, trailBehindBody), "W1 should not hit in the trail behind the active body");

  const outsideVisualBody = makeEnemy(0, 8.1, 3);
  assert(!projectileHitsEnemy(proj, outsideVisualBody), "W1 should not hit far outside the projectile body width");
}

function testW1ProjectileChainFlipsWithNegativeVelocity(): void {
  const proj = makeProjectile(0, 0, -1, 0, 5, "w1.basic");
  const circles = projectileCollisionCircles(proj);
  assert(circles.length === 2, "left-moving W1 should use exactly 2 collision circles");
  assert(circles.every((circle) => circle.radius === 5), "left-moving W1 collision circles should keep projectile radius 5");
  assert(circles.every((circle, i) => circle.x === -W1_PROJECTILE_COLLISION_OFFSETS[i]), "left-moving W1 front should mirror the derived offsets to the left");
  assert(projectileHitsEnemy(proj, makeEnemy(-W1_PROJECTILE_VISUAL_FRONT_OFFSET - 2.99, 0, 3)), "left-moving W1 should hit an enemy touching its left/front tip");
  assert(!projectileHitsEnemy(proj, makeEnemy(8.01, 0, 3)), "left-moving W1 should not hit behind its active body");
}

function testW1ProjectileChainUsesNormalizedDiagonalVelocity(): void {
  const proj = makeProjectile(10, 20, 3, 4, 5, "w1.basic");
  const circles = projectileCollisionCircles(proj);
  assert(circles.length === 2, "diagonal W1 should use exactly 2 collision circles");
  const dir = { x: 3 / 5, y: 4 / 5 };
  for (let i = 0; i < circles.length; i++) {
    const offset = W1_PROJECTILE_COLLISION_OFFSETS[i];
    assert(Math.abs(circles[i].x - (proj.pos.x + dir.x * offset)) < 1e-9, "diagonal W1 should normalize X velocity before applying front offset");
    assert(Math.abs(circles[i].y - (proj.pos.y + dir.y * offset)) < 1e-9, "diagonal W1 should normalize Y velocity before applying front offset");
    assert((circles[i].x - proj.pos.x) * dir.x + (circles[i].y - proj.pos.y) * dir.y > 0, "diagonal W1 circles should be in front along velocity");
  }
}

function testNonW1ProjectileCollisionUnchanged(): void {
  const nonW1 = makeProjectile(0, 0, 1, 0, 5, "enemy.projectile");
  const circles = projectileCollisionCircles(nonW1);
  assert(circles.length === 1, "non-W1 projectile should remain a single circle");
  assert(circles[0].x === nonW1.pos.x && circles[0].y === nonW1.pos.y && circles[0].radius === nonW1.radius, "non-W1 projectile circle should remain centered on projectile pos");
  const enemy = makeEnemy(W1_PROJECTILE_COLLISION_OFFSETS[1] + 3.01, 0, 3);
  assert(!projectileHitsEnemy(nonW1, enemy), "non-W1 projectile should not inherit W1 visual-front reach");
}

function testW2AndBombCollisionContractsUnchanged(): void {
  const store = new EntityStore<WorldEntity>(16);
  const enemyRef = store.spawn((e) => {
    const ent = e as Extract<WorldEntity, { kind: "enemy" }>;
    ent.kind = "enemy";
    ent.pos = { x: 100, y: 100 };
    ent.radius = 8;
    ent.hp = 5;
    ent.pendingKill = false;
  });
  store.spawn((e: any) => {
    e.kind = "laser";
    e.pos = { x: 50, y: 100 };
    e.radius = 99;
    e.pendingKill = false;
  });
  store.spawn((e: any) => {
    e.kind = "bomb";
    e.pos = { x: 100, y: 100 };
    e.radius = 10;
    e.explosionRadius = 48;
    e.pendingKill = false;
  });

  const { impact } = drainCollision(store);
  assert(Number((store.get(enemyRef) as any)?.laserHitTimer ?? 0) > 0, "W2 laser collision should still use its dedicated beam timer path");
  assert(!impact.some((e: any) => e.payload?.projectile?.kind === "bomb"), "bomb entities should not use projectile-enemy collision");
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
  testW1ProjectileChainCoverage();
  testW1ProjectileChainFlipsWithNegativeVelocity();
  testW1ProjectileChainUsesNormalizedDiagonalVelocity();
  testNonW1ProjectileCollisionUnchanged();
  testW2AndBombCollisionContractsUnchanged();
  testPlayerRadiusSeparation();
  testPlayerBodyRadiusHitsEnemyBody();
  testPlayerBodyRadiusCollectsPickup();
  testBodyRadiusFallsBackToCombatRadius();
  console.log("[SMOKE] CollisionSystem OK ✅");
}

main();
