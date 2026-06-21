export const COLORS = {
  PLAYER:          '#00ffee',
  BOLT:            '#aef6ff',
  ORB:             '#ff5cc8',
  HIT_FLASH:       '#ffffff',
  WHITE:           '#ffffff',
  ENEMY_A:         '#ff2266',
  ENEMY_B:         '#ff6600',
  ENEMY_C:         '#8866ff',
} as const;

export type ColorKey = keyof typeof COLORS;

export type PaletteColor = { name: string; hex: string };
export type Palette = { id: string; colors: PaletteColor[] };

export const PALETTES: Record<string, Palette> = {
  player: { id: 'player', colors: [
    { name: 'shadow',    hex: '#001a33' },
    { name: 'dark',      hex: '#003366' },
    { name: 'mid',       hex: '#005599' },
    { name: 'base',      hex: '#00aacc' },
    { name: 'light',     hex: '#00ffee' },
    { name: 'highlight', hex: '#66ffff' },
    { name: 'specular',  hex: '#ffffff' },
  ]},
  enemyA: { id: 'enemyA', colors: [
    { name: 'shadow',    hex: '#1a0011' },
    { name: 'dark',      hex: '#660033' },
    { name: 'base',      hex: '#cc0055' },
    { name: 'light',     hex: '#ff2266' },
    { name: 'highlight', hex: '#ff88aa' },
  ]},
  enemyB: { id: 'enemyB', colors: [
    { name: 'shadow',    hex: '#1a0a00' },
    { name: 'dark',      hex: '#663300' },
    { name: 'base',      hex: '#cc5500' },
    { name: 'light',     hex: '#ff6600' },
    { name: 'highlight', hex: '#ffaa44' },
  ]},
  enemyC: { id: 'enemyC', colors: [
    { name: 'shadow',    hex: '#0d0011' },
    { name: 'dark',      hex: '#330066' },
    { name: 'base',      hex: '#6600cc' },
    { name: 'light',     hex: '#8866ff' },
    { name: 'highlight', hex: '#bbaaff' },
  ]},
};

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex).trim());
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [
    ((n >> 16) & 255) / 255,
    ((n >> 8)  & 255) / 255,
    ( n        & 255) / 255,
  ];
}

export function paletteToFloat32(palette: Palette): Float32Array {
  const arr = new Float32Array(palette.colors.length * 3);
  palette.colors.forEach((c, i) => {
    const [r, g, b] = hexToRgb(c.hex);
    arr[i * 3]     = r;
    arr[i * 3 + 1] = g;
    arr[i * 3 + 2] = b;
  });
  return arr;
}

export function paletteColor(paletteId: string, index: number): string {
  const p = PALETTES[paletteId];
  if (!p) return '#ffffff';
  return p.colors[Math.min(index, p.colors.length - 1)]?.hex ?? '#ffffff';
}
