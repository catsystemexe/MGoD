import { createGame } from "../boot/createGame";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
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

async function main() {
  ensureWindowStub();

  const { loop, store, session } = await createGame(() => makeStubCanvas(), 400, 224);

  // tickujeme 3 sekundy (180 ticků @60Hz)
  for (let i = 0; i < 180; i++) loop.stepOneTick();

  const alive = store.getAliveCount();
  console.log("[SMOKE] alive:", alive, "timeSec:", Number(session.timeSec ?? 0).toFixed(2));

  assert(alive > 0, "expected at least 1 spawned enemy after 3s");
  assert(alive <= 6, "expected alive <= wave.maxAlive (6) in first wave");

  console.log("[SMOKE] DirectorSpawn OK ✅");
}

main();
