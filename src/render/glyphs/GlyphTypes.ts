export type Glyph = {
  id: string;
  w: number;     // glyph width in pixels (grid)
  h: number;     // glyph height in pixels (grid)
  px?: number;   // pixel size multiplier (default 1)
  bits: string;  // length = w*h, row-major, '1' = on, '0' = off
};
