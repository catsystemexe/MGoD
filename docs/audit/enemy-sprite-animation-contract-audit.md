# Enemy Sprite Animation Contract Audit

## 1. Executive summary

This is an audit-only Phase 4 plan for the enemy sprite animation contract. No production code, content JSON, tests, atlas files, PNG files, tools, or package scripts were changed by this audit.

Verified base HEAD for this task branch is `890306ec7fe7551ec425beb89efd573fffcf76e9`. Current enemy sprite work already has the Phase 2/3 shape: canonical enemy sprite identity and scale live under `render.sprite`, enemy root `spriteId` compatibility has been removed, and `SpawnSystem` deletes root `spriteId` while setting enemy `animId = ""`.

Recommendation: implement the smallest enemy-only nested animation descriptor under `render.sprite`:

```ts
interface EnemySpriteAnimationDef {
  id: string;
  speed: number;
}

interface EnemySpriteRenderDef {
  id: string;
  scale: number;
  animation?: EnemySpriteAnimationDef;
}
```

Do not add a generic animation engine, a global asset registry, an animation state machine, or attack/hit/death/turn concepts in Phase 4. Keep projectile and FX animation contracts separate. Preserve sprite-first priority by changing only the frame choice inside the existing enemy sprite path:

```text
nested render.sprite.animation frame
→ static render.sprite.id frame
→ existing SDF/proc/glyph fallback
→ existing quad fallback
```

The initial Phase 4 contract should support only `animation.id` and optional normalized `animation.speed` with default `1.0`. Do not add `animation.phase`, `animation.loop`, or `animation.fallbackId` yet. Atlas `fps`, frame order, and `loop` already exist at the atlas layer; fallback to static `render.sprite.id` is enough for missing animation cases.

## 2. Verified current state

Verified current state from the repository at the task base:

- Enemy appearance type data has `EnemySpriteRenderDef { id, scale }` and `EnemyAppearanceDef.sprite?: EnemySpriteRenderDef`; it has no animation descriptor yet.
- Enemy definitions normalize `render.sprite.id` and `render.sprite.scale`, normalize fallback appearance paths, and inject a fallback glyph only when there is no usable sprite/SDF/glyph/proc path.
- Enemy spawning deletes root `spriteId`, sets enemy root `animId = ""`, materializes a fresh cloned `render` appearance object, and keeps collision/gameplay `radius` separate from `render.sprite.scale`.
- Enemy sprite selection reads only `enemy.render.sprite.id` for static enemy sprite identity, reads root `enemy.animId` first for animation, and uses `enemy.bState.phase` as a time offset when calling `pickAnimFrame`.
- The canonical enemy sprite path runs before SDF/proc/glyph fallback, and it draws with `render.sprite.scale` applied only to sprite dimensions and pivot.
- Six sprite enemies (`basic_1`, `basic_2`, `shooter_1`, `void_1`, `crawler_1`, `mine_1`) define `render.sprite.id` as `enemy.<type>.idle` and `render.sprite.scale` as `1.0`.
- The six per-type enemy atlas files contain one static frame each and empty `anims` objects.
- `enemy_bug1.atlas.json`, `w1_projectiles.atlas.json`, `explosion_bug1.atlas.json`, and `core.atlas.json` demonstrate the existing animation JSON shape: `anims[animKey] = { fps, frames, loop? }`.

## 3. Current animation data flow

### Enemies

Current enemy flow is:

1. `enemyTypes.json` authors `render.sprite.id` and `render.sprite.scale` for the six sprite enemies.
2. `loadContent.ts` structurally validates `render.sprite.id` as a non-empty string and `render.sprite.scale` as a positive finite number when present.
3. `EnemyDefs.ts` normalizes `render.sprite` into `EnemyAppearanceDef.sprite` with default scale `1.0`.
4. `SpawnSystem.ts` materializes `ent.render = materializeEnemyAppearance(def.render)`, deletes `ent.spriteId`, and assigns `ent.animId = ""` for every spawned enemy.
5. `WebGLSceneRenderer.selectEnemySpriteFrame()` derives the atlas system from `render.sprite.id`, then checks root `animId` before static `render.sprite.id`.
6. Because enemies currently have `animId = ""`, `pickAnimFrame` is skipped and static `render.sprite.id` is selected if the atlas/frame are available.
7. If no sprite frame is selected, the render loop falls through to SDF, proc, glyph stack, single glyph, and finally quad fallback.

### Projectiles

Projectiles still use root runtime fields. `SpawnSystem` sets `ent.animId = "projectile.w1"` and `ent.spriteId = "projectile.w1.0"`. The renderer ignores that root `animId` and derives the projectile animation from `weaponTypeId`, currently falling back to `projectile.w1`. Projectile animation uses `tSec + deterministicRefHashPhase` and `w1_projectiles.atlas.json`.

### Pickups

Pickups declare optional root `spriteId` and `animId` fields in `SpawnSystem` types, but no verified renderer pickup sprite animation path was found in the audited files. Pickups therefore remain outside this enemy animation contract.

### FX and explosions

Death FX set root `spriteId = "fx.explosion.bug1.0"`; the renderer reads root `animId` and root `spriteId` for kind `fx`. If `animId` is present it calls `pickAnimFrame(animId, tSec + deterministicRefHashPhase)`, otherwise it tries the static `spriteId`. The atlas `explosion_bug1.atlas.json` has non-looping animation `fx.explosion.bug1`.

### Generic sprite entities / player

The player sprite path uses `core.atlas.json`: static `ship.player.body.0` plus animated `ship.player.thruster` via `pickAnimFrame("ship.player.thruster", tSec)`. This is separate from enemies and should not be refactored in Phase 4.

## 4. Atlas and naming inventory

| Atlas | Frame keys | Animation keys | FPS | Loop | Current user | Notes |
|---|---|---|---:|---|---|---|
| `basic_1.atlas.json` | `enemy.basic_1.idle` | none (`{}`) | n/a | n/a | enemy `basic_1` | Static enemy sprite only. |
| `basic_2.atlas.json` | `enemy.basic_2.idle` | none (`{}`) | n/a | n/a | enemy `basic_2` | Static enemy sprite only. |
| `shooter_1.atlas.json` | `enemy.shooter_1.idle` | none (`{}`) | n/a | n/a | enemy `shooter_1` | Static enemy sprite only. |
| `void_1.atlas.json` | `enemy.void_1.idle` | none (`{}`) | n/a | n/a | enemy `void_1` | Static enemy sprite only. |
| `crawler_1.atlas.json` | `enemy.crawler_1.idle` | none (`{}`) | n/a | n/a | enemy `crawler_1` | Static enemy sprite only. |
| `mine_1.atlas.json` | `enemy.mine_1.idle` | none (`{}`) | n/a | n/a | enemy `mine_1` | Static enemy sprite only. |
| `enemy_bug1.atlas.json` | `enemy.bug1.0`..`.3` | `enemy.bug1` | 12 | default true | no current enemy content path found | Legacy generic enemy atlas shape. |
| `w1_projectiles.atlas.json` | `projectile.w1.0`..`.3` | `projectile.w1` | 18 | default true | projectile renderer | Current projectile animation contract. |
| `explosion_bug1.atlas.json` | `fx.explosion.bug1.0`..`.4` | `fx.explosion.bug1` | 24 | false | FX renderer | Current non-looping explosion animation. |
| `core.atlas.json` | `ship.player.body.0`, `ship.player.thruster.0`..`.3` | `ship.player.body`, `ship.player.thruster` | 10 | default true | player renderer | Generated from `assets/sprites/core.map.txt`. |

Animation representation is already simple and adequate: each atlas has `frames` keyed by full frame ID and optional `anims` keyed by animation ID. Each animation stores `frames` in explicit playback order, `fps`, and optional `loop`; missing `loop` means loop. `tools/gen_atlas.mjs` additionally auto-buckets frame keys ending in `.<number>` into animation keys by removing the numeric suffix and sorting by numeric suffix.

Recommended enemy naming convention for future assets:

```text
frame keys: enemy.<type>.<state>.<index> for animated sequences
static key: enemy.<type>.idle for a static fallback frame
anim keys:  enemy.<type>.<state>
initial state: enemy.<type>.idle
```

Do not migrate assets in this audit. Phase 4 should be allowed to use a fixture/test atlas before migrating production enemy atlases.

## 5. Responsibility map

| Responsibility | Current owner | Recommended Phase 4 owner |
|---|---|---|
| Static enemy sprite ID | `render.sprite.id` content, normalized by `EnemyDefs`, cloned by `SpawnSystem`, consumed by enemy renderer | Keep unchanged. |
| Static enemy sprite scale | `render.sprite.scale`, draw-only geometry scaling | Keep unchanged. |
| Enemy animation ID | Root runtime `animId`, currently always `""` for enemies | Move to nested `render.sprite.animation.id`; keep root enemy `animId` empty/legacy only until removed. |
| Enemy animation speed multiplier | Not implemented | Nested `render.sprite.animation.speed`, normalized to `1.0`; renderer multiplies atlas FPS by speed by passing scaled time or equivalent. |
| Atlas FPS/frame order/loop | Atlas JSON and `SpriteAtlas.pickAnimFrame` | Keep atlas-owned; do not duplicate loop in enemy content initially. |
| Per-entity deterministic phase | Currently `bState.phase` if behavior init writes it | Prefer a separate deterministic `render.sprite.animation.phase` runtime value only if needed later; initial Phase 4 can reuse deterministic `bState.phase` defensively or use zero. |
| Collision radius | Enemy gameplay `radius` | Keep independent from sprite scale/animation. |
| Projectile animation | Projectile renderer/root runtime fields + atlas | Leave separate. |
| FX animation | FX renderer/root runtime fields + atlas | Leave separate. |

## 6. Coupling findings

### MAJOR — Root runtime `animId` is shared across entity kinds but enemy-owned data is now nested

- file: `src/render/webgl/WebGLSceneRenderer.ts`
- symbol: `selectEnemySpriteFrame`
- current behavior: enemy selection reads root `animId` before static nested `render.sprite.id`.
- risk: expanding root `animId` for enemies reintroduces a split appearance contract after Phase 3 removed enemy root `spriteId`.
- recommended action: add nested `render.sprite.animation.id` and make enemy selection prefer that over root `animId`; then leave root `animId` for projectiles/FX and temporary enemy compatibility only.
- required for Phase 4: yes

### MAJOR — Animation should live under `render.sprite`, not root enemy runtime fields

- file: `src/game/defs/EnemyAppearanceTypes.ts`
- symbol: `EnemySpriteRenderDef`
- current behavior: sprite ID and scale are nested, but animation is absent.
- risk: putting enemy animation on the root entity creates two owners for sprite appearance and increases pooled ghost-state risk.
- recommended action: extend `EnemySpriteRenderDef` with optional `animation?: EnemySpriteAnimationDef`.
- required for Phase 4: yes

### MAJOR — Animation ID should be content-authored, not derived from static ID

- file: `src/game/content/enemyTypes.json`
- symbol: `render.sprite.id`
- current behavior: static IDs are authored as `enemy.<type>.idle`; current six atlas files have no animation keys.
- risk: deriving animation ID from static ID can silently fail when static fallback is `enemy.<type>.idle` but animation keys use `enemy.<type>.idle` or `enemy.<type>` inconsistently.
- recommended action: content should explicitly author `render.sprite.animation.id`; use naming convention but do not hard-code derivation.
- required for Phase 4: yes

### BLOCKER — Static-frame fallback rules must remain explicit

- file: `src/render/webgl/WebGLSceneRenderer.ts`
- symbol: `selectEnemySpriteFrame`
- current behavior: missing/empty root `animId` falls back to static `render.sprite.id`; missing static frame returns `null` and allows SDF/proc/glyph fallback.
- risk: a missing animation could make sprite enemies disappear or skip SDF fallback if the selection path returns a bad frame.
- recommended action: preserve `animation frame -> static frame -> null` semantics and add tests for missing animation and missing selected animation frame.
- required for Phase 4: yes

### MAJOR — Pooled entities need animation cleanup/materialization

- file: `src/game/systems/SpawnSystem.ts`
- symbol: `SPAWN_ENEMY`
- current behavior: enemy spawn deletes `spriteId`, sets `animId = ""`, and clones `render` via `materializeEnemyAppearance`.
- risk: if animation runtime fields are added outside the cloned render object, recycled entities can keep old animation IDs, speeds, or phases.
- recommended action: keep animation inside `ent.render.sprite.animation` and ensure `materializeEnemyAppearance` deep-clones it; if root compatibility exists, overwrite root `animId` to `""` every spawn until removed.
- required for Phase 4: yes

### MINOR — Deterministic phase source is currently behavior-owned

- file: `src/game/enemies/behaviors/invaders.ts`
- symbol: `ent.bState.phase`
- current behavior: at least one behavior writes deterministic phase from spawn ordinal; renderer uses `bState.phase` as an animation offset.
- risk: behavior phase may change for movement reasons and unexpectedly alter visual animation phase.
- recommended action: initial Phase 4 may preserve current `bState.phase` offset for compatibility, but document it as transitional; add separate animation phase only when visual phase authoring is required.
- required for Phase 4: no

### MAJOR — Animation speed ownership is not defined

- file: `src/render/sprites/SpriteAtlas.ts`
- symbol: `pickAnimFrame`
- current behavior: atlas FPS is authoritative and the caller passes wall-clock/render time.
- risk: content cannot slow/speed an enemy animation without editing atlas FPS; renderer may be tempted to mutate atlas data.
- recommended action: add enemy content `animation.speed` as a multiplier; default `1.0`; renderer should pass `tSec * speed + phase` or extend helper logic without mutating atlas JSON.
- required for Phase 4: yes

### MINOR — Atlas naming conventions are implicit

- file: `tools/gen_atlas.mjs`
- symbol: numeric suffix bucketing
- current behavior: generated atlases create animation keys by stripping a trailing numeric suffix; hand-authored enemy atlases currently use static `.idle` keys with no numeric suffix.
- risk: authors can create `enemy.basic_1.idle` as both a static frame and an animation key, but existing files do not demonstrate multi-frame enemy idle naming.
- recommended action: document `enemy.<type>.idle` as animation key when animated, with frames `enemy.<type>.idle.0`, `enemy.<type>.idle.1`, and keep static `enemy.<type>.idle` as fallback only when present.
- required for Phase 4: yes

### BLOCKER — Missing animation frame behavior currently falls through to static only indirectly

- file: `src/render/sprites/SpriteAtlas.ts`
- symbol: `pickAnimFrame`
- current behavior: if an animation exists but selected frame key is missing, `this.frame(...)` returns `null`; current renderer expression then tries static sprite frame.
- risk: if Phase 4 wraps selection incorrectly, a bad animation frame can block fallback.
- recommended action: ensure selected animation frame is truthy before returning and always try static frame after any animation miss.
- required for Phase 4: yes

### MINOR — `animId` can conflict with `render.sprite.id`

- file: `public/assets/sprites/*.atlas.json`
- symbol: `frames` and `anims` key spaces
- current behavior: frames and anims are separate objects, so the same string can exist as both a frame key and animation key.
- risk: using the same key for static fallback and animation could be confusing during authoring, even if technically unambiguous.
- recommended action: allow coexistence but state priority: `animation.id` is looked up only in `anims`; `sprite.id` is looked up only in `frames`.
- required for Phase 4: yes

### MAJOR — Projectile/FX contracts should remain separate

- file: `src/render/webgl/WebGLSceneRenderer.ts`
- symbol: projectile and FX sprite paths
- current behavior: projectile and FX animations use root fields, atlas-specific systems, ref-hash phase, and special rotation/non-loop behavior.
- risk: refactoring them into an enemy appearance contract would expand scope and risk regressions in current projectile/FX animation behavior.
- recommended action: make the Phase 4 contract enemy-only; do not change projectile/FX code except tests proving unchanged behavior if implementation touches shared helpers.
- required for Phase 4: yes

## 7. Architecture variants

### Variant A — nested sprite animation descriptor

Example:

```ts
interface EnemySpriteRenderDef {
  id: string;
  scale: number;
  animation?: {
    id: string;
    speed?: number;
  };
}
```

Assessment:

- diff size: small; extend appearance types, parser/validator, materializer, spawn clone, renderer helper, tests.
- migration cost: low; static enemies without `animation` remain unchanged.
- content clarity: high; sprite animation is visibly attached to the sprite it animates.
- runtime state: simple; one nested cloned appearance object.
- pooled ghost-state risk: low if `materializeEnemyAppearance` deep-clones `animation` and spawn continues clearing root `animId`.
- renderer complexity: low; selection helper reads one additional nested descriptor.
- deterministic behavior: good; use global render time plus deterministic phase, no gameplay mutation.
- future attack/hit/dodge states: adequate; a later state-specific descriptor can be added under sprite if required, but Phase 4 need not add it.
- compatibility with projectiles and FX: good; they remain on their existing root contracts.
- overengineering risk: low.

### Variant B — root runtime animation binding

Example:

```ts
interface EnemyAppearanceDef {
  sprite?: EnemySpriteRenderDef;
}
interface EnemyRuntimeEntity {
  animId?: string;
  animSpeed?: number;
}
```

Assessment:

- diff size: superficially small in renderer, but larger in cleanup because root fields need parser/spawn/reset/test rules.
- migration cost: medium; content-to-runtime binding must decide where content authors set animation.
- content clarity: low to medium; sprite identity is nested but animation identity is root runtime.
- runtime state: split; static sprite identity, scale, animation speed, and phase can diverge.
- pooled ghost-state risk: high; every spawn path must overwrite more root fields.
- renderer complexity: medium; enemy root animation overlaps projectile/FX root animation but does not share all semantics.
- deterministic behavior: possible, but ownership of phase/speed is ambiguous.
- future attack/hit/dodge states: tempting to add root state-machine fields prematurely.
- compatibility with projectiles and FX: risky; shared names make accidental behavior coupling likely.
- overengineering risk: medium to high.

Recommendation: choose Variant A. Repository evidence strongly supports nested enemy appearance data: root enemy `spriteId` has already been removed, `render.sprite.scale` is nested, and `SpawnSystem` already materializes `render` appearance as the runtime appearance boundary.

## 8. Recommended contract

Exact recommended TypeScript interfaces:

```ts
export interface EnemySpriteAnimationDef {
  /** Atlas animation key in SpriteAtlasJSON.anims. */
  id: string;

  /** Visual-only multiplier applied to atlas FPS/time. Defaults to 1.0. */
  speed: number;
}

export interface EnemySpriteRenderDef {
  /** Static atlas frame key in SpriteAtlasJSON.frames. Required fallback. */
  id: string;

  /** Visual-only draw scale. Does not affect collision radius. */
  scale: number;

  /** Optional enemy sprite animation descriptor. */
  animation?: EnemySpriteAnimationDef;
}
```

Initial support decision:

- support `animation.id`: yes, required to select an atlas animation.
- support `animation.speed`: yes, useful and small; default to `1.0`; require positive finite values.
- support `animation.phase`: no, not initially. Reuse deterministic current phase behavior or zero; add only if content needs authored visual offsets.
- support `animation.loop`: no. Loop is already an atlas animation property.
- support `animation.fallbackId`: no. Static `render.sprite.id` is the fallback.

Normalization rules:

- If `animation` is absent, preserve static behavior exactly.
- If `animation` is present, it must be an object.
- `animation.id` must be a non-empty string after trim.
- `animation.speed` is optional; when absent normalize to `1.0`.
- Invalid `animation.speed` should be rejected by structural validation if possible and defensively normalized/logged by `EnemyDefs` if malformed data reaches it.
- Do not infer `animation.id` from `render.sprite.id`.

## 9. Content format decision

Smallest extension to `enemyTypes.json`:

```json
"render": {
  "sprite": {
    "id": "enemy.basic_1.idle",
    "scale": 1.0,
    "animation": {
      "id": "enemy.basic_1.idle",
      "speed": 1.0
    }
  }
}
```

Static ID and animation ID should coexist. Reasons:

1. `render.sprite.id` is the verified static fallback and must remain valid for missing/unknown animation cases.
2. The animation key lives in atlas `anims`, while the static key lives in atlas `frames`; using explicit fields avoids hidden derivation.
3. Existing six enemies continue rendering with no content changes if `animation` is omitted.

Priority and fallback rules for content:

```text
if render.sprite.animation.id exists and resolves to a frame: draw animation frame
else if render.sprite.id resolves to a frame: draw static sprite frame
else: fall through to SDF/proc/glyph fallback
```

No production enemy content migration is required to introduce the contract. A later fixture or one test enemy can opt into animation once tests/atlas fixture are ready.

## 10. Runtime entity contract

Recommended enemy runtime entity state:

```ts
interface EnemyRuntimeEntity {
  kind: "enemy";
  typeId: EnemyTypeId;
  radius: number; // gameplay/collision, unchanged
  render?: EnemyAppearanceDef; // fresh materialized appearance, including sprite.animation if present
  animId?: string; // temporary legacy/root field; should remain "" for enemies until removed
  bState: EnemyBehaviorRuntime;
}
```

Decision for enemy root `animId`:

- Do not expand it for enemies.
- Keep it temporarily only because the field already exists on enemy entities and the renderer currently reads it.
- Phase 4 implementation should prefer `render.sprite.animation.id`; after tests prove nested animation works and projectiles/FX remain separate, remove enemy root `animId` in a follow-up cleanup if no hidden tests require it.
- Root `animId` remains reserved for non-enemy entities (projectiles and FX) in the current codebase.

Pooled-entity cleanup:

- Continue deleting `ent.spriteId` for enemy spawns.
- Continue setting `ent.animId = ""` for enemy spawns while the root field exists.
- Ensure `materializeEnemyAppearance` deep-clones `sprite.animation` into a fresh object.
- Do not store mutable animation playback counters on enemy entities in Phase 4.

## 11. Renderer selection contract

Exact recommended enemy selection order:

1. Resolve sprite descriptor from `enemy.render?.sprite`; if absent, return `null` and allow fallback.
2. Resolve enemy sprite system from the static `sprite.id` naming convention/type ID, same as today.
3. If sprite system/atlas/texture is unavailable, return `null` and allow fallback.
4. If `sprite.animation?.id` is present:
   - use `pickAnimFrame(animation.id, tSec * animation.speed + deterministicPhase)` or an equivalent formula that multiplies playback rate without scaling the deterministic phase offset;
   - if the returned frame is non-null, draw it;
   - if animation ID is unknown, empty, has no frames, or selected frame is missing, continue to static fallback.
5. Try `atlas.frame(sprite.id)`.
6. If static frame is present, draw it.
7. Return `null` so the existing SDF/proc/glyph/quad fallback chain runs.

Required behavior cases:

| Case | Required behavior |
|---|---|
| Animation system unavailable | No special system is required; absence of nested descriptor means static path. |
| Animation ID absent | Draw static `render.sprite.id`. |
| Animation ID unknown | Fall back to static `render.sprite.id`. |
| Selected animation frame missing | Fall back to static `render.sprite.id`. |
| Static frame missing | Fall through to SDF/proc/glyph fallback. |
| Atlas not ready / texture not ready | Fall through to SDF/proc/glyph fallback. |
| Sprite descriptor absent | Fall through to SDF/proc/glyph fallback. |

Do not change render priority beyond animation-vs-static selection inside the existing enemy sprite path.

## 12. Timing and determinism

Current time source: `WebGLSceneRenderer.render()` uses `this.accumTime` as `tSec`, and sprite paths call `pickAnimFrame` with that render time plus a deterministic-ish phase. Player thruster uses `tSec`; projectiles and FX use `tSec + phase` where phase is a hash of entity ref; enemies use `tSec + Number(enemy.bState?.phase ?? 0)`.

Current phase source: enemy behavior runtime can include `bState.phase`; `invaders` initializes it from spawn ordinal. Spawn also initializes `bState.t` from optional `spawnAgeSec` before behavior init.

Recommendations:

- Use global render time for visual animation, not simulation state mutation.
- Keep animation visual-only; it must not influence collision, damage, AI, behavior timing, spawn, or projectile logic.
- For initial Phase 4, use the existing deterministic phase input if present (`bState.phase`) and otherwise zero. This preserves current helper behavior.
- Do not add spawn-relative timers or mutable animation elapsed fields in Phase 4.
- If content later needs visual phase offsets independent of behavior, add a nested normalized runtime value such as `render.sprite.animation.phase`, populated deterministically at spawn from `spawnOrdinal` or content, not from `Math.random()`.
- Do not use `rng01` or wall-clock APIs for animation phase.

## 13. Compatibility with projectile and FX animation

Projectile and FX animation behavior should remain unchanged:

- Projectiles: renderer chooses `projectile.w1` based on `weaponTypeId` fallback, hashes entity ref for visual desync, rotates by velocity, and uses `w1_projectiles.atlas.json`.
- FX: renderer reads root `animId`/`spriteId`, hashes entity ref for visual desync, and supports non-looping `fx.explosion.bug1` via atlas `loop: false`.
- Player: renderer continues using static body plus thruster animation from `core.atlas.json`.

Phase 4 should not introduce shared root animation fields, generic animation registries, or projectile/FX refactors. If helper code is shared, tests must prove current projectile/FX root animation behavior still works.

## 14. Migration plan

Suggested small commits for the implementation phase:

### Commit 1 — add enemy sprite animation types and normalization

Expected files:

- `src/game/defs/EnemyAppearanceTypes.ts`
- `src/game/defs/EnemyDefs.ts`
- `src/game/content/loadContent.ts`
- targeted normalizer/content validation tests if existing test structure requires them

Work:

- Add `EnemySpriteAnimationDef`.
- Extend `EnemySpriteRenderDef.animation`.
- Validate and normalize `animation.id` and `animation.speed`.
- Deep-clone animation in `materializeEnemyAppearance`.

### Commit 2 — materialize animation descriptor at spawn

Expected files:

- `src/game/systems/SpawnSystem.ts`
- spawn/runtime tests

Work:

- Ensure enemy spawn continues to clear root `spriteId` and root `animId`.
- Verify materialized `render.sprite.animation` is cloned and cannot leak across pooled entities.

### Commit 3 — update enemy sprite frame selection and fallback

Expected files:

- `src/render/webgl/WebGLSceneRenderer.ts`
- `src/render/webgl/EnemySpriteSelection.smoke.ts`

Work:

- Make `selectEnemySpriteFrame` prefer nested `render.sprite.animation.id` over root `animId`.
- Apply `animation.speed` as a visual timing multiplier.
- Preserve static fallback and SDF/proc/glyph fallback behavior.

### Commit 4 — migrate one test enemy/atlas fixture

Expected files:

- existing test fixture files or new smoke-test fixture files only
- avoid production enemy atlas/PNG migration unless explicitly approved

Work:

- Add a minimal atlas fixture with multi-frame `enemy.<fixture>.idle` animation and static fallback.
- Do not alter production PNGs or production atlases unless the task scope changes.

### Commit 5 — tests and cleanup

Expected files:

- `src/render/webgl/EnemySpriteSelection.smoke.ts`
- any existing content/parser/spawn smoke tests

Work:

- Add missing animation, missing frame, static fallback, pooled state, deterministic phase, speed, and projectile/FX compatibility coverage.
- Remove no production fallback until tests prove behavior.

## 15. Test plan

Minimum later implementation tests:

1. Static sprite remains unchanged when `render.sprite.animation` is absent.
2. Animation descriptor selects an atlas animation frame before the static frame.
3. Missing animation ID falls back to static `render.sprite.id`.
4. Animation frame key missing from `frames` falls back to static `render.sprite.id`.
5. Missing static frame falls through to SDF/proc/glyph fallback.
6. Animation speed changes selected visual frame timing only.
7. Collision radius remains unchanged when animation descriptor and speed are present.
8. Pooled enemies do not retain prior animation descriptor, root `animId`, animation speed, or phase state.
9. Two enemies can use deterministic phase offsets without random or wall-clock state.
10. Projectile root animation behavior remains unchanged.
11. FX root animation and non-looping explosion behavior remain unchanged.
12. All existing six sprite enemies continue to render using their static `render.sprite.id` frames.
13. `render.sprite.animation.id` and `render.sprite.id` can coexist with the same string without ambiguity because they query different atlas maps.
14. Atlas not-ready/texture not-ready returns `null` and preserves fallback.

## 16. Risks

- **BLOCKER** — Returning early on a missing animation would skip static/SDF fallback and make enemies disappear. Mitigation: selection helper must return an animation frame only when non-null and then try static.
- **BLOCKER** — Touching projectile/FX root animation behavior could regress currently working animations. Mitigation: keep Phase 4 enemy-only and test projectile/FX unchanged.
- **MAJOR** — Keeping enemy root `animId` as a primary field would undo appearance separation. Mitigation: nested descriptor is authoritative; root enemy field stays empty/transitional.
- **MAJOR** — Mutable or uncleared animation fields can leak across pooled entities. Mitigation: deep-clone descriptor and clear root compatibility every enemy spawn.
- **MAJOR** — Deriving animation IDs from static IDs can lock in wrong naming conventions. Mitigation: content authors explicit `animation.id`.
- **MINOR** — Reusing `bState.phase` couples visual phase to behavior phase. Mitigation: preserve for compatibility initially, add separate visual phase only when needed.
- **MINOR** — `animation.speed` can be invalid or zero. Mitigation: validate positive finite values and normalize missing to `1.0`.

## 17. Files expected to change

For this audit task, the only changed file is expected to be:

- `docs/audit/enemy-sprite-animation-contract-audit.md`

For the later implementation task, expected production/test files are:

- `src/game/defs/EnemyAppearanceTypes.ts`
- `src/game/defs/EnemyDefs.ts`
- `src/game/content/loadContent.ts`
- `src/game/systems/SpawnSystem.ts`
- `src/render/webgl/WebGLSceneRenderer.ts`
- `src/render/webgl/EnemySpriteSelection.smoke.ts`
- optional test-only atlas/content fixtures if needed

Files not expected to change in the later implementation unless a separate task approves it:

- production `public/assets/sprites/*.png`
- production enemy atlas JSON files
- production `src/game/content/enemyTypes.json`
- `tools/gen_atlas.mjs`
- package scripts
- projectile/FX systems except compatibility tests

## 18. Acceptance criteria

Audit acceptance criteria:

- This document exists at `docs/audit/enemy-sprite-animation-contract-audit.md`.
- Only this documentation file changed.
- Verified state and recommendations are clearly separated.
- Current uses of `animId`, `pickAnimFrame`, atlas animations, frame IDs, `render.sprite.id`, `bState.phase`, and `tSec` are mapped across enemies, projectiles, FX, player, and generic sprite uses.
- Current enemy behavior is documented: enemies set `animId = ""`; enemy selection checks animation before static; six per-type enemy atlases have no animations; atlas FPS/order/loop are documented; missing animation/frame fallbacks are documented.
- Architecture variants A and B are compared and Variant A is recommended.
- The minimal TypeScript contract includes only `animation.id` and normalized `animation.speed`.
- Runtime, renderer, timing, atlas naming, migration, test, risk, and implementation prompt sections are complete.

Later implementation acceptance criteria:

- Existing static sprite enemies render unchanged without animation descriptors.
- Enemy animation descriptor selects atlas animation frames when present.
- Missing animation/frame/static/atlas cases preserve fallback behavior.
- Collision radius and gameplay behavior are unchanged.
- Pooled enemies do not retain ghost animation state.
- Projectile and FX animations remain unchanged.
- No generic animation engine, global asset registry, projectile/FX refactor, or animation state machine is introduced.

## 19. Codex implementation prompt

Start a NEW Codex session from the latest merged state of `feature/sprite-layer`. Create a dedicated task branch for Phase 4 implementation and do not commit directly to `feature/sprite-layer`.

Implement Phase 4 — enemy sprite animation contract, following `docs/audit/enemy-sprite-animation-contract-audit.md`.

Constraints:

- Implement only the minimal nested enemy sprite animation descriptor.
- Do not create a generic animation engine or global asset registry.
- Do not implement attack/hit/death/dodge/turn state machines.
- Do not refactor projectile or FX animation contracts.
- Preserve static `render.sprite.id`, `render.sprite.scale`, sprite-first priority, SDF/proc/glyph fallback, collision radius independence, projectile/FX animation behavior, and deterministic runtime behavior.

Required contract:

```ts
export interface EnemySpriteAnimationDef {
  id: string;
  speed: number;
}

export interface EnemySpriteRenderDef {
  id: string;
  scale: number;
  animation?: EnemySpriteAnimationDef;
}
```

Implementation plan:

1. Add `EnemySpriteAnimationDef`, validation, normalization, and materialization/deep clone support for `render.sprite.animation.id` and optional positive finite `render.sprite.animation.speed` defaulting to `1.0`.
2. Keep enemy root `animId` cleared/empty at spawn; do not expand it for enemies.
3. Update `selectEnemySpriteFrame` to prefer `render.sprite.animation.id` over root `animId`, apply speed as visual timing only with `tSec * animation.speed + deterministicPhase`, and preserve fallback order: animation frame → static `render.sprite.id` → SDF/proc/glyph fallback.
4. Add tests/smoke coverage for static unchanged, animation selection, missing animation fallback, missing animation frame fallback, missing static fallback, speed visual timing, collision radius unchanged, pooled state cleanup, deterministic phase, projectile/FX unchanged, and all six sprite enemies still rendering.
5. Use test-only fixtures if needed; do not migrate production PNGs or production enemy atlases unless explicitly requested.

Run:

- `npm run typecheck`
- `npm run build`
- `npm test --if-present`
- `git diff --check`
- `git status --short`
- `git diff --name-status`

Commit in small commits matching the audit plan, then open a PR against `feature/sprite-layer`.
