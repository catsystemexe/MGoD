export type SpriteAnimDef = { fps: number; frames: number[] };

export type SpriteSheetMeta = {
  image: string;     // URL (z public), např. "/assets/..../ship.png"
  cellW: number;
  cellH: number;
  pivotX: number;    // 0..1
  pivotY: number;    // 0..1
  anims: Record<string, SpriteAnimDef>;
};

export type SpriteAtlas = {
  img: HTMLImageElement;
  meta: SpriteSheetMeta;
  cols: number; // počet sloupců v image (počítáno z img.width / cellW)
};
