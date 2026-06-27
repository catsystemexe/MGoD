# Sprite Layer Cleanup Audit

## 1. Executive summary

Audit scope: current `sprite-layer` branch state and the runtime sprite path for Captain Meow enemies. No production code, assets, or JSON content were changed by this audit.

### Git / workspace state

- Current local branch during audit: `sprite-layer`.
- The branch was created locally from `work`; `git status --branch --short` reports `## sprite-layer` with no upstream tracking branch configured.
- `git remote -v` produced no remotes, so synchronization with a remote cannot be verified from this checkout.
- Initial working tree had no uncommitted changes. After this audit, the only intended changed file is `docs/audit/sprite-layer-cleanup-audit.md`.
- Recent relevant commits:
  - `d901fd2 sprite system / basic implemented`
  - `40bd5a4 feat(sprite): spriteId pipeline — EnemyDefs parser + SpawnSystem wiring`
  - `9d0f3a7 feat(sprite): grunt_linear — přiřazen basic_1 sprite`
  - `9c43c6f feat(sprite): enemySpriteMap — per-typeId enemy sprite rendering`
  - `a024e30 feat(sprite): přidány enemy sprite assety + atlas JSONy (6 enemies)`

### High-level findings

- **BLOCKER** — `WebGLSceneRenderer` contains two active per-type enemy sprite render blocks plus one legacy generic enemy sprite block; only the first per-type block is normally reachable for configured enemy sprites, making later enemy sprite paths duplicate/dead for successful draws.
- **MAJOR** — `spriteId` is stored at the enemy type root and copied directly onto runtime entities, while `render.sprite` does not exist. This keeps sprite configuration split from the rest of rendering and duplicates data across `EnemyDef` and entity state.
- **MAJOR** — sprite asset registration is hardcoded in `WebGLSceneRenderer`; new content does not automatically register a corresponding `SpriteSystem`.
- **MAJOR** — debug logging is active in hot render/spawn paths (`EARLY_ENEMY_SPRITE`, `SDF_FALLBACK`, `[SPR]`, `SPRITE_DRAW_*`, `SPAWN_ENEMY_RENDER_KEYS`).
- **INFO** — all six audited enemy sprite assets exist, are 64×64 PNGs, have one atlas frame keyed as `enemy.<typeId>.idle`, pivot `(32,32)`, and no animation keys.

## 2. Current architecture

Current enemy sprite architecture is a hybrid of data-driven enemy definitions and renderer-local sprite registration:

1. `src/game/content/enemyTypes.json` defines enemy type data. The six sprite-enabled enemies use root-level `spriteId` values like `enemy.basic_1.idle` and still also define `render.sdf` fallback shapes.
2. `src/game/content/loadContent.ts` validates only core gameplay fields (`id`, `hp`, `radius`, `scoreOnKill`, `behaviorPresetId`) and allows extra fields. It does not validate `spriteId`, `render.sprite`, atlas existence, PNG existence, or frame keys.
3. `src/game/defs/EnemyDefs.ts` parses root-level `spriteId` into `EnemyDef.spriteId`, parses `render.color`, `render.sdf`, `render.glyphId`, `render.glyphs`, and `render.proc`, but has no `render.sprite` type.
4. `src/game/systems/SpawnSystem.ts` materializes enemy entities with `typeId`, `spriteId`, `animId`, and cloned `render` fallback data.
5. `src/render/webgl/WebGLSceneRenderer.ts` owns all `SpriteSystem` instances. It creates generic sprite systems for player, FX, projectiles, legacy enemy sprites, and a hardcoded `enemySpriteMap` of six per-type enemy atlases.
6. `SpriteSystem` composes `SpriteAtlas`, `SpriteTexture`, and `SpriteProgram`; successful load sets `ready = true`, while failures log a warning and leave the renderer to fall through to non-sprite paths.

## 3. Actual render priority

Current actual per-entity render priority inside `WebGLSceneRenderer.render()` is:

1. Mesh path (`render.mesh`) with immediate `return` after draw.
2. Laser SDF special case with immediate `return`.
3. Early per-type enemy sprite path using `enemySpriteMap`; if a frame resolves, it draws and returns before SDF/proc/glyph fallback.
4. SDF path (`render.sdf`) with immediate `return`.
5. Procedural parts path (`render.proc` / `proc`) with return only if draw succeeds.
6. Glyph stack path with return only if draw succeeds.
7. Single glyph path with return only if draw succeeds.
8. Player sprite path with immediate `return` on successful body draw.
9. Projectile sprite path with immediate `return` on successful frame draw.
10. Legacy generic enemy sprite path (`enemySprites`) with immediate `return` on successful frame draw.
11. Late per-type enemy sprite path using `enemySpriteMap` with immediate `return` on successful frame draw.
12. FX sprite path with immediate `return` on successful frame draw.
13. Quad fallback.

Important consequence: for configured enemies (`basic_1`, `basic_2`, `shooter_1`, `void_1`, `crawler_1`, `mine_1`) with loaded per-type atlases and matching frame keys, **the early per-type enemy sprite path has priority over SDF**. If that early path cannot draw, the SDF fallback runs before the legacy generic and late per-type enemy sprite blocks.

## 4. Data flow

### `enemyTypes.json` → `loadContent`

- Source file: `src/game/content/enemyTypes.json`.
- Relevant fields: `id`, root `spriteId`, `hp`, `radius`, `scoreOnKill`, `behaviorPresetId`, `attackProfileId`, and `render.sdf`.
- `loadContent()` imports JSON and validates only the required gameplay fields. Extra fields such as `spriteId` and `render` pass through unvalidated.
- Fallback behavior: invalid/missing required gameplay fields throw during content load; invalid/missing sprite fields are not checked here.

### `loadContent` → `EnemyDefs`

- Source file: `src/game/defs/EnemyDefs.ts`.
- Relevant types/symbols: `EnemyDef.spriteId?: string`, `EnemyRenderDef`, `SdfRenderDef`, `ENEMY_DEFS`.
- `spriteIdRaw` is read from `t.spriteId` only. There is no parser for `t.render.sprite`.
- `render.sdf` is whitelist-validated against `SDF_SHAPES`; bad SDF data logs a warning and is omitted.
- Fallback behavior: missing core numeric fields receive defaults with warnings; invalid sprite IDs are neither rejected nor warned because no sprite validation exists.

### `EnemyDefs` → `SpawnSystem`

- Source file: `src/game/systems/SpawnSystem.ts`.
- Relevant symbols: `EnemyEntity`, `SpawnableEntity`, `SPAWN_ENEMY` case.
- Spawn payload supplies `typeId`; `SpawnSystem` resolves `ENEMY_DEFS[p.typeId]` and throws if missing.
- Runtime entity receives:
  - `ent.typeId = p.typeId`
  - `ent.spriteId = def.spriteId ?? ""`
  - `ent.animId = ""`
  - `ent.render = { ...def.render }` clone, without sprite data.
- Fallback behavior: unknown `typeId` throws; missing `def.spriteId` becomes empty string; fallback render data remains available.

### Runtime entity → `WebGLSceneRenderer`

- Source file: `src/render/webgl/WebGLSceneRenderer.ts`.
- Relevant entity reads: `kind`, `typeId`, `spriteId`, `animId`, `render.sdf`, `render.proc`, `render.glyphs`, `render.glyphId`, `radius`, `bState.phase`.
- For enemies, renderer computes `spritePrefix` from `spriteIdRaw.split(".").slice(1, -1).join("_") || typeId`. For `enemy.basic_1.idle`, this yields `basic_1`.
- It chooses `enemySpriteMap.get(spritePrefix) ?? enemySpriteMap.get(typeId)`.
- Fallback behavior: if no ready sprite system or no frame, the renderer falls through to SDF/proc/glyph/quad according to priority.

### `SpriteSystem` → WebGL draw

- Source files: `src/render/sprites/SpriteSystem.ts`, `SpriteAtlas.ts`, `SpriteTexture.ts`, `SpriteProgram.ts`.
- `SpriteSystem.load(atlasUrl, textureUrl)` loads the atlas first, then uses `atlas.json.texture || textureUrl` for the texture.
- `SpriteAtlas.frame(key)` returns `null` when absent; `pickAnimFrame(animKey, tSec)` returns `null` when animation or frame is absent.
- `SpriteTexture.load()` creates an `Image`, uploads RGBA texture data, and marks `ready = true`.
- `SpriteProgram.begin()` binds its program, VAO, texture, and uniforms; callers are responsible for enabling/disabling blending and restoring the main renderer state.

## 5. Legacy and duplicate paths

### Findings

#### BLOCKER — Duplicate per-type enemy sprite rendering

- File/symbol: `src/render/webgl/WebGLSceneRenderer.ts`, early enemy sprite path around lines 797–877 and late per-type path around lines 1179–1224.
- Current behavior: two separate blocks perform similar `typeId`/`spriteId`/`enemySpriteMap` lookup and draw logic. The early block returns on success, so the late block only runs after SDF/proc/glyph fallback fails.
- Risk: cleanup can accidentally alter render priority or revive double-render behavior; maintenance requires fixing lookup/fallback logic twice.
- Recommended solution: keep exactly one per-type enemy sprite path before SDF fallback and delete the late duplicate after tests confirm visual parity.
- Required for cleanup milestone: yes.

#### MAJOR — Legacy `enemySprites` generic atlas remains active

- File/symbol: `src/render/webgl/WebGLSceneRenderer.ts`, `private enemySprites`, constructor load of `/assets/sprites/enemy_bug1.*`, and legacy draw block around lines 1123–1177.
- Current behavior: generic enemy atlas is loaded separately from per-type atlases. It is only reached after SDF/proc/glyph paths, because the early per-type block and SDF path precede it.
- Risk: unclear ownership and fallback order; future assets could appear broken if they are only registered in the legacy atlas but have SDF configured.
- Recommended solution: decide whether the generic atlas is still a supported fallback. If not, remove it in Phase 1 after verifying no active content depends on `enemy_bug1`.
- Required for cleanup milestone: yes, if no content depends on it.

#### MAJOR — Renderer has hardcoded asset registry

- File/symbol: `enemySpriteAssets` in `src/render/webgl/WebGLSceneRenderer.ts`.
- Current behavior: six sprite assets are manually registered in the renderer constructor.
- Risk: adding an enemy with `spriteId` in content does not load its atlas unless the renderer list is also edited.
- Recommended solution: Phase 3 should either formalize this as an explicit registry with tests or derive it from validated content conventions.
- Required for cleanup milestone: Phase 1 no; Phase 3 yes.

#### MINOR — Duplicate sprite-prefix lookup logic

- File/symbol: `spriteIdRaw.split(".").slice(1, -1).join("_") || typeId` occurs in multiple renderer blocks.
- Current behavior: prefix extraction is repeated and depends on `enemy.<type>.idle` naming.
- Risk: frame naming changes could break one block but not another; behavior is implicit.
- Recommended solution: in cleanup, replace duplicates with one local helper or a single render path. Do not build a generic engine abstraction.
- Required for cleanup milestone: yes, as part of duplicate path removal.

## 6. Asset registry findings

Audited files: `public/assets/sprites/basic_1.*`, `basic_2.*`, `shooter_1.*`, `void_1.*`, `crawler_1.*`, `mine_1.*`.

| Asset | PNG size | Atlas texture | Frame keys | Pivot | Anim keys | Matches expected `spriteId` | Sidecars |
|---|---:|---|---|---|---|---|---|
| `basic_1` | 64×64 | `/assets/sprites/basic_1.png` | `enemy.basic_1.idle` | `(32,32)` | none | yes | none found |
| `basic_2` | 64×64 | `/assets/sprites/basic_2.png` | `enemy.basic_2.idle` | `(32,32)` | none | yes | none found |
| `shooter_1` | 64×64 | `/assets/sprites/shooter_1.png` | `enemy.shooter_1.idle` | `(32,32)` | none | yes | none found |
| `void_1` | 64×64 | `/assets/sprites/void_1.png` | `enemy.void_1.idle` | `(32,32)` | none | yes | none found |
| `crawler_1` | 64×64 | `/assets/sprites/crawler_1.png` | `enemy.crawler_1.idle` | `(32,32)` | none | yes | none found |
| `mine_1` | 64×64 | `/assets/sprites/mine_1.png` | `enemy.mine_1.idle` | `(32,32)` | none | yes | none found |

No `.orig.png` backups or obvious `.bak` sidecars matching the audited six asset prefixes were found in `public/assets/sprites`. If such files are later placed under `public/`, Vite/static public handling would generally make them available in the production output unless explicitly excluded by build/deploy tooling.

### Findings

#### INFO — Current six enemy assets are internally consistent

- File/symbol: six atlas JSON files and PNGs under `public/assets/sprites`.
- Current behavior: atlas texture paths, frame keys, pivots, and content `spriteId` values align for all audited six assets.
- Risk: no current mismatch found for these six assets.
- Recommended solution: preserve current frame-key convention or document any replacement convention before changing content.
- Required for cleanup milestone: no.

#### MAJOR — No automated asset validation

- File/symbol: `loadContent`, `EnemyDefs`, renderer constructor.
- Current behavior: missing PNG/atlas/frame fails late and falls back visually; tests do not assert asset availability.
- Risk: broken content can silently regress to SDF/quad fallback.
- Recommended solution: add a startup/test validation that every registered sprite has atlas, texture, and configured frame.
- Required for cleanup milestone: Phase 3 yes.

## 7. Runtime entity contract

### Where fields originate

- `typeId`: carried in `SPAWN_ENEMY` payload, assigned to `ent.typeId` in `SpawnSystem`.
- `spriteId`: root-level content field parsed into `EnemyDef.spriteId`, copied to `ent.spriteId`.
- `animId`: declared on runtime entity interfaces and set to empty string for enemies; projectiles set `projectile.w1`.
- `render`: cloned from `EnemyDef.render` at spawn; currently holds color/SDF/glyph/proc data.
- `render.sprite`: not implemented in the current type contract or parser.

### Findings

#### MAJOR — Sprite data is outside `render`

- File/symbol: `EnemyDef.spriteId`, `EnemyEntity.spriteId`, `SpawnSystem` assignment.
- Current behavior: sprite identity lives beside gameplay fields, while SDF/glyph/proc live under `render`.
- Risk: renderer reads from multiple layers for render data; future `scale`, `flip`, or animation speed will either expand root entity fields or require a migration.
- Recommended solution: Phase 2 should introduce `render.sprite` with at least `id` and `scale`, then decide whether `spriteId` remains as a compatibility alias during migration.
- Required for cleanup milestone: Phase 2 yes.

#### MAJOR — Entity recycling may retain ghost render fields if not overwritten universally

- File/symbol: `EntityStore.spawn` callback usage in `SpawnSystem`; runtime fields assigned ad hoc.
- Current behavior: enemy spawn overwrites `spriteId`, `animId`, and `render`. Projectile/pickup/bomb paths assign different subsets. This audit did not find a centralized reset contract for render fields.
- Risk: if the entity pool reuses objects and a spawn path omits a field, stale sprite/render data can survive.
- Recommended solution: define required reset fields per kind or ensure `EntityStore` clears entities before callback; add tests around recycled entities.
- Required for cleanup milestone: yes if duplicate sprite behavior is hard to reason about during cleanup.

#### INFO — Dev Summoner discovers new enemies from `ENEMY_DEFS`

- File/symbol: `src/dev/DevSummoner.ts`, `Object.keys(ENEMY_DEFS)`.
- Current behavior: new enemy types appear automatically in the Summoner UI after they are valid content and parsed into `ENEMY_DEFS`.
- Risk: sprite assets still do not auto-register; UI discoverability does not imply render support.
- Recommended solution: document this distinction or add validation warnings in dev.
- Required for cleanup milestone: no.

## 8. Debug and temporary code

### Remove

- `EARLY_ENEMY_SPRITE` in renderer hot path: very verbose, logs frame keys every enemy render.
- `SDF_FALLBACK` in renderer hot path: useful during bug diagnosis, but currently unconditional for enemies using SDF fallback.
- `[SPR]` in late per-type renderer block: duplicate path diagnostics.
- `SPRITE_DRAW_EXECUTED` and `SPRITE_DRAW_DONE`: temporary proof logs around legacy/late sprite draw paths.
- `SPAWN_ENEMY_RENDER_KEYS`: temporary spawn diagnostics gated by `__DEV__` but still randomized and noisy.

### Keep behind dev flag

- Existing `[SPRITES] ... load failed` warnings from `SpriteSystem` and renderer constructor are acceptable as dev-visible diagnostics. They should be rate-limited or structured if asset validation is added.

### Replace with structured diagnostics

- If sprite validation remains runtime-based, replace hot-path logs with one-shot warnings keyed by `{typeId, spriteId, atlas}` for missing sprite system, missing atlas frame, and texture load failure.

## 9. Test coverage gaps

Current test/smoke coverage includes gameplay systems such as `SpawnSystem.smoke.ts`, but no audit evidence showed dedicated tests for enemy sprite content parsing, renderer sprite priority, per-type atlas selection, or asset/frame validation.

Minimum cleanup test suite to add later:

1. Parse sprite definition from `enemyTypes.json` into `EnemyDef`.
2. Transfer sprite configuration into spawned enemy entity.
3. Select the correct per-type `SpriteSystem` from `typeId` / sprite ID convention.
4. Ensure enemy sprite has priority before SDF fallback.
5. Ensure missing sprite uses fallback rather than crashing.
6. Ensure one entity is not rendered twice.
7. Ensure all registered sprite assets have available atlas JSON and PNG files.
8. Ensure atlas frame key matches configured enemy type `spriteId`.

## 10. Risks

- **BLOCKER** — Render priority is encoded by duplicate imperative blocks; deleting the wrong block can restore the old bug where SDF draws before sprites.
- **MAJOR** — Hot-path debug logs can hide real issues and degrade runtime performance/noise.
- **MAJOR** — Hardcoded registry can drift from content.
- **MAJOR** — Root-level `spriteId` creates an inconsistent data contract for future sprite fields.
- **MINOR** — Missing remote configuration prevents verifying whether local `sprite-layer` is synchronized with origin.
- **INFO** — Current fallback behavior is forgiving: broken sprite assets generally fall through to SDF/proc/glyph/quad instead of visibly failing.

## 11. Cleanup recommendations

1. Keep current visual output as the invariant: the six configured enemy sprites must still render before SDF fallback.
2. Remove duplicate enemy sprite blocks only after adding a focused renderer-selection test or a minimal manual validation checklist.
3. Remove unconditional hot-path logs in the same Phase 1 cleanup.
4. Do not introduce a broad engine abstraction; keep any helper local to Captain Meow sprite selection unless repeated outside enemies.
5. Introduce `render.sprite` only as a small content/runtime contract with documented compatibility behavior for root `spriteId`.
6. Formalize or validate the asset registry before adding more enemy sprites.

## 12. Proposed cleanup phases

### Phase 1 — safe cleanup

- Remove temporary debug logs.
- Delete unreachable/duplicate enemy sprite paths.
- Remove legacy `enemySprites` if verified unused.
- Preserve current visual result and current fallback behavior.
- Add or run a focused smoke/manual check that `basic_1` renders as sprite, not SDF triangle.

### Phase 2 — data contract

- Add `render.sprite` to content and `EnemyRenderDef` with at least:
  - `id`
  - `scale`
- Decide backward compatibility:
  - short term: allow root `spriteId` as alias and emit dev warning;
  - later: migrate JSON to `render.sprite.id` and remove alias.
- Validate sprite content shape in `loadContent` or a dedicated content validator.

### Phase 3 — registry and asset validation

- Either formalize the hardcoded registry as a typed Captain Meow asset registry or derive it from content naming convention.
- Add validation that atlas JSON exists, PNG exists, atlas `texture` resolves, and configured frame key exists.
- Run this validation in tests or at dev startup; avoid hot render-path checks.

### Phase 4 — future extensions only

Proposed future fields after cleanup, not for immediate implementation:

- `rotation`
- `flipX`
- `flipY`
- `tint`
- `alpha`
- `animationSpeed`

## 13. Files expected to change

Expected in cleanup phases, not changed by this audit:

- `src/render/webgl/WebGLSceneRenderer.ts`
- `src/game/content/enemyTypes.json`
- `src/game/content/loadContent.ts`
- `src/game/defs/EnemyDefs.ts`
- `src/game/systems/SpawnSystem.ts`
- A new or existing test location for content/asset/renderer-selection coverage
- Possibly a formal sprite registry file if Phase 3 chooses explicit registry over convention

Only file changed in this audit phase:

- `docs/audit/sprite-layer-cleanup-audit.md`

## 14. Acceptance criteria

For this audit phase:

- Audit document exists at `docs/audit/sprite-layer-cleanup-audit.md`.
- Production code, content JSON, and assets are unchanged.
- Current branch is `sprite-layer`.
- `npm run typecheck`, `npm run build`, `git diff --check`, and `git status --short` have been run and results reported.
- Audit clearly distinguishes current state from recommendations.
- All findings include severity, location, current behavior, risk, recommendation, and cleanup milestone relevance.

For future cleanup milestone:

- One canonical enemy sprite path exists before SDF fallback.
- No unconditional hot-path sprite debug logs remain.
- Legacy `enemySprites` is removed or explicitly documented as supported fallback.
- Sprite config has a clear data contract.
- Asset/frame validation catches missing or mismatched sprite files before visual fallback hides the issue.
