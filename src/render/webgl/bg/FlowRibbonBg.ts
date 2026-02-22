import { FLOW_PRESETS, FlowPreset, FlowLayerId } from "./flowPresets";

function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
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

function hexToRgb01(hex: any): [number, number, number] | null {
  if (typeof hex !== "string") return null;
  const h = hex.trim();
  const m = /^#?([0-9a-fA-F]{6})$/.exec(h);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return [r, g, b];
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
  flow?: any;
};

type FieldPreset = {
  id: string;
  name: string;

  // “mesh” feel
  grid: number;         // grid frequency in world space
  lineWidth: number;    // 0..1 (smaller = thinner)
  warp: number;         // how much height warps grid
  dotProb: number;      // chance of dot per cell 0..1
  dotSize: number;      // relative size 0..1

  // height field
  amp: number;          // height amplitude
  freq: number;         // base spatial frequency
  speed: number;        // phase speed
  fbmAmp: number;       // 0..1
  fbmFreq: number;      // fbm spatial freq

  // pseudo perspective / lighting
  persp: number;        // 0..1; more = stronger depth feel
  light: number;        // 0..2 intensity
};

const FIELD_PRESETS: FieldPreset[] = [
  {
    id: "mesh.flow.default",
    name: "Mesh Flow // Default",
    grid: 0.065,
    lineWidth: 0.08,
    warp: 0.65,
    dotProb: 0.10,
    dotSize: 0.55,
    amp: 22,
    freq: 0.020,
    speed: 0.95,
    fbmAmp: 0.45,
    fbmFreq: 0.010,
    persp: 0.65,
    light: 1.0,
  },
  {
    id: "mesh.flow.dense",
    name: "Mesh Flow // Dense",
    grid: 0.090,
    lineWidth: 0.07,
    warp: 0.80,
    dotProb: 0.14,
    dotSize: 0.50,
    amp: 18,
    freq: 0.026,
    speed: 1.05,
    fbmAmp: 0.50,
    fbmFreq: 0.013,
    persp: 0.70,
    light: 1.05,
  },
  {
    id: "mesh.flow.calm",
    name: "Mesh Flow // Calm",
    grid: 0.055,
    lineWidth: 0.09,
    warp: 0.55,
    dotProb: 0.07,
    dotSize: 0.60,
    amp: 14,
    freq: 0.016,
    speed: 0.75,
    fbmAmp: 0.35,
    fbmFreq: 0.008,
    persp: 0.60,
    light: 0.95,
  },

  {
    id: "mesh.flow.wireframe",
    name: "Wireframe Landscape",
    grid: 0.075,
    lineWidth: 0.06,
    warp: 0.00,
    dotProb: -1.0,   // < 0 => WIRE mode flag
    dotSize: 0.0,
    amp: 26,
    freq: 0.012,
    speed: 0.0,      // no time waves
    fbmAmp: 1.00,
    fbmFreq: 0.010,
    persp: 0.85,
    light: 1.20,
  },
];

// map FLOW_PRESETS -> our mesh presets (so presetIndex keeps working)
function mapFlowPresetToFieldPreset(pr: FlowPreset): FieldPreset {
  const id = String((pr as any)?.id ?? "");
  if (id.includes("wireframe")) return FIELD_PRESETS.find(p => p.id==="mesh.flow.wireframe") ?? FIELD_PRESETS[0];
  // conservative mapping: existing flow presets “laminar vs shear”
  if (id.includes("shear")) return FIELD_PRESETS[1];
  if (id.includes("laminar")) return FIELD_PRESETS[0];
  return FIELD_PRESETS[0];
}

export class FlowRibbonBg {
  private gl: WebGL2RenderingContext;

  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;

  private aPos: number;

  private uLogic: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;
  private uScroll: WebGLUniformLocation;
  private uColor: WebGLUniformLocation;

  // packed preset params
  private uP0: WebGLUniformLocation; // grid, lineWidth, warp, dotProb
  private uP1: WebGLUniformLocation; // dotSize, amp, freq, speed
  private uP2: WebGLUniformLocation; // fbmAmp, fbmFreq, persp, light

  private lastTimeSec = NaN;
  private lastPresetId = "";

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;

    // Fullscreen quad in NDC
    const vs = `#version 300 es
      precision highp float;
      in vec2 aPos;      // NDC -1..1
      out vec2 vUv;      // 0..1
      void main() {
        vUv = aPos * 0.5 + 0.5;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;

    const fs = `#version 300 es
      precision highp float;

      in vec2 vUv;
      out vec4 outColor;

      uniform vec2 uLogic;   // (logicW, logicH)
      uniform float uTime;
      uniform vec2 uScroll;  // world scroll (already includes parallax outside)

      uniform vec4 uColor;

      uniform vec4 uP0; // grid, lineWidth, warp, dotProb
      uniform vec4 uP1; // dotSize, amp, freq, speed
      uniform vec4 uP2; // fbmAmp, fbmFreq, persp, light

      // --- hash/noise helpers (fast + good enough) ---
      float hash11(float p) {
        p = fract(p * 0.1031);
        p *= p + 33.33;
        p *= p + p;
        return fract(p);
      }

      float hash21(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float valueNoise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash21(i + vec2(0.0,0.0));
        float b = hash21(i + vec2(1.0,0.0));
        float c = hash21(i + vec2(0.0,1.0));
        float d = hash21(i + vec2(1.0,1.0));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
      }

      float fbm(vec2 p) {
        float a = 0.5;
        float f = 1.0;
        float s = 0.0;
        float n = 0.0;
        for (int i = 0; i < 4; i++) {
          s += valueNoise2(p * f) * a;
          n += a;
          a *= 0.55;
          f *= 2.05;
        }
        return (n > 0.0) ? (s / n) : 0.0;
      }

      // height field in world-space (your “warp + envelope + phase warp” version)
      float heightField(vec2 wp)
      {
        float amp  = uP1.y;
        float freq = uP1.z;
        float spd  = uP1.w;

        float fbmAmp  = uP2.x;
        float fbmFreq = uP2.y;

        float t = uTime * spd;

        // 0) domain warp
        float warpFreq = fbmFreq * 0.35;
        float warpAmp  = fbmAmp  * 0.35;

        float w0 = fbm(wp * warpFreq + vec2( t * 0.05, -t * 0.04 ));
        float w1 = fbm(wp * warpFreq + vec2(-t * 0.03,  t * 0.06 ));
        vec2  warp = (vec2(w0, w1) - 0.5) * 2.0;
        vec2 p = wp + warp * warpAmp;

        // 1) envelope (slow)
        float envFreq = fbmFreq * 0.18;
        float envSpd  = 0.045;
        float envAmp  = 0.45;

        float e = fbm(p * envFreq + vec2( t * envSpd,  t * envSpd * 0.7 ));
        float env = 1.0 + (e - 0.5) * 2.0 * envAmp;

        // 2) phase warp (main organics)
        float phaseFreq = fbmFreq * 0.65;
        float phaseSpd  = 0.10;
        float beta      = 1.35;

        float n = fbm(p * phaseFreq + vec2( t * phaseSpd, -t * phaseSpd * 0.8 ));
        float nn = (n - 0.5) * 2.0;

        // 3) 2–3 waves w/ phase deformation
        float f = freq;
        float phaseWarp = beta * nn * f;

        float h0 = sin((p.x * f)                + t * 1.00 + phaseWarp);
        float h1 = sin((p.y * f * 1.37)         + t * 1.41 + p.x * f * 0.33 + phaseWarp * 0.9);
        float h2 = sin(((p.x + p.y) * f * 0.73) + t * 1.93 + phaseWarp * 0.6);

        float base = (h0 * 0.58) + (h1 * 0.27) + (h2 * 0.15);

        // 4) subtle additive detail (avoid grain)
        float detailAmp = fbmAmp * 0.25;
        float detail = nn * detailAmp;

        return (base + detail) * env * amp;
      }

      // “ribbon lanes” mask (not full grid): lanes along Y, driven by heightField + fbm
      
      // --- wireframe grid (X + Y) ---
      float gridWire(vec2 wp) {
        float grid = uP0.x;
        float lw   = uP0.y;

        vec2 g = wp * grid;
        vec2 f = abs(fract(g) - 0.5);
        float d = min(f.x, f.y);

        float aa = fwidth(d) * 1.25 + 1e-6;
        return 1.0 - smoothstep(lw, lw + aa, d);
      }

float gridLines(vec2 wp, float h) {
        float grid = uP0.x;
        float lw   = uP0.y;
        float warp = uP0.z;

        float t = uTime * uP1.w;

        float n = fbm(wp * (uP2.y * 0.55) + vec2(t * 0.05, -t * 0.04)); // 0..1
        float nn = (n - 0.5) * 2.0;

        float coord = wp.y * grid
                    + h * warp * 0.35
                    + nn * warp * 0.25;

        float f = abs(fract(coord) - 0.5);
        float aa = fwidth(f) * 1.25 + 1e-6;
        return 1.0 - smoothstep(lw, lw + aa, f);
      }

      float dotMask(vec2 wp, float h) {
        float grid = uP0.x;
        float dp   = uP0.w;
        float ds   = uP1.x;

        vec2 gp = wp * grid + vec2(h * 0.01, -h * 0.01);
        vec2 cell = floor(gp);
        float r = hash21(cell + 17.3);
        if (r > dp) return 0.0;

        vec2 f = fract(gp) - 0.5;
        float d = dot(f,f);

        float size = mix(0.040, 0.085, ds);
        float aa = fwidth(d) * 1.25 + 1e-6;
        return 1.0 - smoothstep(size*size, size*size + aa, d);
      }

      void main() {
        // pseudo 3D mapping: vUv.y is “depth”
        float depth = 1.0 - vUv.y;        // near=1 .. far=0
        float persp = uP2.z;

        float k = mix(0.18, 1.0, pow(depth, 1.65 + persp * 1.25));

        vec2 wpBase;
        wpBase.x = (vUv.x - 0.5) * uLogic.x * k + uLogic.x * 0.5;
        wpBase.y = (1.0 - depth) * uLogic.y * (0.55 + persp * 1.15);

        // “volumetric” stack: several independent slices rendered in-shader
        const int SLICES = 5;

        vec3 colAcc = vec3(0.0);
        float aAcc = 0.0;

        for (int si = 0; si < SLICES; si++) {
          float z = float(si) / float(SLICES - 1); // 0..1 (far..near)

          float par = mix(0.18, 1.35, pow(z, 1.25)); // parallax
          float sc  = mix(0.55, 1.00, pow(z, 1.10)); // scale

          vec2 wp = wpBase * sc + uScroll * par + vec2(0.0, z * (8.0 + 12.0 * persp));

          float h = heightField(wp);

          float eps = 2.0;
          float hx = heightField(wp + vec2(eps, 0.0)) - h;
          float hy = heightField(wp + vec2(0.0, eps)) - h;
          vec3 n = normalize(vec3(-hx, -hy, 1.7));

          float light = uP2.w;
          vec3 L = normalize(vec3(0.35, 0.55, 1.0));
          float ndl = clamp(dot(n, L), 0.0, 1.0);
          float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.0);
          float lit = (0.22 + ndl * 0.85 + rim * 0.40) * light;

          float dotProb = uP0.w;
          float lines = (dotProb < 0.0) ? gridWire(wp) : gridLines(wp, h);
          float dots  = (dotProb < 0.0) ? 0.0 : (dotMask(wp, h) * 0.20);

          float fog = mix(0.35, 1.15, pow(z, 1.65));   // far dim
          float df  = mix(0.75, 1.0, depth);           // top dim

          float a = (lines * 0.95 + dots * 0.65) * fog * df;
          a = pow(a, 0.95);

          vec3 col = uColor.rgb * lit;
          col *= 1.35; // hardcoded brightness gain

          // front-to-back-ish accumulation (cheap)
          float w = (1.0 - aAcc);
          colAcc += col * (uColor.a * a) * w;
          aAcc   += (uColor.a * a) * w;
        }

        outColor = vec4(colAcc, aAcc);
      }
    `;

    this.prog = createProgram(gl, vs, fs);

    const aPos = gl.getAttribLocation(this.prog, "aPos");
    if (aPos < 0) throw new Error("FlowRibbonBg: attrib missing");
    this.aPos = aPos;

    const uLogic = gl.getUniformLocation(this.prog, "uLogic");
    const uTime = gl.getUniformLocation(this.prog, "uTime");
    const uScroll = gl.getUniformLocation(this.prog, "uScroll");
    const uColor = gl.getUniformLocation(this.prog, "uColor");
    const uP0 = gl.getUniformLocation(this.prog, "uP0");
    const uP1 = gl.getUniformLocation(this.prog, "uP1");
    const uP2 = gl.getUniformLocation(this.prog, "uP2");
    if (!uLogic || !uTime || !uScroll || !uColor || !uP0 || !uP1 || !uP2) throw new Error("FlowRibbonBg: uniform missing");
    this.uLogic = uLogic;
    this.uTime = uTime;
    this.uScroll = uScroll;
    this.uColor = uColor;
    this.uP0 = uP0;
    this.uP1 = uP1;
    this.uP2 = uP2;

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error("FlowRibbonBg: VAO/VBO create failed");
    this.vao = vao;
    this.vbo = vbo;

    // two triangles fullscreen
    const quad = new Float32Array([
      -1, -1,
      +1, -1,
      -1, +1,
      -1, +1,
      +1, -1,
      +1, +1,
    ]);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 2 * 4, 0);

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
  }

  draw(args: FlowBgDrawArgs): void {
    const gl = this.gl;
    const pr = this.preset(args.presetIndex);
    this.rebuildIfNeeded(pr);

    const t = Number(args.timeSec ?? 0);
    const dt = Number.isFinite(this.lastTimeSec) ? clamp(t - this.lastTimeSec, 0, 1 / 15) : 1 / 60;
    this.lastTimeSec = t;

    // allow tiny future use, but currently unused (no legacy controls)
    const ov = (args?.flow ?? {}) as any;

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.uniform2f(this.uLogic, args.logicW, args.logicH);
    gl.uniform1f(this.uTime, t);

    // We draw 3 passes like before (far/mid/near).
    // Scroll is applied per pass via parallax factor from FLOW_PRESETS.
    const baseScrollX = Number(args.scrollX ?? 0);
    const baseScrollY = Number(args.scrollY ?? 0);

    const order: FlowLayerId[] = ["far", "mid", "near"];

    // pick field preset from FLOW_PRESETS id (keeps presetIndex behavior stable)
    const fp = mapFlowPresetToFieldPreset(pr);

    // optional opacity multipliers (kept; safe defaults)
    const farOpacity = Number.isFinite(ov?.farOpacity) ? Number(ov.farOpacity) : 1.0;
    const midOpacity = Number.isFinite(ov?.midOpacity) ? Number(ov.midOpacity) : 1.0;
    const nearOpacity = Number.isFinite(ov?.nearOpacity) ? Number(ov.nearOpacity) : 1.0;

    for (const layerId of order) {
      const par = Number((pr as any)?.parallax?.find((x: any) => x?.layer === layerId)?.factor ?? (layerId === "far" ? 0.25 : layerId === "mid" ? 0.55 : 1.0));
      const scrollX = baseScrollX * par;
      const scrollY = baseScrollY * par;
      gl.uniform2f(this.uScroll, scrollX, scrollY);

      // base colors from FLOW_PRESETS (or fallback)
      let c =
        (pr as any).colors?.[layerId] ??
        (layerId === "far"
          ? [0.55, 0.85, 1.0, 0.14]
          : layerId === "mid"
            ? [0.75, 0.95, 1.0, 0.20]
            : [0.90, 1.00, 1.0, 0.26]);

      // override colors/alpha from content preset (bgPresets.json -> flow.*)
      const flow = (args?.flow ?? {}) as any;
      const hex =
        layerId === "far" ? flow.colorsFar :
        layerId === "mid" ? flow.colorsMid :
        flow.colorsNear;

      const aOverride =
        layerId === "far" ? flow.alphaFar :
        layerId === "mid" ? flow.alphaMid :
        flow.alphaNear;

      const rgb = hexToRgb01(hex);
      if (rgb) {
        const a0 = Number.isFinite(Number(aOverride)) ? Number(aOverride) : c[3];
        c = [rgb[0], rgb[1], rgb[2], a0] as any;
      } else if (Number.isFinite(Number(aOverride))) {
        // allow alpha-only override even if color missing/invalid
        c = [c[0], c[1], c[2], Number(aOverride)] as any;
      }

      let aMul = 1.0;
      if (layerId === "far") aMul = farOpacity;
      if (layerId === "mid") aMul = midOpacity;
      if (layerId === "near") aMul = nearOpacity;

      gl.uniform4f(this.uColor, c[0], c[1], c[2], c[3] * aMul);
      const dbgCol = (globalThis as any).__DBG_FLOW_RIBBON_COLOR__;
      if (dbgCol) {
        const now = performance.now();
        const last = (globalThis as any).__DBG_FLOW_RIBBON_COLOR_LAST__ ?? 0;
        if (now - last > 800) {
          (globalThis as any).__DBG_FLOW_RIBBON_COLOR_LAST__ = now;
          console.log("[DBG_FLOW_RIBBON_COLOR]", layerId, "hex=", hex, "alphaOv=", aOverride, "final=", c);
        }
      }

      // layer tuning: near = stronger, far = calmer
      const layerAmpMul = layerId === "far" ? 0.55 : layerId === "mid" ? 0.80 : 1.00;
      const layerGridMul = layerId === "far" ? 0.85 : layerId === "mid" ? 1.00 : 1.10;
      const layerSpeedMul = layerId === "far" ? 0.70 : layerId === "mid" ? 0.90 : 1.05;

      gl.uniform4f(this.uP0, fp.grid * layerGridMul, fp.lineWidth, fp.warp, fp.dotProb);
      gl.uniform4f(this.uP1, fp.dotSize, fp.amp * layerAmpMul, fp.freq, fp.speed * layerSpeedMul);
      gl.uniform4f(this.uP2, fp.fbmAmp, fp.fbmFreq, fp.persp, fp.light);

      // draw fullscreen quad
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.bindVertexArray(null);

    // dt currently not used; kept for future (if we add temporal smoothing)
    void dt;
  }

  dispose(): void {
    try { this.gl.deleteBuffer(this.vbo); } catch {}
    try { this.gl.deleteVertexArray(this.vao); } catch {}
    try { this.gl.deleteProgram(this.prog); } catch {}
  }
}