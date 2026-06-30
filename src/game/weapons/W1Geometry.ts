/**
 * Audited W1 projectile geometry.
 *
 * Runtime W1 Basic projectiles are rendered by the SDF "bolt" path before the
 * atlas sprite path can run. SpawnSystem gives W1 Basic radius=5 and
 * render.sdf.size=5; WebGLSceneRenderer passes radius*size=25 into SdfPass, and
 * SdfPass draws non-laser shapes on a 4x-radius quad. That makes a 100px wide
 * SDF bolt with local x -1..1 mapped to logic offsets -50..+50 from
 * projectile.pos.
 *
 * The SDF bolt shader fades cyan from the rear and turns white at local x=0.15.
 * The active gameplay body is the bright core, not the rear fade/trail.
 */
export const W1_ACTIVE_BODY_START = 7.5;
export const W1_ACTIVE_BODY_END = 50;

export const W1_PROJECTILE_COLLISION_OFFSETS = [
  W1_ACTIVE_BODY_START + 5,
  W1_ACTIVE_BODY_END - 5,
] as const;

export const W1_PROJECTILE_COLLISION_CIRCLE_COUNT = W1_PROJECTILE_COLLISION_OFFSETS.length;

export const W1_SDF_TRAIL_START = -50;
export const W1_SDF_TRAIL_END = W1_ACTIVE_BODY_START;
export const W1_SDF_VISUAL_END = 50;
export const W1_BASIC_RENDER_LENGTH = W1_SDF_VISUAL_END - W1_SDF_TRAIL_START;

export const W1_SPREAD_RENDER_LENGTH = 48;
export const W1_SPREAD_RENDER_WIDTH = 14;
export const W1_SPREAD_RENDER_WIDTH_L5 = 18;
export const W1_SPREAD_COLLISION_AUDITED_LENGTH = 34;
export const W1_SPREAD_COLLISION_CORE_CENTER_RATIO = 0.25;

// Keep the active gameplay circle centered on the same bright-core region that
// was previously audited. The enlarged render quad improves readability, but
// collision still represents the compact damaging body rather than the full glow.
export const W1_SPREAD_COLLISION_OFFSET =
  W1_SPREAD_COLLISION_AUDITED_LENGTH * W1_SPREAD_COLLISION_CORE_CENTER_RATIO;

export function projectileCollisionOffsetsForWeapon(weaponTypeId: string): readonly number[] {
  if (weaponTypeId === "w1.basic") return W1_PROJECTILE_COLLISION_OFFSETS;
  if (weaponTypeId === "w1.spread") return [W1_SPREAD_COLLISION_OFFSET];
  return [0];
}
