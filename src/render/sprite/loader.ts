import type { SpriteAtlas, SpriteSheetMeta } from "./types";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

export async function loadSpriteAtlas(metaUrl: string): Promise<SpriteAtlas> {
  const res = await fetch(metaUrl);
  if (!res.ok) throw new Error(`Sprite meta fetch failed: ${metaUrl} (${res.status})`);
  const meta = (await res.json()) as SpriteSheetMeta;

  const img = await loadImage(meta.image);
  const cols = Math.max(1, Math.floor(img.width / meta.cellW));

  return { img, meta, cols };
}
