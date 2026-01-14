// src/game/enemies/behaviors/invaders.ts
//
// Robustní varianta:
// - zvládne různé struktury entity (pos / cur.pos / body.pos)
// - normalizuje dt (sec vs ms), aby to "nevystřelilo" mimo obraz

type Vec2 = { x: number; y: number };

type InvadersParams = {
  speedY?: number;
  speedX?: number;
  ampX?: number;
  freq?: number;       // Hz
  phaseStep?: number;
};

type InvadersState = {
  t: number;
  base: Vec2;
  phase: number;
};

function getPosRef(ent: any): Vec2 | null {
  if (ent?.pos && typeof ent.pos.x === "number" && typeof ent.pos.y === "number") return ent.pos;
  if (ent?.cur?.pos && typeof ent.cur.pos.x === "number" && typeof ent.cur.pos.y === "number") return ent.cur.pos;
  if (ent?.body?.pos && typeof ent.body.pos.x === "number" && typeof ent.body.pos.y === "number") return ent.body.pos;
  return null;
}

function writePos(ent: any, x: number, y: number) {
  // piš všude, kde to vypadá jako pozice – ať render nikdy "neuhne"
  if (ent?.pos) { ent.pos.x = x; ent.pos.y = y; }
  if (ent?.cur?.pos) { ent.cur.pos.x = x; ent.cur.pos.y = y; }
  if (ent?.body?.pos) { ent.body.pos.x = x; ent.body.pos.y = y; }
}

function dtToSec(dt: number): number {
  // pokud je dt ~16, je to ms; pokud ~0.016, je to sec
  if (!Number.isFinite(dt)) return 0;
  return (dt > 1) ? (dt / 1000) : dt;
}

export const invadersBehavior = {
  id: "invaders",

  init(ent: any, params: InvadersParams, _ctx: any) {
    const pos = getPosRef(ent);
    if (!pos) return;

    const phaseStep = (typeof params?.phaseStep === "number") ? params.phaseStep : 0.35;

    const pseudoIdx = Math.floor((pos.x + pos.y) * 0.25) % 999;

    const st: InvadersState = {
      t: 0,
      base: { x: pos.x, y: pos.y },
      phase: pseudoIdx * phaseStep,
    };

    ent.behavior = ent.behavior || {};
    ent.behavior.state = st;
  },

  update(ent: any, dt: number, params: InvadersParams, ctx: any) {
    const pos = getPosRef(ent);
    if (!pos) return;

    if (!ent?.behavior?.state) {
      this.init(ent, params, ctx);
      if (!ent?.behavior?.state) return;
    }

    const st: InvadersState = ent.behavior.state;

    const dts = dtToSec(dt);
    st.t += dts;

    const speedY = (typeof params?.speedY === "number") ? params.speedY : 14;
    const speedX = (typeof params?.speedX === "number") ? params.speedX : 0;  // default drift vypneme
    const ampX   = (typeof params?.ampX === "number") ? params.ampX : 26;
    const freqHz = (typeof params?.freq === "number") ? params.freq : 0.55;

    const a = (st.t * Math.PI * 2) * freqHz + st.phase;

    const x = st.base.x + Math.sin(a) * ampX + speedX * st.t;
    const y = st.base.y + speedY * st.t;

    writePos(ent, x, y);
  },
};
