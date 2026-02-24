export type GlRt = {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
};

function must<T>(v: T | null, msg: string): T {
  if (!v) throw new Error(msg);
  return v;
}

export function createColorRt(gl: WebGL2RenderingContext, w: number, h: number): GlRt {
  const fb = must(gl.createFramebuffer(), "createFramebuffer failed");
  const tex = must(gl.createTexture(), "createTexture failed");

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // allocate
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, Math.max(1, w), Math.max(1, h), 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("SceneRT framebuffer incomplete: " + status);
  }

  // cleanup binds
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { fb, tex, w, h };
}

export function resizeColorRt(gl: WebGL2RenderingContext, rt: GlRt, w: number, h: number): void {
  const nw = Math.max(1, w | 0);
  const nh = Math.max(1, h | 0);
  if (rt.w === nw && rt.h === nh) return;

  rt.w = nw;
  rt.h = nh;

  gl.bindTexture(gl.TEXTURE_2D, rt.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nw, nh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

export function disposeRt(gl: WebGL2RenderingContext, rt: GlRt | null): void {
  if (!rt) return;
  try { gl.deleteFramebuffer(rt.fb); } catch {}
  try { gl.deleteTexture(rt.tex); } catch {}
}
