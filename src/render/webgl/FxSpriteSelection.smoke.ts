import assert from "node:assert/strict";
import fs from "node:fs";
import { SpriteAtlas } from "../sprites/SpriteAtlas";
import type { SpriteAtlasJSON, SpriteFrame } from "../sprites/SpriteTypes";
import { selectFxSpriteFrame } from "./WebGLSceneRenderer";

const explosionXs = [0, 80, 160, 240, 320, 400, 480, 560];

function readAtlas(n: number): SpriteAtlasJSON {
  return JSON.parse(fs.readFileSync(`public/assets/sprites/explosion_${n}.atlas.json`, "utf8")) as SpriteAtlasJSON;
}

function frameKey(n: number, i: number): string {
  return `fx.explosion.${n}.${i}`;
}

function assertFrame(frame: SpriteFrame | undefined, n: number, i: number): void {
  assert(frame, `${frameKey(n, i)} should exist`);
  assert.equal(frame.x, explosionXs[i], `${frameKey(n, i)} x`);
  assert.equal(frame.y, 0, `${frameKey(n, i)} y`);
  assert.equal(frame.w, 80, `${frameKey(n, i)} w`);
  assert.equal(frame.h, 80, `${frameKey(n, i)} h`);
  assert.equal(frame.px, 40, `${frameKey(n, i)} px`);
  assert.equal(frame.py, 40, `${frameKey(n, i)} py`);
}

function assertAssetContract(n: number): void {
  const atlas = readAtlas(n);
  assert.equal(atlas.texture, `/assets/sprites/explosion_${n}.png`);
  assert.equal(Object.keys(atlas.frames).length, 8, `explosion ${n} should have exactly 8 frames`);
  for (let i = 0; i < 8; i++) assertFrame(atlas.frames[frameKey(n, i)], n, i);

  const anim = atlas.anims?.[`fx.explosion.${n}`];
  assert(anim, `fx.explosion.${n} animation should exist`);
  assert.deepEqual(anim.frames, Array.from({ length: 8 }, (_, i) => frameKey(n, i)));
  assert.equal(anim.fps, 16);
  assert.equal(anim.loop, false);
}

function assertRealAtlasTiming(n: number): void {
  const atlas = new SpriteAtlas(readAtlas(n));
  const animId = `fx.explosion.${n}`;
  assert.equal(atlas.pickAnimFrame(animId, 0), atlas.frame(frameKey(n, 0)), `${animId} t=0`);
  assert.equal(atlas.pickAnimFrame(animId, 0.095), atlas.frame(frameKey(n, 1)), `${animId} intermediate frame 1`);
  assert.equal(atlas.pickAnimFrame(animId, 0.19), atlas.frame(frameKey(n, 3)), `${animId} intermediate frame 3`);
  assert.equal(atlas.pickAnimFrame(animId, 0.44), atlas.frame(frameKey(n, 7)), `${animId} near end frame 7`);
  assert.equal(atlas.pickAnimFrame(animId, 0.75), atlas.frame(frameKey(n, 7)), `${animId} clamps after duration`);
}

type MockSystem = {
  name: string;
  ready: boolean;
  atlas: SpriteAtlas;
  tex: { ready: boolean };
};

function makeSystem(name: string, atlasJson: SpriteAtlasJSON): MockSystem {
  return { name, ready: true, atlas: new SpriteAtlas(atlasJson), tex: { ready: true } };
}

function assertRegistrySelection(): void {
  const bugAtlas: SpriteAtlasJSON = JSON.parse(fs.readFileSync("public/assets/sprites/explosion_bug1.atlas.json", "utf8"));
  const systems = new Map<string, MockSystem>([
    ["fx.explosion.bug1", makeSystem("bug1", bugAtlas)],
    ["fx.explosion.1", makeSystem("explosion_1", readAtlas(1))],
    ["fx.explosion.2", makeSystem("explosion_2", readAtlas(2))],
    ["fx.explosion.3", makeSystem("explosion_3", readAtlas(3))],
    ["fx.explosion.4", makeSystem("explosion_4", readAtlas(4))],
  ]);

  for (let n = 1; n <= 4; n++) {
    const selected = selectFxSpriteFrame({ animId: `fx.explosion.${n}`, spawnT: 10 }, systems, 10);
    assert(selected, `fx.explosion.${n} should resolve`);
    assert.equal(selected.sys.name, `explosion_${n}`);
    assert.equal(selected.frame, systems.get(`fx.explosion.${n}`)!.atlas.frame(frameKey(n, 0)));
  }

  const bug = selectFxSpriteFrame({ animId: "fx.explosion.bug1", spawnT: 4 }, systems, 4.05);
  assert(bug, "fx.explosion.bug1 should remain supported");
  assert.equal(bug.sys.name, "bug1");

  assert.equal(selectFxSpriteFrame({ animId: "fx.explosion.unknown", spawnT: 0 }, systems, 0), null);
  assert.equal(selectFxSpriteFrame({ spriteId: "fx.explosion.unknown.0" }, systems, 0), null);

  const staticSelected = selectFxSpriteFrame({ spriteId: "fx.explosion.2.3" }, systems, 123);
  assert(staticSelected, "static frame should resolve through prefix registry");
  assert.equal(staticSelected.sys.name, "explosion_2");
  assert.equal(staticSelected.frame, systems.get("fx.explosion.2")!.atlas.frame("fx.explosion.2.3"));

  const localTimeSelected = selectFxSpriteFrame({ animId: "fx.explosion.3", spawnT: 10 }, systems, 10.19);
  assert(localTimeSelected, "local timing selection should resolve");
  assert.equal(localTimeSelected.frame, systems.get("fx.explosion.3")!.atlas.frame("fx.explosion.3.3"));

  const firstA = selectFxSpriteFrame({ animId: "fx.explosion.4", spawnT: 20 }, systems, 20);
  const firstB = selectFxSpriteFrame({ animId: "fx.explosion.4", spawnT: 20, id: "different-hash-source" } as any, systems, 20);
  assert.equal(firstA?.frame, systems.get("fx.explosion.4")!.atlas.frame("fx.explosion.4.0"));
  assert.equal(firstB?.frame, systems.get("fx.explosion.4")!.atlas.frame("fx.explosion.4.0"));
}

function assertRegressionGuards(): void {
  const rendererSource = fs.readFileSync("src/render/webgl/WebGLSceneRenderer.ts", "utf8");
  const damageSource = fs.readFileSync("src/game/systems/DamageSystem.ts", "utf8");
  assert(rendererSource.includes('atlas.pickAnimFrame("ship.player.thruster", tSec)'), "player animation path should remain unchanged");
  assert(rendererSource.includes('this.projSprites.prog.begin'), "projectile sprite rendering path should remain present");
  assert(rendererSource.includes('selectEnemySpriteFrame'), "enemy sprite selection path should remain present");
  assert(rendererSource.includes('const animId = String((e as any).animId ?? "")'), "FX path should retain root animId behavior");
  const fxHelperSource = rendererSource.slice(rendererSource.indexOf("export function selectFxSpriteFrame"), rendererSource.indexOf("function compileShader"));
  assert(!fxHelperSource.includes("phase") && !fxHelperSource.includes("hsh"), "FX helper should not use random/hash phase");
  assert(damageSource.includes("fx.animId = DEFAULT_ENEMY_DEATH_VISUAL.explosionId;"), "gameplay death spawning should use the default animated explosion id");
  assert(damageSource.includes("fx.spriteId = `${DEFAULT_ENEMY_DEATH_VISUAL.explosionId}.0`;"), "gameplay death spawning should keep a static fallback sprite id");
  assert(rendererSource.includes("fr.w * scale, fr.h * scale"), "FX sprite scale should affect draw geometry");
  assert(rendererSource.includes(": 1;"), "invalid FX sprite scale should fall back to 1");
}

for (let n = 1; n <= 4; n++) {
  assertAssetContract(n);
  assertRealAtlasTiming(n);
}
assertRegistrySelection();
assertRegressionGuards();

console.log("[SMOKE] FxSpriteSelection passed");
