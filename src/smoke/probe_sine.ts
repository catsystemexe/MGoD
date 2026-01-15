import { createGame } from "../game/boot/createGame";

function makeStubCanvas(): any {
  return {
    width: 0, height: 0, style: {},
    getBoundingClientRect: () => ({ left:0, top:0, width:0, height:0, right:0, bottom:0, x:0, y:0, toJSON:() => ({}) }),
    addEventListener: () => {}, removeEventListener: () => {},
  };
}

function ensureWindowStub(): void {
  const g: any = globalThis as any;
  if (!g.window) g.window = { addEventListener(){}, removeEventListener(){}, devicePixelRatio: 1 };
  if (!g.document) g.document = { addEventListener(){}, removeEventListener(){}, body: {} };
}

async function main() {
  ensureWindowStub();
  const { loop, store } = await createGame(() => makeStubCanvas(), 896, 504);

  // nech to naspawnovat green (cca 2s)
  for (let i = 0; i < 120; i++) loop.stepOneTick();

  const greens: any[] = [];
  (store as any).debugForEachAlive?.((_ref: any, e: any) => {
    if (e?.kind === "enemy" && e?.typeId === "green") greens.push(e);
  });

  greens.sort((a,b) => (a.pos?.y ?? 0) - (b.pos?.y ?? 0));
  const sample = greens.slice(0, 12);

  console.log("[PROBE] greens:", greens.length, "sample:", sample.length);
  for (const e of sample) {
    console.log("[E0]", {
      x:e.pos?.x, y:e.pos?.y,
      baseX:e.bState?.baseX, baseY:e.bState?.baseY,
      t:e.bState?.t, phase:e.bState?.phase,
      ampX:e.behavior?.ampX, freq:e.behavior?.freq, phaseStep:e.behavior?.phaseStep
    });
  }

  for (let k = 0; k < 10; k++) {
    loop.stepOneTick();
    const s = sample.slice(0,3).map((e, i) => ({
      i,
      x: Number(e.pos?.x ?? 0).toFixed(3),
      y: Number(e.pos?.y ?? 0).toFixed(3),
      vx: Number(e.vel?.x ?? 0).toFixed(3),
      vy: Number(e.vel?.y ?? 0).toFixed(3),
      t: Number(e.bState?.t ?? 0).toFixed(3),
      ph: Number(e.bState?.phase ?? 0).toFixed(3),
    }));
    console.log("[T]", k, s);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
