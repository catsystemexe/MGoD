import { getGL } from "./gl";
import { RenderTarget } from "./RenderTarget";
import { computeDisplay, type DisplayInfo } from "./DisplayRenderer";
import { createBlitProgram, type BlitProgram } from "./BlitProgram";

export type GraphicsMode = "classic_400x224";
export const MODE_RES: Record<GraphicsMode, { w: number; h: number }> = {
  classic_400x224: { w: 400, h: 224 },
};

export class Graphics {
  readonly mode: GraphicsMode;
  readonly logicW: number;
  readonly logicH: number;

  private gl: WebGL2RenderingContext;
  private scene: RenderTarget;
  private blit: BlitProgram;

  private display: DisplayInfo | null = null;

  constructor(private canvas: HTMLCanvasElement, mode: GraphicsMode = "classic_400x224") {
    this.mode = mode;
    this.logicW = MODE_RES[mode].w;
    this.logicH = MODE_RES[mode].h;

    this.gl = getGL(canvas);
    this.scene = new RenderTarget(this.gl, this.logicW, this.logicH);
    this.blit = createBlitProgram(this.gl);

    // default state
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const gl = this.gl;
    // fyzická velikost canvasu
    const physW = Math.max(1, Math.floor(cssW * dpr));
    const physH = Math.max(1, Math.floor(cssH * dpr));

    this.canvas.width = physW;
    this.canvas.height = physH;
    this.canvas.style.width = cssW + "px";
    this.canvas.style.height = cssH + "px";

    this.display = computeDisplay(this.logicW, this.logicH, cssW, cssH, dpr);

    // viewport se nastavuje až v present()
    gl.viewport(0, 0, physW, physH);
  }

  /** Render world + HUD do SceneRT (zatím jen černá + border) */
  renderScene(): void {
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fb);
    gl.viewport(0, 0, this.scene.w, this.scene.h);

    // clear black
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // jednoduchý border: uděláme ho brutálně přes scissor (bez shaderů navíc)
    gl.enable(gl.SCISSOR_TEST);

    // top
    gl.scissor(0, this.scene.h - 1, this.scene.w, 1);
    gl.clearColor(0.2, 0.2, 0.2, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // bottom
    gl.scissor(0, 0, this.scene.w, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // left
    gl.scissor(0, 0, 1, this.scene.h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // right
    gl.scissor(this.scene.w - 1, 0, 1, this.scene.h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Present SceneRT -> screen s integer scale + viewport */
  present(): void {
    const gl = this.gl;
    const d = this.display;
    if (!d) return;

    // letterbox clear (black)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // viewport do kterého se vykreslí pixel-perfect obraz
    gl.viewport(d.viewportX, d.viewportY, d.viewportW, d.viewportH);

    gl.useProgram(this.blit.prog);
    gl.bindVertexArray(this.blit.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1i(this.blit.uTex, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
    gl.useProgram(null);
  }

  /** Present rect in *device pixels* (same space as canvas.width/height) */
  getPresentRect() {
    const d = this.display;
    if (!d) {
      return { x: 0, y: 0, w: this.canvas.width, h: this.canvas.height, scale: 1 };
    }
    // computeDisplay už to má v device px
    return {
      x: d.viewportX,
      y: d.viewportY,
      w: d.viewportW,
      h: d.viewportH,
      scale: d.scale ?? 1, // pokud DisplayInfo nemá scale, viz FIX 1b níže
    };
  }
  


}
