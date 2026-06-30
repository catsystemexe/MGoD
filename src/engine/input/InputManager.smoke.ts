/**
 * InputManager gamepad smoke test.
 * Run: tsx src/engine/input/InputManager.smoke.ts
 */
import { InputManager } from "./InputManager";
import { makeDefaultActions } from "../../game/data/InputRuntime";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

type FakePadInput = { axes?: number[]; buttons?: number[]; connected?: boolean };

function installWindow(): void {
  const listeners = new Map<string, Function[]>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: (type: string, fn: Function) => {
        listeners.set(type, [...(listeners.get(type) ?? []), fn]);
      },
      removeEventListener: () => {},
    },
  });
}

function setGamepads(pads: Array<ReturnType<typeof pad> | null> | null): void {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: pads === null ? {} : { getGamepads: () => pads },
  });
}

function pad(input: FakePadInput) {
  const pressed = new Set(input.buttons ?? []);
  return {
    id: "Xbox MAXFire Blaze 5 compatible USB gamepad",
    mapping: "standard",
    connected: input.connected ?? true,
    axes: input.axes ?? [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.has(i), value: pressed.has(i) ? 1 : 0 })),
  };
}

function makeFakeCanvas(): HTMLCanvasElement {
  return {
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 896, height: 504 }),
    addEventListener: () => {},
    focus: () => {},
  } as any as HTMLCanvasElement;
}

function makeInput(): InputManager {
  installWindow();
  setGamepads([]);
  const input = new InputManager(() => makeFakeCanvas());
  input.setPresentRect(0, 0, 896, 504);
  return input;
}

function sample(input: InputManager) {
  const actions = makeDefaultActions();
  input.sample(actions, 896, 504);
  return actions;
}

function keys(input: InputManager): Set<string> {
  return (input as any).keys as Set<string>;
}

const keyboard = makeInput();
keys(keyboard).add("KeyW");
keys(keyboard).add("KeyD");
let a = sample(keyboard);
assert(a.move.x > 0.69 && a.move.y < -0.69, "keyboard movement works without gamepad");

const gamepadMove = makeInput();
setGamepads([pad({ axes: [1, 0] })]);
a = sample(gamepadMove);
assert(a.move.x > 0.99 && Math.abs(a.move.y) < 0.001, "gamepad movement works without keyboard");

const composed = makeInput();
keys(composed).add("KeyD");
setGamepads([pad({ axes: [1, 1] })]);
a = sample(composed);
assert(Math.hypot(a.move.x, a.move.y) <= 1.000001, "keyboard + gamepad movement is clamped");
assert(a.move.x > 0.9 && a.move.y > 0.2, "keyboard + gamepad movement composes");

const primary = makeInput();
keys(primary).add("Space");
setGamepads([pad({ buttons: [0] })]);
a = sample(primary);
assert(a.firePrimary === true, "keyboard primary OR gamepad A sets primary");

const secondary = makeInput();
setGamepads([pad({ buttons: [2] })]);
a = sample(secondary);
assert(a.firePrimary === false, "gamepad X does not set primary");
assert(a.fireSecondary === true, "gamepad X sets only secondary/W2");

const bomb = makeInput();
setGamepads([pad({ buttons: [1] })]);
a = sample(bomb);
assert(a.bombPressed === true, "gamepad B triggers bomb on rising edge");
a = sample(bomb);
assert(a.bombPressed === false, "holding B does not repeat bomb");
setGamepads([pad({})]);
a = sample(bomb);
assert(a.bombPressed === false, "releasing B does not trigger bomb");
setGamepads([pad({ buttons: [1] })]);
a = sample(bomb);
assert(a.bombPressed === true, "B triggers bomb again after release");

const toggle = makeInput();
setGamepads([pad({ buttons: [3] })]);
a = sample(toggle);
assert(a.toggleW1WeaponPressed === true, "gamepad Y triggers W1 toggle on rising edge");
a = sample(toggle);
assert(a.toggleW1WeaponPressed === false, "holding Y does not repeat W1 toggle");
setGamepads([pad({})]);
a = sample(toggle);
assert(a.toggleW1WeaponPressed === false, "releasing Y does not trigger W1 toggle");
setGamepads([pad({ buttons: [3] })]);
a = sample(toggle);
assert(a.toggleW1WeaponPressed === true, "Y triggers W1 toggle again after release");

const keyboardToggle = makeInput();
keys(keyboardToggle).add("KeyJ");
setGamepads([pad({ buttons: [3] })]);
a = sample(keyboardToggle);
assert(a.toggleW1WeaponPressed === true, "keyboard J and gamepad Y share one W1 toggle action");
a = sample(keyboardToggle);
assert(a.toggleW1WeaponPressed === false, "holding keyboard J plus gamepad Y does not repeat W1 toggle");

const noDev = makeInput();
setGamepads([pad({ buttons: [8, 9, 12, 15] })]);
a = sample(noDev);
assert(a.cycleW1LevelPressed === false && a.cycleW2LevelPressed === false, "gamepad does not change W1/W2 levels");
keys(noDev).add("KeyH");
a = sample(noDev);
assert(a.firePrimary === false && a.fireSecondary === false && a.bombPressed === false && a.toggleW1WeaponPressed === false, "KeyH/debug controls are not gamepad gameplay actions");

const keyboardLevels = makeInput();
keys(keyboardLevels).add("Minus");
keys(keyboardLevels).add("Equal");
setGamepads([pad({})]);
a = sample(keyboardLevels);
assert(a.cycleW1LevelPressed === true && a.cycleW2LevelPressed === true, "Minus/Equal remain keyboard-only level controls");

const disconnect = makeInput();
setGamepads([pad({ axes: [1, 0], buttons: [0, 2] })]);
a = sample(disconnect);
assert(a.move.x > 0.99 && a.firePrimary && a.fireSecondary, "connected gamepad supplies held input before disconnect");
setGamepads([pad({ axes: [1, 0], buttons: [0, 2], connected: false })]);
a = sample(disconnect);
assert(a.move.x === 0 && !a.firePrimary && !a.fireSecondary, "disconnect clears held input");

const reconnect = makeInput();
setGamepads([pad({ buttons: [1, 3] })]);
a = sample(reconnect);
assert(a.bombPressed && a.toggleW1WeaponPressed, "initial B/Y press edges before disconnect");
setGamepads([pad({ buttons: [1, 3], connected: false })]);
a = sample(reconnect);
assert(!a.bombPressed && !a.toggleW1WeaponPressed, "disconnect does not emit B/Y edges");
setGamepads([pad({ buttons: [1, 3] })]);
a = sample(reconnect);
assert(!a.bombPressed && !a.toggleW1WeaponPressed, "reconnect with held B/Y does not emit false edges");
setGamepads([pad({})]);
sample(reconnect);
setGamepads([pad({ buttons: [1, 3] })]);
a = sample(reconnect);
assert(a.bombPressed && a.toggleW1WeaponPressed, "release plus new B/Y press emits edges after reconnect");

const noNavigator = makeInput();
setGamepads(null);
a = sample(noNavigator);
assert(a.move.x === 0 && !a.firePrimary && !a.fireSecondary && !a.bombPressed && !a.toggleW1WeaponPressed, "missing navigator.getGamepads is safe");

console.log("[SMOKE] InputManager gamepad OK ✅");
