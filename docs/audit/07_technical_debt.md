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
