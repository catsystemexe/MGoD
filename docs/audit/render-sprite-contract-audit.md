# Render Sprite Contract Audit

## 1. Executive summary

This audit prepares Phase 2 only: a minimal `render.sprite` data contract for enemy sprites. It does **not** implement the contract and does **not** change production code, content JSON, or assets.

Verified current state after Phase 1 cleanup:

- Enemy sprite content still lives at root `spriteId` in `src/game/content/enemyTypes.json` for `basic_1`, `basic_2`, `shooter_1`, `void_1`, `crawler_1`, and `mine_1`.
- `loadContent.ts` validates required gameplay fields only and permits extra render fields without validating sprite configuration.
- `EnemyDefs.ts` parses root `spriteId` into `EnemyDef.spriteId`; `EnemyRenderDef` has no `sprite` field.
- `SpawnSystem.ts` copies `def.spriteId` to runtime `ent.spriteId` and sets `ent.animId = ""`; `ent.render` is cloned separately.
- `WebGLSceneRenderer.ts` has one canonical per-type enemy sprite path before SDF fallback and delegates frame/system choice to `selectEnemySpriteFrame`.
- `SpriteProgram.draw(posX, posY, w, h, pivotX, pivotY, rot, uvX, uvY, uvW, uvH, tintR, tintG, tintB, tintA)` uses `w`/`h` as rendered sprite size and `pivotX`/`pivotY` as the pivot inside that rendered local sprite space.

Recommended Phase 2 decision: **Variant A** — temporarily support both `render.sprite.id` and root `spriteId`, with priority `render.sprite.id -> root spriteId fallback`. Then migrate the six content entries to `render.sprite` in a dedicated content commit and remove compatibility in a later cleanup. This has the lowest risk because it allows parser, runtime, renderer, and tests to land before the JSON migration.

## 2. Current contract

Current enemy sprite contract:

```json
{
  "id": "basic_1",
  "spriteId": "enemy.basic_1.idle",
  "render": {
    "color": "#ff8844",
    "sdf": { "shape": "triangle", "size": 1.0 }
  }
}
```

Current code contract:

- `EnemyTypeDef` in `src/game/enemies/EnemyBehaviorTypes.ts` lists only gameplay/content core fields and does not type `spriteId` or `render` extras.
- `loadContent.validateEnemyTypes()` requires `id`, `hp`, `radius`, `scoreOnKill`, and `behaviorPresetId`; it explicitly allows extra fields.
- `EnemyDef` has root `spriteId?: string` and `render?: EnemyRenderDef`.
- `EnemyRenderDef` includes `color`, `sdf`, `glyphId`, `glyphs`, and `proc`, but not `sprite`.
- `EnemyEntity` has root `spriteId?: string` and `animId?: string`.
- Runtime `ent.render` is a cloned render fallback object and does not carry sprite configuration.
- `selectEnemySpriteFrame()` currently reads `enemy.spriteId` and `enemy.animId`.

### Findings

#### MAJOR — Sprite render data is split outside `render`

- File/symbol: `src/game/defs/EnemyDefs.ts`, `EnemyDef.spriteId` and `EnemyRenderDef`.
- Current behavior: sprite identity is stored at root `EnemyDef.spriteId`, while SDF/glyph/proc live under `render`.
- Risk: future render-only fields such as scale must either add more root fields or create a second path that duplicates sprite identity.
- Recommendation: add `EnemySpriteRenderDef` and `EnemyRenderDef.sprite` in Phase 2, then make renderer prefer `entity.render.sprite.id`.
- Necessary for Phase 2: yes.

#### MAJOR — Runtime entity duplicates render state at root

- File/symbol: `src/game/systems/SpawnSystem.ts`, `EnemyEntity.spriteId`, `EnemyEntity.animId`, and `ent.render`.
- Current behavior: `spriteId`/`animId` are root runtime fields; `render` is a separate cloned object.
- Risk: entity pool reuse can leave ghost root sprite state if a spawn path forgets to overwrite both root and render data.
- Recommendation: Phase 2 should move the canonical runtime descriptor to `ent.render.sprite`; root `spriteId` should remain only as temporary compatibility if Variant A is chosen.
- Necessary for Phase 2: yes.

#### INFO — Phase 1 renderer priority is suitable for Phase 2

- File/symbol: `src/render/webgl/WebGLSceneRenderer.ts`, canonical enemy sprite path and `selectEnemySpriteFrame`.
- Current behavior: enemy sprite selection runs before SDF/proc/glyph fallback.
- Risk: low, provided Phase 2 does not move this block.
- Recommendation: keep render order unchanged and only alter how sprite ID/scale are read and passed into draw.
- Necessary for Phase 2: yes.

## 3. Target contract

Target content contract for Phase 2:

```json
{
  "id": "basic_1",
  "render": {
    "sprite": {
      "id": "enemy.basic_1.idle",
      "scale": 1.0
    },
    "color": "#ff8844",
    "sdf": { "shape": "triangle", "size": 1.0 }
  }
}
```

Minimal TypeScript contract:

```ts
export interface EnemySpriteRenderDef {
  id: string;
  scale?: number;
}

export interface EnemyRenderDef {
  color?: string;
  sprite?: EnemySpriteRenderDef;
  sdf?: SdfRenderDef;
  glyphId?: string;
  glyphs?: Array<...>;
  proc?: ...;
}
```

Runtime target:

- Preferred runtime source: `entity.render.sprite.id` and `entity.render.sprite.scale`.
- Temporary fallback source if Variant A is chosen: `entity.spriteId`.
- `animId` should not be expanded for Phase 2; current enemies use static `idle` frame keys and empty `animId`.
- `scale` default is `1.0` and affects only visual sprite dimensions.

## 4. Data flow changes

| Step | File | Current field | Phase 2 recommended field | Compatibility |
|---|---|---|---|---|
| Content authoring | `src/game/content/enemyTypes.json` | root `spriteId` | `render.sprite.id`, `render.sprite.scale` | Variant A temporarily accepts both |
| Structural content load | `src/game/content/loadContent.ts` / `validateEnemyTypes` | extra fields allowed, no sprite validation | validate `render.sprite` shape if present | keep root `spriteId` accepted during migration |
| Definition parsing | `src/game/defs/EnemyDefs.ts` / `ENEMY_DEFS` | `spriteIdRaw = t.spriteId` | parse `render.sprite` into `EnemyRenderDef.sprite` | if missing, derive temporary sprite from root `spriteId` |
| Spawn | `src/game/systems/SpawnSystem.ts` / `SPAWN_ENEMY` | `ent.spriteId = def.spriteId ?? ""`; clone `def.render` | clone `def.render.sprite` into `ent.render.sprite` | optionally also set root `ent.spriteId` for fallback |
| Runtime entity | `EnemyEntity` | root `spriteId`, `animId`, `render` | `render.sprite.id`, `render.sprite.scale` | root `spriteId` transitional only |
| Renderer selection | `src/render/webgl/WebGLSceneRenderer.ts` / `selectEnemySpriteFrame` | reads `enemy.spriteId` | read sprite descriptor ID from `enemy.render.sprite.id` first | fallback to root `spriteId` under Variant A |
| WebGL draw | `SpriteProgram.draw` call | draws `fr.w`, `fr.h`, `fr.px`, `fr.py` | draw `fr.w * scale`, `fr.h * scale`, `fr.px * scale`, `fr.py * scale` | default scale 1 keeps visuals unchanged |

## 5. Backward compatibility decision

### Variant A — temporary dual support

Priority:

```text
render.sprite.id
→ root spriteId fallback
```

Details:

- Diff size: medium-small. Types/parser/SpawnSystem/renderer change first; content migration can be a separate commit.
- Risks: two sources of sprite truth exist temporarily; tests must assert priority to avoid ambiguity.
- Test impact: add tests for both `render.sprite.id` and fallback root `spriteId`.
- Ghost-state risk: manageable if `SpawnSystem` always overwrites `ent.render` and root `ent.spriteId` during compatibility.
- Future removal: once six enemies are migrated and tests pass, remove root `spriteId` parsing/runtime fallback in a later cleanup.

### Variant B — one-shot migration

Details:

- Diff size: larger in one commit because types, parser, runtime, renderer, tests, and six content entries change together.
- Risks: harder to bisect; if renderer migration is wrong, all sprite-enabled enemies can fall to SDF at once.
- Test impact: fewer compatibility tests, but more reliance on full content migration correctness.
- Ghost-state risk: lower after completion because root `spriteId` disappears immediately, but higher during implementation if tests are not complete.
- Future removal: no compatibility cleanup needed if all references are removed immediately.

### Recommendation

Choose **Variant A** for Phase 2. It preserves the current visual result while allowing a small, reviewable implementation sequence. The compatibility period should be explicitly short-lived: after six enemy definitions are migrated and tests prove frame validity, open a follow-up cleanup to remove root `spriteId` support.

#### MAJOR — Dual support must have explicit priority

- File/symbol: future `selectEnemySpriteFrame` and `SpawnSystem` changes.
- Current behavior: only root `spriteId` exists.
- Risk: if priority is implicit, root and nested values can disagree and produce confusing output.
- Recommendation: encode and test `render.sprite.id` before root `spriteId`.
- Necessary for Phase 2: yes.

## 6. Scale semantics

`SpriteProgram.draw()` parameters relevant to scale:

```ts
draw(
  posX: number,
  posY: number,
  w: number,
  h: number,
  pivotX: number,
  pivotY: number,
  rot: number,
  uvX: number,
  uvY: number,
  uvW: number,
  uvH: number,
  tintR = 1,
  tintG = 1,
  tintB = 1,
  tintA = 1,
)
```

Recommended application:

- Compute `const scale = normalizeSpriteScale(entity.render?.sprite?.scale)`.
- Draw with:
  - `w = fr.w * scale`
  - `h = fr.h * scale`
  - `pivotX = fr.px * scale`
  - `pivotY = fr.py * scale`
- Keep UV rectangle unchanged: `fr.x`, `fr.y`, `fr.w`, `fr.h`.
- Keep rotation unchanged at current `0` for enemy sprites.
- Do **not** change entity `radius`, `hp`, collision, damage, spawn position, or behavior.

Scale validation/defaults:

| Input | Recommended normalized value | Rationale |
|---|---:|---|
| missing | `1.0` | preserve current visuals |
| `1.0` | `1.0` | explicit default |
| positive finite number | same value | valid visual scale |
| `0` | reject in content validation or normalize to `1.0` with warning | invisible sprites are not useful in Phase 2 |
| negative | reject or normalize to `1.0` with warning | no flip semantics in Phase 2 |
| `NaN` / `Infinity` | reject or normalize to `1.0` with warning | invalid WebGL dimensions |
| string | reject in structural validation | avoids implicit coercion |

Recommendation: structural validation should reject non-number `scale` if present; `EnemyDefs` should normalize missing scale to `1.0`; renderer should defensively use `1.0` for any non-positive/non-finite value.

#### BLOCKER — Scale must not affect collision/gameplay

- File/symbol: future renderer draw call and `SpawnSystem` entity radius assignment.
- Current behavior: sprite dimensions are independent of `ent.radius`; collision radius comes from `def.radius`.
- Risk: coupling scale to radius would change gameplay, collision, and balance.
- Recommendation: apply scale only to `SpriteProgram.draw()` size/pivot arguments.
- Necessary for Phase 2: yes.

## 7. Validation ownership

Recommended split:

### `loadContent.ts` — structural validation

Validate only when `render.sprite` is present:

- `render.sprite` must be an object.
- `render.sprite.id` must be a non-empty string.
- `render.sprite.scale`, if present, must be a finite number greater than `0`.
- Continue allowing root `spriteId` during Variant A migration.

### `EnemyDefs.ts` — normalization/defaults

- Parse `render.sprite` into `EnemyRenderDef.sprite`.
- If `render.sprite.id` is absent and root `spriteId` exists, create a compatibility sprite descriptor `{ id: spriteIdRaw, scale: 1 }` or keep root fallback explicitly documented.
- Normalize missing `scale` to `1.0` in the definition object or leave it optional but ensure renderer default is tested.
- Warn if both root `spriteId` and `render.sprite.id` exist but differ.

### Renderer — defensive fallback only

- Renderer should not be the primary validator.
- It should default invalid/missing scale to `1.0` defensively and fall through to SDF when no valid sprite ID/frame exists.

#### MAJOR — Avoid duplicate validation layers

- File/symbol: `loadContent.validateEnemyTypes`, `EnemyDefs`, `selectEnemySpriteFrame`.
- Current behavior: content validates gameplay fields; `EnemyDefs` tolerates render fields.
- Risk: duplicating the same validation in all three layers creates inconsistent failure behavior.
- Recommendation: structural errors in `loadContent`, normalization in `EnemyDefs`, defensive fallback in renderer.
- Necessary for Phase 2: yes.

## 8. Entity lifecycle and cloning

Current spawn behavior:

- `SpawnSystem` sets `ent.spriteId = def.spriteId ?? ""` and `ent.animId = ""`.
- `SpawnSystem` builds a new `ent.render` object and clones known nested `glyphs`, `proc.parts`, and `sdf`.
- There is no `render.sprite` clone because the field does not exist yet.

Phase 2 clone requirement:

```ts
...(dr.sprite ? { sprite: { ...dr.sprite } } : {})
```

Entity pool considerations:

- Every enemy spawn should overwrite `ent.render` with a fresh object, even if empty.
- During Variant A, every enemy spawn should also overwrite root `ent.spriteId` to either the compatibility ID or `""` so reused slots cannot retain old sprite IDs.
- `animId` should continue to be overwritten (`""`) until a later animation contract exists.
- No runtime entity should share a mutable `render.sprite` object with `EnemyDef` or another entity.

#### MAJOR — Nested `render.sprite` needs explicit clone

- File/symbol: future `SpawnSystem` render clone.
- Current behavior: nested known render fields are cloned manually.
- Risk: a shallow assignment of `dr.sprite` could share mutable runtime render state across enemies.
- Recommendation: clone `sprite` with `{ ...dr.sprite }` as part of `ent.render` construction.
- Necessary for Phase 2: yes.

## 9. Renderer changes

Recommended minimal renderer changes:

1. Extend selection input to accept `render.sprite`:

```ts
type EnemySpriteSelectionInput = {
  typeId?: unknown;
  spriteId?: unknown;      // compatibility only
  animId?: unknown;
  render?: { sprite?: { id?: unknown; scale?: unknown } };
  bState?: { phase?: unknown };
};
```

2. Resolve sprite ID with explicit priority:

```ts
const renderSprite = enemy.render?.sprite;
const spriteId = typeof renderSprite?.id === "string" && renderSprite.id.length
  ? renderSprite.id
  : String(enemy.spriteId ?? "");
```

3. Return normalized scale with the selected frame:

```ts
return frame ? { sys, frame, scale } : null;
```

4. Apply scale only at draw:

```ts
const sw = fr.w * scale;
const sh = fr.h * scale;
sys.prog.draw(ix, iy, sw, sh, fr.px * scale, fr.py * scale, 0, fr.x, fr.y, fr.w, fr.h, 1, 1, 1, 1);
```

5. Keep fallback behavior unchanged: no selected sprite means continue into SDF, then proc, glyph stack, glyph, and later fallback paths.

6. Do not change enemy sprite asset registration in Phase 2.

#### INFO — Renderer priority should remain unchanged

- File/symbol: `WebGLSceneRenderer.render`, canonical enemy sprite block.
- Current behavior: canonical enemy sprite block is immediately before SDF fallback.
- Risk: moving the block can reintroduce the old SDF-over-sprite behavior.
- Recommendation: alter only selection input and draw dimensions; do not move the block.
- Necessary for Phase 2: yes.

## 10. Content migration table

Recommended Phase 2 content migration values:

| Enemy type | Current `spriteId` | Target `render.sprite.id` | Target `render.sprite.scale` | Notes |
|---|---|---|---:|---|
| `basic_1` | `enemy.basic_1.idle` | `enemy.basic_1.idle` | `1.0` | preserve current visual size |
| `basic_2` | `enemy.basic_2.idle` | `enemy.basic_2.idle` | `1.0` | preserve current visual size |
| `shooter_1` | `enemy.shooter_1.idle` | `enemy.shooter_1.idle` | `1.0` | preserve current visual size |
| `void_1` | `enemy.void_1.idle` | `enemy.void_1.idle` | `1.0` | preserve current visual size |
| `crawler_1` | `enemy.crawler_1.idle` | `enemy.crawler_1.idle` | `1.0` | preserve current visual size |
| `mine_1` | `enemy.mine_1.idle` | `enemy.mine_1.idle` | `1.0` | preserve current visual size |

Recommendation: use `scale: 1.0` for every migrated enemy in Phase 2. Individual size tuning should be a later content-only change with explicit visual targets.

## 11. Test plan

Minimum Phase 2 tests to implement later:

1. Parser accepts valid `render.sprite` with `id` and optional positive finite `scale`.
2. Parser rejects or reports invalid `render.sprite.id` when present and not a non-empty string.
3. Parser rejects or normalizes invalid `scale` according to the chosen validation behavior.
4. `EnemyDefs` normalizes missing `scale` to `1.0` or preserves optional scale with tested renderer default.
5. `SpawnSystem` clones `render.sprite` so entity mutation cannot mutate `EnemyDef` or another entity.
6. Recycled entity slots do not retain ghost `spriteId`, `animId`, or `render.sprite` from a previous enemy.
7. Renderer selection prefers `render.sprite.id` over root `spriteId` under Variant A.
8. Renderer applies `scale` to draw width/height and pivot only.
9. Collision radius remains unchanged when `render.sprite.scale` changes.
10. Sprite still renders before SDF fallback.
11. Root `spriteId` fallback works during compatibility window.
12. All six migrated enemies have atlas frames matching `render.sprite.id`.

Tests are not implemented in this audit.

## 12. Risks

- **BLOCKER** — Applying `scale` to collision radius or gameplay stats would change gameplay.
- **MAJOR** — Dual support can create disagreement between root `spriteId` and `render.sprite.id` unless priority and warnings are explicit.
- **MAJOR** — A shallow clone of `render.sprite` can share mutable data across runtime entities.
- **MAJOR** — Removing root `spriteId` before content migration and tests are complete can make all six sprite enemies fall back to SDF.
- **MINOR** — `EnemyTypeDef` currently omits render extras, so type coverage of content remains partial unless expanded.
- **INFO** — Scale `1.0` preserves current visual output and should be used until explicit visual tuning is requested.

## 13. Recommended implementation phases

### Commit 1 — types + parser + validation

- Add `EnemySpriteRenderDef` and `EnemyRenderDef.sprite`.
- Extend content structural validation for `render.sprite` if present.
- Parse and normalize `render.sprite` in `EnemyDefs`.
- Keep root `spriteId` compatibility.

### Commit 2 — SpawnSystem/runtime contract

- Clone `dr.sprite` into `ent.render.sprite`.
- Keep overwriting root `ent.spriteId` during Variant A compatibility.
- Add tests for clone isolation and recycled entity ghost state.

### Commit 3 — renderer scale support

- Update `selectEnemySpriteFrame` to read `render.sprite.id` before root `spriteId`.
- Return normalized scale.
- Apply scale to draw width, height, and pivot only.
- Preserve render order.

### Commit 4 — migrate six enemy definitions

- Move each root `spriteId` into `render.sprite.id`.
- Add `scale: 1.0` for all six sprite enemies.
- Keep root `spriteId` only if compatibility commit strategy requires one transition commit; otherwise remove it from these six entries after tests pass.

### Commit 5 — tests and compatibility cleanup

- Add parser/SpawnSystem/renderer/content-frame tests.
- After migration is stable, remove root `spriteId` fallback in a later explicit cleanup commit.

Alternative: combine commits 1 and 2 if reviewer prefers fewer small parser/runtime patches, but keep content migration separate from renderer scale support.

## 14. Files expected to change

Expected implementation files for Phase 2, not changed by this audit:

- `src/game/enemies/EnemyBehaviorTypes.ts`
- `src/game/content/loadContent.ts`
- `src/game/defs/EnemyDefs.ts`
- `src/game/systems/SpawnSystem.ts`
- `src/render/webgl/WebGLSceneRenderer.ts`
- `src/render/webgl/EnemySpriteSelection.smoke.ts` or equivalent test files
- `src/game/content/enemyTypes.json` in the dedicated migration commit

Only this audit file should change now:

- `docs/audit/render-sprite-contract-audit.md`

## 15. Acceptance criteria

For this audit:

- Production source files, `enemyTypes.json`, assets, and atlas JSON files are unchanged.
- The audit document exists at `docs/audit/render-sprite-contract-audit.md`.
- The document recommends a minimal Phase 2 contract with only `render.sprite.id` and `render.sprite.scale`.
- The document explicitly excludes rotation, flip, tint, alpha, animation speed, appearance databases, enemy factories, and behavior refactors.
- `npm run typecheck`, `npm run build`, `npm test --if-present`, `git diff --check`, and `git status --short` are run and reported.

For future Phase 2 implementation:

- `render.sprite.id` is the canonical sprite ID.
- `render.sprite.scale` defaults to `1.0` and affects render dimensions/pivot only.
- Collision radius and gameplay stats do not change.
- Enemy sprite rendering remains before SDF fallback.
- Variant A compatibility is tested and has a planned removal path.

## 16. Codex implementation prompt

Use this prompt for the next implementation task; do not execute it during this audit:

```text
Work exclusively on branch feature/sprite-layer.

Implement Phase 2 — render.sprite data contract for Captain Meow with minimal diff.

Scope:
- Implement only render.sprite.id and render.sprite.scale.
- Do not implement rotation, flipX, flipY, tint, alpha, animationSpeed, appearance DB, enemy factory, or behavior refactor.
- Do not change gameplay, collision radius, enemy behavior, sprite asset files, atlas JSON files, or render priority.

Required behavior:
1. Add EnemySpriteRenderDef { id: string; scale?: number } and EnemyRenderDef.sprite.
2. Validate render.sprite structurally in loadContent when present: id non-empty string; scale optional positive finite number.
3. Parse/normalize render.sprite in EnemyDefs. Temporarily support root spriteId as fallback with priority render.sprite.id -> root spriteId.
4. SpawnSystem must clone render.sprite into runtime ent.render.sprite and prevent ghost sprite state on recycled entities. Keep root spriteId only as compatibility during Variant A.
5. Renderer/selectEnemySpriteFrame must read render.sprite.id first, root spriteId second, return normalized scale, and apply scale only to SpriteProgram.draw width/height and pivot.
6. Keep render order: mesh -> special laser -> enemy sprite -> SDF -> proc -> glyph stack -> glyph -> other sprite/fallback paths.
7. Migrate only the six sprite enemies (basic_1, basic_2, shooter_1, void_1, crawler_1, mine_1) to render.sprite with scale 1.0 in a dedicated commit.
8. Add tests for parser validation, SpawnSystem clone/no ghost state, renderer selection priority, scale draw dimensions/pivot, unchanged collision radius, sprite-before-SDF priority, compatibility fallback, and six valid atlas frames.

Run:
- npm run typecheck
- npm run build
- npm test --if-present
- git diff --check
- git status --short

Commit in small commits following docs/audit/render-sprite-contract-audit.md.
```
