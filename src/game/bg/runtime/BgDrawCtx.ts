export interface BgDrawCtx {
  gl: WebGL2RenderingContext;
  time: number;
  scroll: { x: number; y: number };
}