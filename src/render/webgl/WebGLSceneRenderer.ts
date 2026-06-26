import type { EntityStore } from "../../engine/ecs/EntityStore";
import { SpriteSystem } from "../sprites/SpriteSystem";
import { getGlyph } from "../glyphs/GlyphDB";

import { cosinePalette, MUZZLE_PALETTE, TRACER_PALETTE } from "../../game/vfx/cosinePalette";

import { DemosceneBg } from "./bg/DemosceneBg";
import { FlowRibbonBg } from "./bg/FlowRibbonBg";
import { FlowSegmentsBg } from "./bg/FlowSegmentsBg";
import type { FlowDisturbance } from "./bg/flowStep";
import { createAtmosphericFXPass, type AtmosphericFXPass } from "./AtmosphericFXPass";
import { createSdfPass, type SdfPass } from "./SdfPass";
import { createMeshPass, type MeshPass } from "../../rendering/MeshPass";
import { loadGLB } from "../../rendering/MeshLoader";
import { uploadMesh, type GpuMesh } from "../../rendering/GpuMesh";
import { hexToRgb } from "../../rendering/ColorPalette";
import {
  computeEnemyDeathVisualState,
  DEFAULT_ENEMY_DEATH_VISUAL,
  type EnemyDeathGhostSnapshot,
  type EnemyDeathVisualDef,
} from "../../game/fx/EnemyDeathVisual";

const NO_FLOW_DISTURB: FlowDisturbance[] = [];

function safeNum(x: unknown, fallback: number): number {
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

type Vec2 = { x: number; y: number };
type HasPos = { pos: Vec2 };
type HasKind = { kind?: string; type?: string; tag?: string };
type HasRadius = { radius?: number };
type HasRender = { render?: { color?: string } };
type DeathVisualFx = {
  age: number;
  flashSec: number;
  burnSec: number;
  overlapSec: number;
  snapshot: EnemyDeathGhostSnapshot;
};

function readKind(e: any): string | null {
  const k = e as HasKind;
  return (k.kind ?? k.type ?? k.tag ?? null) as any;
}

type EnemySpriteFrame = { x: number; y: number; w: number; h: number; px: number; py: number };
type EnemySpriteCandidate = {
  ready?: boolean;
  atlas?: {
    frame: (key: string) => EnemySpriteFrame | null;
    pickAnimFrame: (key: string, tSec: number) => EnemySpriteFrame | null;
  } | null;
  tex?: { ready?: boolean };
};

export function selectEnemySpriteFrame<T extends EnemySpriteCandidate>(
  enemy: {
    typeId?: unknown;
    render?: { sprite?: { id?: unknown; animation?: { id?: unknown; speed?: unknown } } };
    bState?: { phase?: unknown };
  },
  enemySpriteMap: Pick<Map<string, T>, "get">,
  tSec: number,
): { sys: T; frame: EnemySpriteFrame } | null {
  const typeId = String(enemy.typeId ?? "");
  const renderSpriteId = enemy.render?.sprite?.id;
  const spriteId = typeof renderSpriteId === "string" && renderSpriteId.length
    ? renderSpriteId
    : "";
  const spritePrefix = spriteId.split(".").slice(1, -1).join("_") || typeId;
  const sys = enemySpriteMap.get(spritePrefix) ?? enemySpriteMap.get(typeId);
  if (!sys?.ready || !sys.atlas || !sys.tex?.ready) return null;

  const phaseRaw = Number(enemy.bState?.phase ?? 0);
  const deterministicPhase = Number.isFinite(phaseRaw) ? phaseRaw : 0;
  const animation = enemy.render?.sprite?.animation;
  const animationId = typeof animation?.id === "string" && animation.id.length ? animation.id : "";
  const animationSpeed =
    typeof animation?.speed === "number" && Number.isFinite(animation.speed) && animation.speed > 0
      ? animation.speed
      : 1;
  const frame =
    (animationId && sys.atlas.pickAnimFrame(animationId, tSec * animationSpeed + deterministicPhase)) ||
    (spriteId && sys.atlas.frame(spriteId)) ||
    null;

  return frame ? { sys, frame } : null;
}

export type EnemyDeathGhostDrawState<T extends EnemySpriteCandidate = EnemySpriteCandidate> = {
  sys: T;
  frame: EnemySpriteFrame;
  phase: "flash" | "burn";
  tint: [number, number, number];
  opacity: number;
  scale: number;
  hidden: false;
};

export function selectEnemyDeathGhostFrame<T extends EnemySpriteCandidate>(
  deathVisual: DeathVisualFx | undefined,
  enemySpriteMap: Pick<Map<string, T>, "get">,
  renderTimeSec: number,
): EnemyDeathGhostDrawState<T> | null {
  void renderTimeSec;
  if (!deathVisual?.snapshot) return null;

  const visualDef: EnemyDeathVisualDef = {
    flashSec: deathVisual.flashSec,
    burnSec: deathVisual.burnSec,
    overlapSec: deathVisual.overlapSec,
    explosionId: DEFAULT_ENEMY_DEATH_VISUAL.explosionId,
    explosionScale: DEFAULT_ENEMY_DEATH_VISUAL.explosionScale,
  };
  const visualState = computeEnemyDeathVisualState(deathVisual.age, visualDef);
  if (visualState.phase === "hidden" || visualState.opacity <= 0) return null;

  const snapshot = deathVisual.snapshot;
  const phaseRaw = Number((snapshot as any).bState?.phase ?? (snapshot as any).phase ?? 0);
  const deterministicPhase = Number.isFinite(phaseRaw) ? phaseRaw : 0;
  const selected = selectEnemySpriteFrame(
    {
      typeId: snapshot.typeId,
      render: snapshot.render,
      bState: { phase: deterministicPhase },
    },
    enemySpriteMap,
    Math.max(0, Number.isFinite(Number(deathVisual.age)) ? Number(deathVisual.age) : 0),
  );
  if (!selected) return null;

  return {
    sys: selected.sys,
    frame: selected.frame,
    phase: visualState.phase,
    tint: visualState.tint,
    opacity: visualState.opacity,
    scale: snapshot.render?.sprite?.scale ?? 1,
    hidden: false,
  };
}

export type FxRenderLayerKind = "normal" | "deathGhost" | "explosion";

export function classifyFxRenderLayer(entity: { kind?: unknown; type?: unknown; tag?: unknown; deathVisual?: unknown }): FxRenderLayerKind {
  const kind = String(entity.kind ?? entity.type ?? entity.tag ?? "");
  if (kind !== "fx") return "normal";
  return entity.deathVisual ? "deathGhost" : "explosion";
}

export function computeSpriteDrawGeometry(frame: EnemySpriteFrame, scaleRaw: unknown): {
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
} {
  const scale = typeof scaleRaw === "number" && Number.isFinite(scaleRaw) && scaleRaw > 0
    ? scaleRaw
    : 1;
  return {
    width: frame.w * scale,
    height: frame.h * scale,
    pivotX: frame.px * scale,
    pivotY: frame.py * scale,
  };
}

type FxSpriteFrame = EnemySpriteFrame;
type FxSpriteCandidate = EnemySpriteCandidate;

function fxAnimRegistryKeys(animId: string): string[] {
  return animId ? [animId] : [];
}

function fxStaticRegistryKeys(spriteId: string): string[] {
  if (!spriteId) return [];
  const parts = spriteId.split(".");
  return parts.length > 1 ? [parts.slice(0, -1).join("."), spriteId] : [spriteId];
}

export function selectFxSpriteFrame<T extends FxSpriteCandidate>(
  entity: { animId?: unknown; spriteId?: unknown; spawnT?: unknown; fxAge?: unknown },
  fxSpriteSystems: Pick<Map<string, T>, "get">,
  renderTimeSec: number,
): { sys: T; frame: FxSpriteFrame } | null {
  const animId = String(entity.animId ?? "");
  const spriteId = String(entity.spriteId ?? "");
  const fxAgeRaw = Number(entity.fxAge);
  const localT = Number.isFinite(fxAgeRaw)
    ? Math.max(0, fxAgeRaw)
    : Math.max(0, renderTimeSec - (Number.isFinite(Number(entity.spawnT ?? 0)) ? Number(entity.spawnT ?? 0) : 0));

  if (animId) {
    for (const key of fxAnimRegistryKeys(animId)) {
      const sys = fxSpriteSystems.get(key);
      if (!sys?.ready || !sys.atlas || !sys.tex?.ready) continue;
      const frame = sys.atlas.pickAnimFrame(animId, localT);
      if (frame) return { sys, frame };
    }
  }

  if (spriteId) {
    for (const key of fxStaticRegistryKeys(spriteId)) {
      const sys = fxSpriteSystems.get(key);
      if (!sys?.ready || !sys.atlas || !sys.tex?.ready) continue;
      const frame = sys.atlas.frame(spriteId);
      if (frame) return { sys, frame };
    }
  }

  return null;
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

  // ✅ BG demoscene pass

  private uLogic: WebGLUniformLocation;
  private uPos: WebGLUniformLocation;
  private uSize: WebGLUniformLocation;
  private uColor: WebGLUniformLocation;

  private bg: DemosceneBg;
  private bgFlowRibbon: FlowRibbonBg;
  private bgFlowSegments: FlowSegmentsBg;
  private atmosphericFX: AtmosphericFXPass;
  private sdfPass: SdfPass | null;
  private meshPass: MeshPass | null = null;
  private modelCache: Map<string, GpuMesh> = new Map();
  private playerTilt: number = 0;
  private playerThrust: number = 0;

  private accumTime = 0;
  private lastRenderMs = -1;

  private fxSprites: SpriteSystem;
  private fxSpriteSystems: Map<string, SpriteSystem> = new Map();
  private sprites: SpriteSystem;
  private projSprites: SpriteSystem;
  private enemySpriteMap: Map<string, SpriteSystem> = new Map();

  
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


       this.bg = new DemosceneBg(gl);
    this.bgFlowRibbon = new FlowRibbonBg(gl);
    this.bgFlowSegments = new FlowSegmentsBg(gl);
    this.atmosphericFX = createAtmosphericFXPass(gl);
    // SDF vector pass — restores to the main program/VAO/uLogic after each draw.
    // Defensive: a shader compile/link failure must NOT blank the whole scene —
    // degrade to null so entities fall through to the glyph/proc/quad paths.
    try {
      this.sdfPass = createSdfPass(gl, this.logicW, this.logicH, {
        prog: this.prog,
        vao: this.vao,
        uLogic: this.uLogic,
        uColor: this.uColor,
      });
    } catch (e) {
      console.warn("[SdfPass] failed to compile, SDF rendering disabled:", e);
      this.sdfPass = null;
    }
    try {
      this.meshPass = createMeshPass(gl, logicW, logicH);
    } catch (e) {
      console.warn('[MeshPass] shader compile failed:', e);
      this.meshPass = null;
    }
    this.loadModel('player_ship_1', '/models/player_ship_1.glb');
      // Sprite MVP (async load; safe fallback when missing)
      this.sprites = new SpriteSystem(gl);
      void this.sprites.load("/assets/sprites/core.atlas.json", "/assets/sprites/core.png");


    const fxSpriteAssets: Array<{ id: string; atlas: string; png: string }> = [
      { id: "fx.explosion.bug1", atlas: "/assets/sprites/explosion_bug1.atlas.json", png: "/assets/sprites/explosion_bug1.png" },
      { id: "fx.explosion.1", atlas: "/assets/sprites/explosion_1.atlas.json", png: "/assets/sprites/explosion_1.png" },
      { id: "fx.explosion.2", atlas: "/assets/sprites/explosion_2.atlas.json", png: "/assets/sprites/explosion_2.png" },
      { id: "fx.explosion.3", atlas: "/assets/sprites/explosion_3.atlas.json", png: "/assets/sprites/explosion_3.png" },
      { id: "fx.explosion.4", atlas: "/assets/sprites/explosion_4.atlas.json", png: "/assets/sprites/explosion_4.png" },
    ];
    this.fxSprites = new SpriteSystem(gl);
    for (const asset of fxSpriteAssets) {
      const sys = new SpriteSystem(gl);
      void sys
        .load(asset.atlas, asset.png)
        .catch((err) => console.warn(`[SPRITES] fxSprites ${asset.id} load failed`, err));
      this.fxSpriteSystems.set(asset.id, sys);
      if (asset.id === "fx.explosion.bug1") this.fxSprites = sys;
    }

    
    this.projSprites = new SpriteSystem(gl);
    void this.projSprites
      .load("/assets/sprites/w1_projectiles.atlas.json", "/assets/sprites/w1_projectiles.png")
      .catch((err) => console.warn("[SPRITES] projSprites load failed", err));


    // Enemy sprite map — per-typeId sprite systems
    const enemySpriteAssets: Array<{ typeId: string; atlas: string; png: string }> = [
      { typeId: "mine_1",     atlas: "/assets/sprites/mine_1.atlas.json",     png: "/assets/sprites/mine_1.png" },
      { typeId: "crawler_1",  atlas: "/assets/sprites/crawler_1.atlas.json",  png: "/assets/sprites/crawler_1.png" },
      { typeId: "basic_1",    atlas: "/assets/sprites/basic_1.atlas.json",    png: "/assets/sprites/basic_1.png" },
      { typeId: "basic_2",    atlas: "/assets/sprites/basic_2.atlas.json",    png: "/assets/sprites/basic_2.png" },
      { typeId: "shooter_1",  atlas: "/assets/sprites/shooter_1.atlas.json",  png: "/assets/sprites/shooter_1.png" },
      { typeId: "void_1",     atlas: "/assets/sprites/void_1.atlas.json",     png: "/assets/sprites/void_1.png" },
    ];
    for (const asset of enemySpriteAssets) {
      const sys = new SpriteSystem(gl);
      void sys.load(asset.atlas, asset.png)
        .catch((err) => console.warn(`[SPRITES] enemySpriteMap ${asset.typeId} failed`, err));
      this.enemySpriteMap.set(asset.typeId, sys);
    }
    }


  private drawEnemyDeathGhostFx(e: any, ix: number, iy: number, tSec: number): boolean {
    const gl = this.gl;
    const selected = selectEnemyDeathGhostFrame(e?.deathVisual, this.enemySpriteMap, tSec);
    if (!selected) return false;

    const geom = computeSpriteDrawGeometry(selected.frame, selected.scale);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    selected.sys.prog.begin(
      this.logicW,
      this.logicH,
      selected.sys.tex.tex,
      selected.sys.tex.w,
      selected.sys.tex.h,
    );
    selected.sys.prog.draw(
      ix, iy,
      geom.width, geom.height,
      geom.pivotX, geom.pivotY,
      0,
      selected.frame.x, selected.frame.y, selected.frame.w, selected.frame.h,
      selected.tint[0], selected.tint[1], selected.tint[2], selected.opacity,
    );
    selected.sys.prog.end();
    gl.disable(gl.BLEND);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uLogic, this.logicW, this.logicH);
    return true;
  }

  private drawFxSpriteEntity(e: any, ix: number, iy: number, tSec: number): boolean {
    const gl = this.gl;
    const animId = String((e as any).animId ?? "");
    const spriteId = String((e as any).spriteId ?? "");
    void animId;
    void spriteId;
    const selectedFxSprite = selectFxSpriteFrame(e as any, this.fxSpriteSystems, tSec);
    if (!selectedFxSprite) return false;

    const fr = selectedFxSprite.frame;
    const fxSprites = selectedFxSprite.sys;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    fxSprites.prog.begin(
      this.logicW,
      this.logicH,
      fxSprites.tex.tex,
      fxSprites.tex.w,
      fxSprites.tex.h,
    );

    const scale = typeof (e as any).explosionScale === "number" && Number.isFinite((e as any).explosionScale) && (e as any).explosionScale > 0
      ? (e as any).explosionScale
      : 1;
    fxSprites.prog.draw(
      ix, iy,
      fr.w * scale, fr.h * scale,
      fr.px * scale, fr.py * scale,
      0,
      fr.x, fr.y, fr.w, fr.h,
      1, 1, 1, 1,
    );

    fxSprites.prog.end();
    gl.disable(gl.BLEND);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uLogic, this.logicW, this.logicH);
    return true;
  }

  
  private async loadModel(id: string, url: string): Promise<void> {
    console.log('[MeshPass] loadModel START:', id, url);
    try {
      const loaded = await loadGLB(url);
      if (loaded.meshes.length === 0) {
        console.warn(`[MeshPass] no meshes in ${url}`);
        return;
      }
      const gpuMesh = uploadMesh(this.gl, loaded.meshes[0]);
      this.modelCache.set(id, gpuMesh);
      console.log('[MeshPass] loadModel OK:', id, 'meshes:', loaded.meshes.length);
    } catch (e) {
      console.error('[MeshPass] loadModel FAIL:', id, e);
    }
  }

  private drawDebugBackground(sx: number, sy: number): void {
    const gl = this.gl;

    gl.disable(gl.BLEND);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    // dark bg
    gl.uniform4f(this.uColor, 0.04, 0.05, 0.08, 1.0);
    gl.uniform2f(this.uPos, this.logicW * 0.5, this.logicH * 0.5);
    gl.uniform2f(this.uSize, this.logicW, this.logicH);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const grid = 64;

    // vertical
    gl.uniform4f(this.uColor, 1.0, 1.0, 1.0, 0.035);
    const ox = -((sx % grid + grid) % grid);
    for (let x = ox; x < this.logicW; x += grid) {
      gl.uniform2f(this.uPos, x + 0.5, this.logicH * 0.5);
      gl.uniform2f(this.uSize, 1, this.logicH);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // horizontal
    gl.uniform4f(this.uColor, 1.0, 1.0, 1.0, 0.02);
    const oy = -((sy % grid + grid) % grid);
    for (let y = oy; y < this.logicH; y += grid) {
      gl.uniform2f(this.uPos, this.logicW * 0.5, y + 0.5);
      gl.uniform2f(this.uSize, this.logicW, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }
  
  
  private drawGlyphAt(gl: WebGL2RenderingContext, cx: number, cy: number, glyphId: string): boolean {
    const g = getGlyph(glyphId);
    if (!g) return false;

    const w = Number(g.w) | 0;
    const h = Number(g.h) | 0;
    const px = (Number(g.px ?? 1) || 1);
    const bits = String(g.bits ?? "");

    if (w <= 0 || h <= 0) return false;
    if (bits.length !== w * h) return false;

    const isObelisk = glyphId.startsWith("enemy.obelisk.");

    // center glyph on (cx, cy); uPos expects center coordinates
    const outW = isObelisk ? h : w; // rotated 90° => width becomes h
    const outH = isObelisk ? w : h; // rotated 90° => height becomes w

    const halfW = (outW * px) * 0.5;
    const halfH = (outH * px) * 0.5;

    // IMPORTANT: snap base to integer to kill shimmer
    const baseX0 = Math.round(cx - halfW + px * 0.5);
    const baseY0 = Math.round(cy - halfH + px * 0.5);

    // draw each "on" cell as a tiny quad (existing debug program)
    // NOTE: color must already be set via uColor by caller
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (bits.charCodeAt(i) !== 49) continue; // '1'

        // rotate 90° left for obelisk glyphs
        const xx = isObelisk ? y : x;
        const yy = isObelisk ? (w - 1 - x) : y;

        const pxX = baseX0 + Math.round(xx * px);
        const pxY = baseY0 + Math.round(yy * px);

        gl.uniform2f(this.uPos, pxX, pxY);
        gl.uniform2f(this.uSize, px, px);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }
    return true;
    }

  private drawGlyphStackAt(
    gl: WebGL2RenderingContext,
    cx: number,
    cy: number,
    tSec: number,
    phase: number,
    baseCol: string | null,
    glyphs: any
  ): boolean {
    if (!Array.isArray(glyphs) || glyphs.length === 0) return false;

    const parseHex = (c: string | null | undefined): [number, number, number] => {
      if (!c || typeof c !== "string") return [1, 1, 1];
      const m = /^#?([0-9a-fA-F]{6})$/.exec(c.trim());
      if (!m) return [1, 1, 1];
      const n = parseInt(m[1], 16);
      const r = ((n >> 16) & 255) / 255;
      const g = ((n >> 8) & 255) / 255;
      const b = (n & 255) / 255;
      return [r, g, b];
    };

    const [br, bg, bb] = parseHex(baseCol);
    let blendOn = false;

    for (const it of glyphs) {
      if (!it) continue;

      const rawId = (it as any).id;
      if (!(typeof rawId === "string" || typeof rawId === "number")) continue;

      const id = String(rawId);
      if (!id) continue;

      const dx0 = Number(it.dx ?? 0);
      const dy0 = Number(it.dy ?? 0);

      // optional per-glyph bob (dev-friendly idle motion)
      const bobHz = Number(it.bobHz ?? 0);
      const bobAmpX = Number(it.bobAmpX ?? 0);
      const bobAmpY = Number(it.bobAmpY ?? 0);
      const bobPhase = Number(it.bobPhase ?? 0);

      let dx = dx0;
      let dy = dy0;

      if (Number.isFinite(bobHz) && bobHz > 0 && (bobAmpX || bobAmpY)) {
        const tt = (tSec + (Number.isFinite(bobPhase) ? bobPhase : 0)) * Math.PI * 2 * bobHz;
        const s = Math.sin(tt);
        const c = Math.cos(tt);
        if (Number.isFinite(bobAmpX) && bobAmpX) dx += c * bobAmpX;
        if (Number.isFinite(bobAmpY) && bobAmpY) dy += s * bobAmpY;
      }

     



      


      const col = (typeof it.color === "string" && it.color.length) ? it.color : null;
      const [r, g, b] = col ? parseHex(col) : [br, bg, bb];

      let a = Number(it.alpha ?? 1);
      if (!Number.isFinite(a)) a = 1;
      a = Math.max(0, Math.min(1, a));

        const pulseHz = Number(it.pulseHz ?? 0);
        const pulseAmp = Number(it.pulseAmp ?? 0);
        if (Number.isFinite(pulseHz) && pulseHz > 0 && Number.isFinite(pulseAmp) && pulseAmp > 0) {
          const s = Math.sin((tSec + phase) * Math.PI * 2 * pulseHz);
        const k = 1 + s * Math.max(0, Math.min(1, pulseAmp));
        a = Math.max(0, Math.min(1, a * k));
      }

      if (!blendOn && a < 0.999) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        blendOn = true;
      }

      gl.uniform4f(this.uColor, r, g, b, a);

      // IMPORTANT: snap final to integer to kill shimmer
      const x = Math.round(cx + dx);
      const y = Math.round(cy + dy);

      this.drawGlyphAt(gl, x, y, id);
      }
    if (blendOn) gl.disable(gl.BLEND);
    gl.uniform4f(this.uColor, 1, 1, 1, 1);

    return true;
      }

  
  private drawProcPartsAt(
    gl: WebGL2RenderingContext,
    cx: number,
    cy: number,
    tSec: number,
    phase: number,
    baseCol: string | null,
    proc: any
  ): boolean {
    if (!proc || proc.kind !== "parts" || !Array.isArray(proc.parts)) return false;

    const parseHex = (c: string | null | undefined): [number, number, number] => {
      if (!c || typeof c !== "string") return [1, 1, 1];
      const m = /^#?([0-9a-fA-F]{6})$/.exec(c.trim());
      if (!m) return [1, 1, 1];
      const n = parseInt(m[1], 16);
      const r = ((n >> 16) & 255) / 255;
      const g = ((n >> 8) & 255) / 255;
      const b = (n & 255) / 255;
      return [r, g, b];
    };

    const [br, bg, bb] = parseHex(baseCol);

    let blendOn = false;

    for (const part of proc.parts) {
      if (!part) continue;

      const dx = Number(part.dx ?? 0);
      const dy = Number(part.dy ?? 0);
      const w = Number(part.w ?? 0);
      const h = Number(part.h ?? 0);
      if (!(w > 0) || !(h > 0)) continue;

      const col = (typeof part.color === "string" && part.color.length) ? part.color : null;
      const [r, g, b] = col ? parseHex(col) : [br, bg, bb];

      let a = Number(part.alpha ?? 1);
      if (!Number.isFinite(a)) a = 1;
      a = Math.max(0, Math.min(1, a));

      const pulseHz = Number(part.pulseHz ?? 0);
      const pulseAmp = Number(part.pulseAmp ?? 0);
      if (Number.isFinite(pulseHz) && pulseHz > 0 && Number.isFinite(pulseAmp) && pulseAmp > 0) {
        const s = Math.sin((tSec + (Number.isFinite(phase) ? phase : 0)) * Math.PI * 2 * pulseHz);
        const k = 1 + s * Math.max(0, Math.min(1, pulseAmp));
        a = Math.max(0, Math.min(1, a * k));
      }

      if (!blendOn && a < 0.999) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        blendOn = true;
      }

      gl.uniform2f(this.uPos, cx + dx, cy + dy);
      gl.uniform2f(this.uSize, w, h);
      gl.uniform4f(this.uColor, r, g, b, a);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    if (blendOn) gl.disable(gl.BLEND);
    gl.uniform4f(this.uColor, 1, 1, 1, 1);

    return true;
  }

  render(alpha: number = 1): void {
    const gl = this.gl;

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.uniform2f(this.uLogic, this.logicW, this.logicH);


    // --- DEBUG BACKGROUND (world scroll aware)
    const world = (window as any).__CM?.game?.world;
    const sx = Number(world?.scrollX ?? 0);
    const sy = Number(world?.scrollY ?? 0);

    // sprite anim time
    const nowMs = performance.now();
    if (this.lastRenderMs < 0) this.lastRenderMs = nowMs;
    const dt = Math.min((nowMs - this.lastRenderMs) / 1000, 0.05);
    this.lastRenderMs = nowMs;
    this.accumTime += dt;
    const tSec = this.accumTime;
    const bgKind = String((globalThis as any).__CM_BG_KIND__ ?? "shader");
    const presetIndex = Number((globalThis as any).__CM_BG_PRESET__ ?? 0) | 0;

    // BG pass (shader or flow)
    if (bgKind === "flow") {
      const labKind = String((globalThis as any).__CM_BG_LAB__?.kind ?? "flowRibbon");

      if (labKind === "flowSegments") {
        this.bgFlowSegments.draw({
          logicW: this.logicW,
          logicH: this.logicH,
          timeSec: tSec,
          scrollX: sx,
          scrollY: sy,
          presetIndex,
          disturbances: this.collectFlowDisturbances(sx, sy),
        });
      } else {
        // default: flowRibbon
        this.bgFlowRibbon.draw({
          logicW: this.logicW,
          logicH: this.logicH,
          timeSec: tSec,
          scrollX: sx,
          scrollY: sy,
          presetIndex,
        });
      }
    } else {
      this.bg.draw({
        logicW: this.logicW,
        logicH: this.logicH,
        timeSec: tSec,
        scrollX: sx,
        scrollY: sy,
        presetIndex,
      });
    }
    // this.drawDebugBackground(sx, sy);

    // clamp once per frame
    const a = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    const deathGhostFx: Array<{ e: any; ix: number; iy: number }> = [];
    const explosionFx: Array<{ e: any; ix: number; iy: number; w: number; h: number }> = [];

    // ECS iterates recycled slots, not spawn order. Collect enemies separately
    // and draw older IDs first so every newly spawned enemy appears on top.
    const enemyRenderOrder: Array<{
      e: any;
      spawnId: number;
      collectIndex: number;
    }> = [];

    let enemyCollectIndex = 0;
    this.store.debugForEachAlive((_ref, e: any) => {
      if (!e || readKind(e) !== "enemy") return;

      const rawId = Number(e.id);
      enemyRenderOrder.push({
        e,
        spawnId: Number.isFinite(rawId) ? rawId : 0,
        collectIndex: enemyCollectIndex++,
      });
    });

    enemyRenderOrder.sort(
      (left, right) =>
        left.spawnId - right.spawnId ||
        left.collectIndex - right.collectIndex,
    );

    let enemyDrawIndex = 0;

    this.store.debugForEachAlive((_ref, storedEntity: any) => {
      let e = storedEntity;

      if (e && readKind(e) === "enemy") {
        e = enemyRenderOrder[enemyDrawIndex++]?.e ?? e;
      }

      if (!e) return;

      const kind = readKind(e);
      const pos = (e as HasPos).pos;
      if (!pos || !kind) return;

      const r =
        typeof (e as HasRadius).radius === "number" ? (e as HasRadius).radius : null;

      let w = r ? r * 2 : 6;
      let h = r ? r * 2 : 6;

      if (kind === "player") {
        // --- SPRITE PATH (if ready) ---
          if (this.sprites?.ready && this.sprites.atlas) {
            // sprite path – nothing needed here (actual draw is later)
          } else {
          // fallback sizes + color (old behavior)
          w = 6;
          h = 6;

          const hf = Number((e as any).hitFlashT ?? 0);
          const flashOn = Number.isFinite(hf) && hf > 0;

          if (flashOn) gl.uniform4f(this.uColor, 1, 1, 1, 1);
          else gl.uniform4f(this.uColor, 0, 1, 1, 1);
        }
      } else if (kind === "enemy") {
        const hf = Number((e as any).hitFlashT ?? 0);
        const flashOn = Number.isFinite(hf) && hf > 0;

        if (flashOn) {
          gl.uniform4f(this.uColor, 1, 1, 1, 1);
        } else {
          const col = (e as HasRender).render?.color;
          if (typeof col === "string") {
            const [cr, cg, cb] = hexToRgb(col);
            gl.uniform4f(this.uColor, cr, cg, cb, 1);
          } else {
            gl.uniform4f(this.uColor, 1, 0, 0, 1);
          }
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
        if (typeof col === "string") {
          const [cr, cg, cb] = hexToRgb(col);
          gl.uniform4f(this.uColor, cr, cg, cb, 1);
        } else {
          gl.uniform4f(this.uColor, 1, 1, 1, 1);
        }
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
      // Camera: ALL gameplay entities live in WORLD space (unified contract),
      // so every entity converts world -> screen the same way.
      ix -= sx;
      iy -= sy;
      const fxLayer = classifyFxRenderLayer(e as any);
      if (fxLayer === "deathGhost") {
        deathGhostFx.push({ e, ix, iy });
        return;
      }
      if (fxLayer === "explosion") {
        explosionFx.push({ e, ix, iy, w, h });
        return;
      }
      // --- PROC PARTS PATH (vector parts) + GLYPH STACK PATH (composite) + GLYPH PATH (single)
      const baseColStr = (e as any).render?.color;
      const baseCol = (typeof baseColStr === "string" && baseColStr.length) ? baseColStr : null;

      // stable phase seed for desync (prefer spawnOrdinal, fallback to id)
      const phaseSeed =
        (typeof (e as any).spawnOrdinal === "number" && Number.isFinite((e as any).spawnOrdinal))
          ? (e as any).spawnOrdinal
          : ((e as any).id ?? 0);

      // ── Mesh rendering (low-poly 3D) ──
      const rm = (e as any).render?.mesh;
      if (rm && this.meshPass && this.modelCache.has(rm.modelId)) {
        const gpuMesh = this.modelCache.get(rm.modelId)!;

        const velY = safeNum((e as any).vel?.y, 0);
        const targetTilt = Math.max(-0.45, Math.min(0.45, velY * 0.004));
        this.playerTilt += (targetTilt - this.playerTilt) * 0.04;

        this.meshPass.draw({
          mesh:  gpuMesh,
          x:     ix,
          y:     iy,
          scale: rm.scale ?? 1.0,
          rotX:  rm.rotX   ?? 0,
          rotY:  rm.rotY   ?? 0,
          rotZ:  (rm.rotZ ?? 0) - this.playerTilt,
          paletteId: rm.paletteId ?? 'player',
        });

        // ── Thrusters ──────────────────────────────────────────
        if (this.sdfPass) {
          // Thrust z velocity
          const mVelX = safeNum((e as any).vel?.x, 0);
          const mVelY = safeNum((e as any).vel?.y, 0);
          const mSpeed = Math.sqrt(mVelX * mVelX + mVelY * mVelY);
          const tTarget = mSpeed < 1.0 ? 0.1
            : mVelX >= 0
              ? Math.min(1.0, mSpeed / 150.0)
              : 0.1;   // vzad = idle thruster
          this.playerThrust += (tTarget - this.playerThrust) * 0.05;

          const sc   = rm.scale ?? 1.0;
          const thrR = sc * 0.35;      // radius thrustu
          const thrX = ix - sc * 0.28; // pozice za lodí

          // Hlavní thruster
          this.sdfPass.draw({
            ix: thrX,
            iy: iy,
            radius:   thrR,
            shape:    'thruster',
            color:    '#ff6600',
            hpRatio:  1.0,
            time:     this.accumTime,
            hitFlash: 0,
            thrust:   this.playerThrust,
          });

          // Wingtip thrusters — aktivní při tiltu
          const tiltMag = Math.abs(this.playerTilt);
          if (tiltMag > 0.05) {
            const wingY    = sc * 0.22;
            const wingR    = thrR * 0.45;
            const wingThr  = Math.min(1.0, tiltMag * 2.5);
            const wingX    = ix - sc * 0.20;

            this.sdfPass.draw({
              ix: wingX, iy: iy - wingY,
              radius: wingR, shape: 'thruster',
              color: '#ff9900', hpRatio: 1.0,
              time: this.accumTime, hitFlash: 0,
              thrust: wingThr,
            });

            this.sdfPass.draw({
              ix: wingX, iy: iy + wingY,
              radius: wingR, shape: 'thruster',
              color: '#ff9900', hpRatio: 1.0,
              time: this.accumTime, hitFlash: 0,
              thrust: wingThr,
            });
          }
        }

        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);

        return;
      }

      // Laser — beam from ship to right edge
      if (kind === "laser") {
        if (this.sdfPass) {
          const laserStartX = ix;
          const laserEndX   = this.logicW + 50.0;
          const laserRadius = (this.logicW + 50.0) * 0.5;
          const laserMidX   = laserStartX + laserRadius;

          this.sdfPass.draw({
            ix:       laserMidX,
            iy:       iy,
            radius:   laserRadius,
            shape:    'laser',
            color:    '#ffffff',
            hpRatio:  1.0,
            time:     tSec,
            hitFlash: 0,
            thrust:   0,
          });
        }
        return;
      }

      // 0) Enemy sprite path — must run before SDF/proc/glyph fallback.
      if (kind === "enemy") {
        const selected = selectEnemySpriteFrame(e as any, this.enemySpriteMap, tSec);
        if (selected) {
          const { sys, frame: fr } = selected;
          const geom = computeSpriteDrawGeometry(fr, (e as any).render?.sprite?.scale);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

          sys.prog.begin(
            this.logicW,
            this.logicH,
            sys.tex.tex,
            sys.tex.w,
            sys.tex.h,
          );
          sys.prog.draw(
            ix, iy,
            geom.width, geom.height,
            geom.pivotX, geom.pivotY,
            0,
            fr.x, fr.y, fr.w, fr.h,
            1, 1, 1, 1,
          );
          sys.prog.end();
          gl.disable(gl.BLEND);

          gl.useProgram(this.prog);
          gl.bindVertexArray(this.vao);
          gl.uniform2f(this.uLogic, this.logicW, this.logicH);
          return;
        }
      }

      // 0) SDF vector shape (highest priority — short-circuits all other paths).
      // Skipped entirely if the pass failed to compile (this.sdfPass === null).
      const sdf = (e as any).render?.sdf;
      if (this.sdfPass && sdf && typeof sdf.shape === "string") {
        // HP ratio drives deformation; fall back to player energy when no hp.
        const hpNow = safeNum((e as any).hp ?? (e as any).energy, 1);
        const hpMax = safeNum((e as any).maxHp ?? (e as any).energyMax, 1);
        const hpRatio = hpMax > 0 ? Math.max(0, Math.min(1, hpNow / hpMax)) : 1;
        const sizeMult = safeNum(sdf.size, 1);
        const velX = safeNum((e as any).vel?.x, 0);
        const velY = safeNum((e as any).vel?.y, 0);
        const speed = Math.sqrt(velX * velX + velY * velY);
        const thrust = speed < 1.0
          ? 0.0
          : velX >= 0
            ? Math.min(1.0, speed / 150.0)
            : Math.max(0.1, speed / 300.0);

        this.sdfPass.draw({
          ix,
          iy,
          radius: safeNum((e as any).radius, 10) * sizeMult,
          shape: sdf.shape,
          color: typeof sdf.color === "string" ? sdf.color : (baseCol ?? "#ffffff"),
          hpRatio,
          time: tSec,
          hitFlash: safeNum((e as any).hitFlashT, 0),
          thrust: thrust,
        });
        return;
      }

      // 1) procedural parts
      const proc = (e as any).render?.proc ?? (e as any).proc;
      if (proc && proc.kind === "parts") {
        const okp = this.drawProcPartsAt(gl, ix, iy, tSec, phaseSeed, baseCol, proc);
        if (okp) return;
      }

      // 2) glyph stack
      const glyphs = (e as any).render?.glyphs;
      if (glyphs && Array.isArray(glyphs) && glyphs.length) {
        const okg = this.drawGlyphStackAt(gl, ix, iy, tSec, phaseSeed, baseCol, glyphs);
        if (okg) return;
      }

       // 3) single glyph fallback
       const glyphId = (e as any).render?.glyphId ?? (e as any).glyphId;
       if (glyphId) {
         const ok = this.drawGlyphAt(gl, ix, iy, String(glyphId));
         if (ok) return;
       }

        // --- SPRITE DRAW (player only) ---
      if (kind === "player" && this.sprites?.ready && this.sprites.atlas) {
        const atlas = this.sprites.atlas;

        const body = atlas.frame("ship.player.body.0");
        const thr = atlas.pickAnimFrame("ship.player.thruster", tSec);

        if (body && this.sprites.tex.ready) {
          // enable alpha for sprite pass
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);



          // Prefer explicit rot (computed in main), fallback to aimDir ONLY when rot is missing/invalid
          const entRot = (e as any).rot;

          let rot: number;
          const hasRot = typeof entRot === "number" && Number.isFinite(entRot);

          if (hasRot) {
            rot = entRot;
          } else {
            const ad = (e as any).aimDir;
            const ax = typeof ad?.x === "number" ? ad.x : 1;
            const ay = typeof ad?.y === "number" ? ad.y : 0;

            // core.png orientation tweak:
            // 0 = sprite points RIGHT (+X)
            // -PI/2 = sprite points UP
            // +PI/2 = sprite points DOWN
            // PI = sprite points LEFT
            const ROT_OFFSET = 0;

            // our sprite shader flips Y in NDC => -atan2 is typically correct
            rot = -Math.atan2(ay, ax) + ROT_OFFSET;
          }

          // hard safety (prevents NaN => "no rotation")
          if (!Number.isFinite(rot)) rot = 0;

          // draw
          this.sprites.prog.begin(
            this.logicW,
            this.logicH,
            this.sprites.tex.tex,
            this.sprites.tex.w,
            this.sprites.tex.h,
          );

          // body (pivoted)
          this.sprites.prog.draw(
            ix,
            iy,
            body.w,
            body.h,
            body.px,
            body.py,
            rot,
            body.x,
            body.y,
            body.w,
            body.h,
            1,
            1,
            1,
            1,
          );

          // thruster layer (optional)
          if (thr) {
            // offset behind ship along -forward (derived from rot)
            const dx = Math.cos(-rot);
            const dy = Math.sin(-rot);

            const back = 10; // px (tweak later)
            const tx = ix - dx * back;
            const ty = iy - dy * back;

            this.sprites.prog.draw(
              tx,
              ty,
              thr.w,
              thr.h,
              thr.px,
              thr.py,
              rot,
              thr.x,
              thr.y,
              thr.w,
              thr.h,
              1,
              1,
              1,
              1,
            );
          }

          this.sprites.prog.end();

          // restore for quad path
          gl.disable(gl.BLEND);

          // IMPORTANT: sprite path handled, skip quad draw for this entity
          gl.useProgram(this.prog);
          gl.bindVertexArray(this.vao);
          gl.uniform2f(this.uLogic, this.logicW, this.logicH);
          return;



          
        }
      }


      // --- SPRITE DRAW (projectile W1) ---
      if (kind === "projectile" && this.projSprites?.ready && this.projSprites.atlas && this.projSprites.tex.ready) {
        const atlas = this.projSprites.atlas;

        // anim frame (desync per-entity using ref)
        const refStr = String(_ref ?? "");
        let hsh = 0;
        for (let i = 0; i < refStr.length; i++) hsh = (hsh * 31 + refStr.charCodeAt(i)) | 0;
        const phase = ((hsh >>> 0) % 1000) / 1000;

        const weaponTypeId = String((e as any).weaponTypeId ?? "");
        const animId =
          weaponTypeId === "w1.basic" ? "projectile.w1" :
          "projectile.w1"; // fallback for now

        const fr = atlas.pickAnimFrame(animId, tSec + phase);
        if (fr) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

          // rotation from velocity
          const v = (e as any).vel;
          const vx = typeof v?.x === "number" ? v.x : 1;
          const vy = typeof v?.y === "number" ? v.y : 0;

          // pokud tvoje střela míří doprava v PNG, ROT_OFFSET = 0
          const ROT_OFFSET = 0;
          const rot = Math.atan2(vy, vx) + ROT_OFFSET;

          this.projSprites.prog.begin(
            this.logicW,
            this.logicH,
            this.projSprites.tex.tex,
            this.projSprites.tex.w,
            this.projSprites.tex.h,
          );

          // uPos je střed entity; pivot máme 16,8 => sedí
          this.projSprites.prog.draw(
            ix, iy,
            fr.w, fr.h,
            fr.px, fr.py,
            rot,
            fr.x, fr.y, fr.w, fr.h,
            1, 1, 1, 1,
          );

          this.projSprites.prog.end();
          gl.disable(gl.BLEND);

          // restore quad pipeline for subsequent entities (enemies, pickups, etc.)
          gl.useProgram(this.prog);
          gl.bindVertexArray(this.vao);
          gl.uniform2f(this.uLogic, this.logicW, this.logicH);

          return;
        }
      }

      // --- QUAD FALLBACK (original) ---
      gl.uniform2f(this.uPos, ix, iy);
      gl.uniform2f(this.uSize, w, h);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });

    for (const fx of deathGhostFx) {
      this.drawEnemyDeathGhostFx(fx.e, fx.ix, fx.iy, tSec);
    }

    for (const fx of explosionFx) {
      if (this.drawFxSpriteEntity(fx.e, fx.ix, fx.iy, tSec)) continue;
      gl.uniform4f(this.uColor, 0, 1, 1, 1);
      gl.uniform2f(this.uPos, fx.ix, fx.iy);
      gl.uniform2f(this.uSize, fx.w, fx.h);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.bindVertexArray(null);
  }
// --- BG flow disturbances: blast/hit ripples that perturb the flow field ---
  // Reads the same VFXSystem ring buffers the renderer already consumes (no new
  // event wiring) and converts each live source to a SCREEN-space disturbance.
  // Two sources are combined into one list:
  //   explosions -> kick 180 px/s, reach = radius × 2.5 (big shockwave)
  //   hits       -> kick  60 px/s, reach = (count×step) × 1.2 (local ripple)
  private collectFlowDisturbances(sx: number, sy: number): FlowDisturbance[] {
    const vfx = (window as any).__CM?.game?.vfx;
    if (!vfx) return NO_FLOW_DISTURB;

    const out: FlowDisturbance[] = [];

    if (vfx.getExplosions) {
      const list = vfx.getExplosions();
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || !e.alive) continue;
        out.push({
          x: e.x - sx,
          y: e.y - sy,
          radius: Math.max(1, Number(e.radius) || 0) * 2.5,
          age: e.age,
          ttl: e.ttl,
          kick: 180,
        });
      }
    }

    if (vfx.getHits) {
      const list = vfx.getHits();
      for (let i = 0; i < list.length; i++) {
        const h = list[i];
        if (!h || !h.alive) continue;
        // hits carry no explicit radius -> use their spark spread (count×step).
        const baseR = Math.max(8, (h.count | 0) * (Number(h.step) || 0));
        out.push({
          x: h.x - sx,
          y: h.y - sy,
          radius: baseR * 1.2,
          age: h.age,
          ttl: h.ttl,
          kick: 60,
        });
      }
    }

    return out;
  }

// --- VFX: muzzle + tracers + hits (no ECS, no allocations) ---
  renderVFX(vfx: any): void {
    if (!vfx) return;

    const gl = this.gl;

    const world = (window as any).__CM?.game?.world;
    const sx = Number(world?.scrollX ?? 0);
    const sy = Number(world?.scrollY ?? 0);

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

      // cosine-palette muzzle color: bright gold -> deep orange over its life.
      const [mr, mg, mb] = cosinePalette(t, MUZZLE_PALETTE.a, MUZZLE_PALETTE.b, MUZZLE_PALETTE.c, MUZZLE_PALETTE.d);
      gl.uniform4f(this.uColor, mr, mg, mb, alpha);
      // Addendum D fix: fx.x/fx.y are WORLD coords -> subtract camera.
      gl.uniform2f(this.uPos, Math.round(px - sx), Math.round(py - sy));
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

      const n = Math.max(1, Math.floor(fx.len / Math.max(0.001, fx.step)));
      for (let k = 0; k < n; k++) {
        const d = k * fx.step;
        const px = fx.x + fx.dx * d;
        const py = fx.y + fx.dy * d;

        const tail = 1.0 - k / n;
        const sz = fx.size * (0.6 + 0.4 * tail);

        // cosine-palette gradient ALONG the beam (cyan-green head -> green tail).
        const [tr, tg, tb] = cosinePalette(tail, TRACER_PALETTE.a, TRACER_PALETTE.b, TRACER_PALETTE.c, TRACER_PALETTE.d);
        gl.uniform4f(this.uColor, tr, tg, tb, alpha);
        // Addendum D fix: fx.x/fx.y are WORLD coords -> subtract camera.
        gl.uniform2f(this.uPos, Math.round(px - sx), Math.round(py - sy));
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

        const outward = 60;
        const dist = k * step + outward * (fx.age / fx.ttl);

        const j = (Math.sin((k + 1) * 12.9898 + fx.age * 60.0) * 43758.5453) % 1;
        const jitter = (j - 0.5) * step * 0.35;

        const px = fx.x + Math.cos(ang) * (dist + jitter);
        const py = fx.y + Math.sin(ang) * (dist + jitter);

        const grow = 1.0 + t * 0.8;
        // Addendum D fix: fx.x/fx.y are WORLD coords -> subtract camera.
        gl.uniform2f(this.uPos, Math.round(px - sx), Math.round(py - sy));
        gl.uniform2f(this.uSize, fx.size * grow, fx.size * grow);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }
  }

  // EXPLOSIONS quad ring — deaktivováno, nahrazeno fx-entity sprite (Fáze 2)
  // Shockwave efekt se vrátí jako samostatná vrstva pro velké exploze.
  if (false && vfx.getExplosions) {
    const list = vfx.getExplosions();
    for (let i = 0; i < list.length; i++) {
      const fx = list[i];
      if (!fx.alive) continue;

      const t = Math.min(1.0, fx.age / fx.ttl);
      const ease = 1.0 - (1.0 - t) * (1.0 - t); // easeOut for the ring radius
      const alpha = (1.0 - t) * (1.0 - t);

      const cx = fx.x - sx;
      const cy = fx.y - sy;

      // core flash (shrinks as it fades)
      const flash = Math.max(2, fx.radius * (0.30 + 0.30 * (1.0 - t)));
      gl.uniform4f(this.uColor, 1.0, 0.85, 0.45, alpha);
      gl.uniform2f(this.uPos, Math.round(cx), Math.round(cy));
      gl.uniform2f(this.uSize, flash, flash);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // expanding ring of dots out to fx.radius
      const ring = fx.radius * ease;
      const count = 16;
      const sz = 3.0 + 2.0 * (1.0 - t);
      gl.uniform4f(this.uColor, 1.0, 0.55, 0.2, alpha);
      for (let k = 0; k < count; k++) {
        const ang = (k / count) * Math.PI * 2;
        const px = cx + Math.cos(ang) * ring;
        const py = cy + Math.sin(ang) * ring;
        gl.uniform2f(this.uPos, Math.round(px), Math.round(py));
        gl.uniform2f(this.uSize, sz, sz);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }
  }

  gl.bindVertexArray(null);
}

  // --- Atmospheric FX overlay (Visual Layer 2): audio-reactive energy field.
  // Drawn AFTER entities + VFX so it gets the same CRT post-process downstream.
  // Honors the same KeyF toggle as PostProcessPass (__CM_FX__ === false -> off).
  renderAtmosphere(
    timeSec: number,
    freqs: Float32Array | null,
    hasExplosionOrHit = false,
    scrollX = 0,
  ): void {
    if ((globalThis as any).__CM_FX__ === false) return;
    this.atmosphericFX.draw({
      logicW: this.logicW,
      logicH: this.logicH,
      timeSec,
      freqs,
      hasExplosionOrHit,
      scrollX,
    });
  }
}
