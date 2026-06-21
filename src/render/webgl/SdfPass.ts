// src/render/webgl/SdfPass.ts
//
// SDF render pass — a new per-entity vector path alongside glyph/proc/sprite.
//
// Each entity is drawn as ONE bounded quad (reusing the same uPos/uSize/uLogic
// transform as the main renderer program). The fragment shader evaluates a
// signed-distance-field shape over the quad's local -1..1 space (vLocal),
// alpha-masks the edge with smoothstep AA, and adds a soft outer glow. A single
// shared program switches primitives on uShapeType — no per-type shaders, no
// program churn beyond one bind per SDF entity.
//
// Audio/idle motion + HP-ratio deformation + hit flash all arrive as uniforms,
// mirroring the existing "one draw call per entity, set uniforms each time"
// model. State is restored to the main program/VAO/uLogic before returning so
// the surrounding render loop is undisturbed (same discipline as sprite paths).

// ── SHAPE CATALOG ─────────────────────────
// Change entity visuals by updating these IDs
// in createGame.ts (player) or enemyTypes.json
// (enemies). New shapes: add SHAPE_ID entry +
// matching branch in the fragment shader.
// ───────────────────────────────────────────
const SHAPE_ID: Record<string, number> = {
  arrow: 0,
  orb: 1,
  crown: 2,
  mandala: 3,
  sigil: 4,
  bolt: 5,
  triangle: 6,
  rocket: 7,
  thruster: 8,
};

// Bounded-quad vertex shader: identical world->screen transform to the main
// program, plus a vLocal varying in -1..1 for the SDF to live in.
export const SDF_VS = `#version 300 es
in vec2 aPos;                 // 0..1 unit quad
uniform vec2 uLogic;
uniform vec2 uPos;            // entity center (screen px)
uniform vec2 uSize;          // quad size (screen px)
out vec2 vLocal;             // -1..1
void main() {
  vec2 p = uPos + (aPos - vec2(0.5)) * uSize;
  vec2 ndc = vec2(
    (p.x / uLogic.x) * 2.0 - 1.0,
    1.0 - (p.y / uLogic.y) * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
  vLocal = (aPos - vec2(0.5)) * 2.0;
}
`;

export const SDF_FS = `#version 300 es
precision highp float;
in vec2 vLocal;              // -1..1 quad space
out vec4 outColor;

uniform int   uShapeType;    // 0 arrow / 1 orb / 2 crown / 3 mandala / 4 sigil
uniform vec3  uColor;        // base tint
uniform float uHpRatio;      // 0..1 (drives deform + low-hp redshift)
uniform float uTime;         // seconds (idle/rotation animation)
uniform float uHitFlash;     // 0..1 (white pop on hit)
uniform float uThrust;       // 0..1 (thruster intensity)

const float TAU = 6.28318530718;

// Quilez cosine palette (same as AtmosphericFXPass): a + b*cos(2pi*(c*t+d)).
vec3 cosinePalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}

float sdCircle(vec2 p, float r) { return length(p) - r; }

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// IQ equilateral triangle, apex toward +Y.
float sdEquilateral(vec2 p, float r) {
  const float k = 1.7320508; // sqrt(3)
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

// IQ regular hexagon.
float sdHexagon(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

// IQ regular star: n points, m in (2..n) controls inner radius sharpness.
float sdStar(vec2 p, float r, int n, float m) {
  float an = 3.141593 / float(n);
  float en = 3.141593 / m;
  vec2 acs = vec2(cos(an), sin(an));
  vec2 ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float wire2(float d, float th) {
  return smoothstep(th, th * 0.5, abs(d));
}

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 s = b - a, o = p - a;
  return length(o - s * clamp(dot(o, s) / dot(s, s), 0.0, 1.0));
}

float sdChevronBody(vec2 p) {
  vec2 bTop  = vec2(-0.92,  0.66);
  vec2 fTip  = vec2( 1.10,  0.00);
  vec2 bBot  = vec2(-0.92, -0.66);
  vec2 notch = vec2(-0.36,  0.00);
  float d = min(min(sdSeg(p, bTop, fTip), sdSeg(p, fTip, bBot)),
                min(sdSeg(p, bBot, notch), sdSeg(p, notch, bTop)));
  bool inside = false;
  vec2 vs[4];
  vs[0] = bTop; vs[1] = fTip; vs[2] = bBot; vs[3] = notch;
  for (int i = 0; i < 4; i++) {
    vec2 a = vs[i], b = vs[(i + 1) % 4];
    if (((a.y > p.y) != (b.y > p.y)) &&
        (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x))
      inside = !inside;
  }
  return inside ? -d : d;
}

vec4 thrusterEffect(vec2 pos) {
  const float PI2 = 6.28318530718;
  vec4 col = vec4(0.0);
  float d = 0.0;
  pos.y += 0.08;
  if (pos.y > 0.0) return col;
  pos.x += 0.003 * cos(20.0 * pos.y + 4.0 * uTime * PI2);
  float dd = length(pos);
  if (dd > 1.0) pos *= 2.2 * pow(1.0 - dd, 2.0);
  pos *= 1.9;
  d += cos(pos.x * 10.0);
  d += cos(pos.x * 20.0);
  d += cos(pos.x * 40.0);
  d += 0.3 * cos(pos.y * 6.0 + 8.0 * uTime * PI2) - 1.4;
  d += 0.3 * cos(pos.y * 50.0 + 4.0 * uTime * PI2);
  d += 0.3 * cos(pos.y * 10.0 + 2.0 * uTime * PI2);
  float dx = abs(pos.x);
  d *= (dx < 0.05) ? (0.2 - dx) : 0.0;
  d = max(d, 0.0);
  float dy = abs(pos.y);
  if (dy < 0.3) {
    float fac = dy / 0.3;
    col.r += 50.0 * pow(1.0 - fac, 2.0) * d;
    col.g += 10.0 * pow(1.0 - fac, 4.0) * d;
    col.a += 20.0 * (1.0 - fac) * d;
  }
  col.rgb += d * 10.0;
  col.a += d;
  return col;
}

void main() {
  float hp = clamp(uHpRatio, 0.0, 1.0);

  // HP deform: as health drops the silhouette shrinks slightly (divide local
  // space so the shape pulls inward).
  vec2 p = vLocal / mix(0.8, 1.0, hp);

  float d = 1e9;     // signed distance to the shape
  float t = 0.0;     // palette parameter (per-shape)

  if (uShapeType == 0) {
    // ARROW (player): triangle pointing +X (screen-right). Rotate local space
    // so the IQ apex (+Y) maps to +X.
    vec2 q = vec2(-p.y, p.x);
    d = sdEquilateral(q, 0.62);
    t = 0.15 + 0.5 * (p.x * 0.5 + 0.5);
  } else if (uShapeType == 1) {
    // ORB: solid circle core wrapped by a thin hex ring.
    float core = sdCircle(p, 0.34);
    float hex = abs(sdHexagon(p, 0.62)) - 0.05;
    d = min(core, hex);
    t = 0.4 + 0.3 * sin(uTime * 0.8);
  } else if (uShapeType == 2) {
    // CROWN: 6-point star (inner ratio ~0.45 via m=3).
    d = sdStar(p, 0.6, 6, 3.0);
    t = length(p) * 0.9;
  } else if (uShapeType == 3) {
    // MANDALA: three concentric rings, each rotating at its own rate with a
    // petal ripple — a layered breathing rosette.
    float r = length(p);
    float a = atan(p.y, p.x);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float rr = 0.22 + fi * 0.17;
      float petals = 0.03 * cos((6.0 + fi * 2.0) * (a + uTime * (0.3 + 0.15 * fi)));
      float ring = abs(r - rr) - 0.035;
      d = min(d, ring + petals);
    }
    t = r + uTime * 0.05;
  } else if (uShapeType == 4) {
    // SIGIL: a rotating cross (two thin bars) inscribed in a ring.
    vec2 q = rot(uTime * 0.6) * p;
    float bar1 = sdBox(q, vec2(0.62, 0.06));
    float bar2 = sdBox(q, vec2(0.06, 0.62));
    float ring = abs(sdCircle(p, 0.52)) - 0.045;
    d = min(min(bar1, bar2), ring);
    t = atan(q.y, q.x) / TAU + 0.5;
  } else if (uShapeType == 5) {
    // BOLT (projectile): horizontal capsule with a sharp core. Points +X.
    float r = 0.18;
    float len = 0.45;
    vec2 q = vec2(abs(p.x) - len, p.y);
    d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    t = 0.5 + p.x * 0.4;
  } else if (uShapeType == 7) {
    // CHEVRON + thruster, points +X
    vec2 lp = vLocal;

    float deform = (1.0 - hp) * 0.08 * sin(uTime * 11.0 + lp.y * 8.0);
    lp.x += deform;

    float aa = 0.015;

    float bodyDist = sdChevronBody(lp);
    float bodyMask = 1.0 - smoothstep(0.0, aa, bodyDist);
    float outerEdgeMask = 1.0 - smoothstep(0.0, aa, abs(bodyDist) - 0.010);

    float darkMask = (1.0 - smoothstep(0.0, aa,
      min(sdSeg(lp, vec2(-0.66, 0.48), vec2(0.88, 0.00)),
          sdSeg(lp, vec2(-0.66, -0.48), vec2(0.88, 0.00))) - 0.045
    )) * bodyMask;

    float whiteMask = (1.0 - smoothstep(0.0, aa,
      min(sdSeg(lp, vec2(-0.42, 0.34), vec2(0.76, 0.00)),
          sdSeg(lp, vec2(-0.42, -0.34), vec2(0.76, 0.00))) - 0.040
    )) * bodyMask;

    float centerMask = (1.0 - smoothstep(0.0, aa,
      sdSeg(lp, vec2(-0.36, 0.0), vec2(0.58, 0.0)) - 0.004
    )) * bodyMask;

    vec2 tOffset = lp - vec2(-0.36, 0.0);
    vec4 thr = thrusterEffect(vec2(tOffset.y * 0.13, tOffset.x * 0.3));
    float tAlpha = clamp(thr.a * uThrust, 0.0, 2.0);

    vec3 CYAN      = uColor;
    vec3 WHITE     = vec3(0.95, 0.98, 1.00);
    vec3 DARK_TEAL = vec3(0.02, 0.40, 0.52);

    CYAN = mix(CYAN, vec3(1.0, 0.1, 0.0), (1.0 - hp) * 0.6);

    vec3 col = vec3(0.0);
    col = mix(col, thr.rgb, tAlpha * (1.0 - bodyMask));
    col = mix(col, CYAN, bodyMask);
    col = mix(col, WHITE, outerEdgeMask);
    col = mix(col, DARK_TEAL, darkMask);
    col = mix(col, WHITE, whiteMask);
    col = mix(col, WHITE, centerMask);

    col = mix(col, vec3(1.0), uHitFlash);

    outColor = vec4(col, bodyMask + tAlpha * (1.0 - bodyMask));
    return;
  } else if (uShapeType == 8) {
    // THRUSTER — standalone flame
    vec4 thr = thrusterEffect(vec2(vLocal.y * 0.13, vLocal.x * 0.5));
    float tAlpha = clamp(thr.a * uThrust, 0.0, 2.0);
    outColor = vec4(thr.rgb, tAlpha);
    return;
  } else {
    // TRIANGLE — clean equilateral pointing +X
    vec2 q = vec2(-p.y, p.x);
    d = sdEquilateral(q, 0.62);
    t = 0.5 + p.x * 0.4;
  }

  // Edge AA fill + soft outer glow halo.
  //   fill: crisp anti-aliased interior  (smoothstep across the zero level set)
  //   glow: exponential falloff OUTSIDE the shape for a neon bloom
  float fill = smoothstep(0.0, 0.02, -d);
  float glow = exp(-max(d, 0.0) * 8.0);
  float aOut = clamp(fill + glow * 0.55, 0.0, 1.0);
  if (aOut < 0.003) discard;

  // Per-shape color: cosine-palette gradient nudged toward the base tint.
  vec3 pal = cosinePalette(
    t,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 1.0, 0.5),
    vec3(0.0, 0.33, 0.67)
  );
  vec3 col = mix(uColor, pal, 0.35);

  // BOLT (projectile): pure tint, no palette mix — keeps #aef6ff cyan / #ff5cc8
  // magenta exact so primary/secondary read as distinct at a glance.
  if (uShapeType == 5) col = uColor;

  // Low-HP redshift + danger pulse.
  col = mix(vec3(0.9, 0.15, 0.1), col, hp);
  float lowPulse = (1.0 - hp) * 0.5 * (0.5 + 0.5 * sin(uTime * 8.0));
  col += lowPulse * vec3(0.5, 0.0, 0.0);

  // Hit flash overrides toward white.
  col = mix(col, vec3(1.0), clamp(uHitFlash, 0.0, 1.0));

  outColor = vec4(col, aOut);
}
`;

export type SdfPass = {
  draw(args: {
    ix: number;      // screen-space center
    iy: number;
    radius: number;
    shape: string;
    color: string;   // hex
    hpRatio: number;
    time: number;
    hitFlash: number;
    thrust: number;
  }): void;
  dispose(): void;
};

type MainRestore = {
  prog: WebGLProgram;
  vao: WebGLVertexArrayObject;
  uLogic: WebGLUniformLocation;
  uColor: WebGLUniformLocation;
};

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("SdfPass: createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "";
    // Surface the exact compiler message (line/token) in the console before throwing.
    console.error("[SdfPass] shader compile failed:", log);
    gl.deleteShader(sh);
    throw new Error("SdfPass: shader compile failed: " + log);
  }
  return sh;
}

function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  if (!prog) throw new Error("SdfPass: createProgram failed");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || "";
    // Surface the exact linker message in the console before throwing.
    console.error("[SdfPass] program link failed:", log);
    gl.deleteProgram(prog);
    throw new Error("SdfPass: program link failed: " + log);
  }
  return prog;
}

function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex).trim());
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function createSdfPass(
  gl: WebGL2RenderingContext,
  logicW: number,
  logicH: number,
  main: MainRestore,
): SdfPass {
  const prog = createProgram(gl, SDF_VS, SDF_FS);

  const aPos = gl.getAttribLocation(prog, "aPos");
  if (aPos < 0) throw new Error("SdfPass: aPos attrib not found");

  const uLogic = gl.getUniformLocation(prog, "uLogic");
  const uPos = gl.getUniformLocation(prog, "uPos");
  const uSize = gl.getUniformLocation(prog, "uSize");
  const uShapeType = gl.getUniformLocation(prog, "uShapeType");
  const uColor = gl.getUniformLocation(prog, "uColor");
  const uHpRatio = gl.getUniformLocation(prog, "uHpRatio");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uHitFlash = gl.getUniformLocation(prog, "uHitFlash");
  const uThrust = gl.getUniformLocation(prog, "uThrust");

  // Own unit-quad geometry (self-contained: a different program may bind aPos to
  // a different attrib slot than the main renderer, so we don't borrow its VAO).
  const verts = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  if (!vao || !vbo) throw new Error("SdfPass: VAO/VBO create failed");
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return {
    draw(args) {
      // Quad is 4x the visible core so the SDF (core radius ~0.5 of half-extent)
      // has generous room for its outer glow.
      let sizePx = Math.max(1, args.radius) * 4.0;
      if (args.shape === "chevron") sizePx = Math.max(1, args.radius) * 6.0;
      if (args.shape === "thruster") sizePx = Math.max(1, args.radius) * 5.0;

      gl.useProgram(prog);
      gl.bindVertexArray(vao);

      if (uLogic) gl.uniform2f(uLogic, logicW, logicH);
      if (uPos) gl.uniform2f(uPos, args.ix, args.iy);
      if (uSize) gl.uniform2f(uSize, sizePx, sizePx);
      if (uShapeType) gl.uniform1i(uShapeType, SHAPE_ID[args.shape] ?? 0);
      if (uColor) {
        const [r, g, b] = hexToRgb01(args.color);
        gl.uniform3f(uColor, r, g, b);
      }
      if (uHpRatio) gl.uniform1f(uHpRatio, Number.isFinite(args.hpRatio) ? args.hpRatio : 1);
      if (uTime) gl.uniform1f(uTime, args.time);
      if (uHitFlash) gl.uniform1f(uHitFlash, Number.isFinite(args.hitFlash) ? args.hitFlash : 0);
      if (uThrust) gl.uniform1f(uThrust, Number.isFinite(args.thrust) ? args.thrust : 0);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Restore the EXACT canonical state the main loop's other vector paths
      // (proc/glyph) leave behind, so the next entity needs zero extra setup:
      //   { main program, main VAO, uLogic, uColor=white, BLEND off }.
      gl.disable(gl.BLEND);
      gl.useProgram(main.prog);
      gl.bindVertexArray(main.vao);
      gl.uniform2f(main.uLogic, logicW, logicH);
      gl.uniform4f(main.uColor, 1, 1, 1, 1);
    },

    dispose() {
      gl.deleteProgram(prog);
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(vbo);
    },
  };
}
