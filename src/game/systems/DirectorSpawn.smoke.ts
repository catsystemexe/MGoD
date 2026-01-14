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
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as any),
    addEventListener: () => {},
    removeEventListener: () => {},
  } as any as HTMLCanvasElement;
}

async function main() {
  ensureWindowStub();

  const game = await createGame(() => makeStubCanvas(), 400, 224);
  if (!game) throw new Error("[SMOKE] createGame returned undefined");

  const loop = game.loop;
  const store = game.store;
  const session = game.session;
  const director = game.director;

  if (!loop) throw new Error("[SMOKE] loop missing");
  if (!store) throw new Error("[SMOKE] store missing");
  if (!director) throw new Error("[SMOKE] director missing");

  // 3 sekundy simulace (180 ticků @60Hz)
  for (let i = 0; i < 180; i++) loop.stepOneTick();

  const alive = store.getAliveCount();
  const timeSec = Number(session?.timeSec ?? 0);

  // spočti cap z veřejných wave states
  const waveStates = director.getWaveStates();

  // součet maxAlive pouze pro aktivní waves
  const activeCap = waveStates.reduce((sum, w) => {
    if (!w.active) return sum;
    const cap = Number(w.maxAlive ?? 0);
    return sum + Math.max(0, Math.floor(cap));
  }, 0);

  console.log(
    "[SMOKE] alive:",
    alive,
    "activeMaxAlive:",
    activeCap,
    "timeSec:",
    timeSec.toFixed(2)
  );

  assert(
    alive <= activeCap,
    `expected alive <= activeMaxAlive (${activeCap}), got ${alive}`
  );

  console.log("[SMOKE] DirectorSpawn OK ✅");
}

main();