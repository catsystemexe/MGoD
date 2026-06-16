# Captain Meow — Post-Stabilization Verification Audit

**Audit type:** verification only (no code changed, no commits, no PRs).
**Branch audited:** `audit/claude-cm-prototype` @ `93bf2a8` (merge of PR #3
`codex/fix-critical-runtime-blockers`).
**Baseline compared:** `cd117cb` (pre-stabilization, original Claude audit point).
**Date:** 2026-06-16. **Toolchain:** Node v22.22.2, global `tsc` 6.0.2, Vite 7.3.1.

---

## Executive Summary (one page)

Stabilization Phase 1 **achieved its core objective**: all four P0 runtime
blockers from the previous audit are fixed and verified, and `typecheck`, `build`,
and `smoke` are all green. I independently reproduced every result.

- **Renderer P0 — RESOLVED.** `WebGLSceneRenderer.render()` now declares `bgKind`
  and `presetIndex` as locals reading the `__CM_BG_*` globals, and uses the
  correct fields `this.bgFlowRibbon` / `this.bgFlowSegments`. The unused
  self-referential `FlowSegmentsBg.bgSegments` member is removed. A repo-wide
  sweep finds **no remaining stale identifiers**.
- **`DEV_WAVE_KEYS` P0 — RESOLVED.** Replaced by `devWaveKeys`, derived from
  `DIRECTOR_DEFS_MVP.waves` and capped to 9. Both the overlay mapping and the
  digit-key handler reference the new local. No undefined identifier remains.
- **Sticky aim — RESOLVED.** `PlayerSystem` now keeps the previous non-zero
  `aimDir` (and skips rotation refresh) when the aim target exactly overlaps the
  player (`len === 0`). `PlayerSystem.smoke` passes.
- **Build/typecheck mismatch — RESOLVED.** A real `typecheck` script
  (`tsc --noEmit`) was added and **passes** (98 source files, transitively
  including the renderer and bg files). `build` passes. `smoke` passes (12/12).

**No production regressions were introduced.** The one behavioral change — the
re-enabled `SPAWN_BOMB` materialization — is **gated behind `cfg.bomb`, which the
production `createGame` does not supply**, so it is **inert in the actual game**
and only exercised by `SpawnSystem.smoke.ts`. Even where active, the bomb has no
collision, damage, or explosion.

**New debt is minor but real:** the smoke-compatibility shims in `WeaponSystem`
and `SpawnSystem` add ~7 net `as any` casts and dual-shape (string|object,
weaponDb|projectile) branching to production runtime paths purely to satisfy
legacy smoke construction. Pre-existing, out-of-scope gaps (projectile aiming
hardcoded, pickups disabled, smoke coverage gap, replay/determinism gaps,
console spam, `.bak` clutter) are **unchanged**.

**Recommendation: READY FOR MERGE WITH KNOWN DEBT** (already merged via PR #3;
this confirms the merged state is healthy). Track the new shim/bomb debt and the
unchanged scope items for a follow-up.

---

## Detailed Findings (with evidence)

### 1. Current health — commands run

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | ✅ PASS (exit 0) | Ran clean, no diagnostics. `tsc --listFilesOnly` confirms it checks 98 `src/` files including `WebGLSceneRenderer.ts`, `FlowSegmentsBg.ts`, `FlowRibbonBg.ts`, `createGame.ts`, `PlayerSystem.ts`, `SpawnSystem.ts`, `WeaponSystem.ts`. |
| `npm run build` (`vite build`) | ✅ PASS (exit 0) | 74 modules transformed; `dist/` emitted in ~0.6s. |
| `npm run smoke` | ✅ PASS (exit 0) | `[SMOKE RUNNER] OK`; 12/12 green incl. `PlayerSystem OK`, `WeaponSystem OK`, `SpawnSystem OK`. |

**Warnings / caveats:**
- `typescript` is **not** a declared dependency; `npm run typecheck` relies on a
  **global `tsc` 6.0.2** present in this environment. On a clean machine without a
  global TypeScript, `npm run typecheck` would fail to find `tsc`. (P2 debt.)
- No new failures or warnings surfaced during any command. (The prior `npm warn
  Unknown env config "http-proxy"` noted in the stabilization report is
  environmental, not repo-caused; it did not appear/matter here.)
- The dev server / rendered frame was **not** visually verified (no browser
  automation). Renderer correctness is established by source inspection +
  typecheck, not by an observed frame.

### 2. Renderer fixes — VERIFIED

Diff `cd117cb..93bf2a8` on `WebGLSceneRenderer.ts`:
```
+ const bgKind = String((globalThis as any).__CM_BG_KIND__ ?? "shader");
+ const presetIndex = Number((globalThis as any).__CM_BG_PRESET__ ?? 0) | 0;
- this.bgSegments.draw({...})   →  + this.bgFlowSegments.draw({...})
- this.bgFlow.draw({...})       →  + this.bgFlowRibbon.draw({...})
```
`FlowSegmentsBg.ts`: removed `private bgSegments: FlowSegmentsBg;` (the member
that broke `strict` property-initialization under `tsc`).
Sweep: `grep "this.bgFlow\b|this.bgSegments\b|bgFlow\b|bgSegments\b"` (excluding
the correct `bgFlowRibbon`/`bgFlowSegments`) → **NONE**. `tsc --noEmit` clean.

### 3. `DEV_WAVE_KEYS` fix — VERIFIED

Diff on `createGame.ts`:
```
+ const devWaveKeys = DIRECTOR_DEFS_MVP.waves.map((w: any) => String(w.id)).slice(0, 9);
  ... __CM.devWaveHotkeys = devWaveKeys.map((id, i) => ({ n: i+1, waveId: id }))
  ... const waveId = devWaveKeys[n - 1]
```
Hotkey mapping now derives from wave definitions and is range-capped to 1–9.
Sweep: `grep DEV_WAVE_KEYS src/` → **NONE**. No runtime reference hazard remains.

### 4. Sticky aim fix — VERIFIED

Diff on `PlayerSystem.ts`: `len = Math.hypot(dx,dy)` (the `|| 1` fallback
removed), and:
```
+ if (len > 0) {
+   pAny2.aimDir.x = dx / len;  pAny2.aimDir.y = dy / len;
+   pAny2.rot = Math.atan2(dy, dx) + ROT_OFFSET; ...
+ }
```
Behavior matches the intended contract: **target exactly overlapping player ⇒
previous valid `aimDir` preserved**, and rotation only refreshed when a non-zero
aim vector exists. `aimDir` is still defaulted to `{x:1,y:0}` if absent.
`PlayerSystem.smoke` passes.

### 5. SPAWN_BOMB state — actual reality

The `case EventType.SPAWN_BOMB` block was un-commented and re-enabled, **but
guarded** by `const b = (this.cfg as any).bomb; if (!b) break;`.

| Path | `cfg.bomb` provided? | Bomb materializes? |
| --- | --- | --- |
| **Production** (`createGame` spawnCfg = `{rng01, logicSize, weaponDb}`) | ❌ No | **No** — early `break`. `WeaponSystem` still emits `SPAWN_BOMB`, but `SpawnSystem` drops it. |
| **Smoke** (`SpawnSystem.smoke.ts` passes `bomb:{travelSec,damage,radius,ttlSec}`) | ✅ Yes | **Yes** — asserts `bombCount === 1` (passes). |

Capability matrix (where the bomb *does* spawn, i.e. smoke):

| Capability | Status | Evidence |
| --- | --- | --- |
| Spawn | ✅ (only if `cfg.bomb`) | `SpawnSystem` spawns `kind:"bomb"` with pos/posPrev/vel/ttl/damage/radius/target. |
| Move | ✅ | `ProjectileSystem` includes `"bomb"` in its moving-TTL union; integrates `pos += vel*dt`, snapshots `posPrev`. |
| Render | ✅ | `WebGLSceneRenderer` colors `kind==="bomb"` yellow `(1,1,0,1)`; included in interpolation/snap. |
| Cleanup | ✅ | `ProjectileSystem` marks bombs `pendingKill` on TTL expiry + bounds cull; `store.cleanup()` commits. |
| Collide | ❌ | `CollisionSystem` only *defines* `BombEntity`; active passes are projectile→enemy, player→pickup, player→enemy. No bomb branch. |
| Damage | ❌ | `DamageSystem` has no bomb hit/detonation event or damage path. |
| Explode | ❌ | No detonation/blast logic anywhere. |

**Reality:** in the *shipped game* the bomb still does nothing (not even spawn);
in the *smoke harness* it spawns/moves/renders/cleans but never collides, damages,
or explodes. The stabilization's own `SPAWN_BOMB_IMPACT_AUDIT.md` overstates the
in-game effect ("creates a visible yellow moving entity") — that is true only when
a `bomb` config is supplied, which production does not do.

### 6. Regression scan

| Item | Finding | Verdict |
| --- | --- | --- |
| Type-safety regressions | `tsc --noEmit` passes; **no type errors**. But ~**+7 net `as any`** and **+2 `: any`** added (vs 2 `as any`/1 `: any` removed), concentrated in `WeaponSystem`/`SpawnSystem` shims and `createGame`. | Questionable (debt) |
| New `any`-casts | `WeaponSystem`: `(this.cfg as any).primary/secondary/bomb`; `SpawnSystem`: `(p as any).weaponTypeId ?? (p as any).weapon`, `(this.cfg as any).bomb`. | Questionable (debt) |
| Compatibility shims for smoke | `WeaponSystem` ctor now defaults `db: WeaponDB = {}` and `world = {scrollX:0,scrollY:0}`, and accepts string-ID **or** inline-object weapon cfg. `SpawnSystem` synthesizes a `weaponDb` from a legacy `projectile` map and accepts legacy `weapon` payload key. | Questionable (debt) |
| Runtime paths modified solely for test compat | Yes — the above shims and the gated `SPAWN_BOMB` materialization exist to keep `SpawnSystem.smoke`/`WeaponSystem.smoke` green; they alter production constructor/branch logic. Production behavior is preserved (bomb path inert; weapon cfg is still string IDs). | Questionable (tracked debt), not a functional regression |
| Functional/behavioral regression | None observed. typecheck/build/smoke green; bomb path inert in-game; aiming unchanged; only 6 source files touched. | Harmless |
| Console spam, `.bak` files, pickups, aiming | Untouched (correctly out of scope). | Harmless / pre-existing |

---

## Comparison vs original Claude audit

| Finding | Old status | Current status |
| --- | --- | --- |
| Renderer crash (`bgKind`/`presetIndex`/`bgFlow`/`bgSegments`) | P0 broken (render throws every frame) | **RESOLVED** — identifiers declared, fields corrected, sweep clean, typecheck passes |
| `DEV_WAVE_KEYS` undefined | P0 (ReferenceError on digit key) | **RESOLVED** — `devWaveKeys` derived from wave defs |
| Sticky aim smoke failure | Failing | **RESOLVED** — preserves last `aimDir`; smoke passes |
| Build vs typecheck mismatch | build passed / tsc failed | **RESOLVED** — `typecheck` script added; tsc + build + smoke all pass |
| Smoke runner | 12/22 wired, some failing | **IMPROVED but PARTIAL** — 12/12 wired tests pass; **coverage gap unchanged** (engine/Collision/Projectile/CA smokes still not in runner) |
| Bombs disabled | Emitted, not materialized | **CHANGED (test-only)** — materialization re-enabled but **gated on `cfg.bomb`**; inert in production; no collide/damage/explode |
| Pickups disabled | Emitted, not materialized | **UNRESOLVED** — unchanged (intentionally out of scope) |
| Projectile aiming | Hardcoded `{x:1,y:0}` | **UNRESOLVED** — still hardcoded (`WeaponSystem.ts:104`) |
| Replay system (`InputTape`) | Defined, unwired | **UNRESOLVED** — unchanged |
| Determinism gaps (unseeded RNG) | `Math.random` in Spawn/Loot | **UNRESOLVED** — unchanged |
| `GameOverSystem` unwired, console spam, 34 `.bak` files | Debt | **UNRESOLVED** — unchanged (out of scope) |

---

## Risk Assessment

**P0 — none.** All previously-P0 runtime blockers are fixed and verified; the
merged state typechecks, builds, and passes smoke.

**P1**
- **Smoke coverage gap persists.** The load-bearing engine (EventBus, Loop,
  EntityStore, InputManager) and the entire combat path (Collision, Projectile,
  CAImpact) have smoke files that the runner still does **not** execute. Green
  smoke ≠ covered.
- **Test-driven runtime shims in production code.** `WeaponSystem`/`SpawnSystem`
  now carry dual-shape parsing and `any`-casts that exist only to satisfy legacy
  smoke construction. This erodes the type contracts of two core systems and can
  mask real misuse (e.g. a missing `weaponDb` silently becomes `{}`).

**P2**
- **`typecheck` depends on a global `tsc`** (no `typescript` devDependency); not
  reproducible on a clean checkout.
- **Bomb materialization is a latent scope deviation** — gated and inert today,
  but a half-implemented entity (spawn/move/render, no collide/damage/explode)
  that will mislead future readers; the in-repo `SPAWN_BOMB_IMPACT_AUDIT.md`
  overstates its in-game effect.
- **Pre-existing debt unchanged:** hardcoded projectile aim, disabled pickups,
  unseeded RNG, unwired replay, unconditional `[DIR][SPAWN_ENEMY]` logging, 34
  `.bak`/stray files.

---

## Recommendation

### READY FOR MERGE WITH KNOWN DEBT

The stabilization objectives are met: every P0 blocker is resolved and
independently verified, the three gates (typecheck/build/smoke) are green, and no
production regression was introduced (the only behavioral change is gated and
inert in the shipped game). The branch is already merged (PR #3); this audit
confirms the merged state is healthy to keep.

Track for a dedicated follow-up (not blocking, and **not** proposed as fixes
here): (1) decide bomb materialization keep-vs-revert and correct the bomb impact
doc; (2) repay the `any`-cast/shim debt in `WeaponSystem`/`SpawnSystem` or move
smoke fixtures to the real constructor shapes; (3) add `typescript` as a
devDependency; (4) close the smoke-runner coverage gap.

---

*Audit only. No code, commits, PRs, or speculative fixes were produced. Claims
rest on the diffs `cd117cb..93bf2a8`, source inspection, and the actual output of
`npm run typecheck`, `npm run build`, and `npm run smoke` in this environment.*
