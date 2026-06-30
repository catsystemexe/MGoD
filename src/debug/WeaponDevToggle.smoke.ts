import { handleW1WeaponToggleKeydown, W1_WEAPON_TOGGLE_KEY } from "./WeaponDevToggle";
import { DEFAULT_BINDINGS } from "../engine/input/InputBindings";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

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

let active = "w1.basic";
const target = {
  toggleW1Weapon: () => {
    active = active === "w1.basic" ? "w1.spread" : "w1.basic";
    return active;
  },
};

const first = ev(W1_WEAPON_TOGGLE_KEY);
assert(handleW1WeaponToggleKeydown(first, target) === "w1.spread", "KeyJ should toggle Basic -> Spread");
assert(first.prevented(), "KeyJ should prevent browser default");
assert(active === "w1.spread", "active W1 should be Spread after first toggle");

const repeat = ev(W1_WEAPON_TOGGLE_KEY, true);
assert(handleW1WeaponToggleKeydown(repeat, target) === null, "KeyJ repeat should be ignored");
assert(active === "w1.spread", "repeat KeyJ should not toggle");

const input = { tagName: "INPUT", isContentEditable: false, closest: () => null };
assert(handleW1WeaponToggleKeydown(ev(W1_WEAPON_TOGGLE_KEY, false, input), target) === null, "KeyJ inside editable target should be ignored");
assert(active === "w1.spread", "editable KeyJ should not toggle");

assert(handleW1WeaponToggleKeydown(ev("KeyH"), target) === null, "KeyH must remain collision overlay key");
assert(handleW1WeaponToggleKeydown(ev("KeyX"), target) === null, "KeyX must remain bomb key");
assert(handleW1WeaponToggleKeydown(ev("Minus"), target) === null, "Minus must remain W1 level control");
assert(handleW1WeaponToggleKeydown(ev("Equal"), target) === null, "Equal must remain W2 level control");
assert(DEFAULT_BINDINGS.fireBomb.includes("KeyX"), "KeyX should remain the gameplay bomb key");

const second = ev(W1_WEAPON_TOGGLE_KEY);
assert(handleW1WeaponToggleKeydown(second, target) === "w1.basic", "KeyJ should toggle Spread -> Basic");
assert(active === "w1.basic", "active W1 should be Basic after second toggle");

console.log("[SMOKE] WeaponDevToggle OK ✅");
