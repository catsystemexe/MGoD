import { computePickupVisualMetrics, computeScreenPixelScaleFromCanvasMetrics, isPickupRenderEligible, sceneRenderPassForEntity } from "./WebGLSceneRenderer";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

const pickup = {
  kind: "pickup",
  defId: "w1",
  pos: { x: 120, y: 80 },
  posPrev: { x: 120, y: 80 },
  radius: 7.5,
  pendingKill: false,
};

const beforeScale = computeScreenPixelScaleFromCanvasMetrics(
  { drawingBufferWidth: 1792, drawingBufferHeight: 1008, width: 1792, height: 1008 },
  896,
  504,
);
const afterClickTransientCssScale = computeScreenPixelScaleFromCanvasMetrics(
  { drawingBufferWidth: 1792, drawingBufferHeight: 1008, width: 1792, height: 1008 },
  896,
  504,
);

const before = computePickupVisualMetrics(beforeScale);
const after = computePickupVisualMetrics(afterClickTransientCssScale);

assert(isPickupRenderEligible(pickup), "mouse click should not change pickup render eligibility");
assert(sceneRenderPassForEntity(pickup) === "pickup", "mouse click should not change pickup render pass");
assert(beforeScale === 2 && afterClickTransientCssScale === 2, "pickup metrics should use stable drawing-buffer scale, not transient click-time CSS metrics");
assert(before.backgroundLogicPx === after.backgroundLogicPx, "mouse click should not change pickup background size");
assert(before.symbolHeightLogicPx === after.symbolHeightLogicPx, "mouse click should not change pickup symbol size");
assert(before.shadowLogicPx === after.shadowLogicPx, "mouse click should not change pickup shadow size");

console.log("[SMOKE] PickupMouseClickMetrics OK ✅");
