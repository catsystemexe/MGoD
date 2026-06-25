import { selectEnemySpriteFrame } from "./WebGLSceneRenderer";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

type Frame = { x: number; y: number; w: number; h: number; px: number; py: number };

function makeSpriteSystem(frames: Record<string, Frame>) {
  return {
    ready: true,
    tex: { ready: true },
    atlas: {
      frame: (key: string) => frames[key] ?? null,
      pickAnimFrame: (key: string) => frames[key] ?? null,
    },
  };
}

function main() {
  const idle: Frame = { x: 0, y: 0, w: 64, h: 64, px: 32, py: 32 };
  const readyMap = new Map([
    ["basic_1", makeSpriteSystem({ "enemy.basic_1.idle": idle })],
  ]);

  const selected = selectEnemySpriteFrame(
    { typeId: "basic_1", spriteId: "enemy.basic_1.idle", render: { sdf: { shape: "triangle" } } } as any,
    readyMap,
    0,
  );
  assert(selected?.frame === idle, "sprite-ready + existing frame should select sprite frame");

  const missing = selectEnemySpriteFrame(
    { typeId: "basic_1", spriteId: "enemy.basic_1.missing" },
    readyMap,
    0,
  );
  assert(missing === null, "sprite-ready + missing frame should not select sprite frame");

  const sdfEntity = { typeId: "basic_1", spriteId: "enemy.basic_1.idle", render: { sdf: { shape: "triangle" } } };
  const spriteBeforeSdf = selectEnemySpriteFrame(sdfEntity, readyMap, 0);
  assert(!!spriteBeforeSdf, "sprite selection should succeed before SDF fallback decision");

  console.log("[SMOKE] EnemySpriteSelection OK ✅");
}

main();
