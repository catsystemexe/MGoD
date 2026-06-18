// src/render/webgl/bg/FlowDisturbanceKick.smoke.ts
//
// Unit guard for the FlowSegmentsBg "disturbance kick" (explosion/hit ripples).
// We cannot assert "it looks good" automatically, so instead we prove the kick
// EMPIRICALLY changes a particle's vertical velocity:
//
//   - particle at (100,100), disturbance centered at (100,50) directly above it
//   - one step WITHOUT disturbance  -> vy stays at its baseline (~0)
//   - one step WITH disturbance     -> vy is pushed away from the blast (vy > 0,
//                                       i.e. downward, since the blast is above)
//   - one step WITH kickScale = 0   -> kick neutralized -> vy back to baseline
//
// The last check is the regression proof: if the kick term were removed (or
// never applied), the WITH-disturbance run would equal the kickScale=0 run and
// the assertion would fail.

import {
  stepFlowParticle,
  type SegParticle,
  type FlowDisturbance,
} from "./flowStep";
import type { FlowPreset } from "./flowPresets";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

// Minimal laminar preset with all the wobble sources (meander/shear/microWave)
// DISABLED so the baseline vy is a clean ~0 and the only thing that can move it
// is the disturbance kick under test.
const PRESET: FlowPreset = {
  id: "test.flat",
  name: "test",
  type: "particles_segments",
  space: "world",
  direction: { x: -1, y: 0 },
  parallax: [{ layer: "near", factor: 1, densityMul: 1 }],
  spawn: { countBase: 1, respawnPaddingPx: 200, distribution: "uniform_y" },
  motion: {
    speedPxPerSec: { base: 90, layerMul: { far: 1, mid: 1, near: 1 } },
    accelLimitPxPerSec2: 100000,
    dampingPerSec: 0.5,
  },
  segments: {
    thicknessPx: 2,
    lengthPx: { min: 10, max: 20, drift: { enabled: false, targetIntervalSec: { min: 1, max: 2 }, lerpRate: 1 } },
    alignToVelocity: true,
  },
  rng: { seedMode: "perLevel", lowFreq: { enabled: false, globalDriftIntervalSec: { min: 1, max: 2 }, lerpRate: 1 } },
  // production default: a 0.25 multiplier keeps the kick BELOW the MAX_ABS_VY
  // clamp so the falloff gradient stays visible (no saturation).
  disturbance: { kickScale: 0.25 },
} as unknown as FlowPreset;

function makeParticle(): SegParticle {
  return {
    x: 100, y: 100,
    vx: -1, vy: 0,
    len: 15,
    laneId: 0, laneY: 100,
    meanderAmp: 0, meanderHz: 0, meanderPhase: 0,
    spMul: 1, spMulTarget: 1, spMulT: 0,
    lenTarget: 15, lenT: 0,
  };
}

function main() {
  const dt = 1 / 60;
  // radius=100, particle 50px below center -> falloff=0.5; with kickScale=0.25
  // this lands the vertical nudge comfortably under the MAX_ABS_VY (0.45) clamp.
  const MAX_ABS_VY = 0.45;
  const blast: FlowDisturbance[] = [
    { x: 100, y: 50, radius: 100, age: 0, ttl: 0.4, kick: 180 },
  ];

  // 1) baseline: no disturbances -> vy must stay essentially zero.
  const a = makeParticle();
  stepFlowParticle(a, PRESET, dt, 0, "near", 800, 600, []);
  assert(Math.abs(a.vy) < 1e-6, "baseline (no disturbance) vy must stay ~0, got " + a.vy);

  // 2) with disturbance above the particle -> vy pushed downward (positive)...
  const b = makeParticle();
  stepFlowParticle(b, PRESET, dt, 0, "near", 800, 600, blast);
  assert(b.vy > 0.05, "disturbance must push vy downward (away from blast above), got " + b.vy);
  assert(Math.abs(b.vy) > Math.abs(a.vy) + 0.05, "disturbance vy must differ from baseline, got " + b.vy + " vs " + a.vy);
  // ...but NOT saturate the clamp: gradient stays intact (kickScale=0.25 keeps it under MAX_ABS_VY).
  assert(b.vy < 0.44, "disturbance vy must stay below MAX_ABS_VY=" + MAX_ABS_VY + " (no saturation), got " + b.vy);

  // 3) regression proof: kickScale=0 neutralizes the kick -> back to baseline.
  const c = makeParticle();
  const presetNoKick = { ...PRESET, disturbance: { kickScale: 0 } } as FlowPreset;
  stepFlowParticle(c, presetNoKick, dt, 0, "near", 800, 600, blast);
  assert(Math.abs(c.vy) < 1e-6, "kickScale=0 must neutralize the disturbance, got " + c.vy);

  console.log("[SMOKE] FlowDisturbanceKick OK ✅ (baseline vy=" + a.vy.toFixed(4) + ", kicked vy=" + b.vy.toFixed(4) + ")");
}

main();
