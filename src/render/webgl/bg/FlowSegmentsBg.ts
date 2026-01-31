import { FLOW_PRESETS, FlowPreset, FlowLayerId } from "./flowPresets";

type SegParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  laneId: number;
  laneY: number;
  meanderAmp: number;
  meanderHz: number;
  meanderPhase: number;
  // low-freq target speed mul (smoothed)
  spMul: number;
  spMulTarget: number;
  spMulT: number; // timer to retarget
  // length drift
  lenTarget: number;
  lenT: number;
};

export type FlowBgDrawArgs = {
  logicW: number;
  logicH: number;
  timeSec: number;
  scrollX: number;
  scrollY: number;
  presetIndex: number;
  flow?: any;
};

function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

function rand01(seed: number): number {
  // deterministic-ish hash
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep01(t: number): number {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

function normalize2(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

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

  
  // (removed) was unused self-reference
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
  private lastRebuildKey = "";

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

    private rebuildIfNeeded(pr: FlowPreset, logicW: number, logicH: number, baseScrollX: number, baseScrollY: number): void {
    // Rebuild must react not only to presetId changes but also to rebuild-relevant params
    // (segmentCount / segmentLen / jitter / lanes / direction / parallax density, etc.)
    const rebuildKey = [
      pr.id,
      logicW | 0,
      logicH | 0,
      // spawn
      pr.spawn?.countBase ?? 0,
      pr.spawn?.distribution ?? "",
      pr.spawn?.yJitterPx ?? 0,
      pr.spawn?.respawnPaddingPx ?? 0,
      pr.spawn?.lanes?.count ?? 0,
      pr.spawn?.lanes?.jitterYPx ?? 0,
      // segments
      pr.segments?.lengthPx?.min ?? 0,
      pr.segments?.lengthPx?.max ?? 0,
      // direction
      pr.direction?.x ?? 0,
      pr.direction?.y ?? 0,
      // parallax density/shape (stringify for stable-ish signature)
      JSON.stringify(pr.parallax ?? []),
    ].join("|");

    if (
      this.lastPresetId === pr.id &&
      this.lastRebuildKey === rebuildKey &&
      this.layers.far.length > 0
    ) {
      return;
    }

    this.lastPresetId = pr.id;
    this.lastRebuildKey = rebuildKey;
    this.lastTimeSec = NaN;

    this.layers.far = [];
    this.layers.mid = [];
    this.layers.near = [];

    const base = pr.spawn.countBase;
    const pad = pr.spawn.respawnPaddingPx;

    const dir = normalize2(pr.direction.x, pr.direction.y);

      const makeLayer = (_layerId: FlowLayerId, layerIndex: number, densityMul: number, scrollX: number, scrollY: number) => {
        const count = Math.max(1, Math.floor(base * densityMul));
        const arr: SegParticle[] = new Array(count);

        const dist = pr.spawn.distribution;
        const lanes = dist === "lanes" ? (pr.spawn.lanes?.count ?? 8) : 1;
        const laneH = logicH / lanes;

        for (let i = 0; i < count; i++) {
          const seed = (layerIndex + 1) * 10000 + i * 17.23;

          // lanes
          const laneId = dist === "lanes" ? (i % lanes) : 0;
          const laneY_screen = (laneId + 0.5) * laneH;

          const yJ = dist === "lanes"
            ? (rand01(seed + 1.1) - 0.5) * 2 * (pr.spawn.lanes?.jitterYPx ?? 0)
            : (rand01(seed + 1.2) - 0.5) * 2 * (pr.spawn.yJitterPx ?? 0);

          // ✅ init in SCREEN space first...
          const y0_screen = dist === "uniform_y"
            ? clamp((rand01(seed + 2.2) * (logicH + pad * 2) - pad) + yJ, -pad, logicH + pad)
            : clamp(laneY_screen + yJ + (rand01(seed + 2.2) - 0.5) * laneH * 0.20, -pad, logicH + pad);

          // ✅ ...then convert to WORLD by adding scroll
          const x0 = scrollX + (rand01(seed + 2.1) * (logicW + pad * 2) - pad);
          const y0 = scrollY + y0_screen;

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
            // laneY musí být WORLD, jinak laneCoherence tahá špatně
            laneY: scrollY + laneY_screen,

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
        const par = Number(pl.factor ?? 1);
        const scrollX = baseScrollX * par;
        const scrollY = baseScrollY * par;
        this.layers[pl.layer] = makeLayer(
          pl.layer,
          pl.layer === "far" ? 0 : pl.layer === "mid" ? 1 : 2,
          pl.densityMul,
          scrollX,
          scrollY
        );
      }
  }
  private normalizeFlowSegmentsParams(prIn: any): any {
    const pr = prIn ?? {};

    pr.spawn ??= {};
    pr.segments ??= {};
    pr.segments.lengthPx ??= {};
    pr.segments.lengthPx.drift ??= {};
    pr.segments.lengthPx.speedCoupling ??= {};
    pr.motion ??= {};
    pr.motion.speedPxPerSec ??= {};
    pr.motion.speedPxPerSec.layerMul ??= {};
    pr.rng ??= {};
    pr.rng.lowFreq ??= {};
    pr.direction ??= { x: 1, y: 0 };
    pr.parallax ??= [
      { layer: "far", factor: 0.25, densityMul: 0.7 },
      { layer: "mid", factor: 0.5, densityMul: 1.0 },
      { layer: "near", factor: 1.0, densityMul: 1.2 },
    ];
    pr.colors ??= {};

    pr.spawn.respawnPaddingPx ??= 80;
    pr.spawn.countBase ??= 512;
    pr.segments.thicknessPx ??= 1;

    pr.segments.lengthPx.min ??= 12;
    pr.segments.lengthPx.max ??= pr.segments.lengthPx.min;

    pr.segments.lengthPx.drift.enabled ??= false;
    pr.segments.lengthPx.drift.targetIntervalSec ??= { min: 0.5, max: 2.0 };
    pr.segments.lengthPx.drift.lerpRate ??= 1.0;

    pr.motion.accelLimitPxPerSec2 ??= 1200;
    pr.motion.dampingPerSec ??= 1.0;
    pr.motion.speedPxPerSec.base ??= 120;
    pr.motion.speedPxPerSec.layerMul.far ??= 0.6;
    pr.motion.speedPxPerSec.layerMul.mid ??= 0.85;
    pr.motion.speedPxPerSec.layerMul.near ??= 1.0;

    pr.rng.lowFreq.enabled ??= false;
    pr.rng.lowFreq.globalDriftIntervalSec ??= { min: 0.6, max: 1.6 };
    pr.rng.lowFreq.lerpRate ??= 1.0;

    pr.segments.lengthPx.min = Math.max(1, Number(pr.segments.lengthPx.min) || 1);
    pr.segments.lengthPx.max = Math.max(pr.segments.lengthPx.min, Number(pr.segments.lengthPx.max) || pr.segments.lengthPx.min);

    return pr;
  }

  
    private stepLayer(p: SegParticle, pr: FlowPreset, dt: number, t: number, layerId: FlowLayerId, logicW: number, logicH: number, scrollX: number, scrollY: number): void {
      const pad = (pr as any).spawn?.respawnPaddingPx ?? 0;
    const accelLim = pr.motion.accelLimitPxPerSec2;
    const damp = pr.motion.dampingPerSec;

    const layerMul = pr.motion.speedPxPerSec.layerMul[layerId] ?? 1.0;
    const baseSpeed = pr.motion.speedPxPerSec.base * layerMul;

    // low-frequency speed drift (global-ish but per particle; smoothed)
    if (pr.rng.lowFreq.enabled) {
      p.spMulT -= dt;
      if (p.spMulT <= 0) {
        const mi = pr.rng.lowFreq.globalDriftIntervalSec.min;
        const ma = pr.rng.lowFreq.globalDriftIntervalSec.max;
        const seed = (p.laneId + 1) * 133.7 + p.x * 0.01 + p.y * 0.02;
        p.spMulT = lerp(mi, ma, rand01(seed));
        const jit = pr.rng.lowFreq.speedTargetJitterFrac ?? 0.0;
        p.spMulTarget = 1.0 + (rand01(seed + 9.9) - 0.5) * 2.0 * jit;
      }
      p.spMul = lerp(p.spMul, p.spMulTarget, 1.0 - Math.exp(-pr.rng.lowFreq.lerpRate * dt));
    }

    // length drift (smoothed)
      if (pr.segments?.lengthPx?.drift?.enabled) {
      p.lenT -= dt;
      if (p.lenT <= 0) {
        const mi = pr.segments.lengthPx.drift.targetIntervalSec.min;
        const ma = pr.segments.lengthPx.drift.targetIntervalSec.max;
        const seed = (p.laneId + 7) * 19.7 + p.x * 0.013;
        p.lenT = lerp(mi, ma, rand01(seed));
        const lenMin = pr.segments.lengthPx.min;
        const lenMax = pr.segments.lengthPx.max;
        p.lenTarget = lerp(lenMin, lenMax, rand01(seed + 1.7));
      }
      p.len = lerp(p.len, p.lenTarget, 1.0 - Math.exp(-pr.segments.lengthPx.drift.lerpRate * dt));
    }

    // lane coherence: keep y near laneY a bit
    const laneC = pr.segments.lengthPx.laneCoherence ?? 0;
    if (laneC > 0 && pr.spawn.distribution === "lanes") {
      const pull = (p.laneY - p.y) * (laneC * 0.20);
      p.vy += pull * dt;
    }

    // y meander (smooth)  ✅ scale by dt (treat as acceleration)
    if (pr.motion.yMeander?.enabled) {
      const coup = pr.motion.yMeander.xPhaseCoupling;
      const w = Math.PI * 2 * p.meanderHz;
      const wave = Math.sin((t * w) + p.meanderPhase + p.x * coup);
      p.vy += (wave * p.meanderAmp) * 0.12 * dt;
    }

      // shear (y speed depends on y position) ✅ scale by dt
      if (pr.motion.shear?.enabled) {
        const pl = pr.parallax.find((x: any) => x.layer === layerId);
        const mul = pl?.shearMul ?? 1.0;
        const y01 = clamp(p.y / Math.max(1, logicH), 0, 1);
        const yCurve = pr.motion.shear.curve === "smoothstep" ? smoothstep01(y01) : y01;
        const sgn = pr.motion.shear.invert ? -1 : 1;
        const sh = pr.motion.shear.strengthPxPerSec * mul * sgn;
        // inject vy target via accel-limited approach
        p.vy += (yCurve - 0.5) * (sh / Math.max(1, baseSpeed)) * 0.9 * dt;
      }

    // microWave ✅ scale by dt
    if (pr.motion.microWave?.enabled) {
      const mw = pr.motion.microWave;
      const wave = Math.sin(t * Math.PI * 2 * mw.freqHz + p.x * mw.yCoupling);
      p.vy += (wave * mw.ampPx) * 0.10 * dt;
    }

    // accel limit + damping (stability)
    // prefer direction.x/y baseline
    const dir = normalize2(pr.direction.x, pr.direction.y);
    const targetVx = dir[0];
    const targetVy = dir[1];

    // steer back toward base direction gently
    p.vx = lerp(p.vx, targetVx, 1.0 - Math.exp(-1.4 * dt));
    p.vy = lerp(p.vy, targetVy, 1.0 - Math.exp(-1.2 * dt));

    // damping
    p.vx *= Math.exp(-damp * dt);
    p.vy *= Math.exp(-damp * dt);

    // renormalize + enforce "mostly-left" direction (prevents vertical flyers)
    let [nx, ny] = normalize2(p.vx, p.vy);

    // Always move left; clamp vertical component.
    // max |vy| = 0.35 => max angle ≈ 20.5°
    const MAX_ABS_VY = 0.45;

    // clamp ny
    ny = clamp(ny, -MAX_ABS_VY, MAX_ABS_VY);

    // force nx negative with corresponding magnitude to stay unit-ish
    const nxMag = Math.sqrt(Math.max(0, 1 - ny * ny));
    nx = -Math.max(0.15, nxMag); // ensure at least some horizontal component

    // renormalize one more time (safety)
    [nx, ny] = normalize2(nx, ny);

    p.vx = nx;
    p.vy = ny;

    // integrate
    const sp = baseSpeed * p.spMul;
    const dx = p.vx * sp * dt;
    const dy = p.vy * sp * dt;

    // accel clamp (approx by clamping per-step displacement)
    const maxStep = accelLim * dt * dt + sp * dt; // loose but ok
    const stepLen = Math.hypot(dx, dy);
    const k = stepLen > maxStep ? (maxStep / stepLen) : 1.0;

    p.x += dx * k;
    p.y += dy * k;

    // respawn when out of bounds (SCREEN-space wrap) + tiny jitter
// p.x/p.y are in WORLD; draw uses (p - scroll). So wrapping must use screen coords.
const sx = p.x - scrollX;
const sy = p.y - scrollY;

if (sx < -pad) {
  const j = (rand01(p.y * 0.17 + p.laneId * 31.7 + t * 0.13) - 0.5) * pad;
  // place just off the RIGHT edge in screen-space
  p.x = scrollX + logicW + pad + j;
}

if (sy < -pad) p.y = scrollY + logicH + pad;
if (sy > logicH + pad) p.y = scrollY - pad;
  }

  draw(args: FlowBgDrawArgs): void {
    const gl = this.gl;
    const pr = this.preset(args.presetIndex);
    // --- runtime overrides (from BgPipeline params.flow.*) ---
    const flowOv: any = (args as any)?.flow ?? {};

    // Legacy compatibility (BgDevUI sliders):
    // - segmentCount -> spawn.countBase
    // - segmentLen   -> segments.lengthPx.{min,max}
    // - jitter       -> spawn.yJitterPx
    // - speed        -> motion.speedPxPerSec.base (as multiplier vs preset base)
    const legacySpeedMul = Number((flowOv as any).speed);
    if (Number.isFinite(legacySpeedMul) && legacySpeedMul >= 0) {
      const base0 = Number((pr as any)?.motion?.speedPxPerSec?.base ?? 120);
      const nextBase = base0 * legacySpeedMul;
      flowOv.motion = {
        ...(flowOv.motion ?? {}),
        speedPxPerSec: {
          ...(((pr as any).motion?.speedPxPerSec) ?? {}),
          ...((flowOv.motion?.speedPxPerSec) ?? {}),
          base: nextBase,
        },
      };
    }

    
    // Legacy compatibility (BgDevUI sliders):
    // - segmentCount -> spawn.countBase
    // - segmentLen   -> segments.lengthPx.{min,max}
    // - jitter       -> spawn.yJitterPx
    const legacyCount = Number(flowOv.segmentCount);
    if (Number.isFinite(legacyCount) && legacyCount > 0) {
      flowOv.spawn = { ...(flowOv.spawn ?? {}), countBase: legacyCount };
    }

    const legacyLen = Number(flowOv.segmentLen);
    if (Number.isFinite(legacyLen) && legacyLen > 0) {
      flowOv.segments = { ...(flowOv.segments ?? {}), lengthPx: { min: legacyLen, max: legacyLen } };
    }

    const legacyJ = Number(flowOv.jitter);
    if (Number.isFinite(legacyJ) && legacyJ >= 0) {
      flowOv.spawn = { ...(flowOv.spawn ?? {}), yJitterPx: legacyJ };
    }
    // Legacy compatibility (BgDevUI sliders):
    // - thickness -> segments.thicknessPx
    const legacyTh = Number((flowOv as any).thickness);
    if (Number.isFinite(legacyTh) && legacyTh > 0) {
      flowOv.segments = { ...(flowOv.segments ?? {}), thicknessPx: legacyTh };
    }

    // Legacy compatibility (BgDevUI sliders):
    // - alpha -> render.alphaMul (layer color alpha multiplier)
    const legacyAlpha = Number((flowOv as any).alpha);
    if (Number.isFinite(legacyAlpha) && legacyAlpha >= 0) {
      flowOv.render = { ...(flowOv.render ?? {}), alphaMul: legacyAlpha };
    }

    
    // Merge preset + overrides (shallow-deep for top blocks we touch)
    const merged: any = {
      ...pr,
      ...(flowOv ?? {}),
      spawn: { ...(pr as any).spawn, ...(flowOv.spawn ?? {}) },
      segments: { ...(pr as any).segments, ...(flowOv.segments ?? {}) },
      motion: { ...(pr as any).motion, ...(flowOv.motion ?? {}) },
      render: { ...(pr as any).render, ...(flowOv.render ?? {}) },
      direction: { ...(pr as any).direction, ...(flowOv.direction ?? {}) },
    };


    const finalPr: any = this.normalizeFlowSegmentsParams(merged);

    console.log(
      "[FLOW PARAMS]",
      "lengthPx =", finalPr?.segments?.lengthPx,
      "thicknessPx =", finalPr?.segments?.thicknessPx,
      "countBase =", finalPr?.spawn?.countBase
    );

    this.rebuildIfNeeded(finalPr, args.logicW, args.logicH, Number(args.scrollX ?? 0), Number(args.scrollY ?? 0));



    


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
      const pl = finalPr.parallax.find((x: any) => x.layer === layerId);
      if (!pl) continue;

      const par = Number(pl.factor ?? 1);

      // Parallax scroll: layer scroll scales by par (0..1 typicky)
      const scrollX = Number(args.scrollX ?? 0) * par;
      const scrollY = Number(args.scrollY ?? 0) * par;

      // layer color
      const c = finalPr.colors?.[layerId] ?? (
        layerId === "far" ? [0.55, 0.85, 1.0, 0.14] :
        layerId === "mid" ? [0.75, 0.95, 1.0, 0.20] :
                            [0.90, 1.00, 1.0, 0.26]
      );
      const aMul = Number(finalPr.render?.alphaMul ?? 1);
      gl.uniform4f(this.uColor, c[0], c[1], c[2], c[3] * aMul);
      gl.uniform1f(this.uThick, Math.max(1, finalPr.segments.thicknessPx));

      const arr = this.layers[layerId];
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];

        // update
        this.stepLayer(p, finalPr, dt, t, layerId, args.logicW, args.logicH, scrollX, scrollY);

        // segment endpoints (world -> screen) using scroll (parallax)
        const x = p.x - scrollX;
        const y = p.y - scrollY;

        // length coupling by speed (optional)
        let L = p.len;
        if (finalPr.segments.lengthPx.speedCoupling?.enabled) {
          const g = finalPr.segments.lengthPx.speedCoupling.gain;
          const cl = finalPr.segments.lengthPx.speedCoupling.clamp;
          const sp = finalPr.motion.speedPxPerSec.base * (finalPr.motion.speedPxPerSec.layerMul[layerId] ?? 1);
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
