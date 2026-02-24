import type { BaseRenderer } from "./BaseRenderer";

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("PostFxRenderer: createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "";
    gl.deleteShader(sh);
    throw new Error("PostFxRenderer shader compile failed:\n" + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("PostFxRenderer: createProgram failed");
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) || "";
    gl.deleteProgram(p);
    throw new Error("PostFxRenderer link failed:\n" + log);
  }
  return p;
}

export class PostFxRenderer implements BaseRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;

  // uniforms
  private uTex: WebGLUniformLocation | null = null;
  private uTime: WebGLUniformLocation | null = null;
  private uRes: WebGLUniformLocation | null = null;
    private uRtRes: WebGLUniformLocation | null = null;
    private uPadPx: WebGLUniformLocation | null = null;

  private uTintA: WebGLUniformLocation | null = null;
  private uTintB: WebGLUniformLocation | null = null;
  private uGradPow: WebGLUniformLocation | null = null;

  private uFogColor: WebGLUniformLocation | null = null;
  private uFogAmt: WebGLUniformLocation | null = null;
  private uFogPow: WebGLUniformLocation | null = null;

      private uAber: WebGLUniformLocation | null = null;  private uScan: WebGLUniformLocation | null = null;
      private uPoster: WebGLUniformLocation | null = null;
      private uBarrel: WebGLUniformLocation | null = null;
       private uNeonAmt: WebGLUniformLocation | null = null;    private uNeonHeightMix: WebGLUniformLocation | null = null;

  // state from setUniforms
  private time = 0;

  // viewport (screen) resolution used by FS (uRes)
  private resW = 1;
  private resH = 1;
  private rtW = 1;
  private rtH = 1;
  private pad = 0;
  private inputTex: WebGLTexture | null = null;

  // params (defaults tuned for “digital landscape -> watery/atmo” experiments)
  private p = {
    tintA: [0.06, 0.18, 0.28],
    tintB: [0.02, 0.02, 0.03],
    gradPow: 1.35,

    fogColor: [0.02, 0.06, 0.10],
    fogAmt: 0.35,
    fogPow: 1.6,

        aberr: 0.0025,    scan: 0.10,
        posterize: 0.0,
        barrel: 0.0,
        vignette: 0.0,
        grain: 0.0,
scatterDensity: 1.5,
scatterPow: 1.8,
scatterColor: [0.02,0.05,0.09],
glitchStrength: 0.0,
glitchSlices: 40.0,
glitchSpeed: 2.0,
        neonAmt: 0.0,      neonHeightMix: 0.5,  };

  init(gl: WebGL2RenderingContext, w: number, h: number): void {
    this.gl = gl;
    this.resW = Math.max(1, w | 0);
    this.resH = Math.max(1, h | 0);

    const VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

    const FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;

uniform sampler2D uTex;
uniform float uTime;
uniform vec2  uRes;
  uniform vec2  uRtRes;
  uniform vec2  uPadPx;

uniform vec3  uTintA;
uniform vec3  uTintB;
uniform float uGradPow;

uniform vec3  uFogColor;
uniform float uFogAmt;
uniform float uFogPow;

uniform float uAber;uniform float uScan;
uniform float uPoster;
uniform float uNeonAmt;
uniform float uNeonHeightMix;
uniform float uBarrel;
uniform float uVignette;
uniform float uGrain;
uniform float uScatterDensity;
uniform float uScatterPow;
uniform vec3  uScatterColor;
uniform float uGlitchStrength;
uniform float uGlitchSlices;
uniform float uGlitchSpeed;
      
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 barrelWarp(vec2 uv, float k){
  vec2 c = uv * 2.0 - 1.0;
  float r2 = dot(c, c);
  c *= 1.0 + k * r2;
  return c * 0.5 + 0.5;
}

float vignetteMask(vec2 uv, float v){
  vec2 d = abs(uv - 0.5);
  float r = max(d.x, d.y);
  float m = smoothstep(0.55, 0.95, r);
  return 1.0 - clamp(m * v, 0.0, 1.0);
}

float glitchSliceOffset(float y, float slices, float t, float speed){
  float id = floor(y * slices);
  return (hash12(vec2(id, t*speed)) - 0.5);
}

float grainNoise(vec2 uv, float t){
  vec2 px = uv * uRes;
  float n = hash12(floor(px) + fract(px) * 0.01 + t * 17.0);
  return n - 0.5;
}

vec3 sampleAber(vec2 uv, vec2 uvScene, float a){
      // uv      = screen-space [0..1]
      // uvScene = RT-space [0..1] pointing to the center viewport inside padded RT
      vec2 c = uv - 0.5;
      float r = dot(c, c);

      // Fade aberration near screen edges (screen-space) to prevent edge artifacts
      float edge = min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y));
      float edgeSoft = max(1.5 / max(uRes.x, uRes.y), a * 0.55);
      float aEff = a * smoothstep(0.0, edgeSoft, edge);

      // radial offset in screen-normalized units; convert to RT UV using (uRes/uRtRes)
      vec2 off = c * (aEff * (0.35 + 1.25*r));
      vec2 scale = uRes / max(uRtRes, vec2(1.0)); // safe

      // clamp to the *inner* (non-padded) rect inside the RT
      vec2 uvMin = uPadPx / max(uRtRes, vec2(1.0));
      vec2 uvMax = (uPadPx + uRes) / max(uRtRes, vec2(1.0));

      vec2 uvR = clamp(uvScene + off * scale, uvMin, uvMax);
      vec2 uvG = clamp(uvScene,              uvMin, uvMax);
      vec2 uvB = clamp(uvScene - off * scale, uvMin, uvMax);

      float rr = texture(uTex, uvR).r;
      float gg = texture(uTex, uvG).g;
      float bb = texture(uTex, uvB).b;

      return vec3(rr, gg, bb);
    }

    void main(){
  vec2 uv = vUv;
  if (abs(uBarrel) > 0.00001){
    uv = barrelWarp(uv, uBarrel);
  }
    
  // micro-slice glitch (UV displacement)
  if (uGlitchStrength > 0.00001){
    float slices = max(1.0, uGlitchSlices);
    float t = floor(uTime * uGlitchSpeed);
    float dx = glitchSliceOffset(uv.y, slices, t, 1.0) * uGlitchStrength;
    // thin bands only
    float band = abs(fract(uv.y * slices) - 0.5);
    float m = 1.0 - smoothstep(0.0, 0.08, band);
    uv.x += dx * m;
  }

vec2 uvScene = (uv * uRes + uPadPx) / max(uRtRes, vec2(1.0));
    vec3 col = sampleAber(uv, uvScene, uAber);


  // vertical gradient tint (sky/atmo vs deep)
  float gy = pow(clamp(uv.y, 0.0, 1.0), max(0.01, uGradPow));
  vec3 tint = mix(uTintB, uTintA, gy);
  col = mix(col, col + tint, 0.65);

  // fog (stronger towards top / distance feeling)
  float f = pow(clamp(uv.y, 0.0, 1.0), max(0.01, uFogPow)) * uFogAmt;
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
// === Atmospheric Scattering 2.0 ===
float depth = pow(clamp(uv.y,0.0,1.0), uScatterPow);
float scatter = 1.0 - exp(-depth * uScatterDensity);
col = mix(col, uScatterColor, scatter);
col *= mix(1.0, 0.85, scatter);
  // scanlines (subtle)
  float scan = sin((uv.y * uRes.y) * 3.14159) * 0.5 + 0.5;
  col *= mix(1.0, 0.92 + 0.08*scan, clamp(uScan, 0.0, 1.0));
  // optional posterize (for destructive “digital” looks)
  if (uPoster > 0.001) {
    float steps = mix(256.0, 6.0, clamp(uPoster, 0.0, 1.0));
    col = floor(col * steps) / steps;
  }

  
    // --- Neon Edge Boost (post-posterize) ---
    float lum = dot(col, vec3(0.299,0.587,0.114));
    float edge = abs(dFdx(lum)) + abs(dFdy(lum));

    // Height modulation (luminance + perspective hybrid)
    float gyNeon = pow(clamp(uv.y,0.0,1.0), max(0.01, uGradPow));
    float heightMask = mix(lum, gyNeon, uNeonHeightMix);
    edge *= heightMask;

    

    float neonMask = clamp(edge * 6.0, 0.0, 1.0);
    col = mix(col, col * (1.0 + uNeonAmt), neonMask);

if (uVignette > 0.00001){
  col *= vignetteMask(uv, uVignette);
}

if (uGrain > 0.00001){
  col += grainNoise(uv, uTime) * uGrain;
}

    o = vec4(col, 1.0);
}
`;

    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    const prog = link(gl, vs, fs);

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.prog = prog;
    this.vao = gl.createVertexArray();

    this.uTex = gl.getUniformLocation(prog, "uTex");
    this.uTime = gl.getUniformLocation(prog, "uTime");
    this.uRes = gl.getUniformLocation(prog, "uRes");

    

      this.uRtRes = gl.getUniformLocation(prog, "uRtRes");
      this.uPadPx = gl.getUniformLocation(prog, "uPadPx");
this.uTintA = gl.getUniformLocation(prog, "uTintA");
    this.uTintB = gl.getUniformLocation(prog, "uTintB");
    this.uGradPow = gl.getUniformLocation(prog, "uGradPow");

    this.uFogColor = gl.getUniformLocation(prog, "uFogColor");
    this.uFogAmt = gl.getUniformLocation(prog, "uFogAmt");
    this.uFogPow = gl.getUniformLocation(prog, "uFogPow");

    this.uAber = gl.getUniformLocation(prog, "uAber");    this.uScan = gl.getUniformLocation(prog, "uScan");
    this.uPoster = gl.getUniformLocation(prog, "uPoster");
    this.uBarrel = gl.getUniformLocation(prog, "uBarrel");
this.uScatterDensity = gl.getUniformLocation(prog, "uScatterDensity");
this.uScatterPow = gl.getUniformLocation(prog, "uScatterPow");
this.uScatterColor = gl.getUniformLocation(prog, "uScatterColor");
this.uGlitchStrength = gl.getUniformLocation(prog, "uGlitchStrength");
this.uGlitchSlices = gl.getUniformLocation(prog, "uGlitchSlices");
this.uGlitchSpeed = gl.getUniformLocation(prog, "uGlitchSpeed");
      this.uNeonAmt = gl.getUniformLocation(prog, "uNeonAmt");      this.uNeonHeightMix = gl.getUniformLocation(prog, "uNeonHeightMix");  }

  rebuild(_args: any): void {}

  setUniforms(params: any, time: number, _scroll: any, _mouse: any): void {
    this.time = Number(time ?? 0);

    // input texture is injected by BgPipeline into params.common
    const common = params?.common ?? {};
    this.inputTex = (common.__bgInputTex as WebGLTexture) ?? null;
    this.resW = Number(common.__bgW ?? this.resW) || this.resW;
    this.resH = Number(common.__bgH ?? this.resH) || this.resH;

    

      this.rtW = Number(common.__bgRtW ?? this.rtW) || this.rtW;
      this.rtH = Number(common.__bgRtH ?? this.rtH) || this.rtH;
      this.pad = Number(common.__bgPad ?? this.pad) || this.pad;
const fx = params?.postFx ?? params?.fx ?? params?.layerFx ?? params?.params?.postFx ?? params?.params?.fx ?? params?.common?.postFx ?? {};
    if (fx && typeof fx === "object") {
      const v3 = (x: any, d: number[]) => Array.isArray(x) && x.length >= 3 ? [Number(x[0]), Number(x[1]), Number(x[2])] : d;

      if (fx.tintA !== undefined) this.p.tintA = v3(fx.tintA, this.p.tintA);
      if (fx.tintB !== undefined) this.p.tintB = v3(fx.tintB, this.p.tintB);
      if (fx.gradPow !== undefined) this.p.gradPow = Number(fx.gradPow) || this.p.gradPow;

      if (fx.fogColor !== undefined) this.p.fogColor = v3(fx.fogColor, this.p.fogColor);
      if (fx.fogAmt !== undefined) this.p.fogAmt = Number(fx.fogAmt) || this.p.fogAmt;
      if (fx.fogPow !== undefined) this.p.fogPow = Number(fx.fogPow) || this.p.fogPow;

      if (fx.aberr !== undefined) this.p.aberr = Number(fx.aberr) || this.p.aberr;      if (fx.scan !== undefined) this.p.scan = Number(fx.scan) || this.p.scan;
            if (fx.posterize !== undefined) this.p.posterize = Number(fx.posterize) || this.p.posterize;
            if (fx.barrel !== undefined) this.p.barrel = Number(fx.barrel) || 0;
if (fx.scatterDensity !== undefined) this.p.scatterDensity = Number(fx.scatterDensity);
if (fx.scatterPow !== undefined) this.p.scatterPow = Number(fx.scatterPow);
if (fx.scatterColor !== undefined && Array.isArray(fx.scatterColor)) this.p.scatterColor = fx.scatterColor;
if (fx.glitchStrength !== undefined) this.p.glitchStrength = Number(fx.glitchStrength);
if (fx.glitchSlices !== undefined) this.p.glitchSlices = Number(fx.glitchSlices);
if (fx.glitchSpeed !== undefined) this.p.glitchSpeed = Number(fx.glitchSpeed);
            if (fx.neonAmt !== undefined) this.p.neonAmt = Number(fx.neonAmt) || this.p.neonAmt;
            if (fx.neonHeightMix !== undefined) this.p.neonHeightMix = Number(fx.neonHeightMix) || this.p.neonHeightMix;
          }
  }

  draw(): void {
    const gl = this.gl;
    if (!gl || !this.prog || !this.vao) return;
    if (!this.inputTex) return;

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.inputTex);
    gl.uniform1i(this.uTex, 0);

    gl.uniform1f(this.uTime, this.time);
    gl.uniform2f(this.uRes, this.resW, this.resH);

    

      gl.uniform2f(this.uRtRes, this.rtW, this.rtH);
      gl.uniform2f(this.uPadPx, this.pad, this.pad);
gl.uniform3f(this.uTintA, this.p.tintA[0], this.p.tintA[1], this.p.tintA[2]);
    gl.uniform3f(this.uTintB, this.p.tintB[0], this.p.tintB[1], this.p.tintB[2]);
    gl.uniform1f(this.uGradPow, this.p.gradPow);

    gl.uniform3f(this.uFogColor, this.p.fogColor[0], this.p.fogColor[1], this.p.fogColor[2]);
    gl.uniform1f(this.uFogAmt, this.p.fogAmt);
    gl.uniform1f(this.uFogPow, this.p.fogPow);

          gl.uniform1f(this.uAber, this.p.aberr);
          gl.uniform1f(this.uScan, this.p.scan);
          gl.uniform1f(this.uPoster, this.p.posterize);
          if (this.uBarrel) gl.uniform1f(this.uBarrel, this.p.barrel);
if (this.uScatterDensity) gl.uniform1f(this.uScatterDensity, this.p.scatterDensity);
if (this.uScatterPow) gl.uniform1f(this.uScatterPow, this.p.scatterPow);
if (this.uScatterColor) gl.uniform3f(this.uScatterColor, this.p.scatterColor[0], this.p.scatterColor[1], this.p.scatterColor[2]);
if (this.uGlitchStrength) gl.uniform1f(this.uGlitchStrength, this.p.glitchStrength);
if (this.uGlitchSlices) gl.uniform1f(this.uGlitchSlices, this.p.glitchSlices);
if (this.uGlitchSpeed) gl.uniform1f(this.uGlitchSpeed, this.p.glitchSpeed);
          gl.uniform1f(this.uNeonAmt, this.p.neonAmt);
          gl.uniform1f(this.uNeonHeightMix, this.p.neonHeightMix);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    try { if (this.vao) gl.deleteVertexArray(this.vao); } catch {}
    try { if (this.prog) gl.deleteProgram(this.prog); } catch {}
    this.vao = null;
    this.prog = null;
    this.gl = null;
    this.inputTex = null;
  }
}
