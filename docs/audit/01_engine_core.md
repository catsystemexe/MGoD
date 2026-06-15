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
