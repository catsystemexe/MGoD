// src/render/webgl/bg/flowStep.ts
//
// Pure (GL-free) per-particle stepping for FlowSegmentsBg, extracted so the
// motion — including the new explosion/hit "disturbance" kick — can be unit
// tested without a WebGL context. FlowSegmentsBg.draw() delegates here, and the
// shared scalar helpers live here too (FlowSegmentsBg imports them).

import { FlowPreset, FlowLayerId } from "./flowPresets";

export type SegParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  laneId: number;
  laneY: number;
  meanderAmp: number;
  meanderHz: number;
  meanderPhase: number;
  // low-freq target speed mul (smoothed)
  spMul: number;
  spMulTarget: number;
  spMulT: number; // timer to retarget
  // length drift
  lenTarget: number;
  lenT: number;
};

// A localized flow disturbance (explosion / hit). Coordinates are SCREEN-space
// (the renderer subtracts the camera before handing these over). `radius`
// already folds in the per-source radiusMul; `kick` is the outward push
// magnitude in px/s (explosions push harder than hits).
export type FlowDisturbance = {
  x: number;
  y: number;
  radius: number;
  age: number;
  ttl: number;
  kick: number;
};

export function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

export function rand01(seed: number): number {
  // deterministic-ish hash
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep01(t: number): number {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

export function normalize2(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

// Live (runtime, dev-panel) overrides read from __CM_SPACE__ and threaded in by
// FlowSegmentsBg.draw(). Kept as an explicit param so this stepper stays pure /
// GL-free / globals-free (the smoke test calls it with no `live` -> defaults).
export type FlowLive = {
  speedMul?: number;
  meanderMul?: number;
  kickScale?: number;
};

export function stepFlowParticle(
  p: SegParticle,
  pr: FlowPreset,
  dt: number,
  t: number,
  layerId: FlowLayerId,
  logicW: number,
  logicH: number,
  disturbances: readonly FlowDisturbance[],
  live?: FlowLive,
): void {
  const pad = pr.spawn.respawnPaddingPx;
  const accelLim = pr.motion.accelLimitPxPerSec2;
  const damp = pr.motion.dampingPerSec;

  const layerMul = pr.motion.speedPxPerSec.layerMul[layerId] ?? 1.0;
  const baseSpeed = pr.motion.speedPxPerSec.base * layerMul * (live?.speedMul ?? 1.0);

  // low-frequency speed drift (global-ish but per particle; smoothed)
  if (pr.rng.lowFreq.enabled) {
    p.spMulT -= dt;
    if (p.spMulT <= 0) {
      const mi = pr.rng.lowFreq.globalDriftIntervalSec.min;
      const ma = pr.rng.lowFreq.globalDriftIntervalSec.max;
      const seed = (p.laneId + 1) * 133.7 + p.x * 0.01 + p.y * 0.02;
      p.spMulT = lerp(mi, ma, rand01(seed));
      const jit = pr.rng.lowFreq.speedTargetJitterFrac ?? 0.0;
      p.spMulTarget = 1.0 + (rand01(seed + 9.9) - 0.5) * 2.0 * jit;
    }
    p.spMul = lerp(p.spMul, p.spMulTarget, 1.0 - Math.exp(-pr.rng.lowFreq.lerpRate * dt));
  }

  // length drift (smoothed)
  if (pr.segments.lengthPx.drift.enabled) {
    p.lenT -= dt;
    if (p.lenT <= 0) {
      const mi = pr.segments.lengthPx.drift.targetIntervalSec.min;
      const ma = pr.segments.lengthPx.drift.targetIntervalSec.max;
      const seed = (p.laneId + 7) * 19.7 + p.x * 0.013;
      p.lenT = lerp(mi, ma, rand01(seed));
      const lenMin = pr.segments.lengthPx.min;
      const lenMax = pr.segments.lengthPx.max;
      p.lenTarget = lerp(lenMin, lenMax, rand01(seed + 1.7));
    }
    p.len = lerp(p.len, p.lenTarget, 1.0 - Math.exp(-pr.segments.lengthPx.drift.lerpRate * dt));
  }

  // lane coherence: keep y near laneY a bit
  const laneC = pr.segments.lengthPx.laneCoherence ?? 0;
  if (laneC > 0 && pr.spawn.distribution === "lanes") {
    const pull = (p.laneY - p.y) * (laneC * 0.20);
    p.vy += pull * dt;
  }

  // y meander (smooth)  ✅ scale by dt (treat as acceleration)
  if (pr.motion.yMeander?.enabled) {
    const coup = pr.motion.yMeander.xPhaseCoupling;
    const w = Math.PI * 2 * p.meanderHz;
    const wave = Math.sin((t * w) + p.meanderPhase + p.x * coup);
    p.vy += (wave * p.meanderAmp * (live?.meanderMul ?? 1.0)) * 0.12 * dt;
  }

  // shear (y speed depends on y position) ✅ scale by dt
  if (pr.motion.shear?.enabled) {
    const pl = pr.parallax.find(x => x.layer === layerId);
    const mul = pl?.shearMul ?? 1.0;
    const y01 = clamp(p.y / Math.max(1, logicH), 0, 1);
    const yCurve = pr.motion.shear.curve === "smoothstep" ? smoothstep01(y01) : y01;
    const sgn = pr.motion.shear.invert ? -1 : 1;
    const sh = pr.motion.shear.strengthPxPerSec * mul * sgn;
    // inject vy target via accel-limited approach
    p.vy += (yCurve - 0.5) * (sh / Math.max(1, baseSpeed)) * 0.9 * dt;
  }

  // microWave ✅ scale by dt
  if (pr.motion.microWave?.enabled) {
    const mw = pr.motion.microWave;
    const wave = Math.sin(t * Math.PI * 2 * mw.freqHz + p.x * mw.yCoupling);
    p.vy += (wave * mw.ampPx) * 0.10 * dt;
  }

  // accel limit + damping (stability)
  const vLen = Math.hypot(p.vx, p.vy) || 1;
  // prefer direction.x/y baseline
  const dir = normalize2(pr.direction.x, pr.direction.y);
  const targetVx = dir[0];
  const targetVy = dir[1];

  // steer back toward base direction gently
  p.vx = lerp(p.vx, targetVx, 1.0 - Math.exp(-1.4 * dt));
  p.vy = lerp(p.vy, targetVy, 1.0 - Math.exp(-1.2 * dt));

  // damping
  p.vx *= Math.exp(-damp * dt);
  p.vy *= Math.exp(-damp * dt);

  // --- disturbance kick (explosions + hits) -------------------------------
  // Radial outward push from active blasts/hits. Accumulated into a separate
  // `accumVy` so the ordering of the existing motion steps above is never
  // touched; applied here (just before the renormalize+clamp below) as a
  // vertical nudge. With an empty list this whole block is skipped and the
  // particle steps byte-for-byte as before — fully backward compatible.
  if (disturbances.length > 0) {
    const kickScale = live?.kickScale ?? pr.disturbance?.kickScale ?? 1.0;
    let accumVx = 0;
    let accumVy = 0;
    for (let i = 0; i < disturbances.length; i++) {
      const d = disturbances[i];
      const dxp = p.x - d.x;
      const dyp = p.y - d.y;
      const dist = Math.hypot(dxp, dyp) || 1;
      // d.radius already folds in the per-source radiusMul (see renderer).
      const falloff = Math.max(0, 1 - dist / d.radius) * (1 - d.age / d.ttl);
      if (falloff <= 0.01) continue; // skip distant / faded sources
      accumVx += (dxp / dist) * d.kick * kickScale * falloff * 0.3;
      accumVy += (dyp / dist) * d.kick * kickScale * falloff;
    }
    p.vx += accumVx * dt;
    p.vy += accumVy * dt;
  }

  // renormalize + enforce "mostly-left" direction (prevents vertical flyers)
  let [nx, ny] = normalize2(p.vx, p.vy);

  // Always move left; clamp vertical component.
  // max |vy| = 0.35 => max angle ≈ 20.5°
  const MAX_ABS_VY = 0.45;

  // clamp ny
  ny = clamp(ny, -MAX_ABS_VY, MAX_ABS_VY);

  // force nx negative with corresponding magnitude to stay unit-ish
  const nxMag = Math.sqrt(Math.max(0, 1 - ny * ny));
  nx = -Math.max(0.15, nxMag); // ensure at least some horizontal component

  // renormalize one more time (safety)
  [nx, ny] = normalize2(nx, ny);

  p.vx = nx;
  p.vy = ny;

  // integrate
  const sp = baseSpeed * p.spMul;
  const dx = p.vx * sp * dt;
  const dy = p.vy * sp * dt;

  // accel clamp (approx by clamping per-step displacement)
  const maxStep = accelLim * dt * dt + sp * dt; // loose but ok
  const stepLen = Math.hypot(dx, dy);
  const k = stepLen > maxStep ? (maxStep / stepLen) : 1.0;

  p.x += dx * k;
  p.y += dy * k;

  // respawn when out of bounds (wrap from right) + tiny jitter
  if (p.x < -pad) {
    const j = (rand01(p.y * 0.17 + p.laneId * 31.7 + t * 0.13) - 0.5) * pad;
    p.x = logicW + pad + j;
  }
  if (p.y < -pad) p.y = logicH + pad;
  if (p.y > logicH + pad) p.y = -pad;

  // (vLen retained from the original step for parity; intentionally unused.)
  void vLen;
}
