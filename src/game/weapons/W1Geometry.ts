/**
 * Audited W1 projectile geometry.
 *
 * Runtime W1 projectiles are rendered by the SDF "bolt" path before the atlas
 * sprite path can run. SpawnSystem gives W1 radius=5 and render.sdf.size=5;
 * WebGLSceneRenderer passes radius*size=25 into SdfPass, and SdfPass draws
 * non-laser shapes on a 4x-radius quad. That makes a 100px wide SDF bolt with
 * local x -1..1 mapped to logic offsets -50..+50 from projectile.pos.
 *
 * The SDF bolt shader fades cyan from the rear and turns white at local x=0.15.
 * The active gameplay body is the bright white core, not the cyan fade/trail.
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
