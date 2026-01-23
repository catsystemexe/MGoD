import { getGlyph } from "../src/render/glyphs/GlyphDB";

const ids = [
  "enemy.obelisk.core",
  "enemy.obelisk.slit",
  "enemy.obelisk.runes",
  "enemy.obelisk.drone",
];

for (const id of ids) {
  const g = getGlyph(id);
  if (!g) { console.log(id, "MISSING"); continue; }
  const w = Number(g.w)|0, h = Number(g.h)|0;
  const px = Number((g as any).px ?? 1) || 1;
  const bits = String((g as any).bits ?? "");
  let on = 0; for (let i=0;i<bits.length;i++) if (bits.charCodeAt(i)===49) on++;
  console.log(id.padEnd(22), `grid=${w}x${h}`, `px=${px}`, `screen=${w*px}x${h*px}`, `on=${on}/${w*h}`);
}
