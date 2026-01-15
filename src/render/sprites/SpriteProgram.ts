type Loc = WebGLUniformLocation | null;

export class SpriteProgram {
  prog: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;

  aPos: number;
  uLogic: Loc;
  uTex: Loc;
  uPos: Loc;
  uSize: Loc;
  uPivot: Loc;
  uRot: Loc;
  uUV: Loc;
  uTexSize: Loc;
  uTint: Loc;

  constructor(private gl: WebGL2RenderingContext) {
    const vs = `#version 300 es
precision highp float;

in vec2 aPos; // [0..1] unit quad

uniform vec2 uLogic;   // logicW, logicH
uniform vec2 uPos;     // world pos (logic px)
uniform vec2 uSize;    // frame size (px)
uniform vec2 uPivot;   // pivot inside frame (px)
uniform float uRot;    // radians
uniform vec4 uUV;      // uv rect in pixels: x,y,w,h
uniform vec2 uTexSize; // texture size in pixels

out vec2 vUV;

void main() {
  // local px in sprite space (origin at top-left)
  vec2 local = aPos * uSize;

  // pivot around uPivot
  vec2 p = local - uPivot;

  float c = cos(uRot);
  float s = sin(uRot);
  vec2 pr = vec2(p.x * c - p.y * s, p.x * s + p.y * c);

  vec2 world = uPos + pr;

  // NDC from logic px
  vec2 ndc = (world / uLogic) * 2.0 - 1.0;
  ndc.y = -ndc.y;

  gl_Position = vec4(ndc, 0.0, 1.0);

  // UV in normalized coords
  vec2 uvPx = uUV.xy + aPos * uUV.zw;
  vUV = uvPx / uTexSize;
}
`;

    const fs = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform vec4 uTint;

in vec2 vUV;
out vec4 outColor;

void main() {
  vec4 c = texture(uTex, vUV);
  outColor = c * uTint;
}
 `;

  const g = this.gl;
  const prog = g.createProgram();
  if (!prog) throw new Error("createProgram failed");

  function compile(type: number, src: string) {
    const sh = g.createShader(type);
    if (!sh) throw new Error("createShader failed");
    g.shaderSource(sh, src);
    g.compileShader(sh);
    if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) {
      const log = g.getShaderInfoLog(sh) || "(no log)";
      g.deleteShader(sh);
      throw new Error("Shader compile failed: " + log);
    }
    return sh;
  }

  const vsh = compile(g.VERTEX_SHADER, vs);
  const fsh = compile(g.FRAGMENT_SHADER, fs);

  g.attachShader(prog, vsh);
  g.attachShader(prog, fsh);
  g.linkProgram(prog);

  g.deleteShader(vsh);
  g.deleteShader(fsh);

  if (!g.getProgramParameter(prog, g.LINK_STATUS)) {
    const log = g.getProgramInfoLog(prog) || "(no log)";
    g.deleteProgram(prog);
    throw new Error("Program link failed: " + log);
  }

  this.prog = prog;

  this.aPos = g.getAttribLocation(prog, "aPos");
  this.uLogic = g.getUniformLocation(prog, "uLogic");
  this.uTex = g.getUniformLocation(prog, "uTex");
  this.uPos = g.getUniformLocation(prog, "uPos");
  this.uSize = g.getUniformLocation(prog, "uSize");
  this.uPivot = g.getUniformLocation(prog, "uPivot");
  this.uRot = g.getUniformLocation(prog, "uRot");
  this.uUV = g.getUniformLocation(prog, "uUV");
  this.uTexSize = g.getUniformLocation(prog, "uTexSize");
  this.uTint = g.getUniformLocation(prog, "uTint");

  // Unit quad (2 triangles) [0..1]
  const verts = new Float32Array([
    0, 0,  1, 0,  1, 1,
    0, 0,  1, 1,  0, 1,
  ]);

  const vao = g.createVertexArray();
  const vbo = g.createBuffer();
  if (!vao || !vbo) throw new Error("VAO/VBO create failed");

  this.vao = vao;
  this.vbo = vbo;

  g.bindVertexArray(vao);
  g.bindBuffer(g.ARRAY_BUFFER, vbo);
  g.bufferData(g.ARRAY_BUFFER, verts, g.STATIC_DRAW);
  g.enableVertexAttribArray(this.aPos);
  g.vertexAttribPointer(this.aPos, 2, g.FLOAT, false, 0, 0);
  g.bindVertexArray(null);
  g.bindBuffer(g.ARRAY_BUFFER, null);
  }

  begin(logicW: number, logicH: number, tex: WebGLTexture, texW: number, texH: number) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.uniform1i(this.uTex, 0);
    gl.uniform2f(this.uLogic, logicW, logicH);
    gl.uniform2f(this.uTexSize, texW, texH);
  }

  draw(posX: number, posY: number, w: number, h: number, pivotX: number, pivotY: number, rot: number,
       uvX: number, uvY: number, uvW: number, uvH: number,
       tintR = 1, tintG = 1, tintB = 1, tintA = 1) {
    const gl = this.gl;
    gl.uniform2f(this.uPos, posX, posY);
    gl.uniform2f(this.uSize, w, h);
    gl.uniform2f(this.uPivot, pivotX, pivotY);
    gl.uniform1f(this.uRot, rot);
    gl.uniform4f(this.uUV, uvX, uvY, uvW, uvH);
    gl.uniform4f(this.uTint, tintR, tintG, tintB, tintA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  end() {
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.useProgram(null);
  }
}
