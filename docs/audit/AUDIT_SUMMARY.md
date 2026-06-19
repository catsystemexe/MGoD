# Captain Meow — Repository Audit (Phase 1)

> **Purpose:** a reliable knowledge base so future humans and AI agents can begin
> work **without re-exploring the repository from scratch**. This is an
> understanding-and-documentation pass only — **no gameplay code was changed, no
> refactoring or feature work was done.**
>
> **Audited branch:** `audit/claude-cm-prototype` · **Date:** 2026-06-15 ·
> **Commit at audit:** `4afc4f4` ("Add new enemy types and background visual effects").

## How to read this audit

Start here, then drill into the numbered companion files:

| Doc | Covers |
| --- | --- |
| `00_repository_structure.md` | Folder layout, layering, **architecture overview** |
| `01_engine_core.md` | Loop, EventBus, EntityStore, Input, determinism |
| `02_gameplay_systems.md` | Director/spawn/waves, combat, player/enemy, flow/economy |
| `03_enemy_ai_behaviors.md` | Live rail behaviors vs **dead chase-AI**; movement math |
| `04_rendering_visual.md` | WebGL frame pipeline, vector/glyph/sprite/VFX |
| `05_procedural_tech.md` | Procedural backgrounds + procedural gameplay; **reuse** |
| `06_developer_tools.md` | Dev UIs, hotkeys, `window.__CM` API, smoke tests, scripts |
| `07_technical_debt.md` | Prioritized debt incl. **P0 boot regression** |
| `08_development_history.md` | Git timeline, pivots, what the history reveals |
| `09_open_questions.md` | What **cannot** be determined from the repo |
| `10_future_potential.md` | Direction, strengths, blockers (evidence-based) |

---

## 1. Project Summary

**Captain Meow (CM)** is a **deterministic 2D arcade shoot-'em-up** for the
browser: TypeScript + WebGL2, built/served by Vite, developed on Replit, targeted
at desktop and iPad. Fixed logical resolution **896×504** with integer-scaled
letterboxing and a retro **NeoGeo/C64** aesthetic.

- **Genre:** horizontal **side-scrolling** shmup (pivoted there mid-project from
  an earlier top-down/endless-wave prototype).
- **Current gameplay loop (as authored):** the world autoscrolls; a player "ship"
  moves freely and fires; a **Director** schedules JSON-defined **waves** that
  spawn enemies (entering from the right, moving via analytic rail behaviors —
  sine/zigzag/orbit/straight); **projectiles** collide with enemies, deal damage,
  spawn VFX, and award **score**; the player has **energy/lives** and **respawns**
  or hits **game over**. Loot/powerups and bombs are coded but **not wired to
  actually spawn**, and aiming appears **visual-only** (see Caveats).
- **Development stage:** **advanced engine prototype / systems demo.** The
  deterministic core is mature and smoke-tested; the gameplay on top is an MVP
  with several parked features. README itself says: *"Engine skeleton… No gameplay
  implemented… Deterministic core in progress."* That undersells the engine but
  fairly describes the *game* completeness.

### ⚠️ Top caveats a future agent must know first
1. **HEAD likely does not render.** The latest commit added a **runtime
   regression** in `WebGLSceneRenderer.render()` (undeclared `bgKind`,
   `presetIndex`, and wrong field names `this.bgFlow`/`this.bgSegments`). Build
   tools don't type-check, so it ships, but it throws every frame. **Verify/fix
   this before anything else** (`07`/`09`). Last likely-good commit: `HEAD~1`.
2. **Core loop has gaps:** aiming looks visual-only (weapon fires hardcoded
   right); **bombs and pickups are emitted but never spawned** (handlers commented
   out). The game is closer to a systems demo than a complete loop.
3. **Determinism is aspirational, not complete:** unseeded `Math.random`; replay
   `InputTape` defined but unwired.

---

## 2. Architecture at a glance

A fixed-timestep (60 Hz) deterministic simulation drives a data-oriented entity
store; gameplay systems are pure **phase handlers** that communicate only through
an **ownership-checked event bus**; **JSON content** feeds a **Director** that
schedules waves and emits spawn events; a **WebGL renderer** reads simulation
state once per animation frame and draws procedural-vector + sprite entities over
a procedural shader/flow background.

```
Per fixed tick:  Input → Director → Simulation → Collision → Impact → Flow → Audio → Cleanup
                  (systems emit/drain typed events owned by exactly one phase)
Per RAF frame:   loop.step(dt) → renderer reads EntityStore (lerp by alpha) → present (letterbox)
```

`game/boot/createGame.ts` is the **composition root** that wires every system
into the loop. See `00` and `01`.

---

## 3. System status at a glance

| System | State | Notes |
| --- | --- | --- |
| Deterministic Loop / EventBus / EntityStore | ✅ Solid | Cleanest code; smoke-tested |
| Input (kbd/pointer → actions) | ✅ Works | Replay tape unwired; stale smoke test |
| Director + wave scheduling (5 patterns, soft-cap) | ✅ Works | Spawn-log spam |
| SpawnSystem (enemy/projectile) | ✅ Works | Bomb/pickup handlers **disabled** |
| WeaponSystem / ProjectileSystem | ✅ Works | **Aim hardcoded right** (visual-only?) |
| CollisionSystem / DamageSystem / Impact | ✅ Works | CA path is a stub |
| PlayerSystem / EnemySystem | ✅ Works | Enemy rail behaviors live |
| Enemy **rail behaviors** | ✅ Live | sine/zigzag/orbit/straight/invaders/none |
| Enemy **chase AI / controller** | ❌ Dead | No imports; unreachable |
| Flow: Score/Loot/Pickup/Powerup/Respawn | ✅ Works* | *Loot/pickup dead-ended at spawn |
| WorldScroll (autoscroll + camera) | ✅ Works | Coordinate rules documented |
| VFX (muzzle/tracer/hit) | ✅ Works | Cosmetic, non-allocating |
| Procedural backgrounds (shader + 2 flow) | ✅ Strong | Selection wiring hit by P0 regression |
| Sprite atlas pipeline + GlyphDB | ✅ Works | Both coexist (sprite→glyph pivot) |
| WebGL **scene renderer** | ⚠️ **Broken on HEAD** | `render()` regression — see `04`/`07` |
| Canvas2D RenderSystem | 💤 Dormant | Superseded by WebGL |
| CA / cellular-automata | 🚧 Stub | `applyExplosion` returns 0 |
| Dev tools (BgLab, DevHotkeys, `__CM` API) | ✅ Useful | DevUI disabled; `DEV_WAVE_KEYS` undefined |
| Smoke harness | ⚠️ Partial | Runs 12/22; engine + combat tests not run |

---

## 4. Reusable assets & systems (preserve even if rebuilt)

Ranked by reuse value and rationale (detail in `01`/`05`/`02`):

1. **Deterministic engine core** (`src/engine/`) — ⭐⭐⭐⭐⭐. Fixed-step loop,
   phase-ownership event bus, generational slab entity store, two-phase kills,
   render interpolation. Generic, game-agnostic, smoke-tested. *The crown jewel;
   keep intact.*
2. **Procedural background generators** (`render/webgl/bg/`) — ⭐⭐⭐⭐⭐ (shader) /
   ⭐⭐⭐⭐ (flow). Zero-asset, preset-driven, self-contained; liftable into any 2D
   WebGL project. Distinctive look.
3. **Director wave/pattern engine + JSON content model** — ⭐⭐⭐⭐. Deterministic
   scheduling, soft-cap pacing, five placement patterns, fully data-driven.
4. **Rail enemy-behavior system** — ⭐⭐⭐⭐. Closed-form, deterministic,
   content-driven trajectories.
5. **Sprite atlas pipeline + `gen_atlas.mjs`** — ⭐⭐⭐⭐. Clean atlas/texture/
   program split with a working generator and animation buckets.
6. **BgLabUI live-tuning tool** — ⭐⭐⭐⭐. Excellent interactive tuner with
   localStorage presets and JSON import/export.
7. **VFX ring-buffer particle system** — ⭐⭐⭐. Simple, deterministic, no GC churn.

---

## 5. Technical debt — top priorities

Full list in `07`. The headline items:

- **P0 (critical):** the `WebGLSceneRenderer.render()` regression on HEAD (likely
  no rendering) and the undefined `DEV_WAVE_KEYS` in `createGame.ts`.
- **P0 (hygiene):** 34 `.bak*` files, stray/typo files (`runSmokes,ts`,
  `smoke:damage`, `tsx`, `_dump_*`, `package_old.json`, `_patch/`), and
  unconditional debug logging.
- **P1:** two competing enemy systems (one dead), superseded `behaviors.mvp.json`,
  unwired `SimulationPhaseSystem`, `graphics/` vs `render/` overlap +
  unused `DisplayRenderer`.
- **P2 (parked features):** bombs, pickups (spawn side), confirmed aiming, CA
  mechanics, replay tape.

---

## 6. What this audit deliberately did not do

No code was run, no tests executed, no `tsc` pass, no `.bak` diffing, no profiling,
and **no fixes/refactors/feature work** — strictly understanding and
documentation. Claims based on reading rather than execution are flagged as such,
and everything uncertain is collected in `09_open_questions.md`.

---

### One-paragraph handoff

*Captain Meow is a deterministic WebGL2 side-scrolling shmup built on an
unusually clean, smoke-tested engine core, with standout procedural background
tech and a data-driven wave/behavior content pipeline. The gameplay layer is an
MVP/systems-demo: real combat, scoring, lives and respawn work, but aiming looks
visual-only and bombs/pickups are coded yet unwired. The repository carries
significant hygiene debt (34 manual backups, stray files, a dead parallel AI
system) and — critically — the latest commit appears to have broken the scene
renderer, so the very first task for any successor is to confirm whether HEAD
renders and, if not, repair the four undeclared identifiers in
`WebGLSceneRenderer.render()` (or revert that hunk to `HEAD~1`). The engine,
procedural backgrounds, and Director/behavior content model are the assets most
worth preserving in any future direction.*
