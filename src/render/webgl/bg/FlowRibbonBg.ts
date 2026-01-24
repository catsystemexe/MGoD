import { FLOW_PRESETS, FlowPreset, FlowLayerId } from "./flowPresets";

function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function rand01(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("FlowRibbonBg: createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "";
    gl.deleteShader(sh);
    throw new Error("FlowRibbonBg: Shader compile failed: " + log);
  }
  return sh;
}

function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  if (!p) throw new Error("FlowRibbonBg: createProgram failed");
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) || "";
    gl.deleteProgram(p);
    throw new Error("FlowRibbonBg: Program link failed: " + log);
  }
  return p;
}

export type FlowBgDrawArgs = {
  logicW: number;
  logicH: number;
  timeSec: number;
  scrollX: number;
  scrollY: number;
  presetIndex: number;
};

type LayerState = {
  phaseX: number; // moves left over time (wrap)
  seed: number;
};

export class FlowRibbonBg {
  private gl: WebGL2RenderingContext;

  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;

  private aPos: number;
  private aV: number;

  private uLogic: WebGLUniformLocation;
  private uColor: WebGLUniformLocation;

  private lastTimeSec = NaN;
  private lastPresetId = "";

  private layerState: Record<FlowLayerId, LayerState> = {
    far: { phaseX: 0, seed: 101 },
    mid: { phaseX: 0, seed: 202 },
    near: { phaseX: 0, seed: 303 },
  };

  // dynamic CPU buffer reused each draw
  private buf: Float32Array = new Float32Array(0);

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;

    // Vertex = [x,y] in logic space + v = -1..1 across ribbon thickness
    const vs = `#version 300 es
      in vec2 aPos;
      in float aV;

      uniform vec2 uLogic;

      out float vV;

      void main() {
        vV = aV;
        vec2 ndc = (aPos / uLogic) * 2.0 - 1.0;
        gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
      }
    `;

    const fs = `#version 300 es
      precision highp float;

      uniform vec4 uColor;
      in float vV;
      out vec4 outColor;

      void main() {
        // soft edges: vV = -1..1, center=0
        float edge = 1.0 - clamp(abs(vV), 0.0, 1.0);
        // slightly sharpen center without hard aliasing
        edge = pow(edge, 1.35);
        outColor = vec4(uColor.rgb, uColor.a * edge);
      }
    `;

    this.prog = createProgram(gl, vs, fs);

    const aPos = gl.getAttribLocation(this.prog, "aPos");
    const aV = gl.getAttribLocation(this.prog, "aV");
    if (aPos < 0 || aV < 0) throw new Error("FlowRibbonBg: attrib missing");
    this.aPos = aPos;
    this.aV = aV;

    const uLogic = gl.getUniformLocation(this.prog, "uLogic");
    const uColor = gl.getUniformLocation(this.prog, "uColor");
    if (!uLogic || !uColor) throw new Error("FlowRibbonBg: uniform missing");
    this.uLogic = uLogic;
    this.uColor = uColor;

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error("FlowRibbonBg: VAO/VBO create failed");
    this.vao = vao;
    this.vbo = vbo;

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    // interleaved: x,y,v
    const stride = 3 * 4;

    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(this.aV);
    gl.vertexAttribPointer(this.aV, 1, gl.FLOAT, false, stride, 2 * 4);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private preset(i: number): FlowPreset {
    const n = FLOW_PRESETS.length;
    const ix = n > 0 ? ((i % n) + n) % n : 0;
    return FLOW_PRESETS[ix] || FLOW_PRESETS[0];
  }

  private rebuildIfNeeded(pr: FlowPreset): void {
    if (this.lastPresetId === pr.id) return;
    this.lastPresetId = pr.id;
    this.lastTimeSec = NaN;

    // reset phases deterministically per preset
    this.layerState.far.phaseX = 0;
    this.layerState.mid.phaseX = 0;
    this.layerState.near.phaseX = 0;

    // tweak seeds from preset id (stable-ish)
    const h = Array.from(pr.id).reduce((a, c) => (a * 33 + c.charCodeAt(0)) | 0, 5381) >>> 0;
    this.layerState.far.seed = (h ^ 0xA1B2C3) >>> 0;
    this.layerState.mid.seed = (h ^ 0x334455) >>> 0;
    this.layerState.near.seed = (h ^ 0x778899) >>> 0;
  }

  // produces smooth “water ribbons” (many thin triangle strips)
  private drawLayerLanes(
    pr: FlowPreset,
    layerId: FlowLayerId,
    dt: number,
    t: number,
    logicW: number,
    logicH: number
  ): void {
    const gl = this.gl;

    // keep the “layer exists in parallax” contract (even if we ignore factor here)
    const pl = pr.parallax.find(x => x.layer === layerId);
    if (!pl) return;

void pl;

    const lanes = Number.isFinite(ov?.ribbonLanes)
    ? (ov.ribbonLanes | 0)
    : (pr.ribbon?.lanes ?? (pr.spawn.distribution === "lanes" ? (pr.spawn.lanes?.count ?? 10) : 10));
    const layerMul = pr.motion.speedPxPerSec.layerMul[layerId] ?? 1.0;
    const baseSpeed = pr.motion.speedPxPerSec.base * layerMul;

    // ribbon sampling along X
    const stepPx = Number.isFinite(ov?.ribbonStepPx)
    ? (ov.ribbonStepPx | 0)
    : (pr.ribbon?.stepPx ?? 7);
    const xPad = 96;
    const nodes = Math.max(8, Math.ceil((logicW + xPad * 2) / stepPx) + 2);
    const x0 = -xPad;

    // thickness per layer
    const thickBase = Math.max(1, pr.segments.thicknessPx);
    let tm = (pr.ribbon?.thicknessMul?.[layerId] ?? 1.0);
      if (layerId === "far" && Number.isFinite(ov?.thicknessMulFar)) tm = ov.thicknessMulFar;
      if (layerId === "mid" && Number.isFinite(ov?.thicknessMulMid)) tm = ov.thicknessMulMid;
      if (layerId === "near" && Number.isFinite(ov?.thicknessMulNear)) tm = ov.thicknessMulNear;
      const thick = thickBase * tm;

    // meander amplitude/freq
    const ampMin = pr.motion.yMeander?.enabled ? pr.motion.yMeander.ampPx.min : 0.0;
    const ampMax = pr.motion.yMeander?.enabled ? pr.motion.yMeander.ampPx.max : 0.0;
    const hzMin = pr.motion.yMeander?.enabled ? pr.motion.yMeander.freqHz.min : 0.0;
    const hzMax = pr.motion.yMeander?.enabled ? pr.motion.yMeander.freqHz.max : 0.0;

    // phase (move left); wrap by full width to avoid periodic snapping shimmer
    const st = this.layerState[layerId];
    const wrapW = logicW + xPad * 2;
    st.phaseX += baseSpeed * dt;
    if (st.phaseX > 1e9) st.phaseX = st.phaseX % wrapW;

    // buffer sizing
    const floatsPerVert = 3;
    const vertsPerLane = nodes * 2;
    const totalVerts = lanes * vertsPerLane;
    const need = totalVerts * floatsPerVert;
    if (this.buf.length < need) this.buf = new Float32Array(need);

    let w = 0;
    const laneStarts = new Int32Array(lanes);

    // optional: vertical spread from preset
    const yJ =
      pr.spawn.distribution === "uniform_y"
        ? (pr.spawn.yJitterPx ?? 0)
        : (pr.spawn.lanes?.jitterYPx ?? 0);

    for (let laneId = 0; laneId < lanes; laneId++) {
      const seed = st.seed + laneId * 97.13;

      // stable pseudo-random Y across the full height (kills banding)
      const guard = Math.max(2, thick * 0.75);
      const baseY = guard + rand01(seed + 9.1) * Math.max(1, logicH - guard * 2);

      // small stable jitter
      const laneJ = (rand01(seed + 4.4) - 0.5) * 2.0 * yJ;

      laneStarts[laneId] = (w / floatsPerVert) | 0;

      const amp = lerp(ampMin, ampMax, rand01(seed + 1.1));
      const hz = lerp(hzMin, hzMax, rand01(seed + 2.2));
      const ph = rand01(seed + 3.3) * Math.PI * 2;

      for (let i = 0; i < nodes; i++) {
        const x = x0 + (i * stepPx) - (st.phaseX % wrapW);

        let y = baseY + laneJ;
        if (pr.motion.yMeander?.enabled) {
          const coup = pr.motion.yMeander.xPhaseCoupling;
          const wHz = Math.PI * 2 * hz;
          y += Math.sin((t * wHz) + ph + x * coup) * amp;
        }

        const yTop = y - thick * 0.5;
        const yBot = y + thick * 0.5;

        // top
        this.buf[w++] = x;
        this.buf[w++] = yTop;
        this.buf[w++] = -1;

        // bottom
        this.buf[w++] = x;
        this.buf[w++] = yBot;
        this.buf[w++] = +1;
      }
    }

    // upload once per layer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.buf.subarray(0, w), gl.DYNAMIC_DRAW);

    // draw lanes
    for (let laneId = 0; laneId < lanes; laneId++) {
      gl.drawArrays(gl.TRIANGLE_STRIP, laneStarts[laneId], vertsPerLane);
    }
  }

  draw(args: FlowBgDrawArgs): void {
    const gl = this.gl;
    const pr = this.preset(args.presetIndex);

    this.rebuildIfNeeded(pr);

    const t = args.timeSec;
    const dt = Number.isFinite(this.lastTimeSec) ? clamp(t - this.lastTimeSec, 0, 1 / 15) : 1 / 60;
    this.lastTimeSec = t;

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    gl.enable(gl.BLEND);const blend = String(ov?.blend ?? "add");
      if (blend === "alpha") gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      else gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.uniform2f(this.uLogic, args.logicW, args.logicH);

    const order: FlowLayerId[] = ["far", "mid", "near"];
    for (const layerId of order) {
      const c =
        pr.colors?.[layerId] ??
        (layerId === "far"
          ? [0.55, 0.85, 1.0, 0.14]
          : layerId === "mid"
            ? [0.75, 0.95, 1.0, 0.20]
            : [0.90, 1.00, 1.0, 0.26]);

      gl.uniform4f(this.uColor, c[0], c[1], c[2], c[3]);

      this.drawLayerLanes(pr, layerId, dt, t, args.logicW, args.logicH);
    }

    gl.bindVertexArray(null);
  }
}

export { FLOW_PRESETS };
