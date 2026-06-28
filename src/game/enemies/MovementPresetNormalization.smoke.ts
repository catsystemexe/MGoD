import { CONTENT, BEHAVIOR_GRAPHS } from "../content/CONTENT";
import { EnemyBehaviorDB } from "./EnemyBehaviorDB";
import { EnemyBehaviorPresets } from "./EnemyBehaviorPresets";
import { straightBehavior } from "./behaviors/straight";
import { sineBehavior } from "./behaviors/sine";
import { loopBehavior } from "./behaviors/loop";
import { trackBehavior } from "./behaviors/track";
import { alignBehavior } from "./behaviors/align";
import { evadeBehavior } from "./behaviors/evade";
import { buildMovementGroups, createDevSummonerSpawnPayload, getPrimitiveFromPresetId } from "../../dev/DevSummoner";
import type { SmartBehaviorContext } from "./behaviors/smartContext";

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
    "smart.track.soft",
    "smart.track.aggressive",
    "smart.align.attack",
    "smart.evade.axis",
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

function initSmart(behavior: typeof trackBehavior, params: Record<string, unknown>, y = 50, spawnOrdinal = 0) {
  const ent: any = { pos: { x: 100, y }, behavior: params, bState: { t: 0 }, spawnOrdinal };
  behavior.init?.(ent);
  return ent;
}

function stepSmart(
  behavior: typeof trackBehavior,
  ent: any,
  dt: number,
  playerY?: number | null,
  logicH = 480,
): { x: number; y: number } {
  const ctx: SmartBehaviorContext = { dt, logicH, playerPos: playerY == null ? null : { x: 40, y: playerY } };
  behavior.update?.(ent, ctx);
  const target = behavior.getTarget?.(ent, ctx);
  assertFiniteTarget(target, "smart target");
  ent.pos.x = target.x;
  ent.pos.y = target.y;
  return target;
}

function assertSmartBehaviors(): void {
  assert(EnemyBehaviorDB.track === trackBehavior, "track behavior ID must be registered");
  assert(EnemyBehaviorDB.align === alignBehavior, "align behavior ID must be registered");
  assert(EnemyBehaviorDB.evade === evadeBehavior, "evade behavior ID must be registered");

  const soft = EnemyBehaviorPresets["smart.track.soft"];
  const aggressive = EnemyBehaviorPresets["smart.track.aggressive"];
  const align = EnemyBehaviorPresets["smart.align.attack"];
  const evade = EnemyBehaviorPresets["smart.evade.axis"];
  assert(soft?.behaviorId === "track", "smart.track.soft must use track behavior");
  assert(aggressive?.behaviorId === "track", "smart.track.aggressive must use track behavior");
  assert(align?.behaviorId === "align", "smart.align.attack must use align behavior");
  assert(evade?.behaviorId === "evade", "smart.evade.axis must use evade behavior");

  const softEnt = initSmart(trackBehavior, soft.params, 50);
  const aggressiveEnt = initSmart(trackBehavior, aggressive.params, 50);
  const softTarget = stepSmart(trackBehavior, softEnt, 1 / 60, 250);
  const aggressiveTarget = stepSmart(trackBehavior, aggressiveEnt, 1 / 60, 250);
  assert(softTarget.y > 50 && softTarget.y < 250, "track.soft must move gradually toward player Y");
  assert(aggressiveTarget.y > softTarget.y, "track.aggressive must respond more strongly than soft");

  const missingPlayerEnt = initSmart(trackBehavior, soft.params, 50);
  const missingPlayerTarget = stepSmart(trackBehavior, missingPlayerEnt, 1 / 60, undefined);
  assertFiniteTarget(missingPlayerTarget, "track missing-player fallback");
  approx(missingPlayerTarget.y, 50);

  const alignEnt = initSmart(alignBehavior, align.params, 50);
  let lastDistance = Math.abs(250 - alignEnt.pos.y);
  for (let i = 0; i < 120; i += 1) {
    const target = stepSmart(alignBehavior, alignEnt, 1 / 60, 250);
    const distance = Math.abs(250 - target.y);
    assert(distance <= lastDistance + 0.00001, "align.attack must not oscillate away from target");
    assert(target.y <= 250, "align.attack must not snap or overshoot past player Y");
    lastDistance = distance;
  }
  assert(lastDistance <= Number(align.params.toleranceY), "align.attack must reach tolerance");

  const evadeA = initSmart(evadeBehavior, evade.params, 100, 2);
  const firstEvade = stepSmart(evadeBehavior, evadeA, 1 / 60, 100);
  const secondEvade = stepSmart(evadeBehavior, evadeA, 1 / 60, 100);
  assert(firstEvade.y < 100, "evade.axis must choose deterministic tie-break direction");
  assert(secondEvade.y < firstEvade.y, "evade.axis must not flip direction during one evade");

  const evadeB = initSmart(evadeBehavior, evade.params, 100, 2);
  const repeatEvade = stepSmart(evadeBehavior, evadeB, 1 / 60, 100);
  approx(firstEvade.y, repeatEvade.y, 0.00001);

  const reentryA = initSmart(trackBehavior, soft.params, 50);
  const reentryB = initSmart(trackBehavior, soft.params, 50);
  const reentryTargetA = stepSmart(trackBehavior, reentryA, 1 / 60, 250);
  const reentryTargetB = stepSmart(trackBehavior, reentryB, 1 / 60, 250);
  approx(reentryTargetA.x, reentryTargetB.x, 0.00001);
  approx(reentryTargetA.y, reentryTargetB.y, 0.00001);
}

function assertMissingPlayerFallbacks(): void {
  const ctx: SmartBehaviorContext = { dt: 1 / 60, logicH: 480, playerPos: null };
  assert(!("world" in ctx), "smart behavior context must not expose world");

  const trackPreset = EnemyBehaviorPresets["smart.track.aggressive"];
  const trackEnt = initSmart(trackBehavior, trackPreset.params, 120);
  trackBehavior.update?.(trackEnt, ctx as any);
  const trackTarget = trackBehavior.getTarget?.(trackEnt, ctx as any);
  assertFiniteTarget(trackTarget, "track null-player fallback");
  approx(trackTarget.y, 120);
  assert(trackTarget.y !== 0, "track missing-player fallback must not steer toward Y=0");

  const alignPreset = EnemyBehaviorPresets["smart.align.attack"];
  const alignEnt = initSmart(alignBehavior, alignPreset.params, 140);
  alignBehavior.update?.(alignEnt, ctx as any);
  const alignTarget = alignBehavior.getTarget?.(alignEnt, ctx as any);
  assertFiniteTarget(alignTarget, "align null-player fallback");
  approx(alignTarget.y, 140);
  assert(alignTarget.y !== 0, "align missing-player fallback must not steer toward Y=0");

  const evadePreset = EnemyBehaviorPresets["smart.evade.axis"];
  const evadeEnt = initSmart(evadeBehavior, evadePreset.params, 160);
  evadeBehavior.update?.(evadeEnt, ctx as any);
  const evadeTarget = evadeBehavior.getTarget?.(evadeEnt, ctx as any);
  assertFiniteTarget(evadeTarget, "evade null-player fallback");
  approx(evadeTarget.y, 160);
  assert(evadeTarget.y !== 0, "evade missing-player fallback must not steer toward Y=0");
}

function assertEvadeCooldown(): void {
  const evade = EnemyBehaviorPresets["smart.evade.axis"];
  const ent = initSmart(evadeBehavior, evade.params, 100, 2);
  const ctx: SmartBehaviorContext = { dt: 1 / 60, logicH: 480, playerPos: { x: 40, y: 100 } };

  evadeBehavior.update?.(ent, ctx as any);
  assert(Number(ent.bState.evadeTimeLeft) > 0, "evade must activate inside trigger band");
  assert(Number(ent.bState.cooldownLeft) === 0, "evade cooldown must not start at trigger time");
  const firstTarget = evadeBehavior.getTarget?.(ent, ctx as any);
  assertFiniteTarget(firstTarget, "evade active first target");
  ent.pos.y = firstTarget.y;
  const activeDir = Math.sign(Number(ent.bState.evadeDir));

  let guard = 0;
  while (Number(ent.bState.evadeTimeLeft) > 0 && guard < 120) {
    evadeBehavior.update?.(ent, ctx as any);
    const target = evadeBehavior.getTarget?.(ent, ctx as any);
    assertFiniteTarget(target, "evade active target");
    ent.pos.y = target.y;
    assert(Math.sign(Number(ent.bState.evadeDir)) === activeDir, "evade direction must remain stable while active");
    guard += 1;
  }
  assert(guard < 120, "evade must finish within bounded smoke iterations");
  assert(Number(ent.bState.evadeTimeLeft) === 0, "evade active duration must complete");
  assert(Number(ent.bState.cooldownLeft) > 0, "evade cooldown must begin after active evade completes");

  const cooldownBefore = Number(ent.bState.cooldownLeft);
  evadeBehavior.update?.(ent, ctx as any);
  assert(Number(ent.bState.evadeTimeLeft) === 0, "evade must not immediately retrigger during cooldown");
  assert(Number(ent.bState.cooldownLeft) < cooldownBefore, "evade cooldown must decrement while inactive");

  guard = 0;
  while (Number(ent.bState.cooldownLeft) > 0 && guard < 120) {
    evadeBehavior.update?.(ent, ctx as any);
    guard += 1;
  }
  assert(guard < 120, "evade cooldown must expire within bounded smoke iterations");
  ent.pos.y = 100;
  evadeBehavior.update?.(ent, ctx as any);
  assert(Number(ent.bState.evadeTimeLeft) > 0, "evade may retrigger deterministically after cooldown expires");
  assert(Math.sign(Number(ent.bState.evadeDir)) === activeDir, "evade retrigger direction must remain deterministic for the same relative position");
}

function assertSmartFsmContent(): void {
  for (const id of ["fsm.smart_tracker", "fsm.smart_aligner", "fsm.smart_evader"]) {
    assert(BEHAVIOR_GRAPHS[id], `expected test FSM graph ${id}`);
  }
  const enemies = new Set(CONTENT.enemyTypes.map((enemy) => enemy.id));
  for (const id of ["fsm_smart_tracker", "fsm_smart_aligner", "fsm_smart_evader"]) {
    assert(enemies.has(id), `expected test enemy ${id}`);
  }
}

function assertMovementGrouping(): void {
  const groups = buildMovementGroups();
  assert(groups.smart.track.includes("smart.track.soft"), "smart.track.soft must appear under Smart/Track");
  assert(groups.smart.track.includes("smart.track.aggressive"), "smart.track.aggressive must appear under Smart/Track");
  assert(groups.smart.align.includes("smart.align.attack"), "smart.align.attack must appear under Smart/Align");
  assert(groups.smart.evade.includes("smart.evade.axis"), "smart.evade.axis must appear under Smart/Evade");
  assert(groups.dumb.straight.includes("straight.basic"), "Dumb straight presets must remain under Dumb");
  assert(getPrimitiveFromPresetId("smart.track.soft") === "track", "smart primitive extraction must skip class prefix");
  assert(getPrimitiveFromPresetId("straight.basic") === "straight", "dumb primitive extraction must use first segment");
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
assertSmartBehaviors();
assertMissingPlayerFallbacks();
assertEvadeCooldown();
assertSmartFsmContent();
assertMovementGrouping();
assertDevSummonerPayload();
console.log("[MovementPresetNormalization] ok");
