export type BlitProgram = {
  prog: WebGLProgram;
  vao: WebGLVertexArrayObject;
  uTex: WebGLUniformLocation;
};

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

export function createBlitProgram(gl: WebGL2RenderingContext): BlitProgram {
  const vsSrc = `#version 300 es
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

  const fsSrc = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
out vec4 outColor;
void main() {
  outColor = texture(uTex, vUV);
}
`;

  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = link(gl, vs, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray();
  if (!vao) throw new Error("createVAO failed");

  gl.bindVertexArray(vao);
  // žádné buffery – fullscreen triangle přes gl_VertexID
  gl.bindVertexArray(null);

  const uTex = gl.getUniformLocation(prog, "uTex");
  if (!uTex) throw new Error("uTex uniform not found");

  return { prog, vao, uTex };
}
