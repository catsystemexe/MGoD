import { GpuMesh } from "./GpuMesh";

// ─── types ───────────────────────────────────────────────────────────

export type MeshDrawArgs = {
  mesh: GpuMesh;
  x: number;
  y: number;
  scale: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  color: [number, number, number];
};

export type MeshPass = {
  draw(args: MeshDrawArgs): void;
  resize(logicW: number, logicH: number): void;
  dispose(): void;
};

// ─── shaders ─────────────────────────────────────────────────────────

const VS_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat4 uModel;
uniform mat4 uProj;

out vec3 vNormal;
out vec3 vWorldPos;

void main() {
  vec4 worldPos = uModel * vec4(aPosition, 1.0);
  vWorldPos     = worldPos.xyz;
  vNormal       = normalize(mat3(uModel) * aNormal);
  gl_Position   = uProj * worldPos;
}
`;

const FS_SRC = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vWorldPos;

uniform vec3  uColor;
uniform vec3  uLightDir;
uniform float uAmbient;

out vec4 outColor;

void main() {
  outColor = vec4(1.0, 0.0, 0.0, 1.0);
}
`;

// ─── mat4 helpers (column-major Float32Array) ────────────────────────

function mat4Identity(): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r]      * b[c * 4]     +
        a[4 + r]  * b[c * 4 + 1] +
        a[8 + r]  * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function mat4Translate(tx: number, ty: number, tz: number): Float32Array {
  const m = mat4Identity();
  m[12] = tx; m[13] = ty; m[14] = tz;
  return m;
}

function mat4RotateX(angle: number): Float32Array {
  const m = mat4Identity();
  const c = Math.cos(angle), s = Math.sin(angle);
  m[5] = c;  m[6] = s;
  m[9] = -s; m[10] = c;
  return m;
}

function mat4RotateY(angle: number): Float32Array {
  const m = mat4Identity();
  const c = Math.cos(angle), s = Math.sin(angle);
  m[0] = c;  m[2] = -s;
  m[8] = s;  m[10] = c;
  return m;
}

function mat4RotateZ(angle: number): Float32Array {
  const m = mat4Identity();
  const c = Math.cos(angle), s = Math.sin(angle);
  m[0] = c;  m[1] = s;
  m[4] = -s; m[5] = c;
  return m;
}

function mat4Scale(sx: number, sy: number, sz: number): Float32Array {
  const m = new Float32Array(16);
  m[0] = sx; m[5] = sy; m[10] = sz; m[15] = 1;
  return m;
}

function mat4Ortho(
  l: number, r: number,
  b: number, t: number,
  n: number, f: number,
): Float32Array {
  const m = new Float32Array(16);
  m[0]  = 2 / (r - l);
  m[5]  = 2 / (t - b);
  m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l);
  m[13] = -(t + b) / (t - b);
  m[14] = -(f + n) / (f - n);
  m[15] = 1;
  return m;
}

// ─── shader compilation ──────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("MeshPass: createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "";
    console.error("[MeshPass] shader compile failed:", log);
    gl.deleteShader(sh);
    throw new Error("MeshPass: shader compile failed: " + log);
  }
  return sh;
}

function buildProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  if (!prog) throw new Error("MeshPass: createProgram failed");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || "";
    console.error("[MeshPass] program link failed:", log);
    gl.deleteProgram(prog);
    throw new Error("MeshPass: program link failed: " + log);
  }
  return prog;
}

// ─── factory ─────────────────────────────────────────────────────────

export function createMeshPass(
  gl: WebGL2RenderingContext,
  logicW: number,
  logicH: number,
): MeshPass {
  // 1. Compile & link
  const prog = buildProgram(gl, VS_SRC, FS_SRC);

  // 2. Uniform locations
  const uModel    = gl.getUniformLocation(prog, "uModel");
  const uProj     = gl.getUniformLocation(prog, "uProj");
  const uColor    = gl.getUniformLocation(prog, "uColor");
  const uLightDir = gl.getUniformLocation(prog, "uLightDir");
  const uAmbient  = gl.getUniformLocation(prog, "uAmbient");

  // 3. Orthographic projection (screen-pixel space, Y-flip)
  let projMatrix = mat4Ortho(0, logicW, logicH, 0, -1000, 1000);

  // 4. Fixed lighting
  const len = Math.hypot(0.5, 0.8, 1.0);
  const lightDir = new Float32Array([0.5 / len, 0.8 / len, 1.0 / len]);
  const ambient = 0.35;

  // 5. draw
  function draw(args: MeshDrawArgs): void {
    console.log('[MeshPass] draw() called, vao:', !!args.mesh.vao,
      'indexCount:', args.mesh.indexCount);
    gl.useProgram(prog);

    const model = mat4Multiply(
      mat4Multiply(
        mat4Multiply(
          mat4Translate(args.x, args.y, 0),
          mat4RotateX(args.rotX),
        ),
        mat4Multiply(
          mat4RotateY(args.rotY),
          mat4RotateZ(args.rotZ),
        ),
      ),
      mat4Scale(args.scale, args.scale, args.scale),
    );

    gl.uniformMatrix4fv(uModel, false, model);
    gl.uniformMatrix4fv(uProj, false, projMatrix);
    gl.uniform3fv(uColor, args.color);
    gl.uniform3fv(uLightDir, lightDir);
    gl.uniform1f(uAmbient, ambient);

    gl.bindVertexArray(args.mesh.vao);
    gl.drawElements(gl.TRIANGLES, args.mesh.indexCount, args.mesh.indexType, 0);
    gl.bindVertexArray(null);
  }

  // 6. resize
  function resize(w: number, h: number): void {
    projMatrix = mat4Ortho(0, w, h, 0, -1000, 1000);
  }

  // 7. dispose
  function dispose(): void {
    gl.deleteProgram(prog);
  }

  return { draw, resize, dispose };
}
