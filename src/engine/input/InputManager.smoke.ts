import { InputManager } from "./InputManager";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function main() {
  const input = new InputManager({ triggerBufferFrames: 3 });

  // tick 0: no keys
  let a0 = input.sample(0);
  assert(a0.fireBomb === false, "bomb false initially");
  assert(a0.pause === false, "pause false initially");
  assert(a0.firePrimary === false, "primary false initially");

  // press bomb (X), but do NOT sample yet (simulate press between ticks)
  input.__devSetKey("KeyX", true);

  // tick 1 sample -> should fire bomb due to buffering
  let a1 = input.sample(1);
  assert(a1.fireBomb === true, "bomb should trigger on next sample");
  // consumed -> should not re-trigger
  let a2 = input.sample(2);
  assert(a2.fireBomb === false, "bomb should be consumed");

  // hold primary (Space)
  input.__devSetKey("Space", true);
  let a3 = input.sample(3);
  assert(a3.firePrimary === true, "primary should hold true");
  let a4 = input.sample(4);
  assert(a4.firePrimary === true, "primary still true while held");
  input.__devSetKey("Space", false);
  let a5 = input.sample(5);
  assert(a5.firePrimary === false, "primary false after release");

  // movement: diagonal normalization
  input.__devSetKey("KeyW", true);
  input.__devSetKey("KeyD", true);
  let a6 = input.sample(6);
  assert(a6.move.x > 0 && a6.move.y < 0, "move should be up-right");
  assert(Math.abs(Math.abs(a6.move.x) - Math.abs(a6.move.y)) < 1e-6, "diag should normalize equally");

  console.log("[SMOKE] InputManager OK ✅");
}

main();
