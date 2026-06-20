import { BG_PRESETS, BgPreset } from "./bgPresets";

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "";
    gl.deleteShader(sh);
    throw new Error("Shader compile failed: " + log);
  }
  return sh;
}

function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);

  const p = gl.createProgram();
  if (!p) throw new Error("createProgram failed");
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);

  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) || "";
    gl.deleteProgram(p);
    throw new Error("Program link failed: " + log);
  }
  return p;
}

export type DemosceneBgDrawArgs = {
  logicW: number;
  logicH: number;
  timeSec: number;
  scrollX: number;
  scrollY: number;
  presetIndex: number;
};

export class DemosceneBg {
  private gl: WebGL2RenderingContext;

  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;

  private aPos: number;

  private uLogic: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;
  private uScroll: WebGLUniformLocation;

  private uMode: WebGLUniformLocation;
  private uP1: WebGLUniformLocation;
  private uP2: WebGLUniformLocation;
  private uCA: WebGLUniformLocation;
  private uCB: WebGLUniformLocation;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;

    const vs = `#version 300 es
      in vec2 aPos;
      out vec2 vUv;
      void main() {
        vUv = aPos;                 // 0..1
        vec2 ndc = aPos * 2.0 - 1.0;
        gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
      }
    `;

    const fs = `#version 300 es
      precision highp float;
      in vec2 vUv;
      out vec4 outColor;

      uniform vec2  uLogic;    // (logicW, logicH)
      uniform float uTime;     // seconds
      uniform vec2  uScroll;   // (sx, sy)

      uniform int   uMode;     // preset mode
      uniform vec4  uP1;       // generic params
      uniform vec4  uP2;       // generic params
      uniform vec3  uCA;       // base color
      uniform vec3  uCB;       // line/glow color

      float line01(float x, float w) {
        // crisp-ish line with small AA
        return 1.0 - smoothstep(w, w + 0.002, abs(x));
      }

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }

      float starLayer(vec2 uv, float cells, float scroll, float t) {
        vec2 g = uv * cells;
        g.x += scroll * cells;
        vec2 cell = floor(g);
        vec2 f = fract(g) - 0.5;
        float h = hash21(cell);
        if (h < 0.72) return 0.0;
        vec2 sp = (vec2(hash21(cell + 1.7), hash21(cell + 4.3)) - 0.5) * 0.7;
        float d = length(f - sp);
        float tw = 0.55 + 0.45 * sin(t * (2.0 + h * 5.0) + h * 31.0);
        return smoothstep(0.07, 0.0, d) * tw;
      }

      void main() {
        vec2 p = vec2(vUv.x * uLogic.x, vUv.y * uLogic.y);

        // parallax scroll
        float par = uP2.w; // default per preset
        p += uScroll * par;

        float t = uTime;

        // gentle rotation (per preset)
        float rotAmp = uP2.z;
        float a = rotAmp * sin(t * 0.35);
        mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
        p = R * (p - 0.5 * uLogic) + 0.5 * uLogic;

        vec2 c = p - 0.5 * uLogic;
        float r = length(c);
        float ang = atan(c.y, c.x);

        vec3 base = uCA;
        vec3 col = base;

        // Common underlay (very subtle)
        float under = 0.0;

        if (uMode == 0) {
          // Tempest tunnel (rings + spokes)
          float ringW = uP1.x;
          float spokeW = uP1.y;

          float ringScale = uP2.x;
          float spokeFreq = uP2.y;

          float ringL = line01(fract(r * ringScale + t * uP1.z) - 0.5, ringW);
          float spokeL = line01(fract((ang / 6.2831853) * spokeFreq) - 0.5, spokeW);

          float plasma =
            0.5 + 0.5 * sin(p.x * 0.02 + t * 0.7)
              * 0.5 * (0.5 + 0.5 * sin(p.y * 0.018 - t * 0.9));

          under = plasma * 0.35;

          float lines = max(ringL, spokeL);
          float glow = pow(lines, uP2.z > 0.0 ? 1.0 : 1.0) * 0.9;

          col += vec3(0.08, 0.12, 0.18) * under;
          col += uCB * glow;

        } else if (uMode == 1) {
          // Grid warp
          float step = max(8.0, uP1.x);
          float w = uP1.y;
          float warpAmp = uP1.z;
          float warpSpeed = uP1.w;

          vec2 q = p;
          q.x += sin((q.y * 0.03) + t * warpSpeed) * warpAmp;
          q.y += cos((q.x * 0.03) - t * warpSpeed) * warpAmp;

          float gx = line01(fract(q.x / step) - 0.5, w);
          float gy = line01(fract(q.y / step) - 0.5, w);

          float lines = max(gx, gy);
          float glow = pow(lines, uP2.z) * 0.85;

          col += uCB * glow;

        } else if (uMode == 2) {
          // Plasma scan
          float px = uP1.x;
          float py = uP1.y;
          float sp = uP1.z;
          float scanW = uP1.w;

          float plasma =
            0.5 + 0.5 * sin(p.x * px + t * sp)
              * 0.5 * (0.5 + 0.5 * sin(p.y * py - t * (sp * 1.2)));

          float scan = line01(fract((p.y / max(1.0, uLogic.y)) * 240.0 + t * 0.5) - 0.5, scanW);
          float scan2 = line01(fract((p.x / max(1.0, uLogic.x)) * 320.0 - t * 0.35) - 0.5, scanW);

          under = plasma * 0.45;
          float lines = max(scan, scan2);
          float glow = pow(lines, 1.0) * uP2.x;

          col += vec3(0.08, 0.10, 0.18) * under;
          col += uCB * glow;

        } else if (uMode == 3) {
          // Kaleido runes
          float sectors = max(3.0, uP1.x);
          float w = uP1.y;
          float spin = uP1.z;
          float jit = uP1.w;

          float a2 = ang + t * spin;
          float k = 6.2831853 / sectors;
          a2 = abs(mod(a2, k) - 0.5 * k);

          vec2 kk = vec2(cos(a2), sin(a2)) * r;

          float h = hash21(floor(kk * 0.07));
          kk += (h - 0.5) * jit * 10.0;

          float l1 = line01(fract(kk.x * 0.02 + t * 0.12) - 0.5, w);
          float l2 = line01(fract(kk.y * 0.02 - t * 0.10) - 0.5, w);

          float lines = max(l1, l2);
          float glow = pow(lines, uP2.z) * 0.9;

          col += uCB * glow;

        } else if (uMode == 4) {
          // Star wire (radial streaks)
          float streaks = max(6.0, uP1.x);
          float w = uP1.y;
          float sp = uP1.z;
          float nz = uP1.w;

          float a3 = ang / 6.2831853;
          float band = fract(a3 * streaks + t * sp);
          float ln = line01(band - 0.5, w);

          float n = hash21(vec2(floor(r * 0.05), floor(a3 * streaks)));
          float flick = mix(0.65, 1.0, n);
          flick *= mix(1.0 - nz, 1.0, hash21(vec2(floor(p.x * 0.05), floor(p.y * 0.05))));

          float glow = pow(ln, uP2.z) * 0.9 * flick;

          col += uCB * glow;

        } else if (uMode == 5) {
          // Hex field (approx lattice)
          float cell = max(10.0, uP1.x);
          float w = uP1.y;
          float sp = uP1.z;
          float wob = uP1.w;

          vec2 q = p / cell;
          q.x += sin(q.y + t * sp) * wob;
          q.y += cos(q.x - t * sp) * wob;

          float g1 = line01(fract(q.x) - 0.5, w);
          float g2 = line01(fract(q.y) - 0.5, w);
          float g3 = line01(fract((q.x + q.y) * 0.5) - 0.5, w);

          float lines = max(g1, max(g2, g3));
          float glow = pow(lines, uP2.z) * 0.85;

          col += uCB * glow;

        } else if (uMode == 6) {
          // Parallax Stars (3-layer)
          vec2 uv = vUv;
          uv.x *= uLogic.x / max(1.0, uLogic.y);
          float s = uScroll.x / max(1.0, uLogic.y);

          float far  = starLayer(uv, uP1.x, s * 0.12 + t * 0.010, t) * 0.40;
          float mid  = starLayer(uv, uP1.y, s * 0.30 + t * 0.025, t) * 0.70;
          float near = starLayer(uv, uP1.z, s * 0.65 + t * 0.050, t) * 1.00;

          col = uCA + uCB * (far + mid + near);

        } else if (uMode == 7) {
          // Grid Landscape (synthwave)
          vec2 uv = vUv;
          float horizon = 0.5;
          float sx = uScroll.x / max(1.0, uLogic.x);

          if (uv.y > horizon) {
            float fy = (uv.y - horizon) / (1.0 - horizon);
            float depth = 1.0 / max(fy, 0.02);

            float rows = depth * uP1.x + t * uP1.z;
            float gh = line01(fract(rows) - 0.5, uP1.y * depth * 0.5);

            float cx = (uv.x - 0.5) * depth;
            float cols = cx * uP1.w + sx * 6.0;
            float gv = line01(fract(cols) - 0.5, uP1.y * depth * 0.5);

            float fade = smoothstep(0.0, 0.35, fy);
            col = uCA + uCB * max(gh, gv) * fade;
          } else {
            float glow = smoothstep(0.18, 0.0, horizon - uv.y);
            vec2 suv = uv;
            suv.x *= uLogic.x / max(1.0, uLogic.y);
            float st = starLayer(suv, 26.0, sx * 0.30 + t * 0.02, t);
            col = uCA + uCB * (st * 0.5 + glow * uP2.x);
          }
        }

        outColor = vec4(col, 1.0);
      }
    `;

    this.prog = createProgram(gl, vs, fs);

    const aPos = gl.getAttribLocation(this.prog, "aPos");
    if (aPos < 0) throw new Error("BG: aPos attrib not found");
    this.aPos = aPos;

    const uLogic = gl.getUniformLocation(this.prog, "uLogic");
    const uTime = gl.getUniformLocation(this.prog, "uTime");
    const uScroll = gl.getUniformLocation(this.prog, "uScroll");
    const uMode = gl.getUniformLocation(this.prog, "uMode");
    const uP1 = gl.getUniformLocation(this.prog, "uP1");
    const uP2 = gl.getUniformLocation(this.prog, "uP2");
    const uCA = gl.getUniformLocation(this.prog, "uCA");
    const uCB = gl.getUniformLocation(this.prog, "uCB");
    if (!uLogic || !uTime || !uScroll || !uMode || !uP1 || !uP2 || !uCA || !uCB) {
      throw new Error("BG: uniform location missing");
    }
    this.uLogic = uLogic;
    this.uTime = uTime;
    this.uScroll = uScroll;
    this.uMode = uMode;
    this.uP1 = uP1;
    this.uP2 = uP2;
    this.uCA = uCA;
    this.uCB = uCB;

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error("BG: Failed to create VAO/VBO");
    this.vao = vao;
    this.vbo = vbo;

    // fullscreen quad in 0..1 uv space
    const verts = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private preset(i: number): BgPreset {
    const visible = BG_PRESETS.filter(p => !p.hidden);
    const list = visible.length > 0 ? visible : BG_PRESETS;
    const n = list.length;
    const ix = n > 0 ? ((i % n) + n) % n : 0;
    return list[ix] || BG_PRESETS[0];
  }

  draw(args: DemosceneBgDrawArgs): void {
    const gl = this.gl;

    const pr = this.preset(args.presetIndex);

    gl.disable(gl.BLEND);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.uniform2f(this.uLogic, args.logicW, args.logicH);
    gl.uniform1f(this.uTime, args.timeSec);
    gl.uniform2f(this.uScroll, args.scrollX, args.scrollY);

    gl.uniform1i(this.uMode, pr.mode);
    gl.uniform4f(this.uP1, pr.p1[0], pr.p1[1], pr.p1[2], pr.p1[3]);
    gl.uniform4f(this.uP2, pr.p2[0], pr.p2[1], pr.p2[2], pr.p2[3]);
    gl.uniform3f(this.uCA, pr.cA[0], pr.cA[1], pr.cA[2]);
    gl.uniform3f(this.uCB, pr.cB[0], pr.cB[1], pr.cB[2]);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindVertexArray(null);
  }
}


