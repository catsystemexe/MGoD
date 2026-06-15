# 04 – Rendering & Visual Systems

Two cooperating folders:
- **`src/graphics/`** — owns the WebGL2 context, render targets, and the final
  present/letterbox blit (the "frame").
- **`src/render/`** — owns *what* is drawn: the scene renderer, sprites, vector
  glyphs, and procedural backgrounds.

> ⚠️ **Important caveat:** the tip of the audited branch (`4afc4f4`) contains a
> **runtime regression in `WebGLSceneRenderer.render()`** that almost certainly
> prevents the game from rendering. Details in `09_open_questions.md` and the
> "Known regression" box below. Everything described here is the *intended*
> pipeline as written.

## The frame pipeline

```
main.ts frame(now):
  loop.step(dt)                       // advance fixed-timestep simulation
  vfx.update(dt)                      // age cosmetic particles
  compute player aimDir / rot         // per-frame cosmetic
  gfx.renderScene(() => {             // bind scene RT, clear black
     renderer.render(alpha)           //   background + entities + glyphs/sprites
     renderer.renderVFX(vfx)          //   muzzle / tracer / hit particles
  })
  gfx.present()                       // blit scene RT → screen, letterboxed
```

- **Logic resolution:** 896×504 (`Graphics(canvas, "classic_896x504")`).
- **`Graphics`** creates a WebGL2 context (`alpha/antialias/depth/stencil=false`,
  manual premultiplied-alpha) and a `scene` render target (NEAREST, pixel-perfect).
  A second `enemies` RT (LINEAR) is allocated but unused.
- **`PresentPass`/`BlitProgram`/`DisplayRenderer`** compute an **integer scale**
  and centered letterbox, then blit the scene texture to the screen with a single
  fullscreen-triangle draw (no VBO; vertices from `gl_VertexID`). The present rect
  is fed back to `InputManager` and the HUD so input/UI align with the letterbox.
- **`gl.ts`, `RenderTarget.ts`** are minimal WebGL2 helpers.

## WebGLSceneRenderer (`render/webgl/WebGLSceneRenderer.ts`, ~1000 lines)

The orchestrator. Per frame it:
1. **Draws the background** — shader (`DemosceneBg`) or one of two CPU flow
   systems (`FlowRibbonBg` / `FlowSegmentsBg`), selected by `__CM_BG_*` globals.
2. **Iterates every alive entity** (`store.debugForEachAlive`) and renders, in
   priority order:
   - **Procedural "parts"** (`drawProcPartsAt`) — solid colored quads from
     `render.proc.parts[{dx,dy,w,h,color,alpha,pulseHz,pulseAmp}]`. The **player
     ship** uses this (white body + blue nose + pulsing orange fin).
   - **Glyph stack** (`drawGlyphStackAt`) — composite vector glyphs from
     `render.glyphs[{id,dx,dy,color,alpha,bobHz,bobAmpX,bobAmpY,pulseHz,pulseAmp}]`.
     Each "1" bit of a glyph becomes a `px×px` quad, integer-snapped; supports
     per-glyph bob/pulse and special 90° rotation for `enemy.obelisk.*`. All
     current enemy types render via glyph stacks (see `enemyTypes.json`).
   - **Single glyph** (`drawGlyphAt`) — fallback for `render.glyphId`.
   - **Sprites** — player/projectile/enemy/FX via the sprite atlas pipeline.
   - **Quad fallback** — a solid colored rect by `kind`.
3. **Interpolation & camera:** lerps `posPrev → pos` by the loop `alpha`, snaps to
   integer pixels (to avoid shimmer). Player/projectile/bomb render in
   **screen space**; enemies/pickups are offset by `world.scrollX/Y`
   (**world space**) — matching the coordinate rules in
   `docs/architecture/world_movement_rules_MVP.md`.

### Vector vs sprite vs glyph
The renderer supports **three visual representations simultaneously**:
- **Procedural vector parts** — pure quads, used for the player.
- **Vector "glyphs"** — hardcoded bitmaps in `GlyphDB.ts` (`{w,h,px,bits}` where
  `bits` is a row-major `'0'/'1'` string), composited as glyph stacks; the
  current enemy look.
- **Sprite atlases** — PNG + JSON atlas (player ship, `w1` projectiles,
  `enemy_bug1`, `explosion_bug1`) via the `render/sprites/` pipeline
  (`SpriteSystem` = `SpriteAtlas` + `SpriteTexture` + `SpriteProgram`), with
  per-entity hash-desynced animation and rotation-about-pivot.

The coexistence of all three is a result of the sprite→glyph aesthetic pivot (see
history); the glyph path is the newest and the de-facto current style.

## VFX (`game/vfx/VFXSystem.ts`)

A small, **non-allocating ring-buffer** particle system (64 each) for **cosmetic**
effects only (no gameplay impact, updated per render-frame, not per tick):
- **Muzzle** flashes (golden, grow+fade), **tracers** (green dotted chain along
  fire direction), **hit sparks** (white radial spray with pseudo-random jitter).
Hooked up via `WeaponSystem.onSpawnProjectile/onTracer` and
`DamageSystem.onHitSpark`. Rendered by `renderer.renderVFX`.

## RenderSystem (`game/render/RenderSystem.ts`) — DORMANT

A Canvas2D debug renderer (grid, stars, colored entity boxes). Fully **superseded
by the WebGL renderer** and not in the live path. Vestigial.

## Known regression (verified by static analysis, tip commit `4afc4f4`)

`WebGLSceneRenderer.render()` references identifiers that are **not declared**:
- `bgKind` and `presetIndex` — used but never defined in scope or module
  (they should read `globalThis.__CM_BG_KIND__` / `__CM_BG_PRESET__`).
- `this.bgSegments` / `this.bgFlow` — the actual class fields are
  `this.bgFlowSegments` / `this.bgFlowRibbon`.

Because Vite/esbuild does **not** type-check, this is not caught at build time;
in ES-module strict mode it throws a `ReferenceError` on `bgKind` **every frame**,
which `main.ts`'s `frame()` try/catch would surface as "FRAME CRASH". The previous
commit (`HEAD~1`) does **not** contain these references, so the last commit
("Add new enemy types and background visual effects") appears to be a
**work-in-progress/broken checkpoint**. *Runtime confirmation is recommended;* per
the audit mandate it was **not fixed**. See `09_open_questions.md`.

(The procedural-background internals are documented separately in
`05_procedural_tech.md`.)
