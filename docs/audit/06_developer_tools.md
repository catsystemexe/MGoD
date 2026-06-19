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
