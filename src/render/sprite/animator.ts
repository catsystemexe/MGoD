import type { SpriteSheetMeta } from "./types";

export class Animator {
  private anim = "idle";
  private t = 0;
  private fi = 0;

  set(animName: string) {
    if (this.anim === animName) return;
    this.anim = animName;
    this.t = 0;
    this.fi = 0;
  }

  update(dt: number, meta: SpriteSheetMeta) {
    const def = meta.anims[this.anim];
    if (!def || def.frames.length === 0) return;

    const spf = 1 / Math.max(1, def.fps);
    this.t += dt;

    while (this.t >= spf) {
      this.t -= spf;
      this.fi = (this.fi + 1) % def.frames.length;
    }
  }

  frame(meta: SpriteSheetMeta): number {
    const def = meta.anims[this.anim];
    if (!def || def.frames.length === 0) return 0;
    return def.frames[this.fi] ?? 0;
  }

  currentAnim() { return this.anim; }
}
