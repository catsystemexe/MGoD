export interface FxPass {
  init(gl: WebGL2RenderingContext): void;
  rebuild(params?: any): void;
  apply(srcTex: WebGLTexture, dst: any, params: any): void;
}
