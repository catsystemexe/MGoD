import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EntityStore } from "../../engine/ecs/EntityStore";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { AnyEvent, TickContext } from "../../engine/core/Loop";
import { loadContent, validateEnemyTypes } from "../../game/content/loadContent";
import { ENEMY_DEFS, buildEnemyAppearanceRaw, normalizeEnemyAppearance, normalizeEnemySpriteRender } from "../../game/defs/EnemyDefs";
import { materializeEnemyAppearance } from "../../game/defs/EnemyAppearanceTypes";
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

function spawnEnemy(typeId: string, store = new EntityStore<SpawnableEntity>(8), payloadExtra: Record<string, unknown> = {}) {
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
    { type: EventType.SPAWN_ENEMY, payload: { typeId, ...payloadExtra } as any },
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

  const nested = normalizeEnemySpriteRender({ id: " enemy.nested.idle ", scale: 0.5 }, "nested")!;
  assert(nested.id === "enemy.nested.idle", "render.sprite.id should be trimmed");
  assert(nested.scale === 0.5, "valid render.sprite.scale should be preserved");

  const missing = normalizeEnemySpriteRender(undefined, "missing");
  assert(missing === undefined, "missing nested render.sprite should not create a sprite descriptor");

  const invalidScale = normalizeEnemySpriteRender({ id: "enemy.badscale.idle", scale: -2 }, "badscale")!;
  assert(invalidScale.scale === 1, "invalid explicit scale should normalize to 1 in EnemyDefs parser");
}

function testAppearanceNormalizer() {
  const raw = {
    color: "#123456",
    sprite: { id: " enemy.trimmed.idle " },
    sdf: { shape: "orb", color: "#abcdef", size: 0.75 },
    glyphs: [{ id: "enemy.glyph", dx: 2, dy: 3, alpha: 2, pulseAmp: -1, pulseHz: 4 }],
    proc: { kind: "parts", parts: [{ dx: 1, dy: 2, w: 3, h: 4, color: "#fff", alpha: 2, pulseAmp: -1, pulseHz: 5 }] },
  };
  const before = JSON.stringify(raw);
  const normalized = normalizeEnemyAppearance(raw, "trimmed")!;

  assert(JSON.stringify(raw) === before, "normalizeEnemyAppearance should not mutate raw render input");
  assert(normalized !== raw, "normalizeEnemyAppearance should return a fresh appearance object");
  assert(normalized.sprite !== raw.sprite, "normalizeEnemyAppearance should clone sprite descriptors");
  assert(normalized.sprite?.id === "enemy.trimmed.idle", "normalizeEnemyAppearance should trim sprite IDs");
  assert(normalized.sprite?.scale === 1, "normalizeEnemyAppearance should default sprite scale to 1");
  assert(normalized.sdf !== raw.sdf && normalized.sdf?.shape === "orb", "normalizeEnemyAppearance should preserve valid SDF shapes with a fresh object");
  assert(normalized.glyphs !== raw.glyphs, "normalizeEnemyAppearance should clone glyph arrays");
  assert(normalized.glyphs?.[0] !== raw.glyphs[0], "normalizeEnemyAppearance should clone glyph entries");
  assert(normalized.glyphs?.[0]?.alpha === 1, "normalizeEnemyAppearance should clamp glyph alpha");
  assert(normalized.glyphs?.[0]?.pulseAmp === 0, "normalizeEnemyAppearance should clamp glyph pulseAmp");
  assert(normalized.proc !== raw.proc, "normalizeEnemyAppearance should clone proc descriptors");
  assert(normalized.proc?.parts !== raw.proc.parts, "normalizeEnemyAppearance should clone proc parts arrays");
  assert(normalized.proc?.parts[0] !== raw.proc.parts[0], "normalizeEnemyAppearance should clone proc part entries");
  assert(normalized.proc?.parts[0]?.alpha === 1, "normalizeEnemyAppearance should clamp proc part alpha");
  assert(normalized.proc?.parts[0]?.pulseAmp === 0, "normalizeEnemyAppearance should clamp proc part pulseAmp");
  assert(!normalized.glyphId, "sprite/SDF/glyph/proc appearance should not receive fallback glyphId");

  const explicitScale = normalizeEnemyAppearance({ sprite: { id: "enemy.scale.idle", scale: 0.5 } }, "scale")!;
  assert(explicitScale.sprite?.scale === 0.5, "normalizeEnemyAppearance should preserve valid explicit sprite scale");
  assert(!explicitScale.glyphId, "sprite enemy should not receive fallback glyph");

  const sdfOnly = normalizeEnemyAppearance({ sdf: { shape: "triangle" } }, "sdf_only")!;
  assert(sdfOnly.sdf?.shape === "triangle", "normalizeEnemyAppearance should preserve SDF-only appearance");
  assert(!sdfOnly.glyphId, "SDF enemy should not receive fallback glyph");

  const procOnly = normalizeEnemyAppearance({ proc: { kind: "parts", parts: [{ dx: 0, dy: 0, w: 1, h: 1 }] } }, "proc_only")!;
  assert(procOnly.proc?.parts.length === 1, "normalizeEnemyAppearance should preserve proc-only appearance");
  assert(!procOnly.glyphId, "proc enemy should not receive fallback glyph");

  const glyphStackOnly = normalizeEnemyAppearance({ glyphs: [{ id: "enemy.stack" }] }, "stack_only")!;
  assert(glyphStackOnly.glyphs?.length === 1, "normalizeEnemyAppearance should preserve explicit glyph stacks");
  assert(!glyphStackOnly.glyphId, "explicit glyph stack should not receive fallback glyph");

  const fallback = normalizeEnemyAppearance({}, "fallback")!;
  assert(fallback.glyphId === "enemy.fallback", "normalizeEnemyAppearance should add fallback glyph when no valid appearance path exists");

  const invalidSdfFallback = normalizeEnemyAppearance({ sdf: { shape: "bad" } }, "bad_sdf")!;
  assert(!invalidSdfFallback.sdf, "normalizeEnemyAppearance should reject invalid SDF shapes");
  assert(invalidSdfFallback.glyphId === "enemy.bad_sdf", "invalid SDF-only appearance should receive fallback glyph");
}

function testAppearanceAliasAdapter() {
  const rootColor = { color: "#111111" };
  assert(normalizeEnemyAppearance(buildEnemyAppearanceRaw(rootColor), "root_color")?.color === "#111111", "root color should be accepted when render.color is absent");

  const renderColor = { color: "#111111", renderColor: "#222222" };
  assert(normalizeEnemyAppearance(buildEnemyAppearanceRaw(renderColor), "render_color")?.color === "#222222", "renderColor should be accepted and should beat root color");

  const nestedColor = { color: "#111111", renderColor: "#222222", render: { color: "#333333" } };
  assert(normalizeEnemyAppearance(buildEnemyAppearanceRaw(nestedColor), "nested_color")?.color === "#333333", "render.color should beat renderColor and root color");

  const aliases = {
    glyphId: "enemy.root_glyph",
    glyphs: [{ id: "enemy.root_stack" }],
    proc: { kind: "parts", parts: [{ dx: 0, dy: 0, w: 2, h: 3 }] },
    sdf: { shape: "orb", size: 0.8 },
  };
  const aliasAppearance = normalizeEnemyAppearance(buildEnemyAppearanceRaw(aliases), "aliases")!;
  assert(aliasAppearance.glyphId === "enemy.root_glyph", "root glyphId alias should remain accepted");
  assert(aliasAppearance.glyphs?.[0]?.id === "enemy.root_stack", "root glyphs alias should remain accepted");
  assert(aliasAppearance.proc?.parts[0]?.w === 2, "root proc alias should remain accepted");
  assert(aliasAppearance.sdf?.shape === "orb", "root sdf alias should remain accepted");

  const nestedOverrides = {
    glyphId: "enemy.root_glyph",
    glyphs: [{ id: "enemy.root_stack" }],
    proc: { kind: "parts", parts: [{ dx: 0, dy: 0, w: 2, h: 3 }] },
    sdf: { shape: "orb" },
    render: {
      glyphId: "enemy.nested_glyph",
      glyphs: [{ id: "enemy.nested_stack" }],
      proc: { kind: "parts", parts: [{ dx: 1, dy: 1, w: 4, h: 5 }] },
      sdf: { shape: "triangle" },
    },
  };
  const nestedOverrideAppearance = normalizeEnemyAppearance(buildEnemyAppearanceRaw(nestedOverrides), "nested_overrides")!;
  assert(nestedOverrideAppearance.glyphId === "enemy.nested_glyph", "nested glyphId should override root glyphId alias");
  assert(nestedOverrideAppearance.glyphs?.[0]?.id === "enemy.nested_stack", "nested glyphs should override root glyphs alias");
  assert(nestedOverrideAppearance.proc?.parts[0]?.w === 4, "nested proc should override root proc alias");
  assert(nestedOverrideAppearance.sdf?.shape === "triangle", "nested sdf should override root sdf alias");

  const rootSpriteOnly = normalizeEnemyAppearance(buildEnemyAppearanceRaw({ spriteId: "enemy.root_sprite.idle" }), "root_sprite")!;
  assert(!rootSpriteOnly.sprite, "root spriteId should remain unsupported");
  assert(rootSpriteOnly.glyphId === "enemy.root_sprite", "root spriteId should not count as a valid appearance path");

  const raw = {
    color: "#111111",
    renderColor: "#222222",
    glyphs: [{ id: "enemy.root_stack" }],
    render: { color: "#333333", glyphs: [{ id: "enemy.nested_stack" }] },
  };
  const before = JSON.stringify(raw);
  const built = buildEnemyAppearanceRaw(raw);
  assert(JSON.stringify(raw) === before, "buildEnemyAppearanceRaw should not mutate input objects");
  assert(built !== raw.render, "buildEnemyAppearanceRaw should return a fresh adapter object");
}

function testAppearanceMaterialization() {
  const appearance = normalizeEnemyAppearance({
    color: "#123456",
    sprite: { id: "enemy.material.idle", scale: 0.75 },
    sdf: { shape: "orb", color: "#abcdef", size: 0.5 },
    glyphId: "enemy.material",
    glyphs: [{ id: "enemy.material.glyph", dx: 1, dy: 2 }],
    proc: { kind: "parts", parts: [{ dx: 1, dy: 2, w: 3, h: 4 }] },
  }, "material")!;
  const materialized = materializeEnemyAppearance(appearance)!;

  assert(materialized !== appearance, "materialized appearance should be a fresh top-level object");
  assert(materialized.sprite !== appearance.sprite, "materialized sprite should not be shared");
  assert(materialized.sdf !== appearance.sdf, "materialized SDF should not be shared");
  assert(materialized.glyphs !== appearance.glyphs, "materialized glyph array should not be shared");
  assert(materialized.glyphs?.[0] !== appearance.glyphs?.[0], "materialized glyph entries should not be shared");
  assert(materialized.proc !== appearance.proc, "materialized proc should not be shared");
  assert(materialized.proc?.parts !== appearance.proc?.parts, "materialized proc parts array should not be shared");
  assert(materialized.proc?.parts[0] !== appearance.proc?.parts[0], "materialized proc part entries should not be shared");

  materialized.sprite!.id = "enemy.mutated.idle";
  materialized.sdf!.shape = "triangle";
  materialized.glyphs![0].id = "enemy.mutated.glyph";
  materialized.proc!.parts[0].w = 99;

  assert(appearance.sprite?.id === "enemy.material.idle", "mutating materialized sprite should not mutate normalized source");
  assert(appearance.sdf?.shape === "orb", "mutating materialized SDF should not mutate normalized source");
  assert(appearance.glyphs?.[0]?.id === "enemy.material.glyph", "mutating materialized glyph should not mutate normalized source");
  assert(appearance.proc?.parts[0]?.w === 3, "mutating materialized proc part should not mutate normalized source");
  assert(materializeEnemyAppearance(undefined) === undefined, "missing appearance should materialize to undefined");
}

function testSpawnRuntime() {
  const first = spawnEnemy("basic_1");
  assert(first.enemy.render?.sprite?.id === "enemy.basic_1.idle", "spawned enemy should receive render.sprite.id");
  assert(first.enemy.render?.sprite?.scale === 1, "spawned enemy should receive render.sprite.scale");
  assert(Object.prototype.hasOwnProperty.call(first.enemy, "spriteId") === false, "spawned sprite enemy should not have an own root spriteId");
  assert(first.enemy.radius === ENEMY_DEFS.basic_1.radius, "sprite scale must not alter collision radius");

  const second = spawnEnemy("basic_1");
  assert(first.enemy.render !== ENEMY_DEFS.basic_1.render, "spawned render should not share the definition render object");
  assert(first.enemy.render.sprite !== ENEMY_DEFS.basic_1.render?.sprite, "spawned sprite should not share the definition sprite descriptor");
  assert(first.enemy.render.sdf !== ENEMY_DEFS.basic_1.render?.sdf, "spawned SDF should not share the definition SDF descriptor");
  assert(first.enemy.render.sprite !== second.enemy.render.sprite, "spawned entities must not share render.sprite descriptor objects");
  first.enemy.render.sprite.id = "enemy.basic_1.mutated";
  assert(ENEMY_DEFS.basic_1.render?.sprite?.id === "enemy.basic_1.idle", "mutating a spawned sprite should not mutate ENEMY_DEFS");
  assert(second.enemy.render.sprite.id === "enemy.basic_1.idle", "mutating one spawned sprite should not mutate another spawned enemy");

  const red = spawnEnemy("red").enemy;
  assert(red.render !== ENEMY_DEFS.red.render, "spawned SDF/glyph render should not share the definition render object");
  assert(red.render.sdf !== ENEMY_DEFS.red.render?.sdf, "spawned SDF should not share the definition SDF descriptor");
  assert(red.render.glyphs !== ENEMY_DEFS.red.render?.glyphs, "spawned glyph array should not share the definition glyph array");
  assert(red.render.glyphs[0] !== ENEMY_DEFS.red.render?.glyphs?.[0], "spawned glyph entries should not share definition glyph entries");
  red.render.sdf.shape = "triangle";
  red.render.glyphs[0].id = "enemy.red.mutated";
  assert(ENEMY_DEFS.red.render?.sdf?.shape === "orb", "mutating spawned SDF should not mutate ENEMY_DEFS");
  assert(ENEMY_DEFS.red.render?.glyphs?.[0]?.id === "enemy.red", "mutating spawned glyphs should not mutate ENEMY_DEFS");

  const store = new EntityStore<SpawnableEntity>(1);
  const spawned = spawnEnemy("basic_1", store);
  const oldPooledRender = spawned.enemy.render;
  spawned.enemy.pendingKill = true;
  store.cleanup();
  const recycled = spawnEnemy("red", store).enemy;
  assert(recycled.render !== oldPooledRender, "recycled enemy should receive a fresh render object");
  assert(!recycled.render?.sprite, "recycled non-sprite enemy should not retain ghost render.sprite");
  assert(recycled.render?.sdf?.shape === "orb", "recycled enemy should receive fresh SDF appearance");
  assert(Array.isArray(recycled.render?.glyphs) && recycled.render!.glyphs!.length > 0, "recycled enemy should receive fresh glyphs appearance");
  assert(!recycled.render?.proc, "recycled enemy should not retain ghost proc appearance");
  assert(!recycled.render?.glyphId, "recycled explicit SDF/glyph enemy should not receive duplicate fallback glyph");
  assert(recycled.animId === "", "recycled enemy should reset animId");
  assert(Object.prototype.hasOwnProperty.call(recycled, "spriteId") === false, "recycled non-sprite enemy should not retain ghost root spriteId");

  const behaviorStore = new EntityStore<SpawnableEntity>(1);
  const firstBehavior = spawnEnemy("basic_1", behaviorStore).enemy;
  const firstBehaviorParams = firstBehavior.behavior;
  const firstBState = firstBehavior.bState;
  firstBehavior.ai = { ghost: true };
  firstBehavior.behavior = { ghost: true };
  firstBehavior.bState = { ghost: true };
  firstBehavior.pendingKill = true;
  behaviorStore.cleanup();
  const recycledBehavior = spawnEnemy("red", behaviorStore).enemy;
  assert(recycledBehavior.ai === undefined, "recycled enemy should clear stale AI data when the definition has no AI");
  assert(recycledBehavior.behavior !== firstBehaviorParams, "recycled enemy behavior params should be a fresh object");
  assert(recycledBehavior.behavior?.ghost !== true, "recycled enemy behavior params should not retain ghost keys");
  assert(recycledBehavior.bState !== firstBState, "recycled enemy bState should be a fresh object");
  assert(recycledBehavior.bState?.ghost !== true, "recycled enemy bState should not retain ghost keys");
  assert(recycledBehavior.behaviorId === "straight", "recycled enemy behaviorId should be reset from the new definition");
  assert(recycledBehavior.aiWeight === 0 && recycledBehavior.aiWeightTarget === 0, "recycled enemy should reset AI weights");
  assert(recycledBehavior.aiEaseSec === 0.12, "recycled enemy should reset AI easing");
}

function testRendererHelpers() {
  const idle: Frame = { x: 0, y: 0, w: 64, h: 64, px: 32, py: 32 };
  const readyMap = new Map([
    ["basic_1", makeSpriteSystem({ "enemy.basic_1.idle": idle, "enemy.basic_1.legacy": idle })],
  ]);

  const selected = selectEnemySpriteFrame(
    { typeId: "basic_1", render: { sprite: { id: "enemy.basic_1.idle" } } },
    readyMap,
    0,
  );
  assert(selected?.frame === idle, "sprite selection should use render.sprite.id descriptor");

  const missingNested = selectEnemySpriteFrame(
    { typeId: "basic_1" },
    readyMap,
    0,
  );
  assert(missingNested === null, "missing nested sprite ID should return null and allow SDF fallback");

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
    assert(!def.render?.glyphId, `${typeId} sprite appearance should not receive fallback glyphId`);

    const atlasPath = resolve(repoRoot, `public/assets/sprites/${typeId}.atlas.json`);
    const pngPath = resolve(repoRoot, `public/assets/sprites/${typeId}.png`);
    assert(existsSync(atlasPath), `${typeId} atlas JSON should exist`);
    assert(existsSync(pngPath), `${typeId} PNG should exist`);

    const atlas = JSON.parse(readFileSync(atlasPath, "utf8"));
    assert(!!atlas.frames?.[spriteId], `${typeId} render.sprite.id should match atlas frame key`);
  }
}

function testExistingEnemyRenderPaths() {
  for (const typeId of ["red", "bug1", "obelisk", "sigil", "crown", "orb", "mandala", "blue", "sniper_aimed", "scout_sine", "basic_1", "basic_2", "shooter_1", "void_1", "crawler_1", "mine_1"]) {
    const def = ENEMY_DEFS[typeId];
    assert(!!def?.render, `${typeId} should have normalized render appearance`);
  }

  assert(ENEMY_DEFS.red.render?.sdf?.shape === "orb", "red should keep SDF render path");
  assert(!ENEMY_DEFS.red.render?.glyphId, "SDF enemy with glyph stack should not receive duplicate fallback glyph");
  assert(Array.isArray(ENEMY_DEFS.red.render?.glyphs) && ENEMY_DEFS.red.render!.glyphs!.length > 0, "red should keep glyph stack render path");
  assert(normalizeEnemyAppearance(undefined, "fallback_spawn")?.glyphId === "enemy.fallback_spawn", "enemy without explicit appearance should receive normalized fallback glyph");
}

function testContentBehaviorAttackSeparation() {
  const content = loadContent();
  assert(content.enemyTypes.length > 0, "loadContent should accept existing enemy definitions");
  assert(content.behaviorPresets.some((p) => p.id === "straight.basic"), "loadContent should include behavior presets");
  assert(ENEMY_DEFS.basic_1.behaviorPreset === "straight.basic", "behaviorPresetId should still resolve onto ENEMY_DEFS");
  assert(ENEMY_DEFS.basic_1.attackProfile?.id === "single_basic", "attackProfileId should still resolve to the same attackProfile");

  const defaultEnemy = spawnEnemy("basic_1").enemy;
  const overriddenEnemy = spawnEnemy("basic_1", new EntityStore<SpawnableEntity>(8), { behaviorPresetId: "sine.basic" }).enemy;
  assert(defaultEnemy.behaviorId === "straight", "default behavior preset should still resolve at spawn");
  assert(overriddenEnemy.behaviorId === "sine", "wave behavior override should still affect behavior");
  assert(overriddenEnemy.render?.sprite?.id === ENEMY_DEFS.basic_1.render?.sprite?.id, "wave behavior override should not alter appearance");
}

function testBehaviorTypeOwnershipSource() {
  const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
  const behaviorTypesSource = readFileSync(resolve(repoRoot, "src/game/enemies/EnemyBehaviorTypes.ts"), "utf8");
  assert(!behaviorTypesSource.includes("EnemyAppearanceDef"), "EnemyBehaviorTypes.ts must not import EnemyAppearanceDef");
  assert(!behaviorTypesSource.includes("EnemyTypeDef"), "EnemyBehaviorTypes.ts must not define EnemyTypeDef");
  assert(!behaviorTypesSource.includes("ContentBundle"), "EnemyBehaviorTypes.ts must not define ContentBundle");
  assert(!behaviorTypesSource.includes("WaveDef"), "EnemyBehaviorTypes.ts must not define WaveDef");
}

function testRendererSpriteHelperSeparationSource() {
  const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
  const rendererSource = readFileSync(resolve(repoRoot, "src/render/webgl/WebGLSceneRenderer.ts"), "utf8");
  const helperStart = rendererSource.indexOf("export function selectEnemySpriteFrame");
  const helperEnd = rendererSource.indexOf("export function computeSpriteDrawGeometry");
  const helperSource = rendererSource.slice(helperStart, helperEnd);
  assert(helperStart >= 0 && helperEnd > helperStart, "selectEnemySpriteFrame source should be locatable");
  assert(!helperSource.includes("behaviorId"), "enemy sprite helper should not read behaviorId");
  assert(!helperSource.includes("behavior"), "enemy sprite helper should not read behavior params");
  assert(!helperSource.includes("attackProfile"), "enemy sprite helper should not read attack profiles");
}

function main() {
  testContentParser();
  testAppearanceNormalizer();
  testAppearanceAliasAdapter();
  testAppearanceMaterialization();
  testSpawnRuntime();
  testRendererHelpers();
  testMigratedAssetConsistency();
  testExistingEnemyRenderPaths();
  testContentBehaviorAttackSeparation();
  testBehaviorTypeOwnershipSource();
  testRendererSpriteHelperSeparationSource();
  console.log("[SMOKE] EnemySpriteSelection OK ✅");
}

main();
