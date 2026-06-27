// src/game/enemies/behaviors/invaders.ts
//
// NOTE: Typy jsou "měkké" (any), aby to sedlo i když máš mírně jiný runtime.
// Když budeš chtít, zpřísníme to podle tvých reálných typů.

type Vec2 = { x: number; y: number };

type InvadersParams = {
  speedY?: number;     // descent
  speedX?: number;     // lateral drift
  ampX?: number;       // oscillation amplitude
  freq?: number;       // oscillation frequency (Hz)
  phaseStep?: number;  // per-enemy phase offset
};

type InvadersState = {
  t: number;
  base: Vec2;
  phase: number;
};

export const invadersBehavior = {
  id: "invaders",

  init(ent: any, params: InvadersParams, _ctx: any) {
    const phaseStep = (typeof params?.phaseStep === "number") ? params.phaseStep : 0.35;

    // pseudo-index: stabilní per-spawn podle pozice, aby to nebylo všechno ve fázi 0
    const pseudoIdx = Math.floor(((ent?.pos?.x ?? 0) + (ent?.pos?.y ?? 0)) * 0.25) % 999;

    const st: InvadersState = {
      t: 0,
      base: { x: ent.pos.x, y: ent.pos.y },
      phase: pseudoIdx * phaseStep,
    };

    ent.behavior = ent.behavior || {};
    ent.behavior.state = st;
  },

  update(ent: any, dt: number, params: InvadersParams, ctx: any) {
    if (!ent?.behavior?.state) {
      // fallback, kdyby init nebyl volán
      this.init(ent, params, ctx);
    }

    const st: InvadersState = ent.behavior.state;

    const speedY = (typeof params?.speedY === "number") ? params.speedY : 14;
    const speedX = (typeof params?.speedX === "number") ? params.speedX : 22;
    const ampX   = (typeof params?.ampX === "number") ? params.ampX : 26;
    const freqHz = (typeof params?.freq === "number") ? params.freq : 0.55;

    st.t += dt;

    // formace: baseY klesá, X vlní + lehce driftuje
    const a = (st.t * Math.PI * 2) * freqHz + st.phase;
    ent.pos.x = st.base.x + Math.sin(a) * ampX + speedX * st.t;
    ent.pos.y = st.base.y + speedY * st.t;
  },
};
