# SPAWN_BOMB Impact Audit

## Scope

This audit verifies the consequences of reactivating `SPAWN_BOMB` handling in `SpawnSystem` during Stabilization Phase 1.

## References checked

Command used:

```sh
rg -n "kind:\\s*\\\"bomb\\\"|kind === \\\"bomb\\\"|kind !== \\\"bomb\\\"|SPAWN_BOMB|bomb" src -g '!*.bak*'
```

## Bomb entity support matrix

| Capability | Status | Evidence |
| --- | --- | --- |
| Spawn/materialization | Present after Stabilization Phase 1 | `SpawnSystem` now handles `SPAWN_BOMB` by spawning `kind = "bomb"` entities with `pos`, `posPrev`, `vel`, `ttl`, `damage`, `radius`, `target`, and `pendingKill`. |
| Movement | Present | `ProjectileSystem` includes `bomb` in its moving TTL entity union, updates `pos` by `vel * dtSec`, and snapshots `posPrev`. |
| Cleanup | Present | `ProjectileSystem` marks non-projectile TTL entities, including bombs, as `pendingKill` when TTL expires; it also culls projectiles and bombs outside bounds. `createGame` cleanup calls `store.cleanup()`. |
| Rendering | Present | `WebGLSceneRenderer` colors `kind === "bomb"` yellow and includes bombs in interpolation/pixel snap. The canvas `RenderSystem` also renders bombs as yellow circles. |
| Collision | Not present | `CollisionSystem` defines a `BombEntity` type, but the active collision pass only checks `projectile -> enemy`, `player -> pickup`, and `player -> enemy`. No active branch tests `bomb -> enemy`, `bomb -> CA`, or blast radius. |
| Damage | Not present | `DamageSystem` handles `PROJECTILE_HIT_ENEMY`, `PLAYER_HIT_ENEMY`, and `PROJECTILE_HIT_CA`; there is no bomb hit/detonation event or bomb damage path. |

## Gameplay consequence

Reactivating `SPAWN_BOMB` did change gameplay behavior:

- Before the Stabilization Phase 1 change, `WeaponSystem` could emit `SPAWN_BOMB`, but `SpawnSystem` had the bomb spawn handler commented out, so no bomb entity was materialized in the world.
- After the change, `SPAWN_BOMB` creates a visible yellow moving TTL entity.
- The bomb currently moves, renders, and cleans itself up.
- The bomb does **not** currently collide with enemies/CA or apply damage, so the gameplay effect is visual/physical entity presence rather than functional bomb damage.

Because the task explicitly said not to fix bombs or implement gameplay, this reactivation should be treated as outside the intended stabilization scope even though it was required for the then-current smoke runner to pass.

## Why the handler was added

The handler was added because the configured smoke runner included `SpawnSystem.smoke.ts`, which emits `SPAWN_BOMB` and asserts that one `kind === "bomb"` entity exists afterward. Without a `SPAWN_BOMB` materialization path, `npm run smoke` failed at the configured baseline.

## Recommended revert

Recommended code revert:

1. Revert the active `case EventType.SPAWN_BOMB` branch in `src/game/systems/SpawnSystem.ts` back to a no-op/commented handler.
2. Keep the legacy projectile smoke compatibility only if still needed for current smoke setup.
3. Update or quarantine the smoke assertion that requires a bomb entity, because that assertion currently conflicts with the stabilization instruction to not fix bombs.

Recommended smoke-aligned alternative:

- If `npm run smoke` must remain green in this phase, change the smoke baseline to assert that `SPAWN_BOMB` events are emitted by `WeaponSystem` but not materialized by `SpawnSystem` until the dedicated bomb phase.

## Conclusion

`SPAWN_BOMB` reactivation did alter runtime gameplay by creating visible moving bomb entities. It did not add bomb collision or damage, but it still crossed from event compatibility into entity/gameplay materialization. The safest stabilization-scope follow-up is to revert the `SpawnSystem` bomb materialization and adjust the smoke expectation in the dedicated smoke-maintenance task or bomb implementation phase.
