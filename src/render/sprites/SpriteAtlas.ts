import type { SpriteAtlasJSON, SpriteAnim, SpriteFrame } from "./SpriteTypes";

export class SpriteAtlas {
  constructor(public readonly json: SpriteAtlasJSON) {}

  frame(key: string): SpriteFrame | null {
    return this.json.frames[key] ?? null;
  }

  anim(key: string): SpriteAnim | null {
    return this.json.anims?.[key] ?? null;
  }

  pickAnimFrame(animKey: string, tSec: number): SpriteFrame | null {
    const a = this.anim(animKey);
    if (!a || !a.frames?.length) return null;
    const fps = Number(a.fps ?? 10) || 10;
    const idx = Math.floor(tSec * fps) % a.frames.length;
    return this.frame(a.frames[idx]);
  }

  static async load(url: string): Promise<SpriteAtlas> {
    const res = await fetch(url, { cache: "no-store" as any });
    if (!res.ok) throw new Error("SpriteAtlas load failed: " + res.status + " " + res.statusText);
    const json = (await res.json()) as SpriteAtlasJSON;
    return new SpriteAtlas(json);
  }
}
