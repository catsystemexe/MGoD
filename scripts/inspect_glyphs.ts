import { getGlyph } from "../src/render/glyphs/GlyphDB";

const ids = [
  "enemy.red",
  "enemy.bug1",
  "enemy.blue",
  "node.eye",
  "edge.chevron",
  "field.ring8",

  // new primitives
  "node.dot",
  "node.core",
  "edge.spike",
  "edge.bar",
  "field.crosshair",
  "field.ringThin",
];

for (const id of ids) {
  const g = getGlyph(id);
  if (!g) {
    console.log(id.padEnd(14), "MISSING");
    continue;
  }
  const w = Number(g.w) | 0;
  const h = Number(g.h) | 0;
  const px = Number((g as any).px ?? 1) || 1;
  const bits = String((g as any).bits ?? "");
  let on = 0;
  for (let i = 0; i < bits.length; i++) if (bits.charCodeAt(i) === 49) on++;
  console.log(
    id.padEnd(14),
    `grid=${w}x${h}`,
    `px=${px}`,
    `screen=${w*px}x${h*px}`,
    `on=${on}/${w*h}`,
    bits.length === w*h ? "" : "!!BAD_LEN!!"
  );
}
