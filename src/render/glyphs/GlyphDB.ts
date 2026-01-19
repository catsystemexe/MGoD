import type { Glyph } from "./GlyphTypes";

// Minimal starter glyphs (edit later / add more)
const GLYPHS: Record<string, Glyph> = {
  // Tiny 7x7 "diamond bug" placeholder
  "enemy.diamond": {
    id: "enemy.diamond",
    w: 7,
    h: 7,
    px: 2,
    bits:
      // row-major, 7*7 = 49 chars
      "0011100" +
      "0111110" +
      "1111111" +
      "1111111" +
      "1111111" +
      "0111110" +
      "0011100",
  },

  // 9x5 "capsule" projectile-ish
  "proj.capsule": {
    id: "proj.capsule",
    w: 9,
    h: 5,
    px: 1,
    bits:
      "001111100" +
      "011111110" +
      "111111111" +
      "011111110" +
      "001111100",
  },
};

export function getGlyph(id: string): Glyph | null {
  const g = GLYPHS[id];
  return g ?? null;
}

export function listGlyphIds(): string[] {
  return Object.keys(GLYPHS);
}
