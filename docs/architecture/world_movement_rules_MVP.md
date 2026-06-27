# World / Movement Rules — MVP (UNIFIED WORLD-SPACE CONTRACT)

> Status: this supersedes the earlier "mixed-space" ruleset where the player and
> projectiles lived in screen space while enemies lived in world space. As of the
> world-space unification, **every gameplay entity lives in WORLD space on both
> axes**, and screen conversion happens in exactly one place: the renderer.

## 1) Coordinate spaces

- **All gameplay entities** — player, enemies, projectiles, bombs, pickups:
  - `pos.x`, `pos.y` are **WORLD space** (both axes).
  - There is no per-entity "screen vs world" distinction anymore. The store holds
    world coordinates for everyone.

- **SCREEN space** is used only for:
  - raw input / aim targets (mouse, touch) — these are screen pixels,
  - the final pixels drawn to the canvas.

## 2) Camera / WorldScroll

- `world.scrollX` = horizontal camera offset (constant autoscroll to the right;
  `WorldScrollSystem` advances it by `speedX * dt`).
- `world.scrollY` = vertical camera offset that follows the player (dead-band).
- The camera origin in world space is therefore `(scrollX, scrollY)`.

### Render rule (single conversion point)

For **every** entity, uniformly (`WebGLSceneRenderer`):

```
drawX = pos.x - world.scrollX
drawY = pos.y - world.scrollY
```

No entity is exempt. The renderer must not branch on entity kind for the camera
transform.

## 3) Spawn rule (viewport-relative patterns -> world)

- Authored spawn patterns (enemy waves: `originY`, `centerY`, edge spawns, …) are
  **viewport-relative** — they describe "where on screen we want this to appear".
- At spawn time, convert pattern -> world **once** by adding the current scroll
  (`SpawnSystem`, enemy path):

```
worldX = patternX + world.scrollX
worldY = patternY + world.scrollY
```

- Projectiles and bombs need **no** spawn conversion: their origin already comes
  from the player position (WORLD) via `WeaponSystem` (`origin = shipPos + muzzle`).

## 4) Input / aim rule (screen -> player screen pos)

- Input aim targets are SCREEN. The player `pos` is WORLD. To compare them
  (aim direction, sprite rotation), convert the player back to screen first:

```
playerScreen = player.pos - (world.scrollX, world.scrollY)
aimDir = normalize(aimTargetScreen - playerScreen)
```

- This is applied in `PlayerSystem` (gameplay/deterministic) and mirrored in the
  per-frame cosmetic aim in `main.ts`.

## 5) Player movement / clamp rule

- The player must occupy the **same on-screen rectangle** regardless of scroll, so
  movement is integrated and clamped in SCREEN space, then lifted back to WORLD:

```
screen   = player.pos - (scrollX, scrollY)
screen' = clamp(screen + vel*dt, bounds.min + r, bounds.max - r)   // bounds are screen-fixed
player.pos = screen' + (scrollX, scrollY)
```

- `bounds` stay fixed screen pixels (`0..LOGIC_W`, `0..LOGIC_H`); the scroll offset
  is re-applied each tick.

## 6) Collision rule

- All entities are WORLD, so collision compares `pos.x`/`pos.y` **directly**. No
  `+camX` / `+camY` conversions anywhere in `CollisionSystem`.

## 7) Culling rule (world bands around the camera)

- Cull against world bands centered on the camera origin `(scrollX, scrollY)`:
  - **X**: kill if `x < scrollX - margin` or `x > scrollX + W + margin`
  - **Y**: kill if `y < scrollY - band` or `y > scrollY + H + band`
- This applies uniformly to enemies (`EnemySystem`) and projectiles/bombs
  (`ProjectileSystem`).

## 8) Invariants (regression guards)

- Collision/hit detection is **invariant to scroll**: a projectile overlapping an
  enemy in world space hits regardless of `scrollX`/`scrollY`.
  See `CollisionScrollInvariance.smoke.ts`.
- Render is the only place that subtracts scroll; gameplay systems never do.

---

### Notes / known out-of-scope items

- **VFX hit-sparks** (`DamageSystem.onHitSpark` -> `renderVFX`) currently use the
  enemy's WORLD position but `renderVFX` does not subtract the camera, so sparks are
  mispositioned when `scrollY != 0`. This is a pre-existing VFX-layer issue, left
  untouched by the world-space unification (tracked separately).
- The legacy 2D `RenderSystem` (canvas) is not on the active render path
  (`WebGLSceneRenderer` is) and has its own, now-outdated scroll handling.
