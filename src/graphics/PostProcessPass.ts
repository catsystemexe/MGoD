// src/graphics/PostProcessPass.ts
//
// Display Reality Layer — pass #1.
//
// Same fullscreen-triangle skeleton as BlitProgram (gl_VertexID, no vertex
// buffers, a single draw call), but the fragment shader applies a CRT-ish
// post-process: per-row SCANLINES + a slow signal "breathing" gain.
//
// Graphics.present() chooses between this program (post-process ON) and the
// plain BlitProgram (passthrough = OFF) on the CPU side, so the OFF path stays
// the known-good blit and there is no per-pixel branch when effects are off.
//
// GLSL reference: thebookofshaders.com + Maxime Heckel.

export type PostProcessPass = {
  prog: WebGLProgram;
  vao: WebGLVertexArrayObject;
  uTex: WebGLUniformLocation;
  uTime: WebGLUniformLocation | null;
  uRes: WebGLUniformLocation | null;
};

// Exported so a unit test can assert the effects are still present in the
// source without needing a real WebGL context.
export const POSTPROCESS_VS = `#version 300 es
precision highp float;
out vec2 vUV;
const vec2 pos[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);
void main() {
  vec2 p = pos[gl_VertexID];
  gl_Position = vec4(p, 0.0, 1.0);
  // map big triangle to UV
  vUV = 0.5 * (p + 1.0);
}
`;

export const POSTPROCESS_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uTime;
uniform vec2 uResolution;
out vec4 outColor;
void main() {
  // SCANLINES: darken every other physical row by 4%.
  float line = mod(floor(vUV.y * uResolution.y), 2.0);
  float scan = 1.0 - line * 0.04;

  // SIGNAL BREATHING: slow ±1.2% luminance drift (analog signal gain wobble).
  float breath = 1.0 + 0.012 * sin(uTime * 0.7);

  outColor = texture(uTex, vUV) * scan * breath;
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "";
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error("createProgram failed");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || "";
    gl.deleteProgram(prog);
    throw new Error("program link failed: " + log);
  }
  return prog;
}

export function createPostProcessPass(gl: WebGL2RenderingContext): PostProcessPass {
  const vs = compile(gl, gl.VERTEX_SHADER, POSTPROCESS_VS);
  const fs = compile(gl, gl.FRAGMENT_SHADER, POSTPROCESS_FS);
  const prog = link(gl, vs, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray();
  if (!vao) throw new Error("createVAO failed");

  gl.bindVertexArray(vao);
  // no buffers — fullscreen triangle via gl_VertexID
  gl.bindVertexArray(null);

  const uTex = gl.getUniformLocation(prog, "uTex");
  if (!uTex) throw new Error("uTex uniform not found");

  // uTime / uResolution may be optimized out by some drivers; setting a null
  // location is a harmless no-op, so do not throw on them.
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uRes = gl.getUniformLocation(prog, "uResolution");

  return { prog, vao, uTex, uTime, uRes };
}
