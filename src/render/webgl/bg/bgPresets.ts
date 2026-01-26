export type BgPreset = {
  id: string;
  name: string;
  // mode selects branch in shader
  mode: number;
  // generic params
  p1: [number, number, number, number];
  p2: [number, number, number, number];
  // colors (two ramps)
  cA: [number, number, number];
  cB: [number, number, number];
};

export const BG_PRESETS: BgPreset[] = [
  {
    id: "tempest.tunnel",
    name: "Tempest Tunnel (rings+spokes)",
    mode: 0,
    // p1: ringW, spokeW, ringSpeed, spokeSpeed

    // p2: ringScale, spokeFreq, rotAmp, parallax
    p1: [0.025, 0.050, 0.08, 0.00],
    p2: [0.20, 12.0, 0.15, 0.15],
    cA: [0.02, 0.03, 0.06],
    cB: [0.55, 0.90, 1.00],
  },
  {
    id: "grid.warp",
    name: "Grid Warp (vector grid + bend)",
    mode: 1,
    // p1: gridStep, lineW, warpAmp, warpSpeed
    p1: [48.0, 0.020, 1.25, 0.35],
    // p2: rotAmp, parallax, glowPow, spare
    p2: [0.06, 0.10, 1.0, 0.0],
    cA: [0.01, 0.02, 0.04],
    cB: [0.50, 0.95, 0.80],
  },
  {
    id: "plasma.scan",
    name: "Plasma Scan (soft underlay + scanlines)",
    mode: 2,
    // p1: plasmaX, plasmaY, plasmaSpeed, scanW
    p1: [0.020, 0.018, 0.85, 0.018],
    // p2: scanAmp, rotAmp, parallax, spare
    p2: [0.55, 0.03, 0.06, 0.0],
    cA: [0.02, 0.02, 0.05],
    cB: [0.90, 0.65, 1.00],
  },
  {
    id: "kaleido.runes",
    name: "Kaleido Runes (symmetry shards)",
    mode: 3,
    // p1: sectors, lineW, spinSpeed, jitter
    p1: [8.0, 0.020, 0.55, 0.12],
    // p2: rotAmp, parallax, glowPow, spare
    p2: [0.10, 0.08, 1.0, 0.0],
    cA: [0.01, 0.01, 0.03],
    cB: [0.75, 0.95, 1.00],
  },
  {
    id: "star.wire",
    name: "Star Wire (radial streaks)",
    mode: 4,
    // p1: streaks, lineW, speed, noise
    p1: [28.0, 0.020, 1.20, 0.25],
    // p2: rotAmp, parallax, glowPow, spare
    p2: [0.08, 0.12, 1.0, 0.0],
    cA: [0.01, 0.02, 0.05],
    cB: [0.95, 0.95, 0.95],
  },
  {
    id: "hex.field",
    name: "Hex Field (tech lattice)",
    mode: 5,
    // p1: cell, lineW, driftSpeed, wobble
    p1: [42.0, 0.020, 0.45, 0.35],
    // p2: rotAmp, parallax, glowPow, spare
    p2: [0.05, 0.10, 1.0, 0.0],
    cA: [0.01, 0.02, 0.04],
    cB: [0.60, 0.95, 0.65],
  },
];
