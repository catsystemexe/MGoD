import { SpriteAtlas } from "./SpriteAtlas";
import { SpriteTexture } from "./SpriteTexture";
import { SpriteProgram } from "./SpriteProgram";

export class SpriteSystem {
  atlas: SpriteAtlas | null = null;
  tex: SpriteTexture;
  prog: SpriteProgram;

  ready = false;
  err: any = null;

  constructor(private gl: WebGL2RenderingContext) {
    this.tex = new SpriteTexture(gl);
    this.prog = new SpriteProgram(gl);
  }

  async load(atlasUrl: string, textureUrl: string): Promise<void> {
    try {
      this.atlas = await SpriteAtlas.load(atlasUrl);
      // prefer json.texture when present
      const texUrl = this.atlas?.json?.texture || textureUrl;
      await this.tex.load(texUrl);
      this.ready = true;
    } catch (e) {
      this.err = e;
      this.ready = false;
      console.warn("[SpriteSystem] load failed:", e);
    }
  }
}
