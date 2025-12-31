export type PatternDef = {
  w: number;
  h: number;
  data: number[]; // 0/1
};

export const PATTERNS = {
  // 3x3 Glider (letí šikmo)
  GLIDER: {
    w: 3, h: 3,
    data: [
      0, 1, 0,
      0, 0, 1,
      1, 1, 1
    ]
  },
  // 3x1 Blinker (oscilátor)
  BLINKER: {
    w: 3, h: 3,
    data: [
      0, 1, 0,
      0, 1, 0,
      0, 1, 0
    ]
  },
  // 2x2 Block (stálý život - tvrdá zeď)
  BLOCK: {
    w: 2, h: 2,
    data: [1, 1, 1, 1]
  }
};
