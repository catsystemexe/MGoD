# 05 – Procedural Technology Audit

This is, alongside the deterministic engine, the project's **most reusable and
distinctive asset**. There are two categories of procedural tech:

1. **Procedural backgrounds** (`render/webgl/bg/`) — three independent generators.
2. **Procedural gameplay generation** — wave/spawn patterns and deterministic
   enemy trajectories (covered in `02` and `03`, summarized here for reuse).

---

## A. Procedural background generators (`render/webgl/bg/`)

All three are **self-contained, data/preset-driven, zero-asset** (pure math), and
draw into the scene at 896×504. They are selected at runtime via the `__CM_BG_*`
globals and the BG Lab UI (`06_developer_tools.md`).

### 1. `DemosceneBg.ts` — shader-based (GPU)
A single fullscreen-triangle fragment shader with a **6-mode parametric switch**,
all uniform-driven (no textures). Presets (`bgPresets.ts`) carry `mode`, two
`vec4` param banks (`p1`,`p2`), and two `vec3` color ramps.

| Mode | Effect | Technique |
| --- | --- | --- |
| 0 | Tempest tunnel | concentric rings + angular spokes, animated outward |
| 1 | Grid warp | sin/cos-distorted grid |
| 2 | Plasma scan | dual-frequency sine interference + scanlines |
| 3 | Kaleido runes | radial symmetry, rotating shards, hash noise |
| 4 | Star wire | radial streaks + flicker |
| 5 | Hex field | approximate hex grid with wobble |

Shared GLSL primitives: anti-aliased `line01(x,w) = 1 - smoothstep(w, w+0.002,
|x|)` and `hash21()` for noise; `fract()` for periodicity; time/parallax/rotation
uniforms for motion. **Very cheap** (one fragment pass). Adding a mode = one more
`else if (uMode == N)` branch.

### 2. `FlowRibbonBg.ts` — CPU continuous ribbons
Three parallax depth layers (far/mid/near). Per layer it spawns many "lanes",
each a horizontal ribbon built from control nodes whose Y meanders as a per-lane
sine (`y = baseY + sin(t·2π·hz + phase + x·coupling)·amp`), rendered as a
triangle strip with a thin-edge fragment falloff (`pow(1-|v|, 1.35)`). Phase
scrolls left each frame. Preset (`flowPresets.ts`) exposes direction, parallax,
spawn distribution, speed/jitter, meander, shear, microWave, segment/ribbon
geometry, and 3-layer colors. Evokes flowing water/silk. Cost ~2–5 ms.

### 3. `FlowSegmentsBg.ts` — CPU discrete segment particles
A full **per-particle physics sim**: low-frequency speed/length drift (exponential
smoothing), lane-coherence pull, Y-meander acceleration, shear, micro-wave, and
velocity constraints (keep moving left, clamp vertical to ~±20°, damping, accel
limit), with right-edge respawn. Each particle is a billboarded thick line
segment; far/mid/near color layering. More "organic" than ribbons; O(n)/frame.

### Reuse assessment (backgrounds)

| Generator | Reuse | Why |
| --- | --- | --- |
| `DemosceneBg` | ⭐⭐⭐⭐⭐ | Pure GLSL, no assets, trivially portable/extensible, cheap |
| `FlowRibbonBg` | ⭐⭐⭐⭐ | Clean preset/renderer split, data-driven, distinctive |
| `FlowSegmentsBg` | ⭐⭐⭐⭐ | Reusable particle-flow engine; richer but CPU-heavier |

All three could be lifted into a standalone "retro procedural background" module
for any 2D WebGL project with minimal changes (the main coupling is the hardcoded
896×504 logic size and the `__CM_BG_*` global lookups). **Preserve these.**

> Note the renderer regression in `04`/`09` affects only the *selection wiring*
> in `WebGLSceneRenderer.render()`; the generator classes themselves are intact.
> `FlowSegmentsBg.ts` also has a harmless unused self-typed field
> (`private bgSegments: FlowSegmentsBg`) worth removing.

---

## B. Procedural gameplay generation

### Wave/spawn patterns (`DirectorSystem`)
The Director procedurally places enemies using five pattern kinds, all
deterministic: `grid`, `line`, `sine`, `ring`, and `rand` (a sin-hash
pseudo-random — deterministic, replay-safe). Waves are pure JSON
(`directorWaves.json`): timing (`startSec`/`durationSec`), pacing
(`spawnEverySec`), `maxAlive` soft-cap, enemy type, behavior preset, and pattern
params. This is a compact, data-driven **procedural encounter system**.

### Deterministic enemy trajectories (`enemies/behaviors/`)
Analytic, closed-form movement (sine/zigzag/orbit/straight) seeded by
`spawnOrdinal` — procedurally varied yet fully reproducible. See `03`.

### Reuse assessment (gameplay)

| System | Reuse | Why |
| --- | --- | --- |
| Director wave/pattern engine | ⭐⭐⭐⭐ | Data-driven, deterministic, soft-cap pacing; engine-agnostic concept |
| Rail behavior system | ⭐⭐⭐⭐ | Closed-form, deterministic, content-driven trajectories |
| `rand` sin-hash | ⭐⭐⭐ | Handy deterministic pseudo-RNG primitive |

---

## What's NOT here (despite "procedural" expectations)

To set accurate expectations for future work:
- **No procedural world/level/terrain generation.** "World" = an autoscrolling
  camera over a fixed band (`WorldScrollSystem`), not generated geometry.
- **No geometric landscape generation.** The "landscapes" are the procedural
  *backgrounds* above, not gameplay terrain/collision.
- **No procedural enemy *generation*** (stats/shapes are authored in
  `enemyTypes.json` + `GlyphDB.ts`); only their *placement and motion* are
  procedural.
- **The cellular-automata (CA) system is a stub** (`CAImpactSystem`,
  `applyExplosion` returns 0) — a likely intended home for destructible
  procedural terrain, currently unimplemented.
