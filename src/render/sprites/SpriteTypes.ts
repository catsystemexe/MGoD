export type SpriteFrame = {
  x: number; y: number; w: number; h: number;
  px: number; py: number; // pivot inside frame (px coords)
};

export type SpriteAnim = {
  frames: string[];
  fps: number;
  loop?: boolean; // default true
};

export type SpriteAtlasJSON = {
  texture: string;
  grid?: any;
  frames: Record<string, SpriteFrame>;
  anims?: Record<string, SpriteAnim>;
};
