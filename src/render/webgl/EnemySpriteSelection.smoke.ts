import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EntityStore } from "../../engine/ecs/EntityStore";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { AnyEvent, TickContext } from "../../engine/core/Loop";
import { validateEnemyTypes } from "../../game/content/loadContent";
import { ENEMY_DEFS, normalizeEnemySpriteRender } from "../../game/defs/EnemyDefs";
import { createWorldState } from "../../game/data/WorldState";
import { SpawnSystem, type SpawnableEntity } from "../../game/systems/SpawnSystem";
import { computeSpriteDrawGeometry, selectEnemySpriteFrame } from "./WebGLSceneRenderer";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

type Frame = { x: number; y: number; w: number; h: number; px: number; py: number };

function makeSpriteSystem(frames: Record<string, Frame>, ready = true) {
  return {
    ready,
    tex: { ready },
    atlas: {
      frame: (key: string) => frames[key] ?? null,
      pickAnimFrame: (key: string) => frames[key] ?? null,
    },
  };
}

function expectThrows(fn: () => unknown, msg: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, msg);
}

function spawnEnemy(typeId: string, store = new EntityStore<SpawnableEntity>(8)) {
  const spawn = new SpawnSystem(
    store,
    {
      rng01: () => 0.5,
      logicSize: { w: 400, h: 224 },
      weaponDb: {},
    },
    createWorldState(),
  );
  const events: Array<AnyEvent<CMEventMap>> = [
    { type: EventType.SPAWN_ENEMY, payload: { typeId } as any },
  ] as any;
  const ctx: TickContext = { tick: 1, dt: 1 / 60 };
  spawn.update(ctx, events);

  let found: any = null;
  store.debugForEachAlive((_ref, e) => {
    if ((e as any).kind === "enemy" && !found) found = e;
  });
  assert(found, `expected spawned enemy ${typeId}`);
  return { store, enemy: found };
}

function testContentParser() {
  validateEnemyTypes([
    { id: "ok", hp: 1, radius: 1, scoreOnKill: 1, behaviorPresetId: "none.basic", render: { sprite: { id: " enemy.ok.idle ", scale: 1 } } },
  ]);
  expectThrows(
    () => validateEnemyTypes([{ id: "bad_id", hp: 1, radius: 1, scoreOnKill: 1, behaviorPresetId: "none.basic", render: { sprite: { id: "" } } }]),
    "empty render.sprite.id should fail structural validation",
  );
  expectThrows(
    () => validateEnemyTypes([{ id: "bad_scale", hp: 1, radius: 1, scoreOnKill: 1, behaviorPresetId: "none.basic", render: { sprite: { id: "enemy.bad.idle", scale: 0 } } }]),
    "non-positive render.sprite.scale should fail structural validation",
  );

  const nested = normalizeEnemySpriteRender({ id: " enemy.nested.idle ", scale: 0.5 }, "enemy.root.idle", "dual")!;
  assert(nested.id === "enemy.nested.idle", "render.sprite.id should be trimmed and preferred over root spriteId");
  assert(nested.scale === 0.5, "valid render.sprite.scale should be preserved");

  const legacy = normalizeEnemySpriteRender(undefined, " enemy.legacy.idle ", "legacy")!;
  assert(legacy.id === "enemy.legacy.idle", "legacy root spriteId fallback should still work");
  assert(legacy.scale === 1, "legacy root spriteId fallback should default scale to 1");

  const invalidScale = normalizeEnemySpriteRender({ id: "enemy.badscale.idle", scale: -2 }, undefined, "badscale")!;
  assert(invalidScale.scale === 1, "invalid explicit scale should normalize to 1 in EnemyDefs parser");
}

function testSpawnRuntime() {
  const first = spawnEnemy("basic_1");
  assert(first.enemy.render?.sprite?.id === "enemy.basic_1.idle", "spawned enemy should receive render.sprite.id");
  assert(first.enemy.render?.sprite?.scale === 1, "spawned enemy should receive render.sprite.scale");
  assert(first.enemy.spriteId === "enemy.basic_1.idle", "compatibility root spriteId should be overwritten from normalized sprite");
  assert(first.enemy.radius === ENEMY_DEFS.basic_1.radius, "sprite scale must not alter collision radius");

  const second = spawnEnemy("basic_1");
  assert(first.enemy.render.sprite !== second.enemy.render.sprite, "spawned entities must not share render.sprite descriptor objects");

  const store = new EntityStore<SpawnableEntity>(1);
  const spawned = spawnEnemy("basic_1", store);
  spawned.enemy.pendingKill = true;
  store.cleanup();
  const recycled = spawnEnemy("red", store).enemy;
  assert(!recycled.render?.sprite, "recycled non-sprite enemy should not retain ghost render.sprite");
  assert(recycled.spriteId === "", "recycled non-sprite enemy should not retain ghost root spriteId");
}

function testRendererHelpers() {
  const idle: Frame = { x: 0, y: 0, w: 64, h: 64, px: 32, py: 32 };
  const readyMap = new Map([
    ["basic_1", makeSpriteSystem({ "enemy.basic_1.idle": idle, "enemy.basic_1.legacy": idle })],
  ]);

  const selected = selectEnemySpriteFrame(
    { typeId: "basic_1", render: { sprite: { id: "enemy.basic_1.idle" } }, spriteId: "enemy.basic_1.legacy" },
    readyMap,
    0,
  );
  assert(selected?.frame === idle, "sprite selection should use render.sprite.id descriptor");

  const legacy = selectEnemySpriteFrame(
    { typeId: "basic_1", spriteId: "enemy.basic_1.legacy" },
    readyMap,
    0,
  );
  assert(legacy?.frame === idle, "legacy root spriteId fallback should still select a frame");

  const missing = selectEnemySpriteFrame(
    { typeId: "basic_1", render: { sprite: { id: "enemy.basic_1.missing" } } },
    readyMap,
    0,
  );
  assert(missing === null, "missing frame should return null and allow SDF fallback");

  const unready = selectEnemySpriteFrame(
    { typeId: "basic_1", render: { sprite: { id: "enemy.basic_1.idle" } } },
    new Map([["basic_1", makeSpriteSystem({ "enemy.basic_1.idle": idle }, false)]]),
    0,
  );
  assert(unready === null, "unready sprite system should return null and allow SDF fallback");

  assert(!!selected, "sprite selection should succeed before SDF fallback decision");

  const geom1 = computeSpriteDrawGeometry(idle, 1);
  assert(geom1.width === 64 && geom1.height === 64 && geom1.pivotX === 32 && geom1.pivotY === 32, "scale 1 should preserve sprite dimensions and pivot");

  const geomHalf = computeSpriteDrawGeometry(idle, 0.5);
  assert(geomHalf.width === 32 && geomHalf.height === 32 && geomHalf.pivotX === 16 && geomHalf.pivotY === 16, "scale 0.5 should halve dimensions and pivot");

  const geomInvalid = computeSpriteDrawGeometry(idle, 0);
  assert(geomInvalid.width === 64 && geomInvalid.pivotX === 32, "invalid render scale should defensively default to 1");
}

function testMigratedAssetConsistency() {
  const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
  for (const typeId of ["basic_1", "basic_2", "shooter_1", "void_1", "crawler_1", "mine_1"]) {
    const def = ENEMY_DEFS[typeId];
    const spriteId = def?.render?.sprite?.id;
    assert(spriteId === `enemy.${typeId}.idle`, `${typeId} should define render.sprite.id`);
    assert(def.render?.sprite?.scale === 1, `${typeId} should keep render.sprite.scale at 1`);

    const atlasPath = resolve(repoRoot, `public/assets/sprites/${typeId}.atlas.json`);
    const pngPath = resolve(repoRoot, `public/assets/sprites/${typeId}.png`);
    assert(existsSync(atlasPath), `${typeId} atlas JSON should exist`);
    assert(existsSync(pngPath), `${typeId} PNG should exist`);

    const atlas = JSON.parse(readFileSync(atlasPath, "utf8"));
    assert(!!atlas.frames?.[spriteId], `${typeId} render.sprite.id should match atlas frame key`);
  }
}

function main() {
  testContentParser();
  testSpawnRuntime();
  testRendererHelpers();
  testMigratedAssetConsistency();
  console.log("[SMOKE] EnemySpriteSelection OK ✅");
}

main();
