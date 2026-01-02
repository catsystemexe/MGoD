import type { SpriteAtlas } from "./types";

export function drawAtlasFrame(
  ctx: CanvasRenderingContext2D,
  atlas: SpriteAtlas,
  frameIndex: number,
  x: number,
  y: number,
  rotationRad = 0
) {
  const { meta, img, cols } = atlas;
  const cw = meta.cellW;
  const ch = meta.cellH;

  const sx = (frameIndex % cols) * cw;
  const sy = Math.floor(frameIndex / cols) * ch;

  const px = Math.floor(cw * meta.pivotX);
  const py = Math.floor(ch * meta.pivotY);

  ctx.save();
  ctx.translate(x, y);
  if (rotationRad) ctx.rotate(rotationRad);
  ctx.drawImage(img, sx, sy, cw, ch, -px, -py, cw, ch);
  ctx.restore();
}
