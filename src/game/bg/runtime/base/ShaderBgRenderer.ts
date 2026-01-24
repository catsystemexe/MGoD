import { BaseRenderer } from "./BaseRenderer";

export class ShaderBgRenderer implements BaseRenderer {
  init(gl: WebGL2RenderingContext, w: number, h: number): void {}
  rebuild(params: any): void {}
  setUniforms(params: any, time: number, scroll: number, audio: any): void {}
  draw(): void {}
  dispose(): void {}
}
