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
