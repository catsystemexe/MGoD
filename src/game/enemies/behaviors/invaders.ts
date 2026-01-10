// src/game/enemies/behaviors/invaders.ts
//
// Engine contract (dle SpawnSystem + EnemySystem):
// - SpawnSystem: ent.behavior = preset.params, ent.bState = {t:0}, beh.init(ent)
// - EnemySystem: behavior.update(ent, ctx)
// - EnemySystem pak aplikuje vel -> pos
//
// => Proto tady primárně nastavujeme ent.vel (ne ent.pos).

type Vec2 = { x: number; y: number };

function dtToSec(x: any): number {
  const dt = Number(x);
  if (!Number.isFinite(dt)) return 0;
  return dt > 1 ? dt / 1000 : dt; // ms -> sec fallback
}

export const invadersBehavior = {
  id: "invaders",

  init(ent: any) {
    // parametry jsou uložené v ent.behavior (preset.params)
    const p = (ent?.behavior ?? {}) as any;

    const phaseStep = (typeof p.phaseStep === "number") ? p.phaseStep : 0.35;

    // base pozice pro formaci (spawn pozice)
    const x0 = (ent?.pos?.x ?? 0);
    const y0 = (ent?.pos?.y ?? 0);

    // stabilní pseudo index z pozice (ať není všechno ve stejné fázi)
    const pseudoIdx = (Math.floor((x0 + y0) * 0.25) % 999);

    ent.bState = ent.bState || {};
    ent.bState.t = 0;
    ent.bState.baseX = x0;
    ent.bState.baseY = y0;
    ent.bState.phase = pseudoIdx * phaseStep;

    // vždy existující vel
    ent.vel = ent.vel || { x: 0, y: 0 };
  },

  update(ent: any, ctx: any) {
    const p = (ent?.behavior ?? {}) as any;
    ent.bState = ent.bState || { t: 0 };

    // dt: zkus několik běžných polí v TickContext
    const dt =
      dtToSec(ctx?.dtSec) ||
      dtToSec(ctx?.dt) ||
      dtToSec(ctx?.frameDtSec) ||
      dtToSec(ctx?.fixedDtSec) ||
      0;

    // když dt == 0, radši nic nedělej
    if (dt <= 0) return;

    // params
    const speedY = (typeof p.speedY === "number") ? p.speedY : 14;
    const speedX = (typeof p.speedX === "number") ? p.speedX : 0; // drift default vypnut
    const ampX   = (typeof p.ampX === "number") ? p.ampX : 26;
    const freqHz = (typeof p.freq === "number") ? p.freq : 0.55;

    // state
    const st = ent.bState;
    st.t = (typeof st.t === "number") ? st.t : 0;
    st.t += dt;

    const baseX = (typeof st.baseX === "number") ? st.baseX : (ent?.pos?.x ?? 0);
    const baseY = (typeof st.baseY === "number") ? st.baseY : (ent?.pos?.y ?? 0);
    const phase = (typeof st.phase === "number") ? st.phase : 0;

    // cílová pozice v čase (formace)
    const a = (st.t * Math.PI * 2) * freqHz + phase;
    const targetX = baseX + Math.sin(a) * ampX + speedX * st.t;
    const targetY = baseY + speedY * st.t;

    // převeď target -> velocity tak, aby EnemySystem posunul pos správně
    const px = (ent?.pos?.x ?? 0);
    const py = (ent?.pos?.y ?? 0);

    ent.vel = ent.vel || { x: 0, y: 0 };
    ent.vel.x = (targetX - px) / dt;
    ent.vel.y = (targetY - py) / dt;
  },
};
