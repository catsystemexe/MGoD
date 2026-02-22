import type { BaseRenderer } from "./BaseRenderer";

type MeshParams = {
  amp?: number;        // height amplitude
  freq?: number;       // wave frequency
  speed?: number;      // time speed
  tilt?: number;       // how much terrain goes down with depth
  persp?: number;      // perspective strength
  lineAlpha?: number;  // line alpha
  gridX?: number;      // number of vertical lines
  gridZ?: number;      // number of horizontal lines
};

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("MeshTerrainRenderer: createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "";
    gl.deleteShader(sh);
    throw new Error("MeshTerrainRenderer: shader compile failed: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("MeshTerrainRenderer: createProgram failed");
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) || "";
    gl.deleteProgram(p);
    throw new Error("MeshTerrainRenderer: program link failed: " + log);
  }
  return p;
}

export class MeshTerrainRenderer implements BaseRenderer {
  private gl: WebGL2RenderingContext | null = null;

  private prog: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;


  private vertCount = 0; // number of vertices in VBO (2 floats per vertex)
  private uTime: WebGLUniformLocation | null = null;
  private uScroll: WebGLUniformLocation | null = null;
  private uAmp: WebGLUniformLocation | null = null;
  private uFreq: WebGLUniformLocation | null = null;
  private uSpeed: WebGLUniformLocation | null = null;
  private uTilt: WebGLUniformLocation | null = null;
  private uXSpan: WebGLUniformLocation | null = null;
  private uPersp: WebGLUniformLocation | null = null;
  private uAlpha: WebGLUniformLocation | null = null;

  private w = 0;
  private h = 0;

  private time = 0;
  private scrollX = 0;
  private scrollY = 0;

  private mesh: Required<MeshParams> = {
    amp: 0.22,
    freq: 8.0,
    speed: 0.25,
    tilt: 1.25,
    persp: 1.35,
    lineAlpha: 0.22,
    gridX: 120,
    gridZ: 80,
  };

  init(gl: WebGL2RenderingContext, w: number, h: number): void {
    this.gl = gl;
    this.w = w;
    this.h = h;

    const VS = `#version 300 es
precision highp float;


layout(location=0) in vec2 aXZ; // x in [-1..1], z in [0..1] (depth)

uniform float uTime;
uniform vec2  uScroll;
uniform float uAmp;
uniform float uFreq;
uniform float uSpeed;
uniform float uTilt;
uniform float uPersp;
uniform float uXSpan;

float heightFn(float x, float z, float t) {
  float a = sin((x*1.3 + t*0.7) * uFreq);
  float b = sin((z*1.7 + t*0.4) * (uFreq*0.8));
  float c = sin((x*0.9 + z*0.6 + t*0.25) * (uFreq*0.55));
  return (a*0.55 + b*0.35 + c*0.25) * uAmp;
}

void main() {
  float t = uTime * uSpeed;

  // World scroll
  float x = (aXZ.x * uXSpan) + uScroll.x * 0.0008;

  // Base mesh depth in 0..1 (this defines what is FAR vs NEAR)
  float zBase = clamp(aXZ.y, 0.0, 1.0);

  // Projection depth can go slightly beyond 1 (for tail stability / scroll tricks)
  float zProj = aXZ.y + uScroll.y * 0.00025;
  zProj = clamp(zProj, 0.0, 1.2);


 // ✅ u tebe: z=0 je NEAR, z=1 je FAR
float nearW = 1.0 - zBase;  // 1 near → 0 far
float farW  = zBase;        // 0 near → 1 far

  // Height uses projection depth so even the >1 region animates nicely
  float y = heightFn(x, zProj, t);

  // Perspective projection uses zProj
  float denom = 0.80 + zProj * uPersp;
  float px = x / denom;

  // 1) TILT: pushes NEAR down (apply in world space before projection)
  float yTilt = -(nearW * uTilt);

  float py = (y + yTilt) / denom;

  // 2) FAR lift: affects FAR only (apply AFTER projection -> intuitive)
  const float FAR_LIFT = 0.55;   // + = horizon UP
  py += farW * FAR_LIFT;

  // 3) NEAR drop: affects NEAR only (apply AFTER projection -> intuitive)
  const float NEAR_DROP = 0.20;  // + = front edge DOWN
  py -= nearW * NEAR_DROP;

  // Global composition shift (small)
  vec2 clip = vec2(px, py + 0.12);
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

    const FS = `#version 300 es
precision highp float;
out vec4 o;
uniform float uAlpha;
void main() {
  o = vec4(1.0, 1.0, 1.0, uAlpha);
}
`;

    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    const prog = link(gl, vs, fs);

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.prog = prog;

    this.uTime = gl.getUniformLocation(prog, "uTime");
    this.uScroll = gl.getUniformLocation(prog, "uScroll");
    this.uAmp = gl.getUniformLocation(prog, "uAmp");
    this.uFreq = gl.getUniformLocation(prog, "uFreq");
    this.uSpeed = gl.getUniformLocation(prog, "uSpeed");
    this.uTilt = gl.getUniformLocation(prog, "uTilt");
    this.uXSpan = gl.getUniformLocation(prog, "uXSpan");
    this.uPersp = gl.getUniformLocation(prog, "uPersp");
    this.uAlpha = gl.getUniformLocation(prog, "uAlpha");

    // geometry buffer (lines grid)
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    if (!this.vao || !this.vbo) throw new Error("MeshTerrainRenderer: VAO/VBO create failed");

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    // build once; can be rebuilt by calling rebuild()
    const data = this.buildGrid(this.mesh.gridX, this.mesh.gridZ);
    this.vertCount = (data.length / 2) | 0;
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * 4, 0);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private buildGrid(gridX: number, gridZ: number): Float32Array {
    // x lines: vertical lines along depth
    // z lines: horizontal lines across x
    const gx = Math.max(8, Math.min(400, Math.floor(gridX)));
    const gz = Math.max(8, Math.min(300, Math.floor(gridZ)));

    // lines count:
    // vertical: gx lines each with 2 points per segment across gz-1 segments -> (gz * 2) vertices
    // horizontal: gz lines each with (gx * 2) vertices
    const vCount = gx * (gz * 2) + gz * (gx * 2);
    const out = new Float32Array(vCount * 2);

    let k = 0;

    // vertical lines (constant x, varying z)
    for (let ix = 0; ix < gx; ix++) {
      const x = -1 + (2 * ix) / (gx - 1);
      for (let iz = 0; iz < gz; iz++) {
        const z = iz / (gz - 1);
        // each line is drawn as segments; easiest: emit as a polyline in LINES pairs:
        // we connect consecutive points by emitting pairs (p(i), p(i+1))
        if (iz < gz - 1) {
          const z2 = (iz + 1) / (gz - 1);
          out[k++] = x;  out[k++] = z;
          out[k++] = x;  out[k++] = z2;
        }
      }
    }

    // horizontal lines (constant z, varying x)
    for (let iz = 0; iz < gz; iz++) {
      const z = iz / (gz - 1);
      for (let ix = 0; ix < gx; ix++) {
        const x = -1 + (2 * ix) / (gx - 1);
        if (ix < gx - 1) {
          const x2 = -1 + (2 * (ix + 1)) / (gx - 1);
          out[k++] = x;  out[k++] = z;
          out[k++] = x2; out[k++] = z;
        }
      }
    }

    // k might be slightly smaller than allocated (because we didn't use last point in each strip)
    // If so, return a subarray copy to exact length.
    if (k !== out.length) return out.slice(0, k);
    return out;
  }

  rebuild(args: any): void {
    if (!this.gl || !this.vbo) return;

    const mp: MeshParams | undefined = args?.mesh;
    if (mp && typeof mp === "object") {
      this.mesh = {
        amp: Number.isFinite(mp.amp as any) ? Number(mp.amp) : this.mesh.amp,
        freq: Number.isFinite(mp.freq as any) ? Number(mp.freq) : this.mesh.freq,
        speed: Number.isFinite(mp.speed as any) ? Number(mp.speed) : this.mesh.speed,
        tilt: Number.isFinite(mp.tilt as any) ? Number(mp.tilt) : this.mesh.tilt,
        persp: Number.isFinite(mp.persp as any) ? Number(mp.persp) : this.mesh.persp,
        lineAlpha: Number.isFinite(mp.lineAlpha as any) ? Number(mp.lineAlpha) : this.mesh.lineAlpha,
        gridX: Number.isFinite(mp.gridX as any) ? Math.floor(Number(mp.gridX)) : this.mesh.gridX,
        gridZ: Number.isFinite(mp.gridZ as any) ? Math.floor(Number(mp.gridZ)) : this.mesh.gridZ,
      };
    }

    const gl = this.gl;
    const data = this.buildGrid(this.mesh.gridX, this.mesh.gridZ);
      this.vertCount = (data.length / 2) | 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  setUniforms(params: any, time: number, scroll: any, _mouse: any): void {
    this.time = Number(time ?? 0);
    this.scrollX = Number(scroll?.x ?? 0);
    this.scrollY = Number(scroll?.y ?? 0);

    const mp: MeshParams = params?.mesh ?? params?.common?.mesh ?? {};
    // allow patching via layer.params.mesh or common.mesh later
    if (mp && typeof mp === "object") {
      if (mp.amp !== undefined) this.mesh.amp = Number(mp.amp) || this.mesh.amp;
      if (mp.freq !== undefined) this.mesh.freq = Number(mp.freq) || this.mesh.freq;
      if (mp.speed !== undefined) this.mesh.speed = Number(mp.speed) || this.mesh.speed;
      if (mp.tilt !== undefined) this.mesh.tilt = Number(mp.tilt) || this.mesh.tilt;
      if (mp.persp !== undefined) this.mesh.persp = Number(mp.persp) || this.mesh.persp;
      if (mp.lineAlpha !== undefined) this.mesh.lineAlpha = Number(mp.lineAlpha) || this.mesh.lineAlpha;
      if ((mp as any).xSpan !== undefined)
        (this.mesh as any).xSpan =
          Number((mp as any).xSpan) || (this.mesh as any).xSpan;
    }
  }

  draw(): void {
    const gl = this.gl;
    if (!gl || !this.prog || !this.vao) return;

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.uniform1f(this.uTime, this.time);
    gl.uniform2f(this.uScroll, this.scrollX, this.scrollY);
    gl.uniform1f(this.uAmp, this.mesh.amp);
    gl.uniform1f(this.uFreq, this.mesh.freq);
    gl.uniform1f(this.uSpeed, this.mesh.speed);
    gl.uniform1f(this.uTilt, this.mesh.tilt);
    gl.uniform1f(this.uPersp, this.mesh.persp);
    gl.uniform1f(this.uXSpan, (this.mesh as any).xSpan ?? 2.8);
    gl.uniform1f(this.uAlpha, this.mesh.lineAlpha);

    // keep as simple as possible: caller manages blend
          const n = this.vertCount | 0;
      if (n > 0) gl.drawArrays(gl.LINES, 0, n);
    // NOTE: WebGL ignores vertices beyond enabled buffer; this is intentional "no state readback".
    // If you want exact count, store and use it.
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;

    try { if (this.vbo) gl.deleteBuffer(this.vbo); } catch {}
    try { if (this.vao) gl.deleteVertexArray(this.vao); } catch {}
    try { if (this.prog) gl.deleteProgram(this.prog); } catch {}

    this.vbo = null;
    this.vao = null;
    this.prog = null;
    this.gl = null;
  }
}
