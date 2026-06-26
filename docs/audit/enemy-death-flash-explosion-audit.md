# Enemy Death Flash and Explosion Audit

## 1. Executive summary

### Verified repository facts

- Enemy HP reaches zero in `DamageSystem.applyHpDamage`, which emits `ENTITY_DAMAGED`, marks the enemy for kill immediately, then emits a non-player `ENTITY_KILLED` event.
- The gameplay enemy is already removed through the existing `pendingKill` / cleanup lifecycle rather than being retained for a death animation.
- Score is driven from `ENTITY_KILLED` flow events; player deaths are ignored by score.
- Current death visuals are separate from enemy simulation: particle flash/shards are emitted, and a separate `kind: "fx"` sprite entity may be spawned when pool headroom allows.
- Current sprite explosion support loads `explosion_bug1.atlas.json`, not the uploaded `explosion_1.png` asset.
- The uploaded `public/assets/sprites/explosion_1.png` is present and is 448 x 64 pixels, which implies seven 64 x 64 horizontal frames.

### Recommendation

Immediately mark and recycle the gameplay enemy under the existing lifecycle, while spawning a separate render-only ghost FX that snapshots the enemy visual state. Do not preserve the gameplay enemy for the 0.14-second visual overlap.

The recommended visual contract is:

- Spawn a render-only death ghost snapshot at the enemy death position.
- The ghost shows a white flash for 0.06 seconds.
- The ghost then shows an orange/dark burn plus opacity fade for 0.08 seconds.
- Total ghost lifetime is 0.14 seconds.
- Spawn an independent explosion FX lasting 0.50 seconds.
- Render the death ghost below the explosion.
- Do not add a dissolve shader.
- Do not add an enemy-specific death animation.
- Do not delay gameplay enemy cleanup.

## 2. Verified current death flow

### HP-to-zero and kill flow

Verified flow:

1. `DamageSystem.applyHpDamage` reads the target entity and returns if the entity is missing, already `pendingKill`, missing numeric HP, or already at/below zero HP.
2. Positive damage is subtracted from `ent.hp`.
3. `ENTITY_DAMAGED` is emitted with `hpAfter`.
4. If HP remains above zero, no kill occurs.
5. If HP is zero or below, the system uses `__deathFxDone` as an idempotency guard.
6. The enemy is immediately marked for kill via `this.store.markKill(target)` before the kill event is emitted.
7. `ENTITY_KILLED` is emitted with `isPlayer: false`.

This means the repository already favors immediate gameplay death via `pendingKill` instead of waiting for a visual death sequence.

### No delayed gameplay enemy cleanup

`EntityStore.markKill` only sets `pendingKill = true`. `EntityStore.cleanup` later commits the kill by setting `alive = false`, clearing `pendingKill`, bumping generation, and releasing the slot back to the free list. This is a two-phase lifecycle, but it is not a visual delay contract.

### Collision, AI, and attack stop behavior

Verified stop behavior:

- Collision snapshots and scans skip entities that are already `pendingKill`.
- Enemy AI/update skips enemies with `pendingKill`.
- Because death marks the enemy before the kill event, later systems that honor `pendingKill` should stop treating the enemy as collidable, AI-active, or attack-capable in the same frame/tick boundary where they observe that flag.

### Recommendation

Keep this gameplay contract intact. Any 0.14-second visual overlap should be implemented by a separate render-only death ghost, not by keeping the gameplay enemy alive.

## 3. Current explosion and FX flow

### Existing FX entity lifetime

On enemy death, the current implementation emits:

- one ParticleStore flash with `ttl: 0.10`,
- eighteen ParticleStore shards with randomized `ttl` between about `0.22` and `0.44`,
- one optional ECS `kind: "fx"` sprite explosion entity if the pool guard allows it.

The optional ECS explosion entity currently has:

- `kind = "fx"`,
- death position and previous position,
- zero velocity,
- `ttl = 0.4`,
- `spriteId = "fx.explosion.bug1.0"`,
- `radius = 32`.

### Existing explosion atlas rendering

The WebGL renderer loads `/assets/sprites/explosion_bug1.atlas.json` with `/assets/sprites/explosion_bug1.png` for FX sprites. FX sprite rendering checks `kind === "fx"`, requires the FX sprite system to be ready, then selects either an animation frame from `animId` or a static frame from `spriteId`.

Current atlas facts:

- `explosion_bug1.atlas.json` has five frames: `fx.explosion.bug1.0` through `fx.explosion.bug1.4`.
- Its animation is `fx.explosion.bug1` at 24 FPS with `loop: false`.
- Current death-spawn code sets only `spriteId = "fx.explosion.bug1.0"`, so the existing death FX path uses a static frame unless another system assigns `animId`.

## 4. Asset integration findings

### Uploaded asset

Verified asset:

- `public/assets/sprites/explosion_1.png` exists.
- PNG dimensions are 448 x 64.
- With 64 x 64 cells, that is seven horizontal frames.

### Recommended atlas

Do not create this atlas in the audit-only commit, but the implementation should add an atlas equivalent to:

- texture: `/assets/sprites/explosion_1.png`
- frames:
  - `fx.explosion.1.0`
  - `fx.explosion.1.1`
  - `fx.explosion.1.2`
  - `fx.explosion.1.3`
  - `fx.explosion.1.4`
  - `fx.explosion.1.5`
  - `fx.explosion.1.6`
- animation: `fx.explosion.1`
- FPS: 14
- loop: false

At 14 FPS, seven frames cover 0.50 seconds exactly enough for the requested explosion duration.

## 5. Architecture variants

### Variant A: preserve gameplay enemy for 0.14 seconds

Rejected.

Reasons:

- It conflicts with the existing immediate `pendingKill` lifecycle.
- It risks extra collision, AI, attacks, wave-cap counting, scoring ambiguity, and pool pressure.
- It turns a render need into a gameplay-state exception.

### Variant B: separate render-only death ghost plus independent explosion

Recommended.

Reasons:

- It preserves immediate gameplay cleanup.
- It cleanly separates simulation death from render overlap.
- It allows the ghost and explosion to have independent timing and layering.
- It avoids enemy-specific death animations and shader work.

### Variant C: ParticleStore-only flash/burn/explosion

Not preferred for this request.

Reasons:

- ParticleStore is already useful for sparks/shards, but the requested ghost must snapshot the enemy visual state.
- A sprite/visual snapshot is clearer than trying to recreate enemy appearance from particles.

## 6. Recommended runtime contract

When an enemy reaches HP <= 0:

1. Snapshot render state needed for a ghost before slot cleanup can recycle or mutate the entity.
2. Immediately mark the gameplay enemy with the existing `pendingKill` path.
3. Emit the normal kill event exactly once.
4. Spawn a render-only death ghost FX with a 0.14-second lifetime.
5. Spawn an independent explosion FX with a 0.50-second lifetime.
6. Ensure the ghost and explosion do not participate in collision, AI, attacks, scoring, or enemy counts.
7. Ensure the death ghost renders below the explosion.
8. Ensure fallback behavior preserves gameplay correctness even if FX allocation or asset loading fails.

## 7. Gameplay/render separation

### Verified fact

The gameplay enemy currently enters the existing kill lifecycle immediately by `markKill`, and cleanup later recycles the slot.

### Recommendation

The death ghost should snapshot, at minimum:

- world position and previous position,
- radius or render scale,
- sprite ID or render sprite descriptor,
- animation ID/frame phase if needed to preserve visual continuity,
- color or tint data needed for flash/burn,
- any existing render fields needed to choose the same enemy visual.

The ghost must not include gameplay components such as enemy kind, HP, AI behavior, attack profile, collision participation, score value, or wave ownership unless those fields are strictly required for rendering and cannot affect systems.

## 8. Flash and burn visual contract

Recommended ghost timeline:

- `0.00s - 0.06s`: white flash.
- `0.06s - 0.14s`: orange/dark burn plus opacity fade.
- `0.14s`: ghost expires and is removed/recycled.

Implementation notes:

- Use plain sprite tint/alpha uniforms or existing sprite draw parameters if available.
- Do not add a dissolve shader.
- Do not add enemy-specific death animation content.
- Keep burn/fade generic for all enemies.

## 9. Explosion timing and layering

Recommended explosion timeline:

- Spawn at the enemy death position independently from the death ghost.
- Use `fx.explosion.1` with seven frames at 14 FPS and `loop: false`.
- Lifetime is 0.50 seconds.
- The explosion overlaps the entire 0.14-second ghost lifetime and continues for another 0.36 seconds.

Recommended render ordering:

1. Normal world/background layers.
2. Death ghost FX.
3. Explosion FX.
4. Existing higher overlays/post-processing.

The explicit requirement is: death ghost below explosion.

## 10. Pooling and lifecycle risks

### Verified risks

- Entity objects are recycled, and `EntityStore.spawn` deletes non-base fields before reuse.
- `EntityStore.spawn` throws when capacity is exhausted.
- Current death FX sprite entity creation is guarded by `canSpawnParticle`, which uses shared ECS pool pressure.
- The current `kind: "fx"` explosion entity uses the same store as gameplay entities, so cosmetic FX can compete with gameplay capacity unless guarded.

### Recommended mitigations

- Prefer a dedicated FX pool or ring buffer for ghost/explosion entities if practical.
- If using the ECS store, keep the existing capacity guard or introduce a stricter cosmetic allocation guard.
- Never let FX allocation failure prevent `markKill`, kill event emission, or cleanup.
- Snapshot enemy visual fields before cleanup/pool reuse can delete or overwrite them.
- Ensure pooled ghost/explosion entities reset tint, alpha, animation, TTL, and render flags on each spawn.

## 11. Failure and fallback behavior

### Missing asset

If `explosion_1.png` or its atlas fails to load:

- gameplay death must still complete,
- score must still be awarded once,
- collision/AI/attacks must still stop,
- cleanup must still recycle the gameplay enemy,
- fallback can be current particles, current `explosion_bug1` sprite, or no sprite explosion.

### Capacity fallback

If no cosmetic FX slot is available:

- skip the ghost and/or explosion,
- optionally emit ParticleStore flash/shards because ParticleStore is already ring-buffer-like,
- do not throw,
- do not delay gameplay enemy cleanup.

### Idempotency fallback

If duplicate damage events target the same enemy after death has begun:

- no duplicate score,
- no duplicate loot/drop flow,
- no duplicate ghost/explosion burst,
- enemy remains marked for cleanup.

## 12. Test plan

Minimum tests:

1. Projectile damage reducing enemy HP to zero marks the enemy `pendingKill` immediately.
2. Cleanup removes the enemy and invalidates/recycles its slot under the existing `EntityStore` lifecycle.
3. Score increments once for a killed enemy and does not increment for duplicate post-kill damage.
4. Collision ignores a `pendingKill` enemy in the same tick/frame boundary where systems observe it.
5. Enemy AI/update ignores a `pendingKill` enemy.
6. Death spawns a ghost FX with total lifetime 0.14 seconds.
7. Ghost visual phase is white for 0.06 seconds, then orange/dark fade for 0.08 seconds.
8. Explosion FX lasts 0.50 seconds.
9. Explosion uses seven frames from `fx.explosion.1.0` through `fx.explosion.1.6`, animation `fx.explosion.1`, 14 FPS, `loop: false`.
10. Render order draws death ghost below explosion.
11. Missing explosion atlas/texture does not block gameplay death.
12. FX capacity exhaustion does not throw and does not block gameplay death.
13. No dissolve shader is required or loaded for this feature.
14. No enemy-specific death animation is required.

## 13. Implementation plan

Small-commit plan:

1. Add atlas metadata for `public/assets/sprites/explosion_1.png` with seven frames and the `fx.explosion.1` non-looping 14 FPS animation.
2. Add a generic render-only death ghost FX type or data shape.
3. On enemy death, snapshot enemy render state, then keep the current immediate `markKill` and kill-event flow.
4. Spawn ghost FX with 0.14-second lifetime and flash/burn/fade phase state.
5. Spawn independent explosion FX with 0.50-second lifetime and animation `fx.explosion.1`.
6. Update rendering to draw ghost FX below explosion FX.
7. Add fallback handling for missing asset and pool capacity.
8. Add focused smoke/unit coverage for idempotency, lifecycle, timing, and render ordering.

## 14. Expected files

Expected implementation files, not changed by this audit:

- `public/assets/sprites/explosion_1.atlas.json` or equivalent atlas registration.
- Death FX spawning logic near the current enemy death path.
- FX lifetime/update logic for ghost and explosion entities or a dedicated FX pool.
- Renderer changes for ghost tint/alpha and explosion ordering.
- Focused smoke/unit tests for death lifecycle, score idempotency, FX timing, fallback, and ordering.

This audit commit intentionally creates only this documentation file.

## 15. Acceptance criteria

- Gameplay enemy is immediately marked through `pendingKill` when HP reaches zero.
- Gameplay enemy is not preserved for the 0.14-second visual overlap.
- A separate render-only ghost snapshots the enemy visual state.
- Ghost white flash lasts 0.06 seconds.
- Ghost orange/dark burn and opacity fade lasts 0.08 seconds.
- Total ghost lifetime is 0.14 seconds.
- Explosion FX is independent from the ghost.
- Explosion lasts 0.50 seconds.
- Explosion renders above the ghost.
- Explosion atlas uses seven 64 x 64 frames from `explosion_1.png`.
- Atlas frame IDs are `fx.explosion.1.0` through `fx.explosion.1.6`.
- Animation ID is `fx.explosion.1`, 14 FPS, `loop: false`.
- No dissolve shader is added.
- No enemy-specific death animation is added.
- No delayed gameplay enemy cleanup is introduced.
- Missing asset and capacity failures degrade cosmetically only.
- Score remains idempotent.

## 16. Codex implementation prompt

Implement enemy death flash and explosion FX without changing gameplay death timing.

Requirements:

- Keep the existing enemy HP-to-zero behavior: immediately mark the gameplay enemy for kill through the existing `pendingKill` / cleanup lifecycle and emit the existing kill flow once.
- Do not preserve the gameplay enemy for visual overlap.
- Spawn a separate render-only death ghost that snapshots the enemy visual state before the gameplay enemy can be cleaned up or pooled.
- Ghost timing: white flash for 0.06 seconds, then orange/dark burn plus opacity fade for 0.08 seconds, total 0.14 seconds.
- Spawn an independent explosion FX at the death position.
- Use `public/assets/sprites/explosion_1.png`, dimensions 448 x 64, as seven 64 x 64 horizontal frames.
- Add atlas frames `fx.explosion.1.0` through `fx.explosion.1.6` and animation `fx.explosion.1` at 14 FPS with `loop: false`.
- Explosion lifetime is 0.50 seconds.
- Render order must put death ghost below explosion.
- Do not add a dissolve shader.
- Do not add enemy-specific death animations.
- Do not delay enemy cleanup, scoring, collision stop, AI stop, or attack stop.
- Missing asset or capacity exhaustion must not block enemy death, cleanup, or scoring.
- Add minimum tests for HP-to-zero lifecycle, score idempotency, collision/AI skip, ghost timing, explosion timing, render ordering, missing asset fallback, and capacity fallback.
