// src/game/vfx/cosinePalette.ts
//
// Inigo Quilez "cosine gradient" palettes.
//   https://iquilezles.org/articles/palettes/
//
//   color(t) = a + b * cos( 2π (c * t + d) )
//
// a = base level (DC offset), b = amplitude, c = frequency (cycles over t∈[0,1]),
// d = phase per channel. Each of a,b,c,d is an RGB triple.

export type Vec3 = readonly [number, number, number];

const TAU = Math.PI * 2;

/** Quilez cosine palette. `t` is the gradient parameter (typically 0..1). */
export function cosinePalette(t: number, a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 {
  return [
    a[0] + b[0] * Math.cos(TAU * (c[0] * t + d[0])),
    a[1] + b[1] * Math.cos(TAU * (c[1] * t + d[1])),
    a[2] + b[2] * Math.cos(TAU * (c[2] * t + d[2])),
  ];
}

export type PaletteParams = { a: Vec3; b: Vec3; c: Vec3; d: Vec3 };

// Muzzle: bright gold (t=0) -> deep orange (t=1) as the flash ages.
//   t=0 ≈ (1.00, 0.78, 0.45)   t=1 ≈ (0.84, 0.56, 0.25)
export const MUZZLE_PALETTE: PaletteParams = {
  a: [0.60, 0.45, 0.25],
  b: [0.40, 0.35, 0.25],
  c: [0.15, 0.15, 0.15],
  d: [0.00, 0.05, 0.10],
};

// Tracer: cyan-green (head, tail=1) -> green (tail=0) along the beam.
//   tail=1 ≈ (0.04, 0.91, 0.19)   tail=0 ≈ (0.00, 1.00, 0.82)
export const TRACER_PALETTE: PaletteParams = {
  a: [0.20, 0.55, 0.55],
  b: [0.20, 0.45, 0.45],
  c: [0.10, 0.10, 0.25],
  d: [0.50, 0.00, 0.15],
};
