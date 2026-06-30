import { handleCollisionOverlayKeydown, isTextEditingTarget } from "./CollisionOverlayToggle";
import { DEFAULT_BINDINGS } from "../engine/input/InputBindings";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

let enabled = false;
const target = {
  getDebugCollisionOverlay: () => enabled,
  setDebugCollisionOverlay: (v: boolean) => { enabled = v; },
};

function ev(code: string, repeat = false, eventTarget: any = null) {
  let prevented = false;
  return {
    code,
    repeat,
    target: eventTarget,
    preventDefault: () => { prevented = true; },
    prevented: () => prevented,
  } as any;
}

assert(enabled === false, "overlay should default off");

const first = ev("KeyH");
assert(handleCollisionOverlayKeydown(first, target) === true, "KeyH should toggle on");
assert(enabled === true, "overlay should be enabled after first KeyH");
assert(first.prevented(), "KeyH toggle should prevent browser default");

const repeated = ev("KeyH", true);
assert(handleCollisionOverlayKeydown(repeated, target) === false, "repeat KeyH should be ignored");
assert(enabled === true, "repeat KeyH should not toggle off");

const second = ev("KeyH");
assert(handleCollisionOverlayKeydown(second, target) === true, "second KeyH should toggle off");
assert(enabled === false, "overlay should be disabled after second KeyH");

assert(handleCollisionOverlayKeydown(ev("KeyX"), target) === false, "KeyX should not toggle collision overlay");
assert(enabled === false, "KeyX should leave overlay disabled for bomb gameplay input");
assert(DEFAULT_BINDINGS.fireBomb.includes("KeyX"), "KeyX should remain the gameplay bomb key");

const input = { tagName: "INPUT", isContentEditable: false, closest: () => null };
assert(isTextEditingTarget(input as any), "input target should count as text editing");
assert(handleCollisionOverlayKeydown(ev("KeyH", false, input), target) === false, "KeyH inside input should be ignored");
assert(enabled === false, "input KeyH should not toggle overlay");

assert(handleCollisionOverlayKeydown(ev("KeyB"), target) === false, "other gameplay/debug keys should pass through");

console.log("[SMOKE] CollisionOverlayToggle OK ✅");
