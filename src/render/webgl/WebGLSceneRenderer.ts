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
    const vs = `#version 300 es
      in vec2 aPos;
      uniform vec2 uLogic;
      uniform vec2 uPos;
      uniform vec2 uSize;
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

    const verts = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);

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
  render(alpha: number = 1): void {
    const gl = this.gl;

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.uniform2f(this.uLogic, this.logicW, this.logicH);

    // clamp once per frame
    const a = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;

    this.store.debugForEachAlive((_ref, e: any) => {
      if (!e) return;

      const kind = readKind(e);
      const pos = (e as HasPos).pos;
      if (!pos || !kind) return;

      const r =
        typeof (e as HasRadius).radius === "number" ? (e as HasRadius).radius : null;

      let w = r ? r * 2 : 6;
      let h = r ? r * 2 : 6;

      if (kind === "player") {
        w = 6;
        h = 6;

        const hf = Number((e as any).hitFlashT ?? 0);
        const flashOn = Number.isFinite(hf) && hf > 0;

        if (flashOn) gl.uniform4f(this.uColor, 1, 1, 1, 1);
        else gl.uniform4f(this.uColor, 0, 1, 1, 1);
      } else if (kind === "enemy") {
        const hf = Number((e as any).hitFlashT ?? 0);
        const flashOn = Number.isFinite(hf) && hf > 0;

        if (flashOn) {
          gl.uniform4f(this.uColor, 1, 1, 1, 1);
        } else {
          const col = (e as HasRender).render?.color;
          const rgb = typeof col === "string" ? hexToRgb01(col) : null;
          if (rgb) gl.uniform4f(this.uColor, rgb[0], rgb[1], rgb[2], 1);
          else gl.uniform4f(this.uColor, 1, 0, 0, 1);
        }
      } else if (kind === "projectile") {
        gl.uniform4f(this.uColor, 0, 1, 0, 1);
      } else if (kind === "bomb") {
        gl.uniform4f(this.uColor, 1, 1, 0, 1);
      } else if (kind === "pickup") {
        const defId = String((e as any).defId ?? "");
        if (defId === "energy") gl.uniform4f(this.uColor, 0, 1, 0, 1);
        else if (defId === "bomb") gl.uniform4f(this.uColor, 1, 1, 0, 1);
        else if (defId === "score") gl.uniform4f(this.uColor, 0, 1, 1, 1);
        else gl.uniform4f(this.uColor, 1, 0, 1, 1);
      } else if (kind === "particle") {
        const sz = Number((e as any).size ?? 2);
        w = sz;
        h = sz;

        const col = (e as HasRender).render?.color;
        const rgb = typeof col === "string" ? hexToRgb01(col) : null;
        if (rgb) gl.uniform4f(this.uColor, rgb[0], rgb[1], rgb[2], 1);
        else gl.uniform4f(this.uColor, 1, 1, 1, 1);
      } else {
        w = 4;
        h = 4;
        gl.uniform4f(this.uColor, 0, 1, 1, 1);
      }

      const pp = (e as any).posPrev;

      // base interpolated
      let ix = pp ? pp.x + (pos.x - pp.x) * a : pos.x;
      let iy = pp ? pp.y + (pos.y - pp.y) * a : pos.y;

      // Pixel snap: stabilnější varianta
      // 1) nejdřív snap endpoints (pp/pos) → 2) lerp mezi snapnutými body
      if (kind === "player" || kind === "projectile" || kind === "bomb") {
        // endpoint snap + final snap (stabilita pro player/proj/bomb)
        if (pp) {
          const p0x = Math.round(pp.x);
          const p0y = Math.round(pp.y);
          const p1x = Math.round(pos.x);
          const p1y = Math.round(pos.y);
          ix = p0x + (p1x - p0x) * a;
          iy = p0y + (p1y - p0y) * a;
        }
        ix = Math.round(ix);
        iy = Math.round(iy);
      } else if (kind === "enemy") {
        // enemy: only final snap (no endpoint snap) -> reduces pixel shimmer
        ix = Math.round(ix);
        iy = Math.round(iy);
      }

      gl.uniform2f(this.uPos, ix, iy);
      gl.uniform2f(this.uSize, w, h);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });

    gl.bindVertexArray(null);
  }
// --- VFX: muzzle + tracers + hits (no ECS, no allocations) ---
renderVFX(vfx: any): void {
  if (!vfx) return;

  const gl = this.gl;

  gl.useProgram(this.prog);
  gl.bindVertexArray(this.vao);

  // logic space (same as main render)
  gl.uniform2f(this.uLogic, this.logicW, this.logicH);

  // MUZZLE
  if (vfx.getMuzzle) {
    const list = vfx.getMuzzle();
    for (let i = 0; i < list.length; i++) {
      const fx = list[i];
      if (!fx.alive) continue;

      const t = fx.age / fx.ttl;
      const alpha = 1.0 - t;

      const px = fx.x + fx.dx * 2;
      const py = fx.y + fx.dy * 2;

      const size = fx.size * (1.0 + t * 0.5);

      gl.uniform4f(this.uColor, 1.0, 0.9, 0.6, alpha);
      gl.uniform2f(this.uPos, Math.round(px), Math.round(py));
      gl.uniform2f(this.uSize, size, size);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  // TRACERS
  if (vfx.getTracers) {
    const list = vfx.getTracers();
    for (let i = 0; i < list.length; i++) {
      const fx = list[i];
      if (!fx.alive) continue;

      const t = fx.age / fx.ttl;
      const alpha = 1.0 - t;

      gl.uniform4f(this.uColor, 0.6, 1.0, 0.6, alpha);

      const n = Math.max(1, Math.floor(fx.len / Math.max(0.001, fx.step)));
      for (let k = 0; k < n; k++) {
        const d = k * fx.step;
        const px = fx.x + fx.dx * d;
        const py = fx.y + fx.dy * d;

        const tail = 1.0 - k / n;
        const sz = fx.size * (0.6 + 0.4 * tail);

        gl.uniform2f(this.uPos, Math.round(px), Math.round(py));
        gl.uniform2f(this.uSize, sz, sz);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }
  }

  // HITS (spark dots)
  if (vfx.getHits) {
    const list = vfx.getHits();
    for (let i = 0; i < list.length; i++) {
      const fx = list[i];
      if (!fx.alive) continue;

      const t = Math.min(1.0, fx.age / fx.ttl);
      const fade = 1.0 - t;
      const alpha = fade * fade;

      gl.uniform4f(this.uColor, 1.0, 1.0, 1.0, alpha);

      const count = Math.max(1, fx.count | 0);
      const step = Math.max(0.5, fx.step);
      const baseAng = Math.atan2(fx.dy, fx.dx);
      const spread = Math.max(0, fx.spread);

      for (let k = 0; k < count; k++) {
        const u0 = count === 1 ? 0 : (k / (count - 1)) * 2 - 1; // -1..+1
        const u = Math.sign(u0) * (Math.abs(u0) ** 0.65);
        const ang = baseAng + u * spread;

        const dist = k * step;

        const j = (Math.sin((k + 1) * 12.9898 + fx.age * 60.0) * 43758.5453) % 1;
        const jitter = (j - 0.5) * step * 0.35;

        const px = fx.x + Math.cos(ang) * (dist + jitter);
        const py = fx.y + Math.sin(ang) * (dist + jitter);

        const grow = 1.0 + t * 0.8;
        gl.uniform2f(this.uPos, Math.round(px), Math.round(py));
        gl.uniform2f(this.uSize, fx.size * grow, fx.size * grow);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }
  }

  gl.bindVertexArray(null);
}
  }

  
  