# Captain Meow — Full Audit (Combined)

_Single-file concatenation of all Phase 1 audit documents. Generated from `docs/audit/`._

---


<!-- ============================================================ -->
<!-- SOURCE FILE: AUDIT_SUMMARY.md -->
<!-- ============================================================ -->

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


---

<!-- ============================================================ -->
<!-- SOURCE FILE: 00_repository_structure.md -->
<!-- ============================================================ -->

# 00 – Repository Structure & Architecture Overview

## What this project is

**Captain Meow (CM)** is a browser-based, **deterministic 2D arcade
shoot-'em-up** written in TypeScript, rendered with **WebGL2**, built/served by
**Vite**, and developed on **Replit**. It targets a fixed logical resolution of
**896×504** with integer-scaled letterboxing, and aims for a retro NeoGeo / C64
aesthetic. It is a **prototype/engine** — the deterministic core is mature; the
"game" on top is an MVP side-scroller.

## Top-level layout

```
/
├── index.html              Entry HTML; injects eruda mobile console; loads src/index.ts
├── src/                    All TypeScript source
├── public/assets/sprites/  Runtime sprite PNGs + .atlas.json (served as-is by Vite)
├── assets/sprites/         Source sprite map (core.map.txt) for the atlas generator
├── tools/gen_atlas.mjs     Build-time sprite atlas JSON generator
├── scripts/                One-off inspection/patch scripts (glyphs, archetypes)
├── docs/                   Architecture notes, ADRs, and THIS audit
├── package.json            Vite + tsx; scripts: dev, build, smoke, gen:atlas
├── tsconfig.json           Strict TS; includes src/{game,engine,graphics}, main.ts
├── vite.config.ts          Dev server config (Replit hosts allowlist)
└── .replit                 Replit runtime (Node 20 + Python 3.11)
```

Plus repository-debt artifacts at the root (`package_old.json`, `_dump_*.ts`,
`_patch/`, empty `tsx` and `smoke:damage` files) — see `07_technical_debt.md`.

## `src/` architecture

The code is layered. Lower layers know nothing about higher ones.

```
src/
├── index.ts / main.ts        Boot: DOM/canvas setup, RAF frame loop, HUD, hotkeys
│
├── engine/                   GENERIC, GAME-AGNOSTIC DETERMINISTIC CORE  (cleanest code)
│   ├── core/                 Loop (8-phase fixed 60Hz), EventBus (phase ownership),
│   │                         Time, events, EventOwnershipMap, aim, dev
│   ├── ecs/                  EntityStore (slab + generations), EntityRef, ComponentTypes
│   ├── input/                InputManager (kbd+pointer→PlayerActions), ActionSchema,
│   │                         InputTape (replay iface, unused), InputBindings, DisplayContract
│   └── math/                 Vec2
│
├── game/                     GAMEPLAY built on the engine
│   ├── boot/createGame.ts    Composition root: wires every system into the Loop
│   ├── systems/              Director, Spawn, Weapon, Projectile, Collision, Damage,
│   │                         Impact, Player, Enemy, Flow, Score, Loot, Pickup, Powerup,
│   │                         Respawn, WorldScroll, Cleanup, GameOver (+ many *.smoke.ts)
│   ├── enemies/              Enemy movement: behaviors/ (LIVE rail system),
│   │                         ai/ + controller/ (DEAD chase-AI skeleton)
│   ├── defs/                 Static defs: EnemyDefs, WeaponDB, Weapons, Director*Defs/Types
│   ├── content/              Data: enemyTypes.json, directorWaves.json, behaviorPresets.json
│   │                         (+ loaders CONTENT.ts / loadContent.ts) (+ many .bak)
│   ├── data/                 Mutable runtime state: SessionState, WorldState, InputRuntime
│   ├── entities/             spawnPlayer, PlayerTypes
│   ├── impact/               CAImpactSystem (cellular-automata stub)
│   ├── vfx/                  VFXSystem (cosmetic particles: muzzle/tracer/hit)
│   └── render/RenderSystem   Canvas2D debug renderer (DORMANT, superseded by WebGL)
│
├── render/                   WEBGL SCENE RENDERING (the visible game)
│   ├── webgl/                WebGLSceneRenderer (main, ~1000 lines) + bg/ procedural bgs
│   │                         (DemosceneBg shaders, FlowRibbonBg, FlowSegmentsBg, presets)
│   ├── sprites/              Sprite atlas pipeline (Program/System/Atlas/Texture/Types)
│   └── glyphs/               GlyphDB (hardcoded vector "bitmap" glyphs) + GlyphTypes
│
├── graphics/                 WEBGL CONTEXT + PRESENT pipeline
│   │                         Graphics (RTs, letterbox), gl, RenderTarget, PresentPass,
│   │                         BlitProgram, DisplayRenderer (unused)
│
├── ui/                       DevUI (disabled), DevHotkeys, BgLabUI (BG tuning), HUDArcade
├── debug/                    BootTrace (orphaned), GlobalDebug (window.__CM helper)
├── smoke/                    Node smoke-test harness (runSmokes, assert, nodeStub, probes)
└── types/ + env.d.ts         Ambient types
```

## How the layers relate (dependency direction)

```
                 index.ts → main.ts ──────────────────────────────┐
                    │                                              │ (per RAF frame)
                    ▼                                              ▼
        game/boot/createGame.ts                       graphics/Graphics ⇄ render/webgl/
        (composition root)                            WebGLSceneRenderer (reads EntityStore)
                    │                                              ▲
   wires systems ───┼──────────────► engine/core/Loop             │ reads
                    │                 (8-phase 60Hz tick)          │
                    ▼                       │                      │
        game/systems/* ── emit/drain ──► engine/core/EventBus      │
                    │                                              │
                    ▼                                              │
        engine/ecs/EntityStore  ◄───────────────────────────────── (entities)
                    ▲
        game/defs + game/content (static data + JSON)
```

Key relationships:
- **`createGame.ts` is the composition root.** It instantiates the EventBus,
  EntityStore, all systems, the player entity, and assembles the `Loop` with one
  callback per phase. Everything is wired here.
- **Simulation is decoupled from rendering.** Systems mutate the `EntityStore`
  and `WorldState`; the `WebGLSceneRenderer` only *reads* them each frame and
  interpolates positions with the loop's `alpha`. Sim runs at fixed 60 Hz;
  render runs per animation frame.
- **Systems never call each other directly across phases** — they communicate by
  emitting typed events on the EventBus, which are drained by the owning phase.
- **`graphics/` vs `render/`:** `graphics/` owns the WebGL context, render
  targets, and the final present/letterbox blit; `render/` owns *what* is drawn
  into the scene (entities, glyphs, sprites, procedural backgrounds).

## Architecture overview (one paragraph)

A fixed-timestep deterministic simulation (`engine`) drives a data-oriented
entity store; gameplay systems (`game/systems`) are pure phase handlers that talk
only through an ownership-checked event bus; content (`game/content`, JSON) feeds
a Director that schedules waves and emits spawn events; a WebGL renderer
(`render` + `graphics`) reads the simulation state once per animation frame and
draws procedural-vector and sprite entities over a procedural shader/flow
background. The design intent (see `docs/architecture/CM_Architecture_v3.1.md`
and `ADR_0001`) is **determinism and a mode-locked render pipeline**, with replay
hooks scaffolded but not yet wired.

See the per-system documents (01–08) for detail.


---

<!-- ============================================================ -->
<!-- SOURCE FILE: 01_engine_core.md -->
<!-- ============================================================ -->

# 01 – Engine Core & Input

Location: `src/engine/`. This is the **cleanest, most mature part of the
codebase** — generic, game-agnostic, and smoke-tested. It was built and "all
smoke tests green" early in the project (see `08_development_history.md`).

## The deterministic Loop (`engine/core/Loop.ts`) — WORKING

- **Fixed timestep:** `dt = 1/60` (hardcoded; `Time.ts` also exports
  `FIXED_DT = 1/60`). Accumulator pattern: runs fixed ticks while
  `acc >= dt`, frame-delta clamped at 0.25s, **max 6 ticks/frame** to avoid the
  "spiral of death"; on overrun the accumulator is dropped. Pausing clears the
  accumulator so there is no catch-up burst on resume.
- **Render interpolation:** exposes `getAlpha()` (0..1) so the renderer can lerp
  between previous and current positions.
- **8 phases, strict order, per tick:**

  ```
  Input → Director → Simulation → Collision → Impact → Flow → Audio → Cleanup
  ```

  Each phase: `bus.enterPhase(p)` → `bus.drainPhase(p)` → call the system's
  `update(ctx, events)`. All phase handlers are optional. (Note: in the live
  game the Director is actually ticked inside the Simulation callback in
  `createGame.ts` because it emits Simulation-owned `SPAWN_*` events.)

## EventBus (`engine/core/EventBus.ts`) — WORKING

Type-safe, **ownership-driven** event queue. Each event type maps to exactly one
owner `Phase` (`EventOwnershipMap.ts`); only that phase may drain it.

- **Two queues:** `qNow` (this tick) and `qNext` (next tick), swapped at
  `endTickAndSwap()`.
- **`emit()`** routes into `qNow`; it **rejects** (a) any `SPAWN_*` type (those
  must use `emitNext`), and (b) emitting "backwards" into an earlier phase than
  the current one. Forward routing (emit in phase N, drain in N+1) is allowed.
- **`emitNext()`** schedules into `qNext` with `tick+1`, no phase validation —
  used for all `SPAWN_*` so spawns are deterministic and backlog-safe.
- **Invariants:** max events/tick cap (storm guard); `qNow` must be empty at
  end-of-tick (fail-fast in dev, optional drop in prod). Policy is configurable
  (`failFast`, `dropLeftoversInProd`, `maxEventsPerTick`, warn/error callbacks).

Event families (`events.ts`): `SPAWN_*` (Simulation-owned, via emitNext),
`PLAYER_FIRE_*` (Simulation), `*_HIT_*` (Impact), `ENTITY_DAMAGED/KILLED`,
`PLAYER_PICKUP`, `CA_CELLS_KILLED` (Flow). A full projectile→enemy example:
Collision emits `PROJECTILE_HIT_ENEMY` → Impact drains it, applies damage, emits
`ENTITY_KILLED` → Flow drains it, scores/loots → Cleanup commits the kill.

## EntityStore (`engine/ecs/EntityStore.ts`) — WORKING

Fixed-capacity **slab allocator with generation counters** (Array-of-Structures).

- **Capacity 256** in the live game (`new EntityStore(256)`); pre-allocated slots
  + LIFO free-list → O(1) spawn.
- **`EntityRef = { slot, gen }`.** `get(ref)` returns null if the slot is dead or
  the generation mismatches — this is the dangling-reference guard.
- **`spawn(factory)`** recycles a slot, **deletes stale component fields** (so no
  ghost state leaks between lives), then runs the factory.
- **Two-phase kill:** `markKill()` sets `pendingKill`; `cleanup()` (Cleanup
  phase) flips `alive=false`, bumps `gen` (16-bit wrap), and frees the slot. This
  keeps same-tick collision/damage consistent even as entities "die".
- **`debugForEachAlive()`** scans all 256 slots — fine at this cap, O(capacity).

## Input (`engine/input/`) — WORKING

- **`InputManager`** captures keyboard (`Set<code>`) and pointer state from
  window/canvas listeners, then `sample(out, w, h)` writes a deterministic
  `PlayerActions` snapshot once per Input phase. Movement = normalized WASD/arrows
  (digital) **or** nonlinear mouse-drag (analog, `tanh(sign·|d|^0.75·boost)`).
  Aim = mouse position mapped to logic space (honoring the letterbox present
  rect via `setPresentRect`). Fire primary/secondary = held; **bomb = buffered
  rising-edge**. Robust pointer-capture + focus handling for Replit/iPad.
- **`ActionSchema.PlayerActions`:** `{ move, aimTarget, firePrimary,
  fireSecondary, bombPressed, bombTarget }`.
- **`InputTape`** defines a replay interface (`getActionsForTick`) that the Loop
  **never calls** — replay is scaffolded but unwired.
- **`InputBindings`, `DisplayContract`** exist but are effectively unused.

## Math (`engine/math/Vec2.ts`, `engine/core/aim.ts`) — WORKING

Tiny pure helpers (`v2`, `copy`, `sub`, `len`, `normalize`, `computeAimDir` with
"sticky" behavior when the target is within 1e-3 to avoid NaN/jitter).

## Determinism scorecard

| Guarantee | Status |
| --- | --- |
| Fixed 60 Hz timestep | ✅ |
| Strict phase ordering | ✅ |
| Single-owner event draining | ✅ |
| Generation-checked entity refs | ✅ |
| Two-phase deferred kills | ✅ |
| **Seeded RNG** | ❌ Systems use `Math.random` (Spawn, LootDrop). Not seeded — replay would not reproduce drops/jitter. |
| **Replay tape wired** | ❌ `InputTape` interface only. |

## Quality notes / minor debt

- `InputManager.smoke.ts` is **stale** (references removed fields) and would fail.
- `engine/core/dev.ts` (`devSanity`) has **no callers**.
- Engine smoke tests (`EventBus`, `Loop`, `EntityStore`, `InputManager`) exist
  but are **not in the `runSmokes.ts` runner** (see `06_developer_tools.md`).

**Bottom line:** the engine is production-quality and the single strongest asset
in the repo. The only real gaps are *seeded RNG* and *wiring the replay tape* —
both small, both needed before "deterministic" is fully true end-to-end.


---

<!-- ============================================================ -->
<!-- SOURCE FILE: 02_gameplay_systems.md -->
<!-- ============================================================ -->

# 02 – Gameplay Systems

Source of truth: `src/game/`. All systems are wired in
`src/game/boot/createGame.ts` and driven by the deterministic phase loop
(`src/engine/core/Loop.ts`). See `01_engine_core.md` for the loop/EventBus model.

## The phase pipeline

Per fixed tick (60 Hz) the loop runs phases in strict order:

```
Input → Director → Simulation → Collision → Impact → Flow → Audio → Cleanup
```

Systems never read/write each other directly across phases — they communicate
through typed events owned by a single phase. `SPAWN_*` events are always
emitted to *next tick* (`emitNext`) for determinism.

### Wiring map (`createGame.ts`)

| System | Phase | Status |
| --- | --- | --- |
| `InputManager.sample` | Input | ✅ |
| `DirectorPhaseSystem` → `DirectorSystem` | Director (called inside Simulation*) | ✅ |
| `RespawnSystem.tick` | Simulation | ✅ |
| `PickupSystem` | Simulation | ✅ |
| `PlayerSystem` | Simulation | ✅ |
| `WorldScrollSystem` | Simulation | ✅ |
| `WeaponSystem` | Simulation | ✅ |
| `SpawnSystem` | Simulation | ✅ |
| `ProjectileSystem` | Simulation | ✅ |
| `EnemySystem` | Simulation | ✅ |
| `CollisionSystem` | Collision | ✅ |
| `ImpactPhaseSystem` (`DamageSystem` + `CAImpactSystem`) | Impact | ✅ |
| `FlowSystem` → `FlowDispatcher` (`Score`, `Loot`, `Powerup`, `Respawn`) | Flow | ✅ |
| `CleanupSystem` (`store.cleanup`) | Cleanup | ✅ |

\* Note: the Director is emitted/ticked from inside the simulation update in
`createGame.ts` because it must emit `SPAWN_*` (Simulation-owned) events. There
is a dedicated `Phase.Director` in the loop but the live wiring runs the director
within Simulation.

---

## Spawning / waves

### DirectorSystem (`systems/DirectorSystem.ts`, ~462 lines) — WORKING
Deterministic wave scheduler. Owns *timing and event emission only*; it never
creates entities. Per wave it keeps runtime state (enabled/active/time/
accumulator/spawn count) and emits `SPAWN_ENEMY` events.

- Spawn pacing via a lag-safe accumulator (`acc += dt`), capped at
  `MAX_SPAWNS_PER_TICK = 8`.
- **Soft cap slowdown:** as alive-count approaches the cap, the spawn period is
  scaled up (smoothstep 0.7→1.0, up to ~4× slower) instead of hard-stopping.
- Supports patterns: `grid`, `line`, `sine`, `ring`, `rand` (deterministic
  sin-hash pseudo-random).
- DEV API: `forceWave`, `soloWave`, `stopWave`, `setWaveEnabled`, `setDifficulty`
  (exposed on `window.__CM.dev`).
- ⚠️ Logs `[DIR][SPAWN_ENEMY]` on every spawn (should be `__DEV__`-gated).

### DirectorPhaseSystem / DirectorRuntime / DirectorDefs / DirectorTypes
Thin support layer: `DirectorPhaseSystem` advances the session clock and mirrors
the current wave into the HUD; `DirectorRuntime` is the per-wave value object;
`DirectorDefs` loads `CONTENT.waves` (from `directorWaves.json`) and wraps them as
director defs, honoring an optional DEV solo-wave global.

### Wave content (`content/directorWaves.json`)
Data-driven. Each wave:

```json
{
  "id": "wave.crown.grid",
  "startSec": 24, "durationSec": 32,
  "spawnEverySec": 0.8, "maxAlive": 5,
  "enemyTypeId": "crown",
  "behaviorPresetId": "invaders.basic",
  "pattern": { "kind": "grid", "originX": 900, "originY": 200,
               "cols": 3, "rows": 2, "spacingX": 24, "spacingY": 22 }
}
```

The live file defines a test wave plus a timed sequence (red/green/blue, parallel
grids, and the new obelisk/sigil/crown/orb/mandala waves). Enemies spawn at the
right edge (`originX ≈ 900`, logical width 896) and move left.

### SpawnSystem (`systems/SpawnSystem.ts`, ~339 lines) — WORKING
Consumes `SPAWN_*` events and instantiates entities in the `EntityStore`.

- `SPAWN_ENEMY`: looks up `ENEMY_DEFS[typeId]`, resolves `behaviorPresetId`,
  clones render def, seeds `bState`, sets `waveId`/`spawnOrdinal`, converts spawn
  position to world space (`+ world.scrollX`), inits `posPrev` (prevents a
  first-frame render pop), and calls the behavior `init` hook.
- `SPAWN_PROJECTILE`: reads `WeaponDB` for speed/ttl/damage/radius, normalizes
  direction, spawns a projectile (⚠️ projectile glyph is hardcoded, not read from
  WeaponDB).
- `SPAWN_BOMB` and `SPAWN_PICKUP` handlers are **commented out** — so bombs and
  pickups never actually appear despite upstream systems emitting them.

---

## Combat

### WeaponSystem (`systems/WeaponSystem.ts`) — WORKING
Turns player fire input into `SPAWN_PROJECTILE` / `SPAWN_BOMB` events with
per-slot cooldowns (primary/secondary/bomb).
⚠️ Fire direction is currently hardcoded to `{x:1, y:0}` with the aim-target
version commented out next to it — confirm at runtime whether aiming actually
affects projectiles (see `09_open_questions.md`).

### ProjectileSystem (`systems/ProjectileSystem.ts`) — WORKING
Integrates projectile motion, decays TTL, marks consumed/expired projectiles for
kill, and culls offscreen (X ±24px margin, Y camera-band ±140px in world space).
Snapshots `posPrev` for render interpolation.

### CollisionSystem (`systems/CollisionSystem.ts`, ~187 lines) — WORKING
Circle–circle checks across mixed coordinate spaces (player in screen space;
enemies/projectiles/pickups in world space — it converts as needed). Emits:
- `PROJECTILE_HIT_ENEMY` (marks projectile consumed = one-hit),
- `PLAYER_PICKUP` (marks pickup pendingKill),
- `PLAYER_HIT_ENEMY` (gated by player i-frames).
CA collision is stubbed for later.

### DamageSystem (`systems/DamageSystem.ts`, ~237 lines) — WORKING
Applies HP/energy damage in the Impact phase, emits `ENTITY_DAMAGED` /
`ENTITY_KILLED`, triggers hit-flash, and spawns deterministic VFX particle bursts
(fixed counts — no per-frame RNG). On player energy ≤ 0 it sets `deadT` and emits
a player `ENTITY_KILLED`. Contains the (dead) hook that would raise enemy
`aiWeightTarget` if the AI system were active.

### ImpactPhaseSystem / CAImpactSystem
`ImpactPhaseSystem` sequentially runs `DamageSystem` then `CAImpactSystem`.
`CAImpactSystem` handles `PROJECTILE_HIT_CA` → `CA_CELLS_KILLED`, but the
cellular-automata world is not implemented (`applyExplosion` returns 0). Stub.

---

## Player & enemies

### PlayerSystem (`systems/PlayerSystem.ts`) — WORKING
Input → movement with exponential accel/decel smoothing, aim direction + rotation,
and timer decay (invuln/dead/hitFlash). Clamps to bounds and snapshots `posPrev`.
Player lives in screen space.

### EnemySystem (`systems/EnemySystem.ts`, ~146 lines) — WORKING
Per enemy: sanitize pos/vel (NaN/Inf repair), decay hit-flash, (dead) AI-weight
blend, run the rail behavior (`behavior.update` + `getTarget` → derive velocity),
integrate, and cull offscreen (Y ±120px, X ±160px around the camera). Wraps the
behavior call in try/catch and kills malformed enemies. See
`03_enemy_ai_behaviors.md` for the behavior model.

### spawnPlayer / PlayerTypes
The live player entity is actually created inline in `createGame.ts` (white
proc "parts" ship: body + blue nose + pulsing orange fin). `entities/spawnPlayer.ts`
exists as a typed helper.

---

## Flow, economy & lifecycle

| System | File | Status | Role |
| --- | --- | --- | --- |
| FlowSystem | `FlowSystem.ts` | ✅ | Thin wrapper routing Flow-phase events to the dispatcher |
| FlowDispatcher | `FlowDispatcher.ts` | ✅ | Fans events out to Score/Loot/Powerup/Respawn listeners |
| ScoreSystem | `ScoreSystem.ts` | ✅ | +10/enemy kill, +1/CA cell (configurable) |
| LootDropSystem | `LootDropSystem.ts` | ✅ (but dead-ended) | On enemy death, 25% chance to emit `SPAWN_PICKUP` (energy/score/bomb). The pickup never spawns because the SpawnSystem handler is disabled. |
| PickupSystem | `PickupSystem.ts` | ✅ | Pickup motion + TTL (mirrors ProjectileSystem) |
| PowerupSystem | `PowerupSystem.ts` | ✅ | Applies pickup effects on `PLAYER_PICKUP` (energy/bomb/score) |
| RespawnSystem | `RespawnSystem.ts` | ✅ | On player death: capture death pos, decrement lives, gameOver if 0, else schedule 60-tick respawn with i-frames |
| GameOverSystem | `GameOverSystem.ts` | ❌ not wired | Sets `session.gameOver` on player death, but it is **only imported in `createGame.ts.bak`**, not the live boot. `RespawnSystem` is the actual game-over authority. Effectively dead code. |

---

## World, data & content

- **WorldScrollSystem** (`systems/WorldScrollSystem.ts`): autoscrolls X
  (`speedX≈60 px/s`) and eases the camera Y to follow the player within a dead
  band (top/bottom 140px), clamped to world height (`worldH≈900`). Coordinate
  rules are documented in `docs/architecture/world_movement_rules_MVP.md`.
- **SessionState** (`data/SessionState.ts`): `tick, timeSec, score, lives(=3),
  wave(=1), gameOver, lastDeathPos`.
- **WorldState** (`data/WorldState.ts`): scroll offsets + camera params.
- **InputRuntime** (`data/InputRuntime.ts`): the per-tick `PlayerActions`
  snapshot shared between InputManager and the systems.
- **Defs/content:** `EnemyDefs.ts` builds `ENEMY_DEFS` from `enemyTypes.json`;
  `WeaponDB.ts`/`Weapons.ts` define weapons; `loadContent.ts` + `CONTENT.ts`
  load and validate the JSON bundles. All tolerant of missing fields (defaults +
  warnings).

---

## Overall assessment

The gameplay pipeline is **functional and well-architected**: clean phase
separation, typed event flow, deterministic accumulators, data-driven waves and
enemies. The notable gaps are *parked features* rather than bugs — bombs,
pickups (spawn side), confirmed aiming, and CA mechanics — each isolated and
re-enableable. See `07_technical_debt.md` for the prioritized list.


---

<!-- ============================================================ -->
<!-- SOURCE FILE: 03_enemy_ai_behaviors.md -->
<!-- ============================================================ -->

# 03 – Enemy AI & Movement Behaviors

There are **two parallel enemy-control implementations** in the repo. Only one is
live. This is the single most important thing to understand here.

| System | Location | Status |
| --- | --- | --- |
| **Rail behaviors** | `enemies/behaviors/` + `EnemyBehaviorDB.ts` | ✅ **LIVE — sole authority** |
| **Chase AI / controller** | `enemies/ai/` + `enemies/controller/` | ❌ **DEAD — zero imports, unreachable** |

## Live: the rail "behavior" system

**Contract (V1, `EnemyBehaviorTypes.ts`):** a behavior must **not** write
`e.pos`/`e.vel`. It only (a) advances internal state in `update()` and (b)
returns an *analytic target position* from `getTarget()`. `EnemySystem` then
derives velocity from that target: `e.vel = (target - pos) / dt`, integrates, and
culls. This makes trajectories closed-form (no integration drift) and
**deterministic** — phases are seeded from `spawnOrdinal`, and `bState.t` is
seeded from `spawnAgeSec` so a backlog spawn "catches up" correctly.

Registered behaviors (`EnemyBehaviorDB.ts`):

| ID | Motion | Core math |
| --- | --- | --- |
| `none` | passive | returns null → keeps current velocity |
| `straight` | constant velocity | `pos = base + vel·t` |
| `sine` | forward + lateral sine | `x = base + sin(ωt+φ)·A + vx·t; y = base + vy·t` |
| `invaders` | Space-Invaders sine | same family as `sine`, tuned |
| `zigzag` | triangle-wave lateral | `x = base + tri(t/T + φ)·A; y = base + vy·t` |
| `orbit` | circle + drift | `x = cx + cos(ωt)·R; y = cy + sin(ωt)·R + vy·t` |

Behaviors are **content-driven**: `behaviorPresets.json` defines ~13 presets
(`straight.basic`, `sine.basic`, `sine.hold`, `invaders.basic`,
`zigzag.{basic,fast,wide}`, `orbit.{basic,tight,wide}`, `none.basic`), referenced
by enemy types (`enemyTypes.json`) and waves (`directorWaves.json`). In the
current side-scroller, speeds are negative-X so enemies travel right-to-left.

Flow: `SpawnSystem` resolves `behaviorPresetId → preset → behaviorId`, seeds
`bState`, calls `beh.init(ent)`. Each tick `EnemySystem` calls `beh.update` then
`beh.getTarget`, wrapped in try/catch (malformed enemies are killed).

**Quality:** strong — pure/stateless updates, no per-tick allocation,
deterministic, content-driven, error-guarded. Minor smells: the `num()` helper is
re-defined in several behavior files instead of imported from `behaviorUtils.ts`;
parameter naming is inconsistent (`freq` vs `periodSec`, `speedX`/`speedY`).

## Dead: the chase-AI / controller system

A well-designed but **completely inactive** skeleton for adaptive enemies:

- `ai/AiTypes.ts`, `ai/AiDB.ts`, `ai/ais/passive.ts`, `ai/ais/chasePlayer.ts`
  (lead-prediction chase: aim at `playerPos + playerVel·leadSec`, move at `speed`).
- `controller/Controller.ts` (`resolveVel(railVel, aiVel, weight)` = lerp blend),
  `controller/blend.ts` (`lerp`, `smoothTo`).
- Intended activation path: when an enemy with an `ai` field is hit,
  `DamageSystem` would set `aiWeightTarget = 1` and `EnemySystem` would blend
  toward chase. **But no enemy content defines an `ai` field**, `resolveVel` has
  **zero callers**, and nothing outside `ai/` imports these modules. The blend
  hooks in `EnemySystem`/`DamageSystem` therefore never fire.

**Verdict:** pure dead code. Conceptually sound (lead prediction, weighted
blend), and a reasonable basis for future "enemies wake up and chase when shot",
but today it is a trap for readers — **enemies do not react to the player at
all.** Either keep it clearly labeled as a future feature or remove it
(`07_technical_debt.md`).

## Superseded data

`enemies/data/behaviors.mvp.json` is an early behavior table, **superseded** by
`content/behaviorPresets.json` and imported nowhere. Historical only.


---

<!-- ============================================================ -->
<!-- SOURCE FILE: 04_rendering_visual.md -->
<!-- ============================================================ -->

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


---

<!-- ============================================================ -->
<!-- SOURCE FILE: 05_procedural_tech.md -->
<!-- ============================================================ -->

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


---

<!-- ============================================================ -->
<!-- SOURCE FILE: 06_developer_tools.md -->
<!-- ============================================================ -->

# 06 – Developer Tools Audit

Captain Meow ships a moderate, **mostly-runtime** dev toolkit: in-browser UIs,
console (`window.__CM`) commands, hotkeys, a Node smoke-test harness, and a few
asset/inspection scripts. There is **no formal editor**; tuning is live-in-browser
plus JSON content files.

## In-browser UI & overlays (`src/ui/`)

| Tool | Status | What it does | Invoke | Value |
| --- | --- | --- | --- | --- |
| **BgLabUI** (`BgLabUI.ts`, 447 ln) | ✅ wired | Interactive **background tuning lab**: BG kind (shader/flowRibbon/flowSegments), preset index, blend mode, 3-layer colors+alpha, ribbon lanes/step/thickness, segment count/jitter/speed. **Persists named presets to localStorage** + JSON import/export. Writes `__CM_BG_*` globals read by the renderer. | press **U** | ⭐⭐⭐⭐⭐ Excellent; the standout dev tool |
| **DevHotkeys** (`DevHotkeys.ts`) | ✅ wired (under `__DEV__`) | Non-blocking overlay listing wave hotkey → waveId mappings (`pointer-events:none`). | press **I** | ⭐⭐⭐⭐ |
| **DevUI** (`DevUI.ts`, 229 ln) | ⚠️ **disabled** | Full wave control panel (enable/solo/trigger/stop per wave, EnableAll, difficulty 0.5–5×). Complete but **instantiation is commented out** in `main.ts`. | backtick (if re-enabled) | ⭐⭐⭐ good but dormant |
| **HUDArcade** (`HUDArcade.ts`) | ✅ wired | Gameplay HUD: energy/lives, wave, score, weapon status; PAUSED/TITLE/GAME-OVER overlays; scales to the present rect. (Not a dev tool, but the only player-facing UI.) | always | ⭐⭐⭐⭐ |

## Debug helpers (`src/debug/`)

- **`GlobalDebug.ts`** — defines the `window.__CM` registry helper (`ensureCM`).
  Foundational but thin; the real `__CM` surface is populated ad-hoc in `main.ts`
  / `createGame.ts`.
- **`BootTrace.ts`** — a timestamped boot-overlay logger (`BT(msg)`,
  `window.__CM_BT__`). **Orphaned** — imported nowhere. Useful if wired into boot.

## Hotkeys (live)

| Key | Action | Where |
| --- | --- | --- |
| P | toggle pause | main.ts |
| Enter/Space | start from TITLE | main.ts |
| Y / N | restart / dismiss on GAME OVER | main.ts |
| `[` / `]` | prev / next BG preset | main.ts |
| B | toggle BG kind (shader ↔ flow) | main.ts |
| U | toggle BgLabUI | main.ts |
| I | toggle DevHotkeys overlay (if `__DEV__`) | createGame.ts |
| 1–9 | force wave by index (if `__DEV__`) | createGame.ts |

> ⚠️ The **1–9 force-wave** path references an **undefined `DEV_WAVE_KEYS`**
> (never declared/imported). It sits inside `__DEV__`-gated code and a keydown
> handler; since `__DEV__` is never set anywhere, the boot block is skipped, but
> the digit-key handler would throw a `ReferenceError` if a digit is pressed. See
> `09_open_questions.md`. Also note `BgLabUI`'s in-UI hint says **F7** while the
> actual toggle is **U** — a stale label.

## `window.__CM` console API

Core refs: `__CM.loop`, `.store`, `.game`, `.director`, `.vfx`.
Dev wave API: `__CM.dev.waves()`, `.solo(id)`, `.enableAll()`, `.enable(id,on)`,
`.trigger(id)`, `.stop(id)`, `.diff(mult)`.
Debug log: `__CM.setTop(text)`, `.topLog(text)`, `.topLines`.
BG tuning globals: `__CM_BG_KIND__`, `__CM_BG_PRESET__`, `__CM_BG_LAB__`,
`__CM_BG_LAB_UI__`, `__CM_BG_LAB_getFlowColor__()`, `__CM_BG_LAB_getFlowOverrides__()`.
Misc: `__CM_DEV_SOLO_WAVE__`, `__DEV__`, `__BOOT_N__`, `__CM.__running/__rafId`.
(Mobile note: `index.html` injects the **eruda** console because iPad has no
devtools — there are many "iPad has no console" comments in the code.)

## Smoke-test harness (`src/smoke/`)

- **`runSmokes.ts`** (`npm run smoke`, via `tsx`) imports and runs the tests in a
  hardcoded `SMOKES` list. **`assert.ts`** = tiny `ok`/`equal`. **`nodeStub.ts`**
  stubs `window`/`document`/canvas for Node (but the probes duplicate stubs
  inline instead of using it). **`probe_sine.ts` / `probe_sine_count.ts`** are
  standalone diagnostic scripts (trace sine motion / count spawns) not wired into
  npm or the runner.
- **Coverage gap:** there are ~22 `*.smoke.ts` files but the runner only includes
  **12** — and the **12 it runs are all Director/Spawn/Player/Weapon/Flow**. The
  **engine-layer tests are NOT run** (`EventBus`, `Loop`, `EntityStore`,
  `InputManager`), nor are **Collision/Projectile/Impact/CA** tests. So the most
  load-bearing code (the engine) is tested but not in CI-style runs, and the
  combat/collision path has tests that no one runs.

| Area | `.smoke.ts` exist | In runner |
| --- | --- | --- |
| Engine (EventBus, Loop, ECS, Input) | 4 | ❌ none |
| Director + Spawn | 5 | ✅ all |
| Player + Weapon | 2 | ✅ all |
| Simulation/Flow integration | 3 | ✅ all |
| Projectile + Collision + CA | 5+1 | ❌ none |

## Asset / inspection scripts

- **`tools/gen_atlas.mjs`** (`npm run gen:atlas`) — generates a sprite **atlas
  JSON** from a `.map.txt` grid file, auto-bucketing `name.0/.1/...` keys into
  FPS animations. Solid asset-pipeline tool. ⭐⭐⭐⭐⭐
- **`scripts/inspect_glyphs.ts` / `inspect_archetypes.ts` / `inspect_obelisk.ts`**
  — print glyph grid/px/screen size + on-bit counts and flag malformed bitmaps.
  Good QA; uses hardcoded ID lists rather than iterating `GlyphDB`. ⭐⭐⭐
- **`scripts/patch_glyph_stack.py`** — a one-off **codegen/patch** script that
  inserted the `drawGlyphStackAt` method + dispatch into `WebGLSceneRenderer.ts`.
  Clever (guards against double-patching) but a maintenance smell: source code was
  edited by script. Historical. ⭐⭐⭐

## Overall

The dev tooling is **practical and browser-first**, which suits the solo +
iPad/Replit workflow. The **BgLabUI is genuinely excellent** and worth preserving.
The main weaknesses are *test-runner coverage gaps* (engine + combat tests not
run), a few *stale/disabled* pieces (DevUI commented out, `DEV_WAVE_KEYS`
undefined, F7/U label mismatch, orphaned BootTrace), and the absence of any
content/level editor beyond hand-edited JSON.


---

<!-- ============================================================ -->
<!-- SOURCE FILE: 07_technical_debt.md -->
<!-- ============================================================ -->

# 07 – Technical Debt

This document catalogs technical debt found during the Phase 1 audit. It is
descriptive only — **no code was changed**. Findings are prioritized so future
work can triage them.

> Scope note: "debt" here means anything that increases maintenance cost,
> confuses readers, or risks silent breakage. The core engine itself is clean
> (see `01_engine_core.md`); most debt is in the *repository hygiene* and a few
> *half-finished gameplay features*.

---

## P0 (CRITICAL) — Likely boot-blocking regression on the tip commit

**The latest commit (`4afc4f4`, "Add new enemy types and background visual
effects") introduced undeclared-identifier references that static analysis says
will throw at runtime.** Vite/esbuild does not type-check, so these were not
caught at build time, but ES-module strict mode throws `ReferenceError`.

1. **`WebGLSceneRenderer.render()`** references `bgKind`, `presetIndex`,
   `this.bgSegments`, and `this.bgFlow` — **none of which are declared**. The
   real field names are `this.bgFlowRibbon` / `this.bgFlowSegments`, and the two
   variables should read `globalThis.__CM_BG_KIND__` / `__CM_BG_PRESET__`.
   `render()` runs every frame, so this throws every frame → `main.ts`'s frame
   try/catch shows "FRAME CRASH". **This almost certainly means HEAD does not
   render gameplay.** `HEAD~1` does not contain these references.
2. **`createGame.ts`** references **`DEV_WAVE_KEYS`** (lines ~260, ~297) which is
   never declared or imported. It is `__DEV__`-gated (and `__DEV__` is never set,
   so the boot block is skipped), but the always-registered digit-key handler
   would throw if 1–9 is pressed.

**Status:** verified by static analysis + git diff; **not** confirmed by running
the game, and **not fixed** (audit mandate). This is the first thing a future
session should confirm and repair. See `09_open_questions.md`.

> Because of (1), treat HEAD as a **broken work-in-progress checkpoint**. The
> last known-good render path is likely `HEAD~1` (`0038811`, "glyphs basic").

---

## P0 — Repository hygiene (high noise, low risk, easy to fix)

### 1. Pervasive `.bak` backup files committed to git
The repository uses manual file-copy backups (timestamped Unix-epoch suffixes)
instead of relying on git. There are **34** such files. They duplicate logic,
confuse search/grep, and make it unclear which file is authoritative.

Backup files by area:

| Area | Files |
| --- | --- |
| `src/main.ts` | `.bak.1768068289`, `.bak.1768130079`, `.bak.1768130429`, `.bak_vfx` |
| `src/game/boot/createGame.ts` | `.bak`, `.bak_hotkeys_1768861309`, `.bak_hotkeys_1768862573`, `.bak_vfx` |
| `src/render/webgl/WebGLSceneRenderer.ts` | `.bak`, `.bak_fix_1768235751`, `.bak_fix_1768839614`, `.bak_procfix_1768839993`, `.bak_procfix_1768840198`, `.bak_vfx`, `.bak_vfxsnap.1768331040` |
| `src/game/systems/*` | `DamageSystem.ts.bak_fix_1768839614`, `DirectorRuntime.ts.bak_enabled_1768862613`, `DirectorSystem.ts.bak_fix_totalcap`, `DirectorSystem.ts.bak_spawnlog_1768863015`, `EnemySystem.ts.bak`, `SpawnSystem.ts.bak_posprev.1768330964`, `WeaponSystem.ts.bak_vfx` |
| `src/game/content/*` | 2× `behaviorPresets.json.bak_*`, 7× `directorWaves.json.bak_*` |

**Recommendation:** Delete all `.bak*` files; history is preserved in git.
Before deleting, optionally diff each against its live counterpart to confirm no
unique unported fix is hiding inside (the `procfix`/`spawnfix`/`totalcap`
suffixes suggest these were save-points during specific bug fixes).

### 2. Stray / mistyped files at repo root and in `src/`
| File | Problem |
| --- | --- |
| `src/smoke/runSmokes,ts` | **Comma instead of dot** in extension — empty, never executed. The correct `src/smoke/runSmokes.ts` exists alongside it. |
| `smoke:damage` (repo root) | Empty 0-byte file; looks like a shell redirect (`npm run smoke:damage`) accidentally written to disk. |
| `tsx` (repo root) | Empty 0-byte file; looks like `tsx` CLI output accidentally redirected to a file. |
| `_dump_invaders_before_fix.ts` | A debug dump kept as a loose file at repo root. |
| `package_old.json` | Superseded package manifest. The live one is `package.json`. |
| `_patch/director.patterns.snippet.ts` | A loose code snippet, not wired into the build. |

**Recommendation:** Remove all of the above. None are imported by the build
(`tsconfig.json` only includes `src/game`, `src/engine`, `src/graphics`,
`src/main.ts`).

### 3. Debug logging left in production paths
`DirectorSystem.ts` logs on **every enemy spawn** (`console.log("[DIR][SPAWN_ENEMY]"...)`).
`main.ts`, `createGame.ts`, `index.ts` and others log boot/pause/BG-preset
events unconditionally. This spams the console during normal play.

**Recommendation:** Gate behind the existing `globalThis.__DEV__` flag.

---

## P1 — Duplicated / competing implementations

### 4. Two enemy-control systems; one is dead
- **Live:** `src/game/enemies/behaviors/*` + `EnemyBehaviorDB.ts` (rail-based
  analytic movement). This is the only system the running game uses.
- **Dead:** `src/game/enemies/ai/*` (`AiDB`, `chasePlayer`, `passive`) and
  `src/game/enemies/controller/*` (`Controller.resolveVel`, `blend`). These are
  imported **nowhere** outside their own folder. `resolveVel()` has zero callers.
  No enemy content defines an `ai` field, so the hooks in `DamageSystem` /
  `EnemySystem` that would activate it never fire.

See `03_enemy_ai_behaviors.md` for the full trace.

**Recommendation:** Keep as a clearly-labeled future feature OR remove. It is a
well-designed skeleton but currently pure dead code. Do not let its presence
mislead future readers into thinking enemies chase the player.

### 5. Superseded content/data files still present
- `src/game/enemies/data/behaviors.mvp.json` — an early MVP behavior table,
  superseded by `src/game/content/behaviorPresets.json`. Imported nowhere.

### 6. Unwired alternate architecture
- `src/game/systems/SimulationPhaseSystem.ts` is a composite "simulation phase"
  system that is **not** used. `createGame.ts` instead calls each simulation
  subsystem individually inside the loop's `simulation.update`. Two ways to do
  the same thing; only one is live.

### 7. `src/graphics/` vs `src/render/` overlap
There are two rendering-related top-level folders. `src/graphics/` holds the
WebGL context/present pipeline (`Graphics`, `gl`, `RenderTarget`, `PresentPass`,
`BlitProgram`, plus an apparently-unused `DisplayRenderer`). `src/render/` holds
the scene renderer, sprites, glyphs, and procedural backgrounds. The split is
defensible (context vs scene) but the naming does not make the boundary obvious,
and `DisplayRenderer.ts` appears unused. See `04_rendering_visual.md`.

---

## P2 — Half-finished gameplay features (intentional TODOs)

These are not bugs; they are features that were scaffolded then parked. They are
documented so nobody assumes they work.

| Feature | State | Evidence |
| --- | --- | --- |
| **Bomb spawning** | Emitted but not consumed | `WeaponSystem` emits `SPAWN_BOMB`; the `SPAWN_BOMB` handler in `SpawnSystem.ts` is commented out. |
| **Pickup spawning** | Emitted but not consumed | `LootDropSystem` emits `SPAWN_PICKUP`; the `SPAWN_PICKUP` handler in `SpawnSystem.ts` is commented out. So pickups never actually appear even though loot/powerup logic exists downstream. |
| **Mouse/touch aiming in gameplay** | Ambiguous | `WeaponSystem` fires with a hardcoded direction `{x:1, y:0}` (commented-out `dirFromAimTarget` next to it), while `main.ts` computes `playerEnt.aimDir`/`rot` per frame for cosmetics. Net effect needs runtime confirmation — see Open Questions. |
| **Projectile visuals** | Hardcoded | `SpawnSystem` hardcodes the projectile glyph/sprite rather than reading it from `WeaponDB`. All projectiles look the same. |
| **Cellular-automata (CA) impact** | Stub | `CAImpactSystem` and the `PROJECTILE_HIT_CA` path exist but `applyExplosion` returns 0. No CA world exists. |
| **InputTape / deterministic replay** | Interface only | `src/engine/input/InputTape.ts` defines a replay interface that the `Loop` never calls. |

---

## P3 — Smaller smells

- **Stale smoke test:** `InputManager.smoke.ts` references field names
  (`keyDown`, `lmbDown`, `bombBuffer`) that no longer exist on `InputManager`.
  It would fail if run.
- **Dead helper:** `src/engine/core/dev.ts` (`devSanity()`) has no callers.
- **Duplicated `num()` helper** redefined inside several behavior files instead
  of importing from `behaviorUtils.ts`.
- **`EnemySystem` failsafe push-down** (`if above viewport with 0 y-velocity,
  push down`) is a band-aid for behaviors that occasionally produce zero
  velocity; it hides the underlying cause instead of logging it.
- **Dead `GameOverSystem`:** confirmed **not wired** in the live boot — it is
  only imported in `createGame.ts.bak`. `RespawnSystem` is the live game-over
  authority (it sets `session.gameOver` when lives hit 0). `GameOverSystem.ts` is
  orphaned source.
- **Mixed-language comments:** Many comments are in Czech (e.g. "MUSÍ BÝT PŘED",
  "raketa je v okně"). Fine for the original author; a localization/normalization
  pass would help future contributors and AI agents.
- **Mojibake:** Some non-ASCII comments in `createGame.ts` are corrupted
  (e.g. `â ï¸`), indicating an encoding round-trip at some point.

---

## Priority summary

| Priority | Theme | Effort | Risk if ignored |
| --- | --- | --- | --- |
| P0 | Delete `.bak`/stray files, gate logs | Low | Ongoing confusion, console spam |
| P1 | Resolve dead AI system & dup folders | Low–Med | Readers misjudge what the game does |
| P2 | Finish or document parked features | Med | Features silently absent |
| P3 | Stale tests, dead helpers, comments | Low | Minor friction |

**Important:** Per the audit mandate, none of the above was acted on. These are
recommendations for a future cleanup phase.


---

<!-- ============================================================ -->
<!-- SOURCE FILE: 08_development_history.md -->
<!-- ============================================================ -->

# 08 – Development History (from the codebase)

Reconstructed strictly from git metadata and code artifacts. Where intent is
inferred, it is marked as such.

## Timeline facts

- **Commits:** 47 on the audited branch.
- **Date range:** 2025-12-30 → 2026-01-23 (~3.5 weeks of active work).
- **Authors:** effectively a single developer (`catsystemexe`, two email
  identities — a GitHub no-reply and a Replit no-reply address).
- **Platform:** developed on **Replit** (`.replit` present: Node 20 + Python
  3.11 modules, `npm run dev`, ports 5173/5174). Mobile/iPad testing is evident
  (eruda console injected in `index.html`, touch handling, "iPad has no console"
  comments).

## Commit arc (oldest → newest)

The messages trace a clear prototype → engine → content progression:

1. **Prototyping (Dec 30):** `Initial commit`, `Faze 2`, `proto`,
   `gem prototype`, `gg` — throwaway experiments.
2. **Look & target resolution:** `graphic sys -neogeo vibe`,
   `neogeo resolution` — established the NeoGeo aesthetic and the fixed logical
   resolution (now 896×504).
3. **Engine core:** `CM Engine core`, `core build`, `mines solving`,
   `Engine v3.1 – all smoke tests green`, `deterministic tick engine`,
   `Combat loop ok` — the deterministic phase loop, EventBus, EntityStore, and
   the smoke-test harness were built here. This is the architectural heart and
   it is the most polished part of the codebase.
4. **Bring-up:** `boot ok`, `basic player`, `running webGL`,
   `enemy endless wave`.
5. **Enemy behavior engine:** a long sequence — `enemy behavior engine`,
   `behavior 2`, `behavior system done`, `behavior patterns`,
   `behavior engine stable`, `sine fixed … behavior engine V1 in progress`,
   `ai behav`. This is where the rail-based behavior system matured (and where
   the parallel, ultimately-unused `ai/` skeleton was sketched).
6. **Game feel & loop:** `enemy kill`, `energy and lives`, `title and game
   over`, `enemy spawn soft cap maxAlive`, `movement glitch fix`.
7. **VFX:** `VFX render pipeline locked`, `vfx muzzle, trackers`,
   `render clean`, `Engine base done`.
8. **Waves/dev tooling:** `test waves`, `preset waves dev`, `resize`.
9. **Side-scroller pivot:** `ship aim rotation`, `projectile … sprite`,
   `sprite enemy and explosion`, `side scrolling basic`,
   `scrolling world rules clean MVP` — the game shifted to a horizontal
   side-scroller with an autoscrolling world and camera-follow.
10. **Vector glyphs:** `glyphs basic`, `vector: add glyph module (baseline)`,
    `stable spawn`.
11. **Latest:** `Add new enemy types and background visual effects` — the
    procedural background systems and the expanded enemy roster (obelisk, sigil,
    crown, orb, mandala, etc.).

## What the history tells us

- **Engine-first discipline.** The deterministic core (Loop, EventBus,
  EntityStore) was built and smoke-tested *before* heavy gameplay. That
  investment shows: the core is the cleanest code in the repo.
- **Heavy iteration on enemies & waves.** Roughly a third of commits and the
  bulk of the `.bak` files concern the Director/Spawn/behavior pipeline. This
  was the hardest part to get stable (soft-caps, spawn edges, comma fixes,
  archetypes).
- **A genre pivot mid-project.** Early work reads like a top-down / "endless
  wave" shooter; later commits ("side scrolling basic", "scrolling world rules")
  convert it into a **horizontal side-scrolling shoot-'em-up**. Some coordinate
  comments (`world_movement_rules_MVP.md`) and the screen-X / world-Y split were
  introduced to support this pivot.
- **A rendering-style pivot too.** It moved from sprite atlases
  (`sprite enemy and explosion`, PNG atlases in `public/assets/sprites/`) toward
  a **procedural vector "glyph"** look (`glyphs basic`, expanded enemy glyph
  definitions). Both pipelines still coexist in the renderer.
- **Solo, fast, save-point-driven workflow.** The timestamped `.bak` files are
  manual checkpoints taken around risky edits — a personal safety net rather
  than a team process. This explains the repo-hygiene debt in `07`.

## Dating the backups

The `.bak` suffixes are Unix epoch seconds, all in the `1768xxxxxx` range =
mid-January 2026, consistent with the latter half of the project (waves, VFX,
procedural background, glyph work). They are checkpoints, not an older codebase.


---

<!-- ============================================================ -->
<!-- SOURCE FILE: 09_open_questions.md -->
<!-- ============================================================ -->

# 09 – Open Questions, Assumptions & Uncertainties

Per the audit mandate, this section states **what could not be determined from
the repository alone** and where claims rest on static reading rather than
runtime observation. Nothing here was guessed into the other docs as fact.

## Must-verify-at-runtime

1. **Does HEAD actually run?** Static analysis says
   `WebGLSceneRenderer.render()` throws a `ReferenceError` (`bgKind`,
   `presetIndex`, `this.bgSegments`, `this.bgFlow` are undeclared — see `04`/`07`).
   This was **not** confirmed by launching the game. *Open:* does the latest
   commit boot to a playable frame, or does it show "FRAME CRASH"? If it crashes,
   `HEAD~1` is the last good render commit. **This is the single most important
   open question.**

2. **Is the player's aim wired into actual shooting?** `WeaponSystem` fires with a
   hardcoded direction `{x:1, y:0}` (the `dirFromAimTarget` line is commented
   out), while `main.ts` computes `playerEnt.aimDir`/`rot` every frame and the
   renderer rotates the ship sprite to match. *Open:* do projectiles travel where
   the player aims, or always straight right while only the ship *visual*
   rotates? Reading suggests **visual-only aim**; needs runtime confirmation.

3. **Are bombs and pickups actually reachable in play?** Upstream systems emit
   `SPAWN_BOMB` (WeaponSystem) and `SPAWN_PICKUP` (LootDropSystem), but both
   handlers in `SpawnSystem` are commented out. Static reading says **bombs and
   pickups never spawn**. Confirm in-game (and confirm the bomb input even fires).

## Determinism / replay

4. **Intended RNG strategy.** The architecture stresses determinism, yet
   `SpawnSystem` and `LootDropSystem` use unseeded `Math.random`, and `InputTape`
   (replay) is defined but never called by the Loop. *Open:* was seeded RNG +
   replay a planned next step, abandoned, or considered out of scope? The docs
   (`CM_Architecture_v3.1.md`) mention "replay scope" but the code doesn't wire it.

## Design intent we can't confirm from code

5. **What is the cellular-automata (CA) system for?** `CAImpactSystem`,
   `PROJECTILE_HIT_CA`, `CA_CELLS_KILLED`, and `applyExplosion` exist as a stub
   returning 0. *Open:* destructible terrain? A Minesweeper-like mechanic (early
   commits say "mines solving")? The repo doesn't say.

6. **Is the chase-AI system a planned feature or abandoned?** `enemies/ai/` +
   `controller/` are complete but dead (no imports, no content uses `ai`). *Open:*
   keep for "enemies chase when shot" or delete? Author intent unknown.

7. **Genre/target.** Commits show a pivot from top-down/endless-wave to a
   **horizontal side-scroller**, and a visual pivot from sprites to vector glyphs.
   *Open:* is the side-scroller the final direction, and is the glyph look final
   (sprites kept as fallback) or transitional?

8. **"Captain Meow" theme.** The name implies a cat protagonist, but the player
   entity is an abstract white "ship" (proc parts) and enemies are geometric
   glyphs (obelisk/sigil/crown/mandala — an occult/sci-fi motif). *Open:* is the
   cat theme aspirational, dropped, or just not yet authored into art?

## Repository / process

9. **Authoritative branch.** Two branches exist with identical content
   (`audit/claude-cm-prototype`, `claude/cool-gates-0rzloq`). This audit was
   written on `audit/claude-cm-prototype` per the task. *Open:* which is the
   long-lived line of development?

10. **Backup-file intent.** The 34 `.bak*` files are clearly manual save-points,
    but a few suffixes (`procfix`, `spawnfix`, `totalcap`, `fixcomma`) suggest
    each captured a specific in-progress fix. *Open:* does any `.bak` contain a
    fix that was never ported forward? A diff pass is advisable before deletion
    (we did **not** diff all 34).

11. **`enemies` LINEAR render target** is allocated in `Graphics` but unused.
    *Open:* leftover, or reserved for a planned glow/blur layer?

## Things this audit did NOT do (scope boundaries)

- Did **not** run the game, the dev server, or the smoke tests.
- Did **not** run `tsc` to enumerate type errors (build uses esbuild, no
  type-check; a `tsc --noEmit` pass would likely surface more issues).
- Did **not** diff every `.bak` against its live file.
- Did **not** profile performance; the rendering performance figures elsewhere
  are estimates, not measurements.
- Did **not** modify, refactor, or fix anything — audit only.


---

<!-- ============================================================ -->
<!-- SOURCE FILE: 10_future_potential.md -->
<!-- ============================================================ -->

# 10 – Future Potential

Based **only** on evidence in the repository.

## Direction the project appears to be moving toward

- A **horizontal side-scrolling arcade shoot-'em-up** with an autoscrolling
  world and camera-follow (the most recent gameplay commits: "side scrolling
  basic", "scrolling world rules clean MVP").
- A **procedural-vector ("glyph") visual identity** layered over animated
  **procedural backgrounds** (latest commit adds enemy glyph types + background
  visual effects), moving away from the earlier sprite-atlas look.
- An emphasis on a **deterministic, data-driven content pipeline**: waves,
  enemies, behaviors, and weapons are all JSON/registry-defined, tuned live via
  the BG Lab and wave hotkeys.

## Visible strengths (assets to build on)

1. **A genuinely solid deterministic engine.** Fixed-timestep loop, phase-owned
   event bus, generational entity store, two-phase kills, render interpolation —
   all smoke-tested and clean. This is rare in a prototype and is the best reason
   to continue rather than restart.
2. **Excellent procedural background tech** (`DemosceneBg` + two flow systems),
   self-contained and reusable far beyond this game.
3. **A clean content/Director pipeline** — deterministic wave scheduling with
   soft-cap pacing and five placement patterns, fully data-driven.
4. **Deterministic analytic enemy movement** (sine/zigzag/orbit/straight) seeded
   by spawn ordinal.
5. **A standout live-tuning tool** (BgLabUI) and a sensible mobile/Replit
   workflow (eruda console, present-rect-aware input).
6. **Clear architectural intent** captured in `docs/architecture` + an ADR.

## Major blockers / risks

1. **Tip commit likely doesn't render** (`WebGLSceneRenderer.render()`
   regression — see `04`/`07`/`09`). Until confirmed/fixed, "does the game run?"
   is unanswered. **Highest-priority blocker.**
2. **Core gameplay loop is incomplete/unverified end-to-end.** Aiming appears
   visual-only; bombs and pickups are emitted but never spawned. The "game" is
   closer to a **systems demo** than a playable loop until these are wired.
3. **Determinism is not yet real end-to-end** — unseeded `Math.random` and an
   unwired replay tape undercut the project's stated determinism goal.
4. **Repository hygiene debt** (34 `.bak` files, stray/typo files, two competing
   enemy systems, console spam) raises the cost and risk of every future change
   and will confuse future agents.
5. **Test runner under-covers the load-bearing code** — engine and
   collision/projectile smoke tests exist but aren't run.
6. **Single-author, tribal knowledge.** Much intent (CA system, chase-AI, theme,
   replay) lives only in the author's head; comments are partly in Czech and some
   are mojibake. This audit is a first step at externalizing that knowledge.

## A reasonable, evidence-based "what next" (non-binding)

Stated as options for a human/agent, not as a decision:
1. **Stabilize HEAD:** confirm the render regression at runtime; if broken, fix
   the four identifiers (or revert that hunk to `HEAD~1`).
2. **Close the core loop:** decide on and wire real aiming, bombs, and pickups —
   or explicitly cut them — so the game is playable and the demo claims are true.
3. **Repo cleanup phase:** delete `.bak`/stray files, gate logs, resolve the dead
   AI system, fix `DEV_WAVE_KEYS`. (See `07`.)
4. **Make determinism real:** seed RNG; wire `InputTape` into the Loop.
5. **Preserve & isolate the reusable cores** (engine, procedural backgrounds,
   Director) so they survive any future rebuild (see `11`/summary "Reusable
   assets").

These are framed strictly from repository evidence; no product/gameplay decisions
are made here.


---
