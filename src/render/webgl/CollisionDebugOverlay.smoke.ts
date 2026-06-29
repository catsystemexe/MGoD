import { collectCollisionDebugCircles } from "./WebGLSceneRenderer";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

const player: any = { kind: "player", pos: { x: 1, y: 2 }, radius: 3, bodyRadius: 20, pendingKill: false };
const playerCircles = collectCollisionDebugCircles(player, 11, 12);
assert(playerCircles.length === 2, "player should expose combat and body circles");
assert(playerCircles.some((c) => c.kind === "playerCombat" && c.radius === 3), "player combat radius should be 3");
assert(playerCircles.some((c) => c.kind === "playerBody" && c.radius === 20 && c.alpha < 0.6), "player body radius should be 20 and lower alpha");

assert(collectCollisionDebugCircles({ kind: "enemy", radius: 24, pendingKill: false }, 0, 0)[0]?.radius === 24, "enemy should use entity radius");
assert(collectCollisionDebugCircles({ kind: "pickup", radius: 7.5, defId: "w1", pendingKill: false }, 0, 0)[0]?.radius === 7.5, "pickup should use pickup radius 7.5");
assert(collectCollisionDebugCircles({ kind: "projectile", radius: 5, pendingKill: false }, 0, 0)[0]?.radius === 5, "projectile should use projectile radius");
assert(collectCollisionDebugCircles({ kind: "enemyProjectile", radius: 4, pendingKill: false }, 0, 0)[0]?.radius === 4, "enemy projectile should use runtime radius");
assert(collectCollisionDebugCircles({ kind: "bomb", radius: 10, pendingKill: false }, 0, 0)[0]?.radius === 10, "bomb should use runtime radius");
assert(collectCollisionDebugCircles({ kind: "laser", radius: 99, pendingKill: false }, 0, 0).length === 0, "laser should not be drawn as a circle");
assert(collectCollisionDebugCircles({ kind: "pickup", radius: NaN, pendingKill: false }, 0, 0).length === 0, "invalid radius should be ignored");
assert(player.radius === 3 && player.bodyRadius === 20, "overlay collection must not mutate entity");

console.log("[SMOKE] CollisionDebugOverlay OK ✅");
