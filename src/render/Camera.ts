import { Vec2, lerpV2, v2 } from "../utils/math";

/**
 * Phase 1: camera must NOT drift.
 * We return deterministic interpolation between prev and cur.
 * No smoothing/integration.
 */
export class Camera {
  follow(prev: Vec2, cur: Vec2, alpha: number): Vec2 {
    // alpha can sometimes be NaN if dt is weird; guard it.
    const a = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    return lerpV2(prev, cur, a);
  }

  static origin(): Vec2 {
    return v2(0, 0);
  }
}
