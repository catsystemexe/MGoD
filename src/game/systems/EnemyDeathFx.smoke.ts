import assert from "node:assert/strict";
import fs from "node:fs";
import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import { ParticleStore } from "../../engine/fx/ParticleStore";
import { SpriteAtlas } from "../../render/sprites/SpriteAtlas";
import type { SpriteAtlasJSON } from "../../render/sprites/SpriteTypes";
import { selectFxSpriteFrame } from "../../render/webgl/WebGLSceneRenderer";
import { DamageSystem } from "./DamageSystem";
import { ProjectileSystem } from "./ProjectileSystem";

function makeBus(): EventBus<CMEventMap> {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 1024,
    failFast: true,
    dropLeftoversInProd: true,
  });
  bus.enterPhase(Phase.Impact);
  return bus;
}

function makeDamage(store: EntityStore<any>, particles: ParticleStore, bus = makeBus()): { bus: EventBus<CMEventMap>; damage: DamageSystem<any> } {
  return {
    bus,
    damage: new DamageSystem(bus, store, particles, {
      projectileHitEnemyDamage: 10,
      playerHitEnemyDamage: 10,
    }),
  };
}

function spawnEnemy(store: EntityStore<any>): EntityRef {
  return store.spawn((e: any) => {
    e.kind = "enemy";
    e.typeId = "bug1";
    e.pos = { x: 100, y: 200 };
    e.posPrev = { x: 96, y: 196 };
    e.vel = { x: 0, y: 0 };
    e.radius = 18;
    e.hp = 5;
    e.behaviorId = "sine.basic";
    e.attackProfile = { id: "test" };
    e.scoreOnKill = 100;
    e.owner = { slot: 123, gen: 456 };
    e.render = {
      color: "#abcdef",
      sprite: {
        id: "enemy.bug1.0",
        scale: 1.25,
        animation: { id: "enemy.bug1", speed: 1 },
      },
    };
  });
}

function hitEvent(enemy: EntityRef): any {
  return {
    type: EventType.PROJECTILE_HIT_ENEMY,
    payload: { enemy, projectile: { slot: 9999, gen: 1 } },
  };
}

function aliveFx(store: EntityStore<any>): any[] {
  const out: any[] = [];
  store.debugForEachAlive((_ref, e: any) => {
    if (e?.kind === "fx") out.push(e);
  });
  return out;
}

function noGameplayFields(value: Record<string, unknown>): void {
  for (const key of ["hp", "behaviorId", "attackProfile", "scoreOnKill", "owner", "sourceRef", "entityRef", "ref", "damage", "consumed"]) {
    assert(!(key in value), `cosmetic FX should not include ${key}`);
  }
}

function killEnemyWithCapacity(capacity: number): { store: EntityStore<any>; particles: ParticleStore; bus: EventBus<CMEventMap>; damage: DamageSystem<any>; enemyRef: EntityRef; enemy: any; killed: any[]; fx: any[] } {
  const store = new EntityStore<any>(capacity);
  const particles = new ParticleStore();
  const enemyRef = spawnEnemy(store);
  const enemy = store.get(enemyRef) as any;
  const { bus, damage } = makeDamage(store, particles);

  damage.update([hitEvent(enemyRef)]);
  const killed = bus.drainPhase(Phase.Flow).filter((e) => e.type === EventType.ENTITY_KILLED);
  return { store, particles, bus, damage, enemyRef, enemy, killed, fx: aliveFx(store) };
}

function assertImmediateDeathAndVisuals(): void {
  const result = killEnemyWithCapacity(8);
  const { store, particles, bus, damage, enemyRef, enemy, killed, fx } = result;

  assert.equal(enemy.pendingKill, true, "lethal damage should immediately mark enemy pendingKill");
  assert.equal(killed.length, 1, "ENTITY_KILLED should be emitted exactly once");
  assert.equal(store.get(enemyRef), enemy, "original enemy should still be the pending-kill gameplay entity, not retained as a visual ghost");

  const explosions = fx.filter((e) => e.animId === "fx.explosion.1");
  const ghosts = fx.filter((e) => e.deathVisual);
  assert.equal(explosions.length, 1, "exactly one animated explosion FX should spawn");
  assert.equal(ghosts.length, 1, "exactly one death ghost FX should spawn");

  const explosion = explosions[0];
  assert.equal(explosion.kind, "fx");
  assert.equal(explosion.animId, "fx.explosion.1");
  assert.equal(explosion.spriteId, "fx.explosion.1.0");
  assert.equal(explosion.ttl, 0.5);
  assert.equal(explosion.fxAge, 0);
  assert.equal(explosion.spawnT, 0);
  assert.equal(explosion.explosionScale, 1);

  const ghost = ghosts[0];
  assert.equal(ghost.kind, "fx");
  assert.equal(ghost.ttl, 0.14);
  assert.equal(ghost.fxAge, 0);
  assert.equal(ghost.deathVisual.age, 0);
  assert.equal(ghost.deathVisual.flashSec, 0.06);
  assert.equal(ghost.deathVisual.burnSec, 0.08);
  assert.equal(ghost.deathVisual.overlapSec, 0.14);
  assert.deepEqual(ghost.vel, { x: 0, y: 0 });
  assert.notEqual(ghost.deathVisual.snapshot.pos, enemy.pos);
  assert.notEqual(ghost.deathVisual.snapshot.posPrev, enemy.posPrev);
  assert.notEqual(ghost.deathVisual.snapshot.render, enemy.render);
  assert.notEqual(ghost.deathVisual.snapshot.render?.sprite, enemy.render.sprite);
  assert.notEqual(ghost.deathVisual.snapshot.render?.sprite?.animation, enemy.render.sprite.animation);
  noGameplayFields(ghost as Record<string, unknown>);
  noGameplayFields(ghost.deathVisual.snapshot as Record<string, unknown>);
  assert.equal((ghost as any).__deathFxDone, undefined, "ghost should not inherit death idempotency marker");
  assert.equal((explosion as any).__deathFxDone, undefined, "explosion should not inherit death idempotency marker");
  assert.equal((enemy as any).__deathFxDone, true, "death idempotency marker should stay on the killed gameplay enemy");

  enemy.pos.x = -1000;
  enemy.render.sprite.id = "enemy.mutated";
  enemy.render.sprite.animation.id = "enemy.mutated";
  assert.equal(ghost.deathVisual.snapshot.pos.x, 100);
  assert.equal(ghost.deathVisual.snapshot.render.sprite.id, "enemy.bug1.0");
  assert.equal(ghost.deathVisual.snapshot.render.sprite.animation.id, "enemy.bug1");

  const beforeFxCount = aliveFx(store).length;
  damage.update([hitEvent(enemyRef)]);
  const duplicateKilled = bus.drainPhase(Phase.Flow).filter((e) => e.type === EventType.ENTITY_KILLED);
  assert.equal(duplicateKilled.length, 0, "post-kill damage should not duplicate kill event");
  assert.equal(aliveFx(store).length, beforeFxCount, "post-kill damage should not duplicate cosmetic FX");

  assert(particles.aliveCount() >= 19, "ParticleStore death flash and shards should remain emitted");
}

function assertRuntimeAgingAndTtl(): void {
  const { store } = killEnemyWithCapacity(8);
  const projectileSystem = new ProjectileSystem(makeBus(), store, 800, 600, { scrollX: 0, scrollY: 0 } as any);
  const ghost = aliveFx(store).find((e) => e.deathVisual)!;
  const explosion = aliveFx(store).find((e) => e.animId === "fx.explosion.1")!;

  projectileSystem.update(0.1);
  assert(Math.abs(ghost.deathVisual.age - 0.1) < 1e-9, "ghost age should increment exactly once per update");
  assert(Math.abs(ghost.fxAge - 0.1) < 1e-9, "ghost fxAge should increment exactly once per update");
  assert(Math.abs(ghost.deathVisual.age + ghost.ttl - 0.14) < 1e-9, "ghost TTL and age should remain aligned to overlap duration");
  assert.equal(ghost.pendingKill, false);
  assert.equal(explosion.pendingKill, false);

  projectileSystem.update(0.041);
  assert.equal(ghost.pendingKill, true, "ghost should expire through existing ttl <= 0 handling");
  assert.equal(explosion.pendingKill, false, "explosion should remain alive at ghost expiry");

  projectileSystem.update(0.36);
  assert.equal(explosion.pendingKill, true, "explosion should expire at 0.5 seconds through existing TTL handling");
}

function assertNewExplosionStartsAtFrame0(): void {
  const { fx } = killEnemyWithCapacity(8);
  const explosion = fx.find((e) => e.animId === "fx.explosion.1")!;
  const atlasJson = JSON.parse(fs.readFileSync("public/assets/sprites/explosion_1.atlas.json", "utf8")) as SpriteAtlasJSON;
  const system = {
    ready: true,
    atlas: new SpriteAtlas(atlasJson),
    tex: { ready: true },
  };
  const systems = new Map([["fx.explosion.1", system]]);
  assert.equal(explosion.fxAge, 0);
  assert.equal(selectFxSpriteFrame(explosion, systems, 999)?.frame, system.atlas.frame("fx.explosion.1.0"));
  explosion.fxAge = 0.49;
  assert.equal(selectFxSpriteFrame(explosion, systems, 999)?.frame, system.atlas.frame("fx.explosion.1.7"), "explosion should reach frame 7 before expiry");
  explosion.fxAge = 0.75;
  assert.equal(selectFxSpriteFrame(explosion, systems, 999)?.frame, system.atlas.frame("fx.explosion.1.7"), "non-looping explosion should clamp to frame 7");
}

function assertCapacityFallback(): void {
  const unavailable = killEnemyWithCapacity(1);
  assert.equal(unavailable.enemy.pendingKill, true, "capacity pressure must not block gameplay death");
  assert.equal(unavailable.killed.length, 1, "capacity pressure must not block kill event");
  assert.equal(unavailable.fx.length, 0, "no cosmetics should spawn when no slots are available");

  const oneSlot = killEnemyWithCapacity(2);
  assert.equal(oneSlot.enemy.pendingKill, true);
  assert.equal(oneSlot.killed.length, 1);
  assert.equal(oneSlot.fx.length, 1, "exactly one cosmetic should spawn with one free slot");
  assert.equal(oneSlot.fx[0].animId, "fx.explosion.1", "explosion should have priority over ghost");
  assert.equal(oneSlot.fx[0].deathVisual, undefined, "ghost may be skipped when only one cosmetic slot exists");
}


function assertUnexpectedSpawnErrorsAreNotSwallowed(): void {
  const store = new EntityStore<any>(4);
  const particles = new ParticleStore();
  const enemyRef = spawnEnemy(store);
  const { damage } = makeDamage(store, particles);
  const originalSpawn = store.spawn.bind(store);
  let cosmeticSpawnAttempted = false;
  (store as any).spawn = (factory: (e: any) => void) => {
    void factory;
    cosmeticSpawnAttempted = true;
    throw new Error("unexpected cosmetic factory failure");
  };

  assert.throws(
    () => damage.update([hitEvent(enemyRef)]),
    /unexpected cosmetic factory failure/,
    "unexpected cosmetic spawn errors should not be swallowed",
  );
  assert.equal(cosmeticSpawnAttempted, true);
  (store as any).spawn = originalSpawn;
}

function assertRendererFxRegistryStillSupportsAllExplosions(): void {
  const systems = new Map<string, { ready: boolean; atlas: SpriteAtlas; tex: { ready: boolean } }>();
  const bugJson = JSON.parse(fs.readFileSync("public/assets/sprites/explosion_bug1.atlas.json", "utf8")) as SpriteAtlasJSON;
  systems.set("fx.explosion.bug1", { ready: true, atlas: new SpriteAtlas(bugJson), tex: { ready: true } });
  for (let i = 1; i <= 4; i++) {
    const json = JSON.parse(fs.readFileSync(`public/assets/sprites/explosion_${i}.atlas.json`, "utf8")) as SpriteAtlasJSON;
    systems.set(`fx.explosion.${i}`, { ready: true, atlas: new SpriteAtlas(json), tex: { ready: true } });
  }

  assert(selectFxSpriteFrame({ animId: "fx.explosion.bug1", fxAge: 0 }, systems, 0));
  for (let i = 1; i <= 4; i++) {
    assert(selectFxSpriteFrame({ animId: `fx.explosion.${i}`, fxAge: 0 }, systems, 0));
  }
}

function assertRegressionGuards(): void {
  const damageSource = fs.readFileSync("src/game/systems/DamageSystem.ts", "utf8");
  const projectileSource = fs.readFileSync("src/game/systems/ProjectileSystem.ts", "utf8");
  assert(damageSource.includes("DEFAULT_ENEMY_DEATH_VISUAL.explosionId"), "enemy death should use default explosion id");
  assert(!damageSource.includes("fx.explosion.2") && !damageSource.includes("fx.explosion.3") && !damageSource.includes("fx.explosion.4"), "enemy death should not randomly select explosion variants");
  assert(projectileSource.includes("EventType.EXPLOSION"), "bomb explosion flow should remain present");
  assert(projectileSource.includes("e.ttl -= dtSec"), "existing projectile/FX TTL behavior should remain authoritative");
}

assertImmediateDeathAndVisuals();
assertRuntimeAgingAndTtl();
assertNewExplosionStartsAtFrame0();
assertCapacityFallback();
assertUnexpectedSpawnErrorsAreNotSwallowed();
assertRendererFxRegistryStillSupportsAllExplosions();
assertRegressionGuards();

console.log("[SMOKE] EnemyDeathFx passed");
