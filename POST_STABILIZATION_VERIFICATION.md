# Post-Stabilization Verification — World-Space Coordinate Unification

Branch: `audit/claude-cm-prototype`

## Summary

All gameplay entities (player, enemies, projectiles, bombs, pickups) were unified
to a single **WORLD-space** coordinate contract on both axes. Screen conversion now
happens in exactly one place — the renderer (`pos − (scrollX, scrollY)` for every
entity). See `docs/architecture/world_movement_rules_MVP.md` for the full ruleset.

### Root bugs fixed
1. **Y-axis projectile collision drift** — projectiles were screen-space while
   enemies were world-space; collisions only papered over X with `+camX` and left a
   latent Y mismatch.
2. **Y-axis cull bug** — projectile X-cull used screen bounds while Y used a
   world band; mixing spaces broke as the camera scrolled.

### Companion fixes (to preserve identical observable behavior at scrollX/Y = 0)
- **ProjectileSystem X-cull** rewritten world-relative (`camX ± W`), mirroring the Y
  band and `EnemySystem`. Without this, a scrolled camera would cull every shot on
  spawn.
- **PlayerSystem / main.ts aim** convert the (now WORLD) player back to SCREEN before
  comparing against SCREEN-space aim targets; player movement integrates+clamps in
  SCREEN space then lifts back to WORLD, so the player occupies the same on-screen
  rectangle regardless of scroll.

## Verification results

| Check | Result |
|---|---|
| `npm run smoke` | **20/20** — `[SMOKE RUNNER] OK` |
| `npm run typecheck` | exit 0, no errors |
| `npm run build` | OK (74 modules) |

### New regression test — `CollisionScrollInvariance.smoke.ts` (20th smoke)
Two-part guard, both empirically proven to fail if the corresponding fix is reverted:

- **Part A — collision math invariance:** a projectile overlapping an enemy in WORLD
  space registers the hit at `scrollX=120, scrollY=90`. (Old `+camX` logic → MISS.)
- **Part B — cull-timing invariance:** with the camera scrolled far right
  (`scrollX=2000`), an on-screen projectile is NOT culled while a genuinely
  off-screen one still IS. (Old screen-space X-cull → on-screen shot wrongly culled.)

Discrimination was verified empirically: temporarily reverting the X-cull to its
screen-space form makes Part B fail with
`B: on-screen projectile must NOT be culled at scrollX!=0`; restoring the fix returns
the suite to green.

---

## Addendum D — Pre-existing VFX hit-spark camera bug (NOT caused by this migration)

**Finding:** `DamageSystem.ts:54-57` sends enemy hit-spark VFX particles using
WORLD-space position, with a comment claiming "camera subtraction happens in
renderVFX()". `WebGLSceneRenderer.ts:903-904` (renderVFX) reads `sx`/`sy` but the
HITS draw path (`WebGLSceneRenderer.ts:990-994`) never actually subtracts them from
the particle draw position.

**Effect:** hit-spark VFX particles draw at the wrong screen position whenever
`scrollY != 0` (and now also `scrollX != 0`, since `enemy.x` was always world).
Purely cosmetic — no gameplay/collision impact.

**Status:** pre-existing, **NOT introduced or worsened** by the world-space
coordinate unification (this commit). Enemy entities were already world-space before
and after this migration, so the hit-spark mispositioning is unchanged by it. Not
fixed — tracked for a future cosmetic-polish pass.

**Honest scope note:** the same `renderVFX` function never applies the camera offset
to its MUZZLE or TRACER particles either (they also draw raw `fx.x`/`fx.y`); `sx`/`sy`
are effectively unused in the function. Those emitters originate from the player/weapon
and were not audited here — folded into the same future cosmetic-polish pass rather
than this scope.
