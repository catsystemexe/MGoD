import assert from "node:assert/strict";
import fs from "node:fs";
import { SpriteAtlas } from "../sprites/SpriteAtlas";
import type { SpriteAtlasJSON } from "../sprites/SpriteTypes";
import {
  classifyFxRenderLayer,
  selectEnemyDeathGhostFrame,
  selectFxSpriteFrame,
} from "./WebGLSceneRenderer";
import type { EnemyDeathGhostSnapshot } from "../../game/fx/EnemyDeathVisual";

type MockSystem = {
  name: string;
  ready: boolean;
  atlas: SpriteAtlas;
  tex: { ready: boolean };
};

function makeSystem(name: string, json: SpriteAtlasJSON): MockSystem {
  return { name, ready: true, atlas: new SpriteAtlas(json), tex: { ready: true } };
}

function enemyAtlas(typeId: string): SpriteAtlasJSON {
  return {
    texture: `/assets/sprites/${typeId}.png`,
    frames: {
      [`enemy.${typeId}.idle`]: { x: 0, y: 0, w: 64, h: 64, px: 32, py: 32 },
      [`enemy.${typeId}.0`]: { x: 0, y: 0, w: 64, h: 64, px: 32, py: 32 },
      [`enemy.${typeId}.1`]: { x: 64, y: 0, w: 64, h: 64, px: 32, py: 32 },
      [`enemy.${typeId}.2`]: { x: 128, y: 0, w: 64, h: 64, px: 32, py: 32 },
    },
    anims: {
      [`enemy.${typeId}`]: {
        fps: 10,
        loop: false,
        frames: [`enemy.${typeId}.0`, `enemy.${typeId}.1`, `enemy.${typeId}.2`],
      },
      "fx.root.should.not.apply": {
        fps: 10,
        loop: false,
        frames: [`enemy.${typeId}.2`],
      },
    },
  };
}

function deathVisual(snapshot: EnemyDeathGhostSnapshot, age = 0) {
  return {
    age,
    flashSec: 0.06,
    burnSec: 0.08,
    overlapSec: 0.14,
    snapshot,
  };
}

function staticSnapshot(): EnemyDeathGhostSnapshot {
  return {
    typeId: "basic_1",
    pos: { x: 10, y: 20 },
    posPrev: { x: 9, y: 19 },
    radius: 12,
    render: { sprite: { id: "enemy.basic_1.idle", scale: 1.5 } },
  };
}

function animatedSnapshot(): EnemyDeathGhostSnapshot {
  return {
    typeId: "bug1",
    pos: { x: 30, y: 40 },
    posPrev: { x: 29, y: 39 },
    radius: 16,
    render: {
      color: "#ffffff",
      sprite: {
        id: "enemy.bug1.0",
        scale: 0.75,
        animation: { id: "enemy.bug1", speed: 1 },
      },
    },
  };
}

function makeEnemySystems(): Map<string, MockSystem> {
  return new Map<string, MockSystem>([
    ["basic_1", makeSystem("basic_1", enemyAtlas("basic_1"))],
    ["bug1", makeSystem("bug1", enemyAtlas("bug1"))],
  ]);
}

function assertFrameSelection(): void {
  const systems = makeEnemySystems();

  const staticSelected = selectEnemyDeathGhostFrame(deathVisual(staticSnapshot(), 0), systems, 123);
  assert(staticSelected, "static snapshot should select a frame");
  assert.equal(staticSelected.sys.name, "basic_1");
  assert.equal(staticSelected.frame, systems.get("basic_1")!.atlas.frame("enemy.basic_1.idle"));
  assert.equal(staticSelected.scale, 1.5);

  const animatedSelected = selectEnemyDeathGhostFrame(deathVisual(animatedSnapshot(), 0.11), systems, 999);
  assert(animatedSelected, "animated snapshot should select through nested animation");
  assert.equal(animatedSelected.sys.name, "bug1");
  assert.equal(animatedSelected.frame, systems.get("bug1")!.atlas.frame("enemy.bug1.1"));
  assert.equal(animatedSelected.scale, 0.75);

  const rootAnimIgnored = selectEnemyDeathGhostFrame({ ...deathVisual(animatedSnapshot(), 0.11), animId: "fx.root.should.not.apply" } as any, systems, 999);
  assert(rootAnimIgnored, "root FX animId should not block ghost animation");
  assert.equal(rootAnimIgnored.frame, systems.get("bug1")!.atlas.frame("enemy.bug1.1"));

  assert.equal(selectEnemyDeathGhostFrame(deathVisual({ ...staticSnapshot(), render: { sprite: { id: "enemy.unknown.idle", scale: 1 } } }, 0), systems, 0), null);
  assert.equal(selectEnemyDeathGhostFrame(deathVisual({ ...staticSnapshot(), typeId: "missing", render: { sprite: { id: "enemy.missing.idle", scale: 1 } } }, 0), systems, 0), null);
}

function assertTintOpacity(): void {
  const systems = makeEnemySystems();
  const at0 = selectEnemyDeathGhostFrame(deathVisual(staticSnapshot(), 0), systems, 0);
  assert(at0, "age 0 should draw");
  assert.equal(at0.phase, "flash");
  assert.equal(at0.opacity, 1);
  assert.deepEqual(at0.tint, [1, 1, 1]);

  const burnStart = selectEnemyDeathGhostFrame(deathVisual(staticSnapshot(), 0.06), systems, 0);
  assert(burnStart, "burn start should draw");
  assert.equal(burnStart.phase, "burn");
  assert.deepEqual(burnStart.tint, [1, 0.55, 0.12]);
  assert.equal(burnStart.opacity, 1);

  const midBurn = selectEnemyDeathGhostFrame(deathVisual(staticSnapshot(), 0.1), systems, 0);
  assert(midBurn, "mid burn should draw");
  assert(midBurn.tint[0] < 1 && midBurn.tint[1] < 0.55 && midBurn.tint[2] < 0.12, "mid burn should darken from orange");
  assert(midBurn.opacity > 0 && midBurn.opacity < 1, "mid burn opacity should be between 0 and 1");

  assert.equal(selectEnemyDeathGhostFrame(deathVisual(staticSnapshot(), 0.14), systems, 0), null, "hidden state should not return draw state");
}

function assertNoMutationAndDeterministic(): void {
  const systems = makeEnemySystems();
  const snapshot = animatedSnapshot();
  const before = JSON.stringify(snapshot);
  const a = selectEnemyDeathGhostFrame(deathVisual(snapshot, 0.11), systems, 5);
  const b = selectEnemyDeathGhostFrame(deathVisual(snapshot, 0.11), systems, 5);
  assert.deepEqual(a, b, "repeated calls should be deterministic");
  assert.equal(JSON.stringify(snapshot), before, "snapshot source data should not be mutated");
}

function assertLayering(): void {
  const entities = [
    { kind: "enemy" },
    { kind: "fx", deathVisual: deathVisual(staticSnapshot(), 0) },
    { kind: "fx", spriteId: "fx.explosion.1.0" },
  ];
  const normal: unknown[] = [];
  const ghosts: unknown[] = [];
  const explosions: unknown[] = [];
  for (const entity of entities) {
    const layer = classifyFxRenderLayer(entity);
    if (layer === "deathGhost") ghosts.push(entity);
    else if (layer === "explosion") explosions.push(entity);
    else normal.push(entity);
  }
  const drawOrder = [...normal.map(() => "normal"), ...ghosts.map(() => "ghost"), ...explosions.map(() => "explosion")];
  assert.deepEqual(drawOrder, ["normal", "ghost", "explosion"]);
}

function assertFxAtlasStillResolves(): void {
  const systems = new Map<string, MockSystem>();
  const bugJson = JSON.parse(fs.readFileSync("public/assets/sprites/explosion_bug1.atlas.json", "utf8")) as SpriteAtlasJSON;
  systems.set("fx.explosion.bug1", makeSystem("bug1", bugJson));
  for (let i = 1; i <= 4; i++) {
    const json = JSON.parse(fs.readFileSync(`public/assets/sprites/explosion_${i}.atlas.json`, "utf8")) as SpriteAtlasJSON;
    systems.set(`fx.explosion.${i}`, makeSystem(`explosion_${i}`, json));
  }

  assert.equal(selectFxSpriteFrame({ animId: "fx.explosion.bug1", spawnT: 0 }, systems, 0)?.sys.name, "bug1");
  for (let i = 1; i <= 4; i++) {
    assert.equal(selectFxSpriteFrame({ animId: `fx.explosion.${i}`, spawnT: 0 }, systems, 0)?.sys.name, `explosion_${i}`);
  }
}

function assertNoShaderDependency(): void {
  const rendererSource = fs.readFileSync("src/render/webgl/WebGLSceneRenderer.ts", "utf8");
  assert(!rendererSource.toLowerCase().includes("dissolve"), "no dissolve shader dependency should be introduced");
  assert(rendererSource.includes("selected.sys.prog.draw"), "ghost rendering should use existing SpriteProgram draw RGBA parameters");
  assert(!rendererSource.includes("deathVisual.age ="), "renderer should not mutate deathVisual.age");
  assert(!rendererSource.includes("fxAge ="), "renderer should not mutate fxAge");
  assert(!rendererSource.includes("ttl ="), "renderer should not mutate FX TTL");
}

assertFrameSelection();
assertTintOpacity();
assertNoMutationAndDeterministic();
assertLayering();
assertFxAtlasStillResolves();
assertNoShaderDependency();

console.log("[SMOKE] EnemyDeathGhostRender passed");
