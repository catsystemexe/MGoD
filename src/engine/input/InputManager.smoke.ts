/**
 * InputManager smoke test – CM v3.1+
 * Run: npm run smoke:input
 */
import { InputManager } from "./InputManager";
import type { DisplayInfo } from "./DisplayContract";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

// ultra-min fake canvas for Node (only what InputManager reads)
function makeFakeCanvas(): HTMLCanvasElement {
  return {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 224 } as any),
    addEventListener: () => {},
    removeEventListener: () => {},
  } as any as HTMLCanvasElement;
}

function main() {
  const canvas = makeFakeCanvas();
  const input = new InputManager(canvas, { bombBufferTicks: 3, preventDefaults: false });

  // Provide display mapping so readAimLogic works
  const di: DisplayInfo = {
    logicW: 400,
    logicH: 224,
    viewport: { x: 0, y: 0, w: 400, h: 224 },
  } as any;
  input.setDisplayInfo(di);

  // tick0: default state
  let a0 = input.sampleActions();
  assert(a0.firePrimary === false, "primary false initially");
  assert(a0.fireSecondary === false, "secondary false initially");
  assert(a0.bombPressed === false, "bomb not pressed initially");

  // Simulate move W+D (up-right). In your code: up = -1, right = +1
  const keyDown: Set<string> = (input as any).keyDown;
  keyDown.add("KeyW");
  keyDown.add("KeyD");

  let a1 = input.sampleActions();
  assert(a1.move.x > 0, "move right");
  assert(a1.move.y < 0, "move up");
  // normalized diagonal => |x| == |y|
  assert(Math.abs(Math.abs(a1.move.x) - Math.abs(a1.move.y)) < 1e-6, "diag normalized");

  // Simulate mouse aim at (100,50) in client coords
  (input as any).mouseClient = { x: 100, y: 50 };
  let a2 = input.sampleActions();
  assert(Math.abs(a2.aim.x - 100) < 1e-6, "aim.x maps to logic");
  assert(Math.abs(a2.aim.y - 50) < 1e-6, "aim.y maps to logic");

  // LMB/RMB hold behavior
  (input as any).lmbDown = true;
  (input as any).rmbDown = true;
  let a3 = input.sampleActions();
  assert(a3.firePrimary === true, "LMB => firePrimary");
  assert(a3.fireSecondary === true, "RMB => fireSecondary");

  // Bomb buffering: simulate Space press effect (buffer set + target captured)
  // We mimic what onKeyDown does: set bombBuffer and bombTargetBuffered
  (input as any).bombBuffer = 2;
  (input as any).bombTargetBuffered = { x: 123, y: 45 };

  let a4 = input.sampleActions();
  assert(a4.bombPressed === true, "bomb should trigger when buffer > 0");
  assert(a4.bombTarget.x === 123 && a4.bombTarget.y === 45, "bomb target from buffer");

  // Consumed immediately (your code sets bombBuffer = 0)
  let a5 = input.sampleActions();
  assert(a5.bombPressed === false, "bomb consumed (single trigger)");

  console.log("[SMOKE] InputManager OK ✅");
}

main();