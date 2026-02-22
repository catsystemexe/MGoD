/* eslint-disable */
const fs = require("fs");

function die(msg) {
  console.error("PATCH FAIL:", msg);
  process.exit(1);
}

function read(p) {
  if (!fs.existsSync(p)) die("missing file: " + p);
  return fs.readFileSync(p, "utf8");
}

function write(p, s) {
  fs.writeFileSync(p, s, "utf8");
}

function ensureOnce(hay, needle, label) {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const n = (hay.match(new RegExp(esc, "g")) || []).length;
  if (n !== 1) die(`expected exactly 1 occurrence of ${label}, got ${n}`);
}

const FLOW = "src/render/webgl/bg/FlowRibbonBg.ts";
let s = read(FLOW);

// 1) Insert helpers after lerp()
const insertAfter =
  `function lerp(a: number, b: number, t: number): number {\n` +
  `  return a + (b - a) * t;\n` +
  `}\n`;

ensureOnce(s, insertAfter, "lerp() block");

const helpers =
`function smoothstep01(t: number): number {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

// smooth 1D value-noise in continuous domain
function noise1(x: number, seed: number): number {
  const i0 = Math.floor(x);
  const i1 = i0 + 1;
  const f = x - i0;
  const a = rand01(seed + i0 * 17.13);
  const b = rand01(seed + i1 * 17.13);
  return lerp(a, b, smoothstep01(f));
}

// fractal brownian motion: 0..1-ish
function fbm1(x: number, seed: number, octaves: number, lacunarity: number, gain: number): number {
  let amp = 0.5;
  let freq = 1.0;
  let sum = 0.0;
  let norm = 0.0;
  for (let o = 0; o < octaves; o++) {
    sum += noise1(x * freq, seed + o * 101.9) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? (sum / norm) : 0.0;
}
`;

if (!s.includes("function smoothstep01(")) {
  s = s.replace(insertAfter, insertAfter + "\n" + helpers + "\n");
} else {
  console.log("helpers already present, skipping insert");
}

// 2) Replace the single-sine y += ... * amp;
const targetLine = `y += Math.sin((t * wHz) + ph + spatial + advect) * amp;`;
ensureOnce(s, targetLine, "single-sine line");

const repl =
`// --- WATER-LIKE COMPOSITE WAVE (less periodic, more "current") ---
            // base multi-sine (macro shape)
            const s0 = Math.sin((t * wHz) + ph + spatial + advect);
            const s1 = Math.sin((t * wHz * 2.71) + ph * 1.37 + (spatial * 3.0) + (advect * 2.2));
            const s2 = Math.sin((t * wHz * 7.10) + ph * 2.11 + (spatial * 9.0) + (advect * 6.0));

            // smooth turbulence in space+time (fbm)
            // scale xPhase down so noise doesn't look like tight jitter
            const nBase = (xPhase * 0.11) + (t * 0.35);
            const n = fbm1(nBase, seed + 999.5, 4, 2.05, 0.55); // 0..1
            const n2 = fbm1(nBase * 0.55 + 12.3, seed + 333.7, 3, 2.2, 0.6); // 0..1

            // lane-dependent "current" modulation: ties nearby lanes together (less banding)
            const yNorm = baseY / Math.max(1, logicH);
            const cur = (Math.sin(t * 0.22 + yNorm * 6.0 + rand01(seed + 81.2) * 3.0) * 0.5 + 0.5); // 0..1

            // assemble: macro + mid + micro + turbulence
            const macro = s0 * 0.72 + s1 * 0.22;
            const micro = s2 * 0.06;
            const turb = ((n - 0.5) * 2.0) * (0.35 + 0.65 * cur) + ((n2 - 0.5) * 2.0) * 0.25;

            y += (macro + micro + turb * 0.85) * amp;`;

s = s.replace(targetLine, repl);

write(FLOW, s);
console.log("patched:", FLOW);

// 3) Optional: tune preset 0 in flowPresets.ts
const FP = "src/render/webgl/bg/flowPresets.ts";
let p = read(FP);

const oldBlock =
`yMeander: {
            enabled: true,
            ampPx: { min: 0.25, max: 0.85 },   // jemnější
            freqHz: { min: 0.04, max: 0.10 },
            xPhaseCoupling: 0.006,
          },`;

if (p.includes(oldBlock)) {
  const newBlock =
`yMeander: {
            enabled: true,
            ampPx: { min: 2.2, max: 7.5 },     // výraznější “voda”
            freqHz: { min: 0.06, max: 0.16 },  // živější bez “vibrování”
            xPhaseCoupling: 0.018,             // delší proudy přes X
          },`;
  p = p.replace(oldBlock, newBlock);
  write(FP, p);
  console.log("tuned:", FP);
} else {
  console.log("preset block not found exactly (maybe already edited). skipping preset tune.");
}
