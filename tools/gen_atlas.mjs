import fs from "node:fs";

function die(msg) {
  console.error("[gen_atlas]", msg);
  process.exit(1);
}

const MAP_PATH = process.argv[2] || "assets/sprites/core.map.txt";
const OUT_PATH = process.argv[3] || "assets/sprites/core.atlas.json";

// MVP defaults (edit later if needed)
const texture = "assets/sprites/core.png";
const cellW = 56;
const cellH = 56;
const cols = 8;
const marginX = 0;
const marginY = 0;
const spacingX = 0;
const spacingY = 0;

// animation defaults
const defaultAnimFps = 10;

if (!fs.existsSync(MAP_PATH)) die("Missing map: " + MAP_PATH);

const lines = fs
  .readFileSync(MAP_PATH, "utf-8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l.length > 0 && !l.startsWith("#"));

const frames = {};
const animBuckets = new Map(); // baseKey -> [frameKeys]

for (let i = 0; i < lines.length; i++) {
  const key = lines[i];
  if (key === ".") continue;

  const col = i % cols;
  const row = Math.floor(i / cols);

  const x = marginX + col * (cellW + spacingX);
  const y = marginY + row * (cellH + spacingY);

  // default pivot = center
  const px = cellW * 0.5;
  const py = cellH * 0.5;

  frames[key] = { x, y, w: cellW, h: cellH, px, py };

  // if key ends with .<number> treat as animation frame
  const m = key.match(/^(.*)\.(\d+)$/);
  if (m) {
    const base = m[1];
    if (!animBuckets.has(base)) animBuckets.set(base, []);
    animBuckets.get(base).push(key);
  }
}

// make anims (sorted by numeric suffix)
const anims = {};
for (const [base, keys] of animBuckets.entries()) {
  keys.sort((a, b) => {
    const na = Number(a.split(".").pop());
    const nb = Number(b.split(".").pop());
    return na - nb;
  });
  anims[base] = { frames: keys, fps: defaultAnimFps };
}

const out = {
  texture,
  grid: { cellW, cellH, cols, marginX, marginY, spacingX, spacingY },
  frames,
  anims,
};

fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf-8");
console.log("[gen_atlas] wrote", OUT_PATH);
console.log("[gen_atlas] frames=", Object.keys(frames).length, "anims=", Object.keys(anims).length);
