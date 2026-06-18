import { FLOW_PRESETS, FlowPreset, FlowLayerId } from "./flowPresets";
import {
  SegParticle,
  FlowDisturbance,
  stepFlowParticle,
  clamp,
  rand01,
  lerp,
  normalize2,
} from "./flowStep";

const NO_DISTURB: readonly FlowDisturbance[] = [];

export type FlowBgDrawArgs = {
  logicW: number;
  logicH: number;
  timeSec: number;
  scrollX: number;
  scrollY: number;
  presetIndex: number;
  // Active localized disturbances (explosions/hits), screen-space. Empty/omitted
  // => particles step exactly as before (fully backward compatible).
  disturbances?: readonly FlowDisturbance[];
};

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("FlowBG: createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "";
    gl.deleteShader(sh);
    throw new Error("FlowBG: Shader compile failed: " + log);
  }
  return sh;
}

function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  if (!p) throw new Error("FlowBG: createProgram failed");
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) || "";
    gl.deleteProgram(p);
    throw new Error("FlowBG: Program link failed: " + log);
  }
  return p;
}

export class FlowSegmentsBg {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;

  private aPos: number;

  private uLogic: WebGLUniformLocation;
  private uA: WebGLUniformLocation;
  private uB: WebGLUniformLocation;
  private uThick: WebGLUniformLocation;
  private uColor: WebGLUniformLocation;

  private layers: Record<FlowLayerId, SegParticle[]> = { far: [], mid: [], near: [] };

  private lastTimeSec = NaN;
  private lastPresetId = "";

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;

    // unit quad [-0.5..0.5]x[-0.5..0.5]
    const vs = `#version 300 es
      in vec2 aPos;

      uniform vec2 uLogic;
      uniform vec2 uA;
      uniform vec2 uB;
      uniform float uThick;

      void main() {
        vec2 a = uA;
        vec2 b = uB;
        vec2 d = b - a;
        float len = max(0.0001, length(d));
        vec2 dir = d / len;
        vec2 n = vec2(-dir.y, dir.x);

        // aPos.x selects along segment (0..1), aPos.y selects thickness (-0.5..0.5)
        float t = aPos.x + 0.5;
        float s = aPos.y;

        vec2 p = mix(a, b, t) + n * (s * uThick);

        // logic -> NDC
        vec2 ndc = (p / uLogic) * 2.0 - 1.0;
        gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
      }
    `;

    const fs = `#version 300 es
      precision highp float;
      uniform vec4 uColor;
      out vec4 outColor;
      void main() {
        outColor = uColor;
      }
    `;

    this.prog = createProgram(gl, vs, fs);

    const aPos = gl.getAttribLocation(this.prog, "aPos");
    if (aPos < 0) throw new Error("FlowBG: aPos attrib not found");
    this.aPos = aPos;

    const uLogic = gl.getUniformLocation(this.prog, "uLogic");
    const uA = gl.getUniformLocation(this.prog, "uA");
    const uB = gl.getUniformLocation(this.prog, "uB");
    const uThick = gl.getUniformLocation(this.prog, "uThick");
    const uColor = gl.getUniformLocation(this.prog, "uColor");
    if (!uLogic || !uA || !uB || !uThick || !uColor) throw new Error("FlowBG: uniform missing");

    this.uLogic = uLogic;
    this.uA = uA;
    this.uB = uB;
    this.uThick = uThick;
    this.uColor = uColor;

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error("FlowBG: VAO/VBO create failed");
    this.vao = vao;
    this.vbo = vbo;

    const verts = new Float32Array([
      -0.5, -0.5,
       0.5, -0.5,
      -0.5,  0.5,
      -0.5,  0.5,
       0.5, -0.5,
       0.5,  0.5,
    ]);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private preset(i: number): FlowPreset {
    const n = FLOW_PRESETS.length;
    const ix = n > 0 ? ((i % n) + n) % n : 0;
    return FLOW_PRESETS[ix] || FLOW_PRESETS[0];
  }

  private rebuildIfNeeded(pr: FlowPreset, logicW: number, logicH: number): void {
    if (this.lastPresetId === pr.id && this.layers.far.length > 0) return;

    this.lastPresetId = pr.id;
    this.lastTimeSec = NaN;

    this.layers.far = [];
    this.layers.mid = [];
    this.layers.near = [];

    const base = pr.spawn.countBase;
    const pad = pr.spawn.respawnPaddingPx;

    const dir = normalize2(pr.direction.x, pr.direction.y);

    const makeLayer = (layerId: FlowLayerId, layerIndex: number, densityMul: number) => {
      const count = Math.max(1, Math.floor(base * densityMul));
      const arr: SegParticle[] = new Array(count);

      const lanes = pr.spawn.distribution === "lanes" ? (pr.spawn.lanes?.count ?? 8) : 1;
      const laneH = logicH / lanes;

      for (let i = 0; i < count; i++) {
        const seed = (layerIndex + 1) * 10000 + i * 17.23;

        // lanes
        const laneId = pr.spawn.distribution === "lanes" ? (i % lanes) : 0;
        const laneY = (laneId + 0.5) * laneH;

        const yJ = pr.spawn.distribution === "lanes"
          ? (rand01(seed + 1.1) - 0.5) * 2 * (pr.spawn.lanes?.jitterYPx ?? 0)
          : (rand01(seed + 1.2) - 0.5) * 2 * (pr.spawn.yJitterPx ?? 0);


// start just off the right edge (so flow enters from the right)
        const x0 = logicW + pad + rand01(seed + 2.1) * (pad * 2);
        const y0 = clamp(laneY + yJ + (rand01(seed + 2.2) - 0.5) * laneH * 0.20, -pad, logicH + pad);

        const lenMin = pr.segments.lengthPx.min;
        const lenMax = pr.segments.lengthPx.max;
        const len0 = lerp(lenMin, lenMax, rand01(seed + 3.3));

        const spMul0 = 1.0;

        const meEnabled = !!pr.motion.yMeander?.enabled;
        const meAmp = meEnabled ? lerp(pr.motion.yMeander!.ampPx.min, pr.motion.yMeander!.ampPx.max, rand01(seed + 4.4)) : 0;
        const meHz = meEnabled ? lerp(pr.motion.yMeander!.freqHz.min, pr.motion.yMeander!.freqHz.max, rand01(seed + 5.5)) : 0;
        const mePh = rand01(seed + 6.6) * Math.PI * 2;

        arr[i] = {
          x: x0,
          y: y0,
          vx: dir[0],
          vy: dir[1],
          len: len0,
          laneId,
          laneY,
          meanderAmp: meAmp,
          meanderHz: meHz,
          meanderPhase: mePh,

          spMul: spMul0,
          spMulTarget: spMul0,
          spMulT: 0,

          lenTarget: len0,
          lenT: 0,
        };
      }

      return arr;
    };

    for (const pl of pr.parallax) {
      this.layers[pl.layer] = makeLayer(pl.layer, pl.layer === "far" ? 0 : pl.layer === "mid" ? 1 : 2, pl.densityMul);
    }
  }

  draw(args: FlowBgDrawArgs): void {
    const gl = this.gl;
    const pr = this.preset(args.presetIndex);

    this.rebuildIfNeeded(pr, args.logicW, args.logicH);

    const disturbances = args.disturbances ?? NO_DISTURB;
    const t = args.timeSec;
    const dt = Number.isFinite(this.lastTimeSec) ? clamp(t - this.lastTimeSec, 0, 1 / 15) : 1 / 60;
    this.lastTimeSec = t;

    // ✅ We need alpha compositing to build a "water layer"
    // ✅ deterministic overlay: no depth test/write (prevents flicker with other passes)
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.uniform2f(this.uLogic, args.logicW, args.logicH);

    // draw 3 layers back-to-front
    const order: FlowLayerId[] = ["far", "mid", "near"];
    for (const layerId of order) {
      const pl = pr.parallax.find(x => x.layer === layerId);
      if (!pl) continue;

      const par = pl.factor;
      // Screen-space flow: ignore world scroll (prevents "drifting" with camera)
      const scrollX = 0;
      const scrollY = 0;

      // layer color
      const c = pr.colors?.[layerId] ?? (
        layerId === "far" ? [0.55, 0.85, 1.0, 0.14] :
        layerId === "mid" ? [0.75, 0.95, 1.0, 0.20] :
                            [0.90, 1.00, 1.0, 0.26]
      );
      gl.uniform4f(this.uColor, c[0], c[1], c[2], c[3]);
      gl.uniform1f(this.uThick, Math.max(1, pr.segments.thicknessPx));

      const arr = this.layers[layerId];
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];

        // update
        stepFlowParticle(p, pr, dt, t, layerId, args.logicW, args.logicH, disturbances);

        // segment endpoints (world -> screen) using scroll (parallax)
        const x = p.x - scrollX;
        const y = p.y - scrollY;

        // length coupling by speed (optional)
        let L = p.len;
        if (pr.segments.lengthPx.speedCoupling?.enabled) {
          const g = pr.segments.lengthPx.speedCoupling.gain;
          const cl = pr.segments.lengthPx.speedCoupling.clamp;
          const sp = pr.motion.speedPxPerSec.base * (pr.motion.speedPxPerSec.layerMul[layerId] ?? 1);
          const add = sp * g;
          L = clamp(L + add * 0.02, cl.min, cl.max);
        }

        const dir = normalize2(p.vx, p.vy);
        const ax = x;
        const ay = y;
        const bx = x - dir[0] * L;
        const by = y - dir[1] * L;

        gl.uniform2f(this.uA, ax, ay);
        gl.uniform2f(this.uB, bx, by);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }

    gl.bindVertexArray(null);
  }
}

export { FLOW_PRESETS };
