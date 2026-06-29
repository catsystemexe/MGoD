import { sceneRenderPassForEntity, sceneRenderPassRank } from "./WebGLSceneRenderer";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

const pickupPass = sceneRenderPassForEntity({ kind: "pickup", defId: "score" });
const deathGhostPass = sceneRenderPassForEntity({ kind: "fx", deathVisual: { snapshot: {} } });
const explosionPass = sceneRenderPassForEntity({ kind: "fx", spriteId: "fx.explosion.1.0" });
const overlayPass = "collisionDebugOverlay" as const;

assert(pickupPass === "pickup", "pickup entities should remain in the pickup gameplay pass");
assert(deathGhostPass === "deathGhostFx", "death ghost should classify as deferred death FX");
assert(explosionPass === "explosionFx", "explosion should classify as deferred explosion FX");
assert(sceneRenderPassRank(pickupPass) < sceneRenderPassRank(deathGhostPass), "pickup should submit before death ghost FX");
assert(sceneRenderPassRank(pickupPass) < sceneRenderPassRank(explosionPass), "pickup should submit before explosion FX");
assert(sceneRenderPassRank(deathGhostPass) < sceneRenderPassRank(overlayPass), "death ghost FX should submit before debug overlay");
assert(sceneRenderPassRank(explosionPass) < sceneRenderPassRank(overlayPass), "explosion FX should submit before debug overlay");

console.log("[SMOKE] SceneRenderOrder OK ✅");
