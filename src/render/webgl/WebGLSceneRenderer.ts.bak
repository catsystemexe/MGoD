import type { EntityStore } from "../../engine/ecs/EntityStore";

type Vec2 = { x: number; y: number };
type HasPos = { pos: Vec2 };
type HasKind = { kind?: string; type?: string; tag?: string };
type HasRadius = { radius?: number };
type HasRender = { render?: { color?: string } };
function readKind(e: any): string | null {
  const k = e as HasKind;
  return (k.kind ?? k.type ?? k.tag ?? null) as any;
}


function hexToRgb01(hex: string): [number, number, number] | null {
  const h = String(hex).trim();
  const m = /^#?([0-9a-fA-F]{6})$/.exec(h);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return [r, g, b];
}


function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS);
  if (!ok) {
    const log = gl.getShaderInfoLog(sh) || "(no log)";
    gl.deleteShader(sh);
    throw new Error("Shader compile failed: " + log);
  }
  return sh;
}

function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  if (!prog) throw new Error("createProgram failed");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  const ok = gl.getProgramParameter(prog, gl.LINK_STATUS);
  if (!ok) {
    const log = gl.getProgramInfoLog(prog) || "(no log)";
    gl.deleteProgram(prog);
    throw new Error("Program link failed: " + log);
  }
  return prog;
}

export class WebGLSceneRenderer {
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;

  private aPos: number;

  private uLogic: WebGLUniformLocation;
  private uPos: WebGLUniformLocation;
  private uSize: WebGLUniformLocation;
  private uColor: WebGLUniformLocation;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly store: EntityStore<any>,
    private readonly logicW: number,
    private readonly logicH: number,
  ) {
    // IMPORTANT: do NOT "const gl = this.gl" here; parameter is already named gl.

    const vs = `#version 300 es
      in vec2 aPos;          // unit quad in [0..1]
      uniform vec2 uLogic;   // logicW, logicH
      uniform vec2 uPos;     // center position in logic px
      uniform vec2 uSize;    // size in logic px
      void main() {
        vec2 p = uPos + (aPos - vec2(0.5)) * uSize;
        vec2 ndc = vec2(
          (p.x / uLogic.x) * 2.0 - 1.0,
          1.0 - (p.y / uLogic.y) * 2.0
        );
        gl_Position = vec4(ndc, 0.0, 1.0);
      }
    `;

    const fs = `#version 300 es
      precision mediump float;
      uniform vec4 uColor;
      out vec4 outColor;
      void main() { outColor = uColor; }
    `;

    this.prog = createProgram(gl, vs, fs);

    const aPos = gl.getAttribLocation(this.prog, "aPos");
    if (aPos < 0) throw new Error("aPos attrib not found");
    this.aPos = aPos;

    const uLogic = gl.getUniformLocation(this.prog, "uLogic");
    const uPos = gl.getUniformLocation(this.prog, "uPos");
    const uSize = gl.getUniformLocation(this.prog, "uSize");
    const uColor = gl.getUniformLocation(this.prog, "uColor");
    if (!uLogic || !uPos || !uSize || !uColor) {
      throw new Error("Uniform location missing (uLogic/uPos/uSize/uColor)");
    }
    this.uLogic = uLogic;
    this.uPos = uPos;
    this.uSize = uSize;
    this.uColor = uColor;

    // Unit quad (two triangles) in [0..1]
    const verts = new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      0, 1,
      1, 0,
      1, 1,
    ]);

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error("Failed to create VAO/VBO");
    this.vao = vao;
    this.vbo = vbo;

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
  }

  /** Draw into CURRENT framebuffer (SceneRT is already bound + cleared by Graphics). */
  render(): void {
    const gl = this.gl;

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.uniform2f(this.uLogic, this.logicW, this.logicH);

this.store.debugForEachAlive((_ref, e: any) => {
  if (!e) return;

  const kind = readKind(e);
  const pos = (e as HasPos).pos;
  if (!pos || !kind) return;

  let w = 6, h = 6;
  const r = (e as HasRadius).radius;

  if (kind === "player") {
    w = 6;
    h = 6;
    gl.uniform4f(this.uColor, 1, 1, 1, 1);
  } else if (kind === "enemy") {
    const rr = (typeof r === "number" ? r : 4);
    w = rr * 2;
    h = rr * 2;

    const col = (e as HasRender).render?.color;
    const rgb = (typeof col === "string") ? hexToRgb01(col) : null;
    if (rgb) gl.uniform4f(this.uColor, rgb[0], rgb[1], rgb[2], 1);
    else gl.uniform4f(this.uColor, 1, 0, 0, 1);
  } else if (kind === "projectile") {
    w = 3;
    h = 2;
    gl.uniform4f(this.uColor, 0, 1, 0, 1);
  } else if (kind === "bomb") {
    const rr = (typeof r === "number" ? r : 6);
    w = rr * 2;
    h = rr * 2;
    gl.uniform4f(this.uColor, 1, 1, 0, 1);
  } else {
    w = 4;
    h = 4;
    gl.uniform4f(this.uColor, 0, 1, 1, 1);
  }

  gl.uniform2f(this.uPos, pos.x, pos.y);
  gl.uniform2f(this.uSize, w, h);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
});
     }
   }