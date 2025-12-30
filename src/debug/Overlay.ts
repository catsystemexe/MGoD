import { Config } from "../core/Config";

export class Overlay {
  private fps = 0;
  private frames = 0;
  private acc = 0;

  onRenderFrame(dtSec: number): void {
    this.frames++;
    this.acc += dtSec;
    if (this.acc >= 0.5) {
      this.fps = Math.round(this.frames / this.acc);
      this.frames = 0;
      this.acc = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D, lines: string[]): void {
    if (!Config.SHOW_OVERLAY) return;

    ctx.save();

    ctx.font =
      "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
    ctx.textBaseline = "top";

    const pad = 8;
    const lineH = 16;
    const w = 520;
    const h = pad * 2 + lineH * (lines.length + 1);

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(10, 10, w, h);

    ctx.fillStyle = "#fff";
    ctx.fillText(`FPS: ${this.fps}`, 10 + pad, 10 + pad);

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 10 + pad, 10 + pad + lineH * (i + 1));
    }

    ctx.restore();
  }
}
