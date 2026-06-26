export type EnemySdfShape =
  | "arrow"
  | "orb"
  | "crown"
  | "mandala"
  | "sigil"
  | "bolt"
  | "triangle"
  | "chevron"
  | "thruster"
  | "laser";

export interface EnemySpriteRenderDef {
  id: string;
  scale: number;
}

export interface EnemySdfRenderDef {
  shape: EnemySdfShape;
  color?: string;
  size?: number;
}

export interface EnemyGlyphRenderDef {
  id: string;
  dx?: number;
  dy?: number;
  color?: string;
  alpha?: number;
  pulseHz?: number;
  pulseAmp?: number;
}

export interface EnemyProcPartDef {
  dx: number;
  dy: number;
  w: number;
  h: number;
  color?: string;
  alpha?: number;
  pulseHz?: number;
  pulseAmp?: number;
}

export interface EnemyProcRenderDef {
  kind: "parts";
  parts: EnemyProcPartDef[];
}

export interface EnemyAppearanceDef {
  color?: string;
  sprite?: EnemySpriteRenderDef;
  sdf?: EnemySdfRenderDef;
  glyphId?: string;
  glyphs?: EnemyGlyphRenderDef[];
  proc?: EnemyProcRenderDef;
}

export function materializeEnemyAppearance(
  appearance: EnemyAppearanceDef | undefined,
): EnemyAppearanceDef | undefined {
  if (!appearance) return undefined;

  return {
    ...(appearance.color ? { color: appearance.color } : {}),
    ...(appearance.sprite ? { sprite: { ...appearance.sprite } } : {}),
    ...(appearance.sdf ? { sdf: { ...appearance.sdf } } : {}),
    ...(appearance.glyphId ? { glyphId: appearance.glyphId } : {}),
    ...(appearance.glyphs ? { glyphs: appearance.glyphs.map((glyph) => ({ ...glyph })) } : {}),
    ...(appearance.proc
      ? {
          proc: {
            ...appearance.proc,
            parts: appearance.proc.parts.map((part) => ({ ...part })),
          },
        }
      : {}),
  };
}
