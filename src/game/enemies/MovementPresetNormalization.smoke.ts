import { CONTENT, BEHAVIOR_GRAPHS } from "../content/CONTENT";
import { EnemyBehaviorDB } from "./EnemyBehaviorDB";
import { EnemyBehaviorPresets } from "./EnemyBehaviorPresets";
import { straightBehavior } from "./behaviors/straight";
import { sineBehavior } from "./behaviors/sine";
import { loopBehavior } from "./behaviors/loop";
import { createDevSummonerSpawnPayload } from "../../dev/DevSummoner";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`[MovementPresetNormalization] ${msg}`);
}

function approx(actual: number, expected: number, epsilon = 0.0001): void {
  assert(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be near ${expected}`);
}

function initStraight(params: Record<string, unknown>) {
  const ent: any = { pos: { x: 100, y: 50 }, behavior: params, bState: { t: 0 } };
  straightBehavior.init?.(ent);
  return ent;
}

function straightTarget(params: Record<string, unknown>, seconds: number) {
  const ent = initStraight(params);
  straightBehavior.update?.(ent, { dt: seconds } as any);
  return straightBehavior.getTarget?.(ent, { dt: seconds } as any);
}

function straightDisplacementX(params: Record<string, unknown>, seconds: number): number {
  const target = straightTarget(params, seconds);
  assert(target, "straight target must exist");
  return target.x - 100;
}

function assertContentReferencesResolve(): void {
  const ids = new Set(CONTENT.behaviorPresets.map((preset) => preset.id));
  assert(ids.size === CONTENT.behaviorPresets.length, "behavior preset IDs must be unique");

  for (const preset of CONTENT.behaviorPresets) {
    assert(EnemyBehaviorDB[preset.behaviorId], `preset ${preset.id} behaviorId must be registered`);
  }

  for (const enemy of CONTENT.enemyTypes) {
    assert(ids.has(enemy.behaviorPresetId), `enemy ${enemy.id} behaviorPresetId must resolve`);
  }

  for (const wave of CONTENT.waves) {
    if (wave.behaviorPresetId) {
      assert(ids.has(wave.behaviorPresetId), `wave ${wave.id} behaviorPresetId must resolve`);
    }
  }

  for (const [graphId, graph] of Object.entries(BEHAVIOR_GRAPHS)) {
    for (const [stateId, state] of Object.entries(graph.states)) {
      if (state.movementPresetId) {
        assert(ids.has(state.movementPresetId), `graph ${graphId}.${stateId} movementPresetId must resolve`);
      }
    }
  }
}

function assertCanonicalLibrary(): void {
  const expected = [
    "none.hold",
    "straight.drift",
    "straight.basic",
    "straight.accel",
    "straight.decel",
    "straight.charge",
    "diagonal.up",
    "diagonal.down",
    "sine.soft",
    "sine.wide",
    "sine.tight",
    "sine.evade",
    "sine.hover",
    "zigzag.sharp",
    "loop.single",
    "loop.repeat",
    "invaders.pack",
  ];
  for (const id of expected) assert(EnemyBehaviorPresets[id], `expected canonical preset ${id}`);
  for (const removed of ["straight.fast", "sine.basic", "sine.hold", "sine.sniper", "sine.hyper", "invaders.basic", "none.basic"]) {
    assert(!EnemyBehaviorPresets[removed], `removed preset ${removed} must not be exposed`);
  }
}

function assertStraightInterpolation(): void {
  const constant = straightTarget({ speedX: -160, speedY: 0 }, 0.5);
  approx(constant?.x ?? 0, 20);
  approx(constant?.y ?? 0, 50);

  const accelEarly = straightTarget({ speedXStart: -80, speedXEnd: -320, speedYStart: 0, speedYEnd: 0, duration: 2 }, 0.25);
  const accelLate = straightTarget({ speedXStart: -80, speedXEnd: -320, speedYStart: 0, speedYEnd: 0, duration: 2 }, 2);
  assert(accelEarly && accelLate, "accel targets must exist");
  assert(Math.abs((accelEarly.x - 100) / 0.25) < Math.abs((accelLate.x - 100) / 2), "straight.accel average speed must increase");

  const accelParams = { speedXStart: -80, speedXEnd: -320, speedYStart: 0, speedYEnd: 0, duration: 2 };
  approx(straightDisplacementX(accelParams, 1), -140);
  approx(straightDisplacementX(accelParams, 2), -400);
  approx(straightDisplacementX(accelParams, 3), -720);

  const decelEarly = straightTarget({ speedXStart: -360, speedXEnd: -80, speedYStart: 0, speedYEnd: 0, duration: 2 }, 0.25);
  const decelLate = straightTarget({ speedXStart: -360, speedXEnd: -80, speedYStart: 0, speedYEnd: 0, duration: 2 }, 2);
  assert(decelEarly && decelLate, "decel targets must exist");
  assert(Math.abs((decelEarly.x - 100) / 0.25) > Math.abs((decelLate.x - 100) / 2), "straight.decel average speed must decrease");

  const ent = initStraight({ speedXStart: -80, speedXEnd: -320, duration: 2 });
  straightBehavior.update?.(ent, { dt: 1 } as any);
  const first = straightBehavior.getTarget?.(ent, { dt: 1 } as any);
  ent.pos = { x: 100, y: 50 };
  ent.bState = { t: 0 };
  straightBehavior.init?.(ent);
  straightBehavior.update?.(ent, { dt: 1 } as any);
  const second = straightBehavior.getTarget?.(ent, { dt: 1 } as any);
  approx(first?.x ?? 0, second?.x ?? 1);
  approx(first?.y ?? 0, second?.y ?? 1);
}


function initLoop(params: Record<string, unknown>) {
  const ent: any = { pos: { x: 100, y: 50 }, behavior: params, bState: { t: 0 } };
  loopBehavior.init?.(ent);
  return ent;
}

function loopTarget(params: Record<string, unknown>, seconds: number) {
  const ent = initLoop(params);
  if (seconds > 0) loopBehavior.update?.(ent, { dt: seconds } as any);
  return loopBehavior.getTarget?.(ent, { dt: seconds } as any);
}

function assertFiniteTarget(target: { x: number; y: number } | null | undefined, label: string): asserts target is { x: number; y: number } {
  assert(target, `${label} target must exist`);
  assert(Number.isFinite(target.x), `${label} target.x must be finite`);
  assert(Number.isFinite(target.y), `${label} target.y must be finite`);
}

function assertLoopBehavior(): void {
  assert(EnemyBehaviorDB.loop === loopBehavior, "loop behavior ID must be registered");

  const single = EnemyBehaviorPresets["loop.single"];
  const repeat = EnemyBehaviorPresets["loop.repeat"];
  assert(single?.behaviorId === "loop", "loop.single must use loop behavior");
  assert(repeat?.behaviorId === "loop", "loop.repeat must use loop behavior");

  const initial = loopTarget(single.params, 0);
  assertFiniteTarget(initial, "loop.single initial");
  approx(initial.x, 100);
  approx(initial.y, 50);

  const ent = initLoop(single.params);
  const duration = Number(ent.bState.duration);
  assert(Number.isFinite(duration) && duration > 0, "loop.single duration must be finite");
  loopBehavior.update?.(ent, { dt: duration } as any);
  const completed = loopBehavior.getTarget?.(ent, { dt: duration } as any);
  assertFiniteTarget(completed, "loop.single completed");
  approx(completed.x, 100 + Number(single.params.speedX) * duration, 0.00001);
  approx(completed.y, 50 + Number(single.params.speedY ?? 0) * duration, 0.00001);

  const afterEnt = initLoop(single.params);
  loopBehavior.update?.(afterEnt, { dt: duration + 0.5 } as any);
  const after = loopBehavior.getTarget?.(afterEnt, { dt: 0.5 } as any);
  assertFiniteTarget(after, "loop.single after completion");
  approx(after.x, 100 + Number(single.params.speedX) * (duration + 0.5), 0.00001);
  approx(after.y, 50 + Number(single.params.speedY ?? 0) * (duration + 0.5), 0.00001);

  const repeatEnt = initLoop(repeat.params);
  const repeatDuration = Number(repeatEnt.bState.duration);
  loopBehavior.update?.(repeatEnt, { dt: repeatDuration * 3 + 0.25 } as any);
  const repeated = loopBehavior.getTarget?.(repeatEnt, { dt: 0.25 } as any);
  const oneCycleEnt = initLoop(repeat.params);
  loopBehavior.update?.(oneCycleEnt, { dt: 0.25 } as any);
  const oneCycle = loopBehavior.getTarget?.(oneCycleEnt, { dt: 0.25 } as any);
  assertFiniteTarget(repeated, "loop.repeat repeated");
  assertFiniteTarget(oneCycle, "loop.repeat one cycle");
  const repeatSpeedX = Number(repeat.params.speedX);
  const repeatSpeedY = Number(repeat.params.speedY ?? 0);
  approx(repeated.x - repeatSpeedX * (repeatDuration * 3 + 0.25), oneCycle.x - repeatSpeedX * 0.25, 0.00001);
  approx(repeated.y - repeatSpeedY * (repeatDuration * 3 + 0.25), oneCycle.y - repeatSpeedY * 0.25, 0.00001);

  const first = loopTarget(single.params, 0.75);
  const second = loopTarget(single.params, 0.75);
  assertFiniteTarget(first, "loop deterministic first");
  assertFiniteTarget(second, "loop deterministic second");
  approx(first.x, second.x, 0.00001);
  approx(first.y, second.y, 0.00001);
}

function assertDevSummonerPayload(): void {
  const payload = createDevSummonerSpawnPayload({
    typeId: "red",
    spawnX: 920,
    spawnY: 260,
    behaviorPresetId: "loop.single",
    devManualSpawnId: 7,
  });
  assert(payload.behaviorPresetId === "loop.single", "DevSummoner payload must include behaviorPresetId");
  assert(!(payload as any).behaviorId, "DevSummoner payload must not include behaviorId");
  assert(!(payload as any).primitive, "DevSummoner payload must not include primitive metadata");
  assert(!(payload as any).movementClass, "DevSummoner payload must not include movement class metadata");
}

function assertSineYAxisWaves(): void {
  for (const id of ["sine.soft", "sine.wide", "sine.tight", "sine.evade", "sine.hover"]) {
    const preset = EnemyBehaviorPresets[id];
    const ent: any = { pos: { x: 100, y: 50 }, behavior: preset.params, bState: { t: 0 }, spawnOrdinal: 0 };
    sineBehavior.init?.(ent);
    sineBehavior.update?.(ent, { dt: 0.25 } as any);
    const target = sineBehavior.getTarget?.(ent, { dt: 0.25 } as any);
    assert(target, `${id} target must exist`);
    assert(target.y !== 50, `${id} must generate Y-axis wave movement`);
  }
}

assertContentReferencesResolve();
assertCanonicalLibrary();
assertStraightInterpolation();
assertLoopBehavior();
assertSineYAxisWaves();
assertDevSummonerPayload();
console.log("[MovementPresetNormalization] ok");
