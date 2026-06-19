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
