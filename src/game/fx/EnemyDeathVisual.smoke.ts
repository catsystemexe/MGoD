import assert from "node:assert/strict";
import {
  computeEnemyDeathVisualState,
  createEnemyDeathGhostData,
  DEFAULT_ENEMY_DEATH_VISUAL,
  DEFAULT_ENEMY_DEATH_VISUAL_TIMING_VALID,
  snapshotEnemyDeathVisual,
  type EnemyDeathGhostSnapshot,
} from "./EnemyDeathVisual";

const EPS = 1e-9;

function approxEqual(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) <= eps;
}

function assertNoGameplayFields(value: Record<string, unknown>): void {
  for (const key of [
    "hp",
    "behaviorId",
    "attackProfile",
    "scoreOnKill",
    "pendingKill",
    "owner",
    "sourceRef",
    "entityRef",
    "ref",
    "waveId",
  ]) {
    assert(!(key in value), `snapshot data should not include ${key}`);
  }
}

function makeAnimatedEnemy(): any {
  return {
    kind: "enemy",
    typeId: "bug1",
    pos: { x: 10, y: 20 },
    posPrev: { x: 9, y: 19 },
    radius: 18,
    hp: 0,
    behaviorId: "sine.basic",
    attackProfile: { weapon: "bad" },
    scoreOnKill: 100,
    pendingKill: true,
    owner: { id: 1, gen: 2 },
    sourceRef: { id: 2, gen: 3 },
    render: {
      color: "#ff00aa",
      sprite: {
        id: "enemy.bug1.0",
        scale: 1.25,
        animation: {
          id: "enemy.bug1",
          speed: 0.75,
        },
      },
    },
  };
}

function assertProfile(): void {
  assert.equal(DEFAULT_ENEMY_DEATH_VISUAL.flashSec, 0.06);
  assert.equal(DEFAULT_ENEMY_DEATH_VISUAL.burnSec, 0.08);
  assert.equal(DEFAULT_ENEMY_DEATH_VISUAL.overlapSec, 0.14);
  assert.equal(DEFAULT_ENEMY_DEATH_VISUAL.explosionId, "fx.explosion.1");
  assert.equal(DEFAULT_ENEMY_DEATH_VISUAL.explosionScale, 1);
  assert(approxEqual(DEFAULT_ENEMY_DEATH_VISUAL.flashSec + DEFAULT_ENEMY_DEATH_VISUAL.burnSec, DEFAULT_ENEMY_DEATH_VISUAL.overlapSec));
  assert.equal(DEFAULT_ENEMY_DEATH_VISUAL_TIMING_VALID, true);
}

function assertSnapshotCloning(): EnemyDeathGhostSnapshot {
  const enemy = makeAnimatedEnemy();
  const snapshot = snapshotEnemyDeathVisual(enemy);
  assert(snapshot, "animated enemy should produce a snapshot");

  assert.deepEqual(snapshot.pos, { x: 10, y: 20 });
  assert.deepEqual(snapshot.posPrev, { x: 9, y: 19 });
  assert.notEqual(snapshot.pos, enemy.pos);
  assert.notEqual(snapshot.posPrev, enemy.posPrev);
  assert.notEqual(snapshot.render, enemy.render);
  assert.notEqual(snapshot.render?.sprite, enemy.render.sprite);
  assert.notEqual(snapshot.render?.sprite?.animation, enemy.render.sprite.animation);
  assert.equal(snapshot.render?.color, "#ff00aa");
  assert.equal(snapshot.render?.sprite?.id, "enemy.bug1.0");
  assert.equal(snapshot.render?.sprite?.scale, 1.25);
  assert.deepEqual(snapshot.render?.sprite?.animation, { id: "enemy.bug1", speed: 0.75 });

  enemy.pos.x = 99;
  enemy.posPrev.y = 88;
  enemy.render.color = "#000000";
  enemy.render.sprite.id = "enemy.changed.0";
  enemy.render.sprite.animation.id = "enemy.changed";
  assert.deepEqual(snapshot.pos, { x: 10, y: 20 });
  assert.deepEqual(snapshot.posPrev, { x: 9, y: 19 });
  assert.equal(snapshot.render?.color, "#ff00aa");
  assert.equal(snapshot.render?.sprite?.id, "enemy.bug1.0");
  assert.equal(snapshot.render?.sprite?.animation?.id, "enemy.bug1");

  snapshot.pos.x = -1;
  snapshot.posPrev.y = -2;
  if (snapshot.render?.sprite?.animation) snapshot.render.sprite.animation.speed = 2;
  assert.equal(enemy.pos.x, 99);
  assert.equal(enemy.posPrev.y, 88);
  assert.equal(enemy.render.sprite.animation.speed, 0.75);

  assertNoGameplayFields(snapshot as unknown as Record<string, unknown>);
  assertNoGameplayFields(snapshot.render as unknown as Record<string, unknown>);
  return snapshot;
}

function assertInvalidPosition(): void {
  assert.equal(snapshotEnemyDeathVisual(null), null);
  assert.equal(snapshotEnemyDeathVisual({ typeId: "bug1", pos: { x: NaN, y: 0 }, radius: 10 }), null);
  assert.equal(snapshotEnemyDeathVisual({ typeId: "bug1", pos: { x: 1, y: Infinity }, radius: 10 }), null);
  assert.equal(snapshotEnemyDeathVisual({ typeId: "bug1", radius: 10 }), null);
}

function assertSpriteModes(): void {
  const staticSnapshot = snapshotEnemyDeathVisual({
    typeId: "basic_1",
    pos: { x: 1, y: 2 },
    posPrev: { x: 0, y: 1 },
    radius: 12,
    render: { sprite: { id: "enemy.basic_1.idle", scale: 0.9 } },
  });
  assert(staticSnapshot, "static sprite snapshot should work");
  assert.equal(staticSnapshot.render?.sprite?.id, "enemy.basic_1.idle");
  assert.equal(staticSnapshot.render?.sprite?.scale, 0.9);
  assert.equal(staticSnapshot.render?.sprite?.animation, undefined);

  const animatedSnapshot = snapshotEnemyDeathVisual(makeAnimatedEnemy());
  assert(animatedSnapshot?.render?.sprite?.animation, "animated sprite snapshot should work");
}

function assertTimeline(): void {
  const at0 = computeEnemyDeathVisualState(0);
  assert.equal(at0.phase, "flash");
  assert.deepEqual(at0.tint, [1, 1, 1]);
  assert.equal(at0.opacity, 1);

  assert.equal(computeEnemyDeathVisualState(0.03).phase, "flash");
  const burnStart = computeEnemyDeathVisualState(0.06);
  assert.equal(burnStart.phase, "burn");
  assert.equal(burnStart.opacity, 1);
  assert.deepEqual(burnStart.tint, [1, 0.55, 0.12]);

  const burnMid = computeEnemyDeathVisualState(0.1);
  assert.equal(burnMid.phase, "burn");
  assert(burnMid.opacity > 0 && burnMid.opacity < 1, "burn opacity should fade between 0 and 1");

  const burnEnd = computeEnemyDeathVisualState(0.139);
  assert.equal(burnEnd.phase, "burn");
  assert(burnEnd.opacity > 0 && burnEnd.opacity < 0.01, "near-overlap burn opacity should be low");

  const hidden = computeEnemyDeathVisualState(0.14);
  assert.equal(hidden.phase, "hidden");
  assert.equal(hidden.opacity, 0);
  assert.equal(computeEnemyDeathVisualState(1).phase, "hidden");
  assert.equal(computeEnemyDeathVisualState(1).opacity, 0);

  assert.deepEqual(computeEnemyDeathVisualState(-1), at0);
  assert.deepEqual(computeEnemyDeathVisualState(NaN), at0);
  assert.deepEqual(computeEnemyDeathVisualState(Infinity), at0);
  assert.deepEqual(computeEnemyDeathVisualState(-Infinity), at0);
  assert.deepEqual(computeEnemyDeathVisualState(0.1), computeEnemyDeathVisualState(0.1));

  const invalidProfileState = computeEnemyDeathVisualState(0, {
    flashSec: -1,
    burnSec: 0,
    overlapSec: NaN,
    explosionId: "",
    explosionScale: -2,
  });
  assert.deepEqual(invalidProfileState, at0, "invalid profile durations should safely use defaults");
}

function assertCreateHelper(): void {
  const enemy = makeAnimatedEnemy();
  const data = createEnemyDeathGhostData(enemy);
  assert(data, "create helper should produce ghost data");
  assert.equal(data.kind, "fx");
  assert.deepEqual(data.vel, { x: 0, y: 0 });
  assert.equal(data.ttl, 0.14);
  assert.equal(data.deathVisual.age, 0);
  assert.equal(data.deathVisual.flashSec, 0.06);
  assert.equal(data.deathVisual.burnSec, 0.08);
  assert.equal(data.deathVisual.overlapSec, 0.14);
  assertNoGameplayFields(data as unknown as Record<string, unknown>);
  assertNoGameplayFields(data.deathVisual.snapshot as unknown as Record<string, unknown>);
  assert.deepEqual(enemy.pos, { x: 10, y: 20 }, "create helper should not mutate enemy");
}

assertProfile();
assertSnapshotCloning();
assertInvalidPosition();
assertSpriteModes();
assertTimeline();
assertCreateHelper();

console.log("[SMOKE] EnemyDeathVisual passed");
