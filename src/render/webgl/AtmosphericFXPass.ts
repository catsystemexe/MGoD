// src/render/webgl/AtmosphericFXPass.ts
//
// Atmospheric FX — foreground overlay (Visual Layer 2).
//
// A fullscreen audio-reactive "energy stream / pulsing field" rendered via
// DOMAIN WARPING (Quilez: fbm-of-fbm-of-fbm). Drawn into the scene RT AFTER
// entities + VFX so it receives the same CRT post-process (scanlines / CA /
// glow) from Graphics.present() — keeping it unified with the image instead of
// floating above the CRT layer.
//
// Audio drives it: the 32-bin FFT spectrum is uploaded as a 32x1 R8 texture
// (LINEAR-filtered for free smooth interpolation across the spectrum). Bass
// pumps the warp depth + intensity, treble shifts the cosine-palette color.
//
// Fullscreen-triangle skeleton via gl_VertexID (no vertex buffers), same as
// PostProcessPass. Additive blending (SRC_ALPHA, ONE) for an energy glow.

const FREQ_BINS = 32;

// Exported so the smoke test can assert the effect terms are present in source
// without a real WebGL context.
export const ATMOS_VS = `#version 300 es
precision highp float;
out vec2 vUv;
const vec2 pos[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);
void main() {
  vec2 p = pos[gl_VertexID];
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0); // NDC flip Y (match bg passes)
  vUv = 0.5 * (p + 1.0);
}
`;

export const ATMOS_FS = `#version 300 es
precision highp float;
in vec2 vUv;                 // 0..1
out vec4 outColor;

uniform vec2  uResolution;   // (logicW, logicH)
uniform float uTime;
uniform sampler2D uFreqs;    // 32x1 R8, normalized 0..1 spectrum

// Quilez cosine palette: a + b*cos(2pi*(c*t+d)). cyan->violet rainbow.
vec3 cosinePalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

float hash(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1,0)), c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.0; a *= 0.5; } return s; }

void main(){
  // audio bands (linear-interpolated across 32 bins for free)
  float bass = texture(uFreqs, vec2(0.06, 0.5)).r;
  float treb = texture(uFreqs, vec2(0.80, 0.5)).r;

  vec2 p = vUv * vec2(uResolution.x / uResolution.y, 1.0) * 3.0;
  float t = uTime * 0.15;

  // DOMAIN WARPING — fold the field through itself; bass pumps the warp depth.
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 2.0 * q + vec2(1.7, 9.2)), fbm(p + 2.0 * q + vec2(8.3, 2.8)));
  float field = fbm(p + (2.0 + bass * 2.0) * r);

  // thin bright ridge = "stream"; transparent everywhere else.
  float stream = smoothstep(0.55, 0.60, field) * (1.0 - smoothstep(0.60, 0.74, field));
  float pulse  = 0.6 + 0.4 * sin(uTime * 0.7);
  float intensity = stream * pulse * (0.5 + bass * 1.3);

  // cyan->violet via Quilez standard rainbow palette, treble nudges the hue.
  vec3 col = cosinePalette(
    field + treb * 0.4,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 1.0, 0.5),
    vec3(0.0, 0.33, 0.67)
  );

  float alpha = clamp(intensity, 0.0, 1.0) * 0.3;   // peak ~0.3, else ~0
  outColor = vec4(col * (0.6 + treb * 0.6), alpha);
}
`;

export type AtmosphericFXPass = {
  draw(args: { logicW: number; logicH: number; timeSec: number; freqs: Float32Array | null }): void;
  dispose(): void;
};

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("AtmosphericFX: createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "";
    gl.deleteShader(sh);
    throw new Error("AtmosphericFX: shader compile failed: " + log);
  }
  return sh;
}

function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  if (!prog) throw new Error("AtmosphericFX: createProgram failed");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || "";
    gl.deleteProgram(prog);
    throw new Error("AtmosphericFX: program link failed: " + log);
  }
  return prog;
}

export function createAtmosphericFXPass(gl: WebGL2RenderingContext): AtmosphericFXPass {
  const prog = createProgram(gl, ATMOS_VS, ATMOS_FS);

  const vao = gl.createVertexArray();
  if (!vao) throw new Error("AtmosphericFX: createVAO failed");

  const uResolution = gl.getUniformLocation(prog, "uResolution");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uFreqs = gl.getUniformLocation(prog, "uFreqs");

  // 32x1 R8 spectrum texture (LINEAR -> free smooth interpolation across bins).
  const tex = gl.createTexture();
  if (!tex) throw new Error("AtmosphericFX: createTexture failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, FREQ_BINS, 1, 0, gl.RED, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  // reusable upload buffer: dB -> (db+100)/100 clamped 0..1 -> 0..255
  const u8 = new Uint8Array(FREQ_BINS);

  function uploadFreqs(freqs: Float32Array | null): void {
    if (freqs && freqs.length >= FREQ_BINS) {
      for (let i = 0; i < FREQ_BINS; i++) {
        let n = (freqs[i] + 100) / 100; // normalize dB
        if (n < 0) n = 0; else if (n > 1) n = 1;
        u8[i] = (n * 255) | 0;
      }
    } else {
      u8.fill(0); // null/short -> silence
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FREQ_BINS, 1, gl.RED, gl.UNSIGNED_BYTE, u8);
  }

  return {
    draw(args) {
      gl.useProgram(prog);
      gl.bindVertexArray(vao);

      uploadFreqs(args.freqs);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (uFreqs) gl.uniform1i(uFreqs, 0);
      if (uResolution) gl.uniform2f(uResolution, args.logicW, args.logicH);
      if (uTime) gl.uniform1f(uTime, args.timeSec);

      // additive energy glow
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // restore state (other passes expect BLEND off / no VAO bound)
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
      gl.useProgram(null);
    },

    dispose() {
      gl.deleteProgram(prog);
      gl.deleteVertexArray(vao);
      gl.deleteTexture(tex);
    },
  };
}
