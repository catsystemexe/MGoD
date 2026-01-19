import type { Glyph } from "./GlyphTypes";

// Minimal starter glyphs (edit later / add more)
const GLYPHS: Record<string, Glyph> = {
  // Tiny 7x7 "diamond bug" placeholder (kept as ultimate fallback)
  "enemy.diamond": {
    id: "enemy.diamond",
    w: 7,
    h: 7,
    px: 2,
    bits:
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

  // --- ENEMIES (11x11, px=2 => 22x22 on screen) ---

  // red: chunky "crab"
  "enemy.red": {
    id: "enemy.red",
    w: 11,
    h: 11,
    px: 2,
    bits:
      "00001110000" +
      "00011111000" +
      "00111011100" +
      "01111111110" +
      "11101110111" +
      "11111111111" +
      "01111111110" +
      "00110101100" +
      "00011011000" +
      "00110001100" +
      "00000000000",
  },

  // blue: "invader"
  "enemy.blue": {
    id: "enemy.blue",
    w: 11,
    h: 11,
    px: 2,
    bits:
      "00011011000" +
      "00111111100" +
      "01101110110" +
      "11111111111" +
      "11011111011" +
      "11111111111" +
      "00110001100" +
      "01100000110" +
      "11000000011" +
      "00011011000" +
      "00100100100",
  },

  // enemy_bug1: "bug"
  "enemy.enemy_bug1": {
    id: "enemy.enemy_bug1",
    w: 11,
    h: 11,
    px: 2,
    bits:
      "00001110000" +
      "00111111100" +
      "01111011110" +
      "11111111111" +
      "11011111011" +
      "11111111111" +
      "01101110110" +
      "00111111100" +
      "00011011000" +
      "00110001100" +
      "00000000000",
  },
};

export function getGlyph(id: string): Glyph | null {
  const g = GLYPHS[id];
  return g ?? null;
}

export function listGlyphIds(): string[] {
  return Object.keys(GLYPHS);
}
