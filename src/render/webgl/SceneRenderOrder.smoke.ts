import {
  collectPickupDrawCommand,
  computePickupVisualMetrics,
  computeScreenPixelScaleFromCanvasMetrics,
  pickupBackgroundColorForDefId,
  pickupSymbolForDefId,
  sceneRenderPassForEntity,
  sceneRenderPassRank,
  type PickupDrawCommand,
} from "./WebGLSceneRenderer";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

type Trace = "normal" | "pickup.background" | "pickup.symbol" | "deathGhostFx" | "explosionFx" | "collisionDebugOverlay";

type SlotEntity = { label: string; entity: any; ix: number; iy: number };

function renderTraceForSlots(slots: SlotEntity[], overlay = true): Trace[] {
  const trace: Trace[] = [];
  const pickups: PickupDrawCommand[] = [];
  const deathGhosts: SlotEntity[] = [];
  const explosions: SlotEntity[] = [];

  for (const slot of slots) {
    const pass = sceneRenderPassForEntity(slot.entity);
    if (pass === "pickup") {
      const cmd = collectPickupDrawCommand(slot.entity, slot.ix, slot.iy);
      if (cmd) pickups.push(cmd);
      continue;
    }
    if (pass === "deathGhostFx") {
      deathGhosts.push(slot);
      continue;
    }
    if (pass === "explosionFx") {
      explosions.push(slot);
      continue;
    }
    trace.push("normal");
  }

  for (const pickup of pickups) {
    trace.push("pickup.background");
    if (pickupSymbolForDefId(pickup.defId)) trace.push("pickup.symbol");
  }
  for (const _ of deathGhosts) trace.push("deathGhostFx");
  for (const _ of explosions) trace.push("explosionFx");
  if (overlay) trace.push("collisionDebugOverlay");
  return trace;
}

const pickup = (defId = "w1") => ({
  kind: "pickup",
  defId,
  pos: { x: 120, y: 80 },
  posPrev: { x: 120, y: 80 },
  radius: 7.5,
  pendingKill: false,
});
const spreadProjectile = {
  kind: "projectile",
  pos: { x: 120, y: 80 },
  posPrev: { x: 120, y: 80 },
  radius: 5,
  render: { sdf: { shape: "plasmaOrb", color: "#ffd21f", tipColor: "#ff8a00", lengthPx: 18, widthPx: 18 } },
  pendingKill: false,
};
const deathGhost = { kind: "fx", deathVisual: { snapshot: {} }, pos: { x: 120, y: 80 }, radius: 8 };
const explosion = { kind: "fx", spriteId: "fx.explosion.1.0", pos: { x: 120, y: 80 }, radius: 16 };

const pickupPass = sceneRenderPassForEntity(pickup("score"));
const deathGhostPass = sceneRenderPassForEntity(deathGhost);
const explosionPass = sceneRenderPassForEntity(explosion);
const overlayPass = "collisionDebugOverlay" as const;

assert(pickupPass === "pickup", "pickup entities should remain in the pickup gameplay pass");
assert(deathGhostPass === "deathGhostFx", "death ghost should classify as deferred death FX");
assert(explosionPass === "explosionFx", "explosion should classify as deferred explosion FX");
assert(sceneRenderPassRank("normal") < sceneRenderPassRank(pickupPass), "normal entities should submit before pickups");
assert(sceneRenderPassRank(pickupPass) < sceneRenderPassRank(deathGhostPass), "pickup should submit before death ghost FX");
assert(sceneRenderPassRank(pickupPass) < sceneRenderPassRank(explosionPass), "pickup should submit before explosion FX");
assert(sceneRenderPassRank(deathGhostPass) < sceneRenderPassRank(overlayPass), "death ghost FX should submit before debug overlay");
assert(sceneRenderPassRank(explosionPass) < sceneRenderPassRank(overlayPass), "explosion FX should submit before debug overlay");

const exactOrder = renderTraceForSlots([
  { label: "projectile", entity: spreadProjectile, ix: 10, iy: 10 },
  { label: "pickup", entity: pickup("w1"), ix: 10, iy: 10 },
  { label: "death", entity: deathGhost, ix: 10, iy: 10 },
  { label: "explosion", entity: explosion, ix: 10, iy: 10 },
]);
assert(exactOrder.join(" > ") === "normal > pickup.background > pickup.symbol > deathGhostFx > explosionFx > collisionDebugOverlay", "actual deferred trace should be normal -> pickup -> death -> explosion -> overlay");

const pickupLowerSlot = renderTraceForSlots([
  { label: "pickup-low", entity: pickup("w1"), ix: 20, iy: 20 },
  { label: "spread-high", entity: spreadProjectile, ix: 20, iy: 20 },
], false);
const pickupHigherSlot = renderTraceForSlots([
  { label: "spread-low", entity: spreadProjectile, ix: 20, iy: 20 },
  { label: "pickup-high", entity: pickup("w1"), ix: 20, iy: 20 },
], false);
assert(pickupLowerSlot.join(" > ") === "normal > pickup.background > pickup.symbol", "pickup in lower ECS slot should still render after later spread projectile");
assert(pickupHigherSlot.join(" > ") === pickupLowerSlot.join(" > "), "pickup pass order should be independent of ECS slot order");

const repeated = renderTraceForSlots([
  { label: "spread-a", entity: spreadProjectile, ix: 30, iy: 30 },
  { label: "pickup-a", entity: pickup("energy"), ix: 40, iy: 40 },
  { label: "spread-b", entity: spreadProjectile, ix: 50, iy: 50 },
  { label: "pickup-b", entity: pickup("bomb"), ix: 60, iy: 60 },
], false);
assert(repeated.filter((item) => item === "normal").length === 2, "two spread projectiles should draw in the normal pass");
assert(repeated.filter((item) => item === "pickup.background").length === 2, "each active pickup should draw one background per frame");
assert(repeated.filter((item) => item === "pickup.symbol").length === 2, "each symbol-mapped active pickup should draw one symbol per frame");

const scale = computeScreenPixelScaleFromCanvasMetrics({ drawingBufferWidth: 1792, drawingBufferHeight: 1008, width: 1792, height: 1008 }, 896, 504);
const metrics = computePickupVisualMetrics(scale);
assert(Math.abs(metrics.backgroundLogicPx * metrics.screenPixelScale - 30) < 0.001, "pickup background should stay 30 screen px");
assert(Math.abs(metrics.symbolHeightLogicPx * metrics.screenPixelScale - 20) < 0.001, "pickup symbol should stay 20 screen px");
assert(Math.abs(metrics.shadowLogicPx * metrics.screenPixelScale - 2) < 0.001, "pickup shadow should stay 2 screen px");
assert(pickupSymbolForDefId("score") === null, "score pickup symbol behavior should remain unchanged");
assert(pickupBackgroundColorForDefId("score").join(",") === "0,1,1,1", "score pickup background should remain cyan");

const pending = collectPickupDrawCommand({ ...pickup("w1"), pendingKill: true }, 10, 10);
const invalidPos = collectPickupDrawCommand({ ...pickup("w1"), pos: { x: NaN, y: 1 } }, 10, 10);
assert(pending === null, "pending-kill pickups should not enter the pickup pass");
assert(invalidPos === null, "pickups without valid gameplay position should not enter the pickup pass");

console.log("[SMOKE] SceneRenderOrder OK ✅");
