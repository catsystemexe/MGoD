// src/game/systems/StartToSpawn.integration.smoke.ts
import { createGame } from "../boot/createGame";

function assert(cond: any, msg: string) {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function nearly(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

function ensureWindowStub(): void {
  const g: any = globalThis as any;
  if (!g.window) {
    g.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      devicePixelRatio: 1,
    };
  }
  if (!g.document) {
    g.document = {
      addEventListener: () => {},
      removeEventListener: () => {},
      body: {},
    };
  }
}

function makeStubCanvas(): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    style: {} as any,
    getBoundingClientRect: () =>
      ({
        left: 0, top: 0, width: 0, height: 0,
        right: 0, bottom: 0, x: 0, y: 0,
        toJSON: () => ({}),
      } as any),
    addEventListener: () => {},
    removeEventListener: () => {},
  } as any as HTMLCanvasElement;
}

(async () => {
  ensureWindowStub();

  const g: any = await createGame(() => makeStubCanvas(), 896, 504);
  assert(g, "createGame must return game object");

  // ✅ IMPORTANT: Input phase would overwrite actions every tick → disable sampling in this smoke
  if (g.inputMgr && typeof g.inputMgr.sample === "function") {
    g.inputMgr.sample = () => {};
  }

  g.loop.setPaused(false);

  assert(g.inputRt?.actions, "inputRt.actions missing");
  g.inputRt.actions.move.x = 1;
  g.inputRt.actions.move.y = 0;

  // optional: force at least 1 projectile
  g.inputRt.actions.firePrimary = true;

  const px0 = g.playerEnt.pos.x;
  const py0 = g.playerEnt.pos.y;

  for (let i = 0; i < 120; i++) {
    g.loop.step(1 / 60);
  }

  g.inputRt.actions.firePrimary = false;

  const px1 = g.playerEnt.pos.x;
  const py1 = g.playerEnt.pos.y;

  assert(!nearly(px0, px1) || !nearly(py0, py1), "player should move after ticks");

  let nEnemy = 0;
  let nProj = 0;

  g.store.debugForEachAlive((_r: any, e: any) => {
    if (!e?.kind) return;
    if (e.kind === "enemy") nEnemy++;
    if (e.kind === "projectile") nProj++;
  });

  assert(nEnemy + nProj > 0, "expected enemies or projectiles");

  console.log("[SMOKE] StartToSpawn.integration OK ✅");
})();
