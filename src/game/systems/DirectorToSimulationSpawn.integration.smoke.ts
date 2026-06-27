import { strict as assert } from "node:assert";
import { createGame } from "../boot/createGame";

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

function countEnemies(store: any): number {
  let n = 0;
  store.debugForEachAlive((_r: any, e: any) => { if (e?.kind === "enemy") n++; });
  return n;
}

(async () => {
  ensureWindowStub();
  const g = await createGame(() => makeStubCanvas(), 896, 504);

  const e0 = countEnemies(g.store);

  // Tick 0 -> 1: Director emitNext, Simulation spawns next tick.
  g.loop.stepOneTick();
  const e1 = countEnemies(g.store);

  // Tick 1 -> 2: now any emitNext from tick1 can become real entities in Simulation
  g.loop.stepOneTick();
  const e2 = countEnemies(g.store);

  assert(e2 >= e1, "enemy count must not decrease between ticks (no kills expected)");

  // Within short run, must have some enemies (directorWaves are active immediately in content)
  for (let i = 0; i < 60; i++) g.loop.stepOneTick();
  const eN = countEnemies(g.store);
  assert(eN > 0, "expected enemies after short run");

  // optional sanity: should be >= initial
  assert(eN >= e0, "enemy count should be >= initial baseline");

  console.log("[SMOKE] DirectorToSimulationSpawn.integration OK ✅");
})();
