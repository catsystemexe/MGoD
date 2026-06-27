# Enemy Appearance Separation Audit

## 1. Executive summary

This is an audit-only Phase 3 plan for separating enemy appearance/render configuration from gameplay, behavior, and attack configuration. Verified base HEAD is `5bfa94d` and the audit branch is `codex/sprite-phase-3-appearance-audit`.

Key recommendation: use a minimal nested separation inside the existing enemy definition pipeline. Keep one enemy content source, keep `render` as the appearance section for now, introduce a typed `EnemyAppearanceDef`/materialization boundary, and avoid normalized global registries until content actually needs shared appearances or cross-enemy skins.

Recommended order: remove enemy-only root `spriteId` compatibility first in a small cleanup commit, then introduce an appearance normalization/materialization helper, then move behavior/attack binding types out of render-facing content types. Do not remove root `spriteId` globally because projectiles, pickups, and FX still use root sprite fields.

## 2. Verified current state

Verified by reading the current repository state, including the prior Phase 1 and Phase 2 audits.

- Phase 2 is present: `EnemyRenderDef` includes `sprite?: EnemySpriteRenderDef`, and `EnemyDef` still has temporary root `spriteId?: string` compatibility.
- Structural content validation requires core enemy gameplay fields and validates `render.sprite` when present.
- Six sprite enemies (`basic_1`, `basic_2`, `shooter_1`, `void_1`, `crawler_1`, `mine_1`) define `render.sprite.id` and `render.sprite.scale` in `enemyTypes.json`.
- Enemy sprite selection prefers `enemy.render.sprite.id` before root `enemy.spriteId`, and the canonical enemy sprite render path still runs before SDF/proc/glyph fallback.
- Runtime spawning clones `def.render` into `ent.render`, clones nested sprite/glyph/proc/SDF structures, and still writes compatibility root `ent.spriteId` from `def.render.sprite.id` or `def.spriteId`.
- `SpawnSystem` injects `render.glyphId = "enemy." + typeId` when no `glyphId`, `proc`, or non-empty `glyphs` exist.
- Director wave overrides only carry `behaviorPresetId` into spawn payloads; no verified wave path overrides enemy appearance.

## 3. Current data flow

1. `enemyTypes.json` is the single enemy type content source. It currently mixes gameplay (`hp`, `radius`, `scoreOnKill`), behavior binding (`behaviorPresetId`), attack binding (`attackProfileId`), optional AI overlay (`ai`, `aiWeight`, `aiEaseSec`), and appearance (`render.color`, `render.sprite`, `render.sdf`, `render.glyphId`, `render.glyphs`, `render.proc`).
2. `loadContent.ts` validates required gameplay fields, validates `render.sprite` shape if present, validates behavior-preset references, and leaves most render/AI/attack details to later parsers.
3. `EnemyDefs.ts` normalizes enemy types into `ENEMY_DEFS`. It parses gameplay defaults, behavior preset tolerance aliases, render color/sprite/SDF/glyph/proc data, AI overlay data, and attack profiles.
4. `DirectorDefs.ts` maps loaded director JSON into director wave definitions, preserving only enemy type, pattern, spawn cadence, limits, and optional `behaviorPresetId`.
5. `DirectorSystem.ts` emits `SPAWN_ENEMY` with `typeId`, `waveId`, `spawn`, `spawnOrdinal`, and optional wave `behaviorPresetId`.
6. `SpawnSystem.ts` resolves `ENEMY_DEFS[typeId]`, resolves the effective behavior preset from wave override or enemy default, spawns a pooled enemy entity, copies gameplay fields, clones render fields, sets compatibility sprite aliases, clones AI fields, and initializes behavior state.
7. `EnemySystem.ts` runs movement behavior from runtime `behaviorId`/`behavior` and separately looks up `ENEMY_DEFS[e.typeId].attackProfile` for shooting.
8. `WebGLSceneRenderer.ts` renders entities. For enemies it reads `render.sprite`/root sprite fallback first, then falls back to `render.sdf`, `render.proc`, `render.glyphs`, `render.glyphId`, and finally generic quad rendering.

## 4. Responsibility map

| Field | Current owner/source | Current normalization | Current runtime consumer | Notes |
|---|---|---|---|---|
| `hp` | `enemyTypes.json` | required by `loadContent`, default-tolerated by `EnemyDefs` | `SpawnSystem` copies to `hp`/`maxHp`; damage systems use runtime HP | Gameplay only. |
| `radius` | `enemyTypes.json` | required by `loadContent`, default-tolerated by `EnemyDefs` | `SpawnSystem`, collision/culling/renderer fallback geometry | Collision and fallback visual size currently share the same runtime radius. |
| `scoreOnKill` | `enemyTypes.json` | required by `loadContent`, default-tolerated by `EnemyDefs` | scoring/death flow through definitions/runtime kill handling | Gameplay reward only. |
| `behaviorPresetId` | `enemyTypes.json`, optional wave override | reference-checked by `loadContent`; stored as `EnemyDef.behaviorPreset` | `SpawnSystem` resolves behavior preset and stores runtime `behaviorId`/`behavior` | Behavior binding. |
| `attackProfileId` | `enemyTypes.json` | resolved in `EnemyDefs` against attack profile JSON | `EnemySystem` re-reads `ENEMY_DEFS[e.typeId].attackProfile` | Attack binding remains on definition lookup, not runtime entity. |
| `ai`, `aiWeight`, `aiEaseSec` | `enemyTypes.json` optional | parsed by `EnemyDefs` | cloned by `SpawnSystem`; potential behavior/AI consumers | Gameplay/behavior overlay, not appearance. |
| `render.color` | `enemyTypes.json` | parsed by `EnemyDefs` | `SpawnSystem` clones; renderer and damage FX read runtime render color | Appearance, but damage FX uses it for VFX color. |
| `render.sprite` | `enemyTypes.json` | validated by `loadContent`, normalized by `EnemyDefs` | `SpawnSystem` clones; renderer selects frame/scale | Canonical Phase 2 sprite appearance. |
| `render.sdf` | `enemyTypes.json` | whitelist-normalized by `EnemyDefs` | `SpawnSystem` clones; renderer SDF fallback | Appearance fallback. |
| `render.glyphId` | `enemyTypes.json` or injected at spawn | parsed by `EnemyDefs`, injected by `SpawnSystem` if missing | renderer glyph fallback | Fallback ownership is split. |
| `render.glyphs` | `enemyTypes.json` | normalized by `EnemyDefs` | `SpawnSystem` deep-clones; renderer glyph stack | Appearance. |
| `render.proc` | `enemyTypes.json` | normalized by `EnemyDefs` | `SpawnSystem` deep-clones; renderer proc fallback | Appearance. |
| legacy root `spriteId` | legacy enemy content/type/entity alias | accepted by `EnemyTypeDef`, normalized into `render.sprite` and `EnemyDef.spriteId` | `SpawnSystem` writes root alias; renderer fallback reads it | Enemy-only compatibility should be removed; projectile/FX root sprite use is separate. |
| `animId` | runtime root field | no enemy content normalization | renderer reads for enemy/projectile/FX animation frame selection | Enemies set empty string; no animation system yet. |

## 5. Coupling findings

### MAJOR — `EnemyDefs.ts` performs unrelated parsing jobs

- File: `src/game/defs/EnemyDefs.ts`
- Symbol: `ENEMY_DEFS`
- Current behavior: one loop parses gameplay defaults, behavior-preset aliases, render color/sprite/SDF/glyph/proc, AI overlay, attack profile resolution, warnings, and compatibility root `spriteId`.
- Risk: Phase 3 changes can accidentally affect gameplay defaults or attack binding while only intending to adjust render normalization.
- Recommended action: extract small pure normalizers in the same file or nearby files: one for gameplay, one for appearance, one for behavior/attack binding. Keep `ENEMY_DEFS` as the assembly point.
- Required for Phase 3: yes.

### MAJOR — `EnemyBehaviorTypes.ts` owns render-facing content shape

- File: `src/game/enemies/EnemyBehaviorTypes.ts`
- Symbol: `EnemyTypeDef`
- Current behavior: a behavior-types file defines `EnemyTypeDef.render.sprite` and legacy `spriteId`.
- Risk: render content appears to be behavior-owned, making future appearance additions harder to place and inviting behavior systems to import render types.
- Recommended action: move enemy content/appearance type definitions to a neutral defs/content type module, or at minimum split appearance types out and import them into the content type.
- Required for Phase 3: yes, but can be a small type-only move.

### MAJOR — `SpawnSystem.ts` mixes appearance cloning with behavior setup

- File: `src/game/systems/SpawnSystem.ts`
- Symbol: `SPAWN_ENEMY` case
- Current behavior: the spawn path resolves behavior preset, sets gameplay fields, materializes root sprite aliases, deep-clones render data, injects glyph fallback, clones AI overlay, and initializes behavior state in one block.
- Risk: pooled-entity ghost state or behavior override changes can accidentally mutate or skip appearance state.
- Recommended action: introduce a `materializeEnemyAppearance(def, typeId)` helper that returns a fresh runtime render object and compatibility aliases while they exist. Keep behavior preset resolution separate.
- Required for Phase 3: yes.

### MINOR — Renderer still depends on root enemy compatibility fields

- File: `src/render/webgl/WebGLSceneRenderer.ts`
- Symbol: `selectEnemySpriteFrame`
- Current behavior: sprite selection prefers `render.sprite.id` but falls back to `enemy.spriteId`; it also reads `animId` for enemies.
- Risk: root `spriteId` can mask incomplete migrations and allows two sprite IDs to disagree.
- Recommended action: remove enemy root `spriteId` fallback in a pre-Phase-3 cleanup; keep `animId` as empty/optional until an animation phase designs it.
- Required for Phase 3: yes for `spriteId`, no for `animId`.

### INFO — Renderer does not consume gameplay-only bindings for enemy appearance

- File: `src/render/webgl/WebGLSceneRenderer.ts`
- Symbol: enemy render path
- Current behavior: the enemy sprite path uses kind/type/render sprite/root sprite/anim/phase and fallback paths use render data, HP ratio, radius, and position.
- Risk: low. `radius` and `hp` are used for visual fallback effects, but not behavior IDs or attack profiles.
- Recommended action: retain current render priority; document `radius`/`hp` as runtime visualization inputs, not appearance configuration.
- Required for Phase 3: no.

### MINOR — Gameplay systems mostly avoid render data, except VFX color

- File: `src/game/systems/DamageSystem.ts`
- Symbol: enemy death FX emission
- Current behavior: death particles choose `ent.render.color` as a VFX color.
- Risk: removing or relocating render color without a runtime color accessor could silently change death FX colors.
- Recommended action: treat death FX color as appearance-derived VFX data and keep it on runtime appearance, or add a small accessor.
- Required for Phase 3: yes if `render.color` moves.

### INFO — Wave/director overrides affect behavior only

- Files: `src/game/defs/DirectorTypes.ts`, `src/game/defs/DirectorDefs.ts`, `src/game/systems/DirectorSystem.ts`
- Symbol: `behaviorPresetId`
- Current behavior: waves can override behavior preset only; no appearance override path was found.
- Risk: low. Future bosses/phases may need appearance overrides, but Phase 3 does not.
- Recommended action: keep wave appearance overrides out of Phase 3.
- Required for Phase 3: no.

### MAJOR — `radius` is both collision radius and fallback visual scale

- Files: `src/game/systems/SpawnSystem.ts`, `src/game/systems/CollisionSystem.ts`, `src/render/webgl/WebGLSceneRenderer.ts`
- Symbol: runtime `radius`
- Current behavior: `radius` is copied from definition and used by collision/culling and by SDF/quad fallback drawing.
- Risk: appearance separation may be tempted to move or rescale radius as visual data, changing collisions.
- Recommended action: keep `radius` in gameplay/collision. If visual radius is ever needed, add separate appearance scale/size later; do not change collision in Phase 3.
- Required for Phase 3: yes.

### MAJOR — Spawn-time fallback glyph injection couples appearance defaults to runtime spawning

- File: `src/game/systems/SpawnSystem.ts`
- Symbol: glyph fallback injection block
- Current behavior: if cloned render lacks glyph/proc/glyph stack, spawn injects `glyphId = "enemy." + typeId`.
- Risk: fallback appearance changes happen at runtime and can be missed by definition/content tests; pooled entities might retain or mutate injected state.
- Recommended action: move default appearance fallback into definition normalization so spawned entities only clone an already-normalized appearance.
- Required for Phase 3: yes.

### MAJOR — Enemy-only root `spriteId` compatibility should not survive Phase 3

- Files: `EnemyDef`, `EnemyTypeDef`, `EnemyEntity`, `SpawnSystem`, `selectEnemySpriteFrame`, sprite smoke tests
- Symbol: root `spriteId`
- Current behavior: compatibility alias remains even though all six sprite enemies have canonical `render.sprite`.
- Risk: two authoritative sprite paths weaken the separation boundary.
- Recommended action: remove enemy-only root `spriteId` compatibility before appearance separation in a small commit. Do not remove projectile/pickup/FX root sprite fields.
- Required for Phase 3: yes.

## 6. Target boundaries

Recommended conceptual boundaries, names flexible:

```ts
interface EnemyGameplayDef {
  hp: number;
  radius: number;      // collision/culling/gameplay radius
  scoreOnKill: number;
}

interface EnemyAppearanceDef {
  color?: string;
  sprite?: { id: string; scale: number };
  sdf?: SdfRenderDef;
  glyphId?: string;
  glyphs?: EnemyGlyphDef[];
  proc?: EnemyProcRenderDef;
}

interface EnemyBehaviorBinding {
  presetId: EnemyBehaviorPresetId | string;
  ai?: Record<string, unknown>;
  aiWeight?: number;
  aiEaseSec?: number;
}

interface EnemyAttackBinding {
  profileId?: string;
  profile?: AttackProfileDef;
}

interface EnemyDef {
  id: EnemyTypeId;
  gameplay: EnemyGameplayDef;
  behavior: EnemyBehaviorBinding;
  attack?: EnemyAttackBinding;
  appearance?: EnemyAppearanceDef;
}

interface EnemyRuntimeEntity {
  kind: "enemy";
  typeId: EnemyTypeId;
  hp: number;
  maxHp: number;
  radius: number;
  behaviorId: EnemyBehaviorId;
  behavior: EnemyBehaviorParams;
  bState: Record<string, unknown>;
  render?: EnemyAppearanceDef; // fresh clone/materialized runtime copy
}
```

Implementation does not need to rename everything at once. The useful Phase 3 boundary is a normalizer/materializer boundary, not a large database split.

## 7. Architecture variants

### Variant A — nested separation inside `EnemyDef`

- Diff size: small to medium. Add nested concepts and helpers while keeping `ENEMY_DEFS` lookup unchanged.
- Migration cost: low. Existing `enemyTypes.json` can remain one source; code can bridge old flat shape during migration.
- Runtime lookup cost: unchanged; still one `ENEMY_DEFS[typeId]` lookup at spawn.
- Duplication risk: low if `id` remains authoritative once and appearance is nested/copied once.
- Content authoring complexity: low. Authors keep one enemy object.
- Test impact: focused tests around normalization, spawn materialization, and legacy cleanup.
- Future animation compatibility: good enough; `appearance.sprite` can later add animation metadata.
- Future bosses/phases compatibility: adequate; boss phases can still be one enemy type initially, or later add scoped phase overrides.
- Overengineering risk: low.

### Variant B — separate normalized registries

Examples: `ENEMY_GAMEPLAY_DEFS`, `ENEMY_APPEARANCE_DEFS`, `ENEMY_BEHAVIOR_BINDINGS`.

- Diff size: large. Many consumers must choose the correct registry.
- Migration cost: high. Requires new assembly/cross-reference rules and likely more tests.
- Runtime lookup cost: more lookups or an aggregation layer, though still trivial in absolute terms.
- Duplication risk: higher because enemy IDs become keys in multiple structures.
- Content authoring complexity: higher unless content remains one file and registries are generated, in which case code complexity rises without authoring benefit.
- Test impact: broader; must test registry synchronization and missing sections.
- Future animation compatibility: good, but not uniquely better than Variant A today.
- Future bosses/phases compatibility: better for shared skins/phases if needed, but current evidence does not require it.
- Overengineering risk: high.

## 8. Recommended architecture

Choose Variant A. Keep one content source and one spawned enemy definition lookup. Introduce a clearer internal separation in the definition pipeline:

1. Normalize enemy content into gameplay, behavior/AI binding, attack binding, and appearance pieces.
2. Materialize runtime appearance through one helper that always returns fresh mutable structures and no ghost fields.
3. Keep `radius` gameplay/collision-owned.
4. Keep renderer priority unchanged: sprite first, then SDF/proc/glyph, then quad.
5. Do not create global normalized registries unless later evidence shows shared appearances, skins, or boss phase reuse.

## 9. Content format decision

Short-term recommendation: retain the current mostly-flat gameplay structure with only `render` as the nested appearance section:

```json
{
  "id": "basic_1",
  "hp": 3,
  "radius": 9,
  "scoreOnKill": 75,
  "behaviorPresetId": "straight.basic",
  "attackProfileId": "single_basic",
  "render": {}
}
```

Do not migrate `enemyTypes.json` to fully nested `gameplay`/`behavior`/`appearance` sections in Phase 3. That would be clearer in theory but creates a larger content migration and many compatibility choices. The smallest useful clarity gain is code-side separation while preserving the existing authoring format. A later content-format migration can happen once the code boundary is proven.

## 10. Runtime entity contract

Recommended runtime fields:

- `typeId`: copy from spawn payload; keep as the authoritative definition key.
- `hp`/`maxHp`: copy numeric gameplay values at spawn.
- `radius`: copy gameplay collision/culling radius at spawn; do not derive from sprite scale.
- `render`: clone/materialize appearance once at spawn. Deep-clone mutable nested structures (`sprite`, `glyphs`, `proc.parts`, `sdf`).
- `behaviorId`: resolve once at spawn after applying wave override.
- `behavior`: clone preset params once at spawn.
- `bState`: fresh behavior state each spawn.
- `ai`, `aiWeight`, `aiWeightTarget`, `aiEaseSec`: clone/copy from behavior binding if still runtime-owned.
- `attackProfile`: optional future improvement: resolve once at spawn or keep definition lookup. Current code uses definition lookup; Phase 3 can leave it unchanged unless tests cover an entity-local attack profile.
- enemy root `spriteId`: remove as compatibility alias.
- enemy root `animId`: keep optional/empty only if renderer tests still cover animation fallback; do not expand until animation work.

Pooled entity ghost state: spawning must explicitly overwrite or delete enemy appearance and behavior fields every time. The safest pattern is a single materializer returning `{ render }`, and spawn assignment should set absent optional fields to `undefined` or omit them from a fresh object while also clearing removed aliases like root `spriteId`.

## 11. Legacy spriteId cleanup

Recommendation: **A. remove root enemy `spriteId` compatibility first, in a small cleanup commit.**

Reasoning:

- All verified sprite-enabled enemies already use `render.sprite.id`.
- Keeping root enemy `spriteId` during appearance separation preserves two sources of sprite truth.
- Removing it first simplifies the Phase 3 target boundary and test expectations.

Scope of removal must be enemy-only:

- Remove `EnemyDef.spriteId` compatibility and `normalizeEnemySpriteRender(...rootSpriteId...)` fallback.
- Remove `EnemyTypeDef.spriteId` from enemy content typing.
- Remove `EnemyEntity.spriteId` for enemies if no other enemy code needs it.
- Remove `SpawnSystem` enemy assignment to root `ent.spriteId`.
- Remove root fallback from `selectEnemySpriteFrame` for enemy selection.
- Update enemy sprite tests that assert legacy root fallback.

Do not globally remove root `spriteId` from projectiles, pickups, or FX. Projectiles and FX still use root sprite IDs/animation IDs in their current renderer paths.

## 12. Fallback appearance ownership

Recommendation: move fallback appearance defaults from `SpawnSystem` into definition normalization.

Current behavior injects `render.glyphId = "enemy." + typeId` at spawn if no glyph/proc/glyph stack exists. The better owner is the appearance normalizer because fallback defaults are content/appearance defaults, not runtime spawning logic.

Do not move this to the renderer: renderer fallback should be defensive and draw what the entity has, not invent content identities. Do not remove it outright unless tests prove every enemy has explicit appearance fallback and visual compatibility is accepted.

## 13. Migration plan

### Commit 1 — remove enemy-only root `spriteId` compatibility

Expected files:

- `src/game/defs/EnemyDefs.ts`
- `src/game/enemies/EnemyBehaviorTypes.ts` or replacement neutral content type file
- `src/game/systems/SpawnSystem.ts`
- `src/render/webgl/WebGLSceneRenderer.ts`
- `src/render/webgl/EnemySpriteSelection.smoke.ts`

### Commit 2 — introduce EnemyAppearanceDef typing and normalization boundary

Expected files:

- `src/game/defs/EnemyDefs.ts`
- optional new `src/game/defs/EnemyAppearanceTypes.ts`
- `src/game/content/loadContent.ts` if imports/types need updating
- smoke/unit test files for appearance normalization

### Commit 3 — simplify `SpawnSystem` appearance materialization

Expected files:

- `src/game/systems/SpawnSystem.ts`
- tests around cloned appearance and pooled-entity ghost state

### Commit 4 — separate behavior/attack binding types from render/content types

Expected files:

- `src/game/enemies/EnemyBehaviorTypes.ts`
- optional new neutral content/definition type files under `src/game/defs` or `src/game/content`
- import sites in `loadContent.ts`, `EnemyDefs.ts`, `SpawnSystem.ts`

### Commit 5 — tests and cleanup

Expected files:

- existing smoke tests or new focused tests
- possibly `docs/audit` follow-up notes if implementation changes decisions

## 14. Test plan

Minimum later implementation tests:

1. Normalized appearance does not mutate gameplay data.
2. `SpawnSystem` clones mutable appearance structures (`sprite`, `glyphs`, `proc.parts`, `sdf`) rather than sharing definition objects.
3. Gameplay systems work without reading render-only data.
4. Renderer sprite/fallback selection works without reading behavior-only data.
5. Collision radius remains independent from visual sprite scale.
6. Wave `behaviorPresetId` override changes behavior only and does not alter appearance.
7. Pooled entities do not retain appearance ghost state or behavior ghost state.
8. Legacy enemy root `spriteId` cleanup behaves as intended: nested `render.sprite.id` works and root enemy fallback no longer applies.
9. All existing enemy definitions still load.
10. Fallback glyph defaults are applied by normalization/materialization exactly once and do not mutate shared data.

## 15. Risks

- Removing root enemy `spriteId` compatibility can break hidden tests that still construct legacy enemy objects; mitigate with explicit test updates and scoped cleanup.
- Moving fallback glyph ownership can alter exact runtime `render` shape; mitigate by asserting spawned entities still get the same fallback glyphs.
- `radius` is currently both gameplay collision radius and fallback visual radius; do not rename/move it without dedicated collision tests.
- Type moves can cascade through imports; keep behavior refactor type-only and small.
- No remote is configured in this checkout, so pushing the branch cannot be performed from this environment unless a remote is added externally.

## 16. Files expected to change

Audit task changed only:

- `docs/audit/enemy-appearance-separation-audit.md`

Later implementation is expected to touch only small focused sets listed in the migration plan. No production code was changed by this audit.

## 17. Acceptance criteria

For this audit:

- Only `docs/audit/enemy-appearance-separation-audit.md` changes.
- `npm run typecheck`, `npm run build`, `npm test --if-present`, `git diff --check`, `git status --short`, and `git diff --name-status` are run and reported.
- The audit distinguishes verified current state from recommendations.
- The recommended architecture is minimal and compatible with current engine behavior.

For later Phase 3 implementation:

- Enemy appearance is normalized/materialized through a clear boundary.
- Behavior and attack binding are not owned by render-facing types.
- Enemy root `spriteId` compatibility is removed without touching projectile/pickup/FX sprite contracts.
- Spawned entities do not retain pooled ghost state.
- Renderer priority and gameplay/collision behavior are unchanged.

## 18. Codex implementation prompt

Start a new Codex session from latest `feature/sprite-layer` and create a dedicated branch. Implement Phase 3 from `docs/audit/enemy-appearance-separation-audit.md` with small commits. Do not change render priority, gameplay balance, collision radius semantics, assets, package scripts, or split content into multiple JSON files.

Commit 1: remove enemy-only root `spriteId` compatibility. Remove `EnemyDef.spriteId`, enemy `EnemyTypeDef.spriteId`, enemy spawn assignment to root `ent.spriteId`, and enemy root fallback in `selectEnemySpriteFrame`. Update only enemy sprite tests. Do not remove projectile/pickup/FX root sprite IDs.

Commit 2: introduce a minimal `EnemyAppearanceDef` typing/normalization boundary while keeping `enemyTypes.json` mostly flat with `render`. Move fallback glyph default ownership from `SpawnSystem` into appearance normalization.

Commit 3: simplify `SpawnSystem` by materializing a fresh cloned runtime appearance object via one helper and separating that from behavior preset resolution. Ensure pooled entities cannot retain render, sprite, behavior, or AI ghost state.

Commit 4: separate behavior/attack binding types from render-facing enemy content types with the smallest type-only move possible. Keep one `ENEMY_DEFS[typeId]` lookup and no normalized global registries.

Commit 5: add/adjust tests for normalized appearance immutability, cloned mutable render structures, gameplay systems not reading render-only data, renderer not reading behavior-only data, radius independent from sprite scale, wave behavior override not changing appearance, pooled-entity ghost state, enemy root `spriteId` cleanup, and all enemy definitions loading.

Run `npm run typecheck`, `npm run build`, `npm test --if-present`, `git diff --check`, `git status --short`, and `git diff --name-status` before committing. Commit with focused messages and open a PR against `feature/sprite-layer`.
