export function getGL(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  }) as WebGL2RenderingContext | null;

  if (!gl) throw new Error("WebGL2 not supported");
  return gl;
}

export function assertOk(gl: WebGL2RenderingContext, label: string) {
  const e = gl.getError();
  if (e !== gl.NO_ERROR) throw new Error(`[GL] ${label} error: ${e}`);
}