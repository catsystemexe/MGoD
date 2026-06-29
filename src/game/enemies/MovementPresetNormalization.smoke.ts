import { CONTENT, BEHAVIOR_GRAPHS } from "../content/CONTENT";
import { EnemyBehaviorDB } from "./EnemyBehaviorDB";
import { EnemyBehaviorPresets } from "./EnemyBehaviorPresets";
import { straightBehavior } from "./behaviors/straight";
import { sineBehavior } from "./behaviors/sine";
import { loopBehavior } from "./behaviors/loop";
import { trackBehavior } from "./behaviors/track";
import { alignBehavior } from "./behaviors/align";
import { evadeBehavior } from "./behaviors/evade";
import { rangeBehavior } from "./behaviors/range";
import { orbitTargetBehavior } from "./behaviors/orbitTarget";
import { buildMovementGroups, createDevSummonerGroupSpawnPayload, createDevSummonerSpawnPayload, getPrimitiveFromPresetId, groupFormationSelectOptions, normalizeGroupCount, normalizeGroupStepperValue, stepGroupCount, stepGroupParamValue } from "../../dev/DevSummoner";
import { ENEMY_GROUP_COHESION_IDS, ENEMY_GROUP_FORMATION_IDS } from "./EnemyGroups";
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
    "smart.range.close",
    "smart.range.medium",
    "smart.range.far",
    "smart.orbit.half",
    "smart.orbit.repeat",
    "smart.orbit.wide",
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

function angleFromPlayer(target: { x: number; y: number }, playerY: number): number {
  return Math.atan2(target.y - playerY, target.x - 40);
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

function initSmart(behavior: typeof trackBehavior, params: Record<string, unknown>, y = 50, spawnOrdinal = 0, x = 100) {
  const ent: any = { pos: { x, y }, behavior: params, bState: { t: 0 }, spawnOrdinal };
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
  assert(EnemyBehaviorDB.range === rangeBehavior, "range behavior ID must be registered");
  assert(EnemyBehaviorDB.orbitTarget === orbitTargetBehavior, "orbitTarget behavior ID must be registered");

  const soft = EnemyBehaviorPresets["smart.track.soft"];
  const aggressive = EnemyBehaviorPresets["smart.track.aggressive"];
  const align = EnemyBehaviorPresets["smart.align.attack"];
  const evade = EnemyBehaviorPresets["smart.evade.axis"];
  const rangeClose = EnemyBehaviorPresets["smart.range.close"];
  const rangeMedium = EnemyBehaviorPresets["smart.range.medium"];
  const rangeFar = EnemyBehaviorPresets["smart.range.far"];
  const orbitHalf = EnemyBehaviorPresets["smart.orbit.half"];
  const orbitRepeat = EnemyBehaviorPresets["smart.orbit.repeat"];
  const orbitWide = EnemyBehaviorPresets["smart.orbit.wide"];
  assert(soft?.behaviorId === "track", "smart.track.soft must use track behavior");
  assert(aggressive?.behaviorId === "track", "smart.track.aggressive must use track behavior");
  assert(align?.behaviorId === "align", "smart.align.attack must use align behavior");
  assert(evade?.behaviorId === "evade", "smart.evade.axis must use evade behavior");
  assert(rangeClose?.behaviorId === "range", "smart.range.close must use range behavior");
  assert(rangeMedium?.behaviorId === "range", "smart.range.medium must use range behavior");
  assert(rangeFar?.behaviorId === "range", "smart.range.far must use range behavior");
  assert(orbitHalf?.behaviorId === "orbitTarget", "smart.orbit.half must use orbitTarget behavior");
  assert(orbitRepeat?.behaviorId === "orbitTarget", "smart.orbit.repeat must use orbitTarget behavior");
  assert(orbitWide?.behaviorId === "orbitTarget", "smart.orbit.wide must use orbitTarget behavior");

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



  const tooFar = initSmart(rangeBehavior, rangeMedium.params, 100, 0, 500);
  const farTarget = stepSmart(rangeBehavior, tooFar, 1 / 60, 100);
  assert(farTarget.x < 500, "range.medium too-far enemy must move toward player");
  assert(Math.abs(farTarget.x - 500) <= Number(rangeMedium.params.maxSpeed) / 60 + 0.00001, "range correction must be bounded");

  const tooClose = initSmart(rangeBehavior, rangeClose.params, 100, 0, 45);
  const closeTarget = stepSmart(rangeBehavior, tooClose, 1 / 60, 100);
  assert(closeTarget.x > 45, "range.close too-close enemy must move away from player");

  const stable = initSmart(rangeBehavior, rangeMedium.params, 100, 0, 40 + Number(rangeMedium.params.preferredDistance));
  const stableTarget = stepSmart(rangeBehavior, stable, 1 / 60, 100);
  approx(stableTarget.x, stable.pos.x);

  const overlapA = initSmart(rangeBehavior, rangeClose.params, 100, 2, 40);
  const overlapB = initSmart(rangeBehavior, rangeClose.params, 100, 2, 40);
  const overlapTargetA = stepSmart(rangeBehavior, overlapA, 1 / 60, 100);
  const overlapTargetB = stepSmart(rangeBehavior, overlapB, 1 / 60, 100);
  assert(overlapTargetA.x > 40, "range overlap must use deterministic fallback direction");
  approx(overlapTargetA.x, overlapTargetB.x, 0.00001);
  approx(overlapTargetA.y, overlapTargetB.y, 0.00001);

  const rangeMissing = initSmart(rangeBehavior, rangeFar.params, 120, 0, 300);
  const rangeMissingTarget = stepSmart(rangeBehavior, rangeMissing, 1 / 60, null);
  assertFiniteTarget(rangeMissingTarget, "range null-player fallback");

  const orbitInit = initSmart(orbitTargetBehavior, orbitRepeat.params, 120, 0, 260);
  const orbitInitialTarget = stepSmart(orbitTargetBehavior, orbitInit, 0, 120);
  approx(orbitInitialTarget.x, 260, 0.00001);
  approx(orbitInitialTarget.y, 120, 0.00001);

  assert(orbitHalf.params.pingPong === true, "orbit.half must request ping-pong half arcs");
  assert(Number(orbitHalf.params.arcCenterAngle) === 0, "orbit.half must center its arc in front of the player");
  assert(Number(orbitHalf.params.angularSpeed) === 1.1, "orbit.half angular speed must be exactly half of the prior 2.2");
  assert(Number(orbitHalf.params.radiusX) >= 180, "orbit.half radiusX must be visibly outside the ship");
  assert(Number(orbitHalf.params.radiusY) >= 120, "orbit.half radiusY must be visibly outside the ship");
  const halfDuration = Number(orbitHalf.params.arcRadians) / Number(orbitHalf.params.angularSpeed);
  const half = initSmart(orbitTargetBehavior, orbitHalf.params, 120, 0, 260);
  stepSmart(orbitTargetBehavior, half, 0, 120);
  const halfEnd = stepSmart(orbitTargetBehavior, half, halfDuration / 2, 120);
  const halfAfterReverse = stepSmart(orbitTargetBehavior, half, 1 / 60, 120);
  const halfMid = stepSmart(orbitTargetBehavior, half, halfDuration / 2 - 1 / 60, 120);
  const halfReturn = stepSmart(orbitTargetBehavior, half, halfDuration / 2, 120);
  const halfRepeatStart = stepSmart(orbitTargetBehavior, half, 1 / 60, 120);
  assertFiniteTarget(halfMid, "orbit half midpoint");
  assertFiniteTarget(halfEnd, "orbit half completed");
  assert(halfMid.x > 40 + Number(orbitHalf.params.radiusX) * 0.8, "orbit half midpoint must be directly in front of the player");
  approx(halfMid.y, 120, 0.00001);
  assert(halfEnd.x >= 40 - 0.00001, "orbit half terminal must not cross behind the player");
  approx(halfEnd.x, 40, 0.00001);
  assert(Math.abs(halfEnd.y - 120) > Number(orbitHalf.params.radiusY) * 0.8, "orbit half terminal must be above or below the player");
  assert(halfAfterReverse.x > halfEnd.x, "orbit half must reverse direction after the front-arc terminal point");
  assert(Math.hypot(halfAfterReverse.x - halfEnd.x, halfAfterReverse.y - halfEnd.y) < 12, "orbit half reversal must remain position-continuous");
  assert(halfReturn.x >= 40 - 0.00001, "orbit half return must stay in the player-front half-plane");
  assert(Math.abs(halfReturn.y - 120) > Number(orbitHalf.params.radiusY) * 0.8, "orbit half return terminal must be above or below the player");
  assert(Math.hypot(halfReturn.x - halfRepeatStart.x, halfReturn.y - halfRepeatStart.y) < 20, "orbit half repeated cycles must not snap");
  for (const target of [halfMid, halfEnd, halfAfterReverse, halfReturn, halfRepeatStart]) {
    assert(target.x >= 40 - 0.00001, "orbit half target must remain in the player-front half-plane");
    assert(angleFromPlayer(target, 120) >= -Math.PI / 2 - 0.00001, "orbit half target angle must not pass below the front arc");
    assert(angleFromPlayer(target, 120) <= Math.PI / 2 + 0.00001, "orbit half target angle must not pass above the front arc");
  }
  const halfBehind = initSmart(orbitTargetBehavior, orbitHalf.params, 120, 0, -60);
  const halfBehindInitial = stepSmart(orbitTargetBehavior, halfBehind, 0, 120);
  const halfBehindFirst = stepSmart(orbitTargetBehavior, halfBehind, 1 / 60, 120);
  const halfBehindSecond = stepSmart(orbitTargetBehavior, halfBehind, 1 / 60, 120);
  assertFiniteTarget(halfBehindFirst, "orbit half behind-player first target");
  assert(halfBehindInitial.x < 40, "orbit half behind-player setup must start behind the player");
  assert(halfBehindFirst.x >= halfBehindInitial.x, "orbit half behind-player entry must move toward the front arc");
  assert(Math.hypot(halfBehindFirst.x - halfBehindInitial.x, halfBehindFirst.y - halfBehindInitial.y) < 45, "orbit half behind-player first step must be bounded");
  assert(Math.hypot(halfBehindSecond.x - halfBehindFirst.x, halfBehindSecond.y - halfBehindFirst.y) < 45, "orbit half behind-player second step must remain continuous");


  assert(Number(orbitRepeat.params.radiusX) === 220, "orbit.repeat radiusX must be approximately 2x the prior 110");
  assert(Number(orbitRepeat.params.radiusY) === 144, "orbit.repeat radiusY must be approximately 2x the prior 72");
  const repeatDuration = Number(orbitRepeat.params.arcRadians) / Number(orbitRepeat.params.angularSpeed);
  const repeatOne = initSmart(orbitTargetBehavior, orbitRepeat.params, 120, 0, 40 + Number(orbitRepeat.params.radiusX));
  stepSmart(orbitTargetBehavior, repeatOne, 0, 120);
  const repeatOneCycle = stepSmart(orbitTargetBehavior, repeatOne, repeatDuration, 180);
  assertFiniteTarget(repeatOneCycle, "orbit repeat one cycle");

  const repeatMany = initSmart(orbitTargetBehavior, orbitRepeat.params, 120, 0, 40 + Number(orbitRepeat.params.radiusX));
  stepSmart(orbitTargetBehavior, repeatMany, 0, 120);
  const repeatManyCycles = stepSmart(orbitTargetBehavior, repeatMany, repeatDuration * 5, 180);
  assertFiniteTarget(repeatManyCycles, "orbit repeat many cycles");
  approx(repeatOneCycle.x - 40, repeatManyCycles.x - 40, 0.00001);
  approx(repeatOneCycle.y - 180, repeatManyCycles.y - 180, 0.00001);

  const moving = initSmart(orbitTargetBehavior, orbitRepeat.params, 120, 0, 260);
  stepSmart(orbitTargetBehavior, moving, 0, 120);
  const beforeMove = stepSmart(orbitTargetBehavior, moving, 1 / 60, 120);
  const afterMove = stepSmart(orbitTargetBehavior, moving, 1 / 60, 180);
  assert(afterMove.y > beforeMove.y, "moving player must translate orbit center");

  assert(Number(orbitWide.params.radiusX) > Number(orbitRepeat.params.radiusX) + 80, "orbit.wide radius must be visibly larger than repeat");
  assert(Number(orbitWide.params.centerResponse) > 0, "orbit.wide must configure delayed center tracking");
  assert(Number(orbitWide.params.maxCenterSpeed) > 0, "orbit.wide must bound center movement speed");

  const wide = initSmart(orbitTargetBehavior, orbitWide.params, 120, 0, 40 + Number(orbitWide.params.radiusX));
  const wideInitial = stepSmart(orbitTargetBehavior, wide, 0, 120);
  const wideBeforeMove = { x: Number(wide.bState.centerX), y: Number(wide.bState.centerY) };
  const wideMoved = stepSmart(orbitTargetBehavior, wide, 1 / 60, 260);
  const wideAfterMove = { x: Number(wide.bState.centerX), y: Number(wide.bState.centerY) };
  assertFiniteTarget(wideInitial, "orbit wide initial");
  assertFiniteTarget(wideMoved, "orbit wide moved player");
  assert(wideAfterMove.y > wideBeforeMove.y, "orbit.wide center must converge toward moved player");
  assert(wideAfterMove.y < 260, "orbit.wide center must not instantly equal moved player");
  assert(wideAfterMove.y - wideBeforeMove.y <= Number(orbitWide.params.maxCenterSpeed) / 60 + 0.00001, "orbit.wide center movement must be bounded");
  assert(Math.hypot(wideMoved.x - wideInitial.x, wideMoved.y - wideInitial.y) < 20, "orbit.wide moved player target must not spike");
  let laggingWide = wideMoved;
  for (let i = 0; i < 60; i += 1) {
    laggingWide = stepSmart(orbitTargetBehavior, wide, 1 / 60, 320);
  }
  assert(Number(wide.bState.centerY) < 320 - 20, "orbit.wide sustained player movement must create relative lag");
  assert(Math.abs(laggingWide.y - 320) > 20, "orbit.wide target must remain separated from sustained player movement");

  const wideReentryA = initSmart(orbitTargetBehavior, orbitWide.params, 120, 3, 40 + Number(orbitWide.params.radiusX));
  const wideReentryB = initSmart(orbitTargetBehavior, orbitWide.params, 120, 3, 40 + Number(orbitWide.params.radiusX));
  const wideReentryInitialA = stepSmart(orbitTargetBehavior, wideReentryA, 0, 120);
  const wideReentryInitialB = stepSmart(orbitTargetBehavior, wideReentryB, 0, 120);
  const wideReentryMovedA = stepSmart(orbitTargetBehavior, wideReentryA, 1 / 60, 260);
  const wideReentryMovedB = stepSmart(orbitTargetBehavior, wideReentryB, 1 / 60, 260);
  approx(wideReentryInitialA.x, wideReentryInitialB.x, 0.00001);
  approx(wideReentryInitialA.y, wideReentryInitialB.y, 0.00001);
  approx(wideReentryMovedA.x, wideReentryMovedB.x, 0.00001);
  approx(wideReentryMovedA.y, wideReentryMovedB.y, 0.00001);

  const wideMissing = initSmart(orbitTargetBehavior, orbitWide.params, 140, 0, 260);
  const wideMissingTarget = stepSmart(orbitTargetBehavior, wideMissing, 1 / 60, null);
  assertFiniteTarget(wideMissingTarget, "orbit wide null-player fallback");

  const cwParams = { ...orbitRepeat.params, direction: 1 };
  const ccwParams = { ...orbitRepeat.params, direction: -1 };
  const cw = initSmart(orbitTargetBehavior, cwParams, 120, 0, 260);
  const ccw = initSmart(orbitTargetBehavior, ccwParams, 120, 0, 260);
  stepSmart(orbitTargetBehavior, cw, 0, 120);
  stepSmart(orbitTargetBehavior, ccw, 0, 120);
  const cwTarget = stepSmart(orbitTargetBehavior, cw, 0.25, 120);
  const ccwTarget = stepSmart(orbitTargetBehavior, ccw, 0.25, 120);
  assert(cwTarget.y > 120 && ccwTarget.y < 120, "orbit directions must diverge deterministically");

  const orbitMissing = initSmart(orbitTargetBehavior, orbitRepeat.params, 140, 0, 260);
  const orbitMissingTarget = stepSmart(orbitTargetBehavior, orbitMissing, 1 / 60, null);
  assertFiniteTarget(orbitMissingTarget, "orbit null-player fallback");

  const overlapOrbitA = initSmart(orbitTargetBehavior, orbitRepeat.params, 120, 4, 40);
  const overlapOrbitB = initSmart(orbitTargetBehavior, orbitRepeat.params, 120, 4, 40);
  const overlapInitialA = stepSmart(orbitTargetBehavior, overlapOrbitA, 0, 120);
  const overlapInitialB = stepSmart(orbitTargetBehavior, overlapOrbitB, 0, 120);
  approx(overlapInitialA.x, 40, 0.00001);
  approx(overlapInitialA.y, 120, 0.00001);
  approx(overlapInitialA.x, overlapInitialB.x, 0.00001);
  approx(overlapInitialA.y, overlapInitialB.y, 0.00001);
  const overlapFirstA = stepSmart(orbitTargetBehavior, overlapOrbitA, 1 / 60, 120);
  const overlapFirstB = stepSmart(orbitTargetBehavior, overlapOrbitB, 1 / 60, 120);
  assertFiniteTarget(overlapFirstA, "orbit overlap first target");
  const overlapStep = Math.hypot(overlapFirstA.x - overlapInitialA.x, overlapFirstA.y - overlapInitialA.y);
  assert(overlapStep <= Number(orbitRepeat.params.maxRadialSpeed) / 60 * 2, "orbit overlap first step must be bounded by radial convergence");
  assert(overlapStep < Number(orbitRepeat.params.radiusX) * 0.25, "orbit overlap first step must not jump to configured radius");
  approx(overlapFirstA.x, overlapFirstB.x, 0.00001);
  approx(overlapFirstA.y, overlapFirstB.y, 0.00001);

  const rangeReentryA = initSmart(rangeBehavior, rangeMedium.params, 100, 1, 500);
  const rangeReentryB = initSmart(rangeBehavior, rangeMedium.params, 100, 1, 500);
  const rangeReentryTargetA = stepSmart(rangeBehavior, rangeReentryA, 1 / 60, 100);
  const rangeReentryTargetB = stepSmart(rangeBehavior, rangeReentryB, 1 / 60, 100);
  approx(rangeReentryTargetA.x, rangeReentryTargetB.x, 0.00001);
  approx(rangeReentryTargetA.y, rangeReentryTargetB.y, 0.00001);

  const orbitReentryA = initSmart(orbitTargetBehavior, orbitRepeat.params, 120, 1, 260);
  const orbitReentryB = initSmart(orbitTargetBehavior, orbitRepeat.params, 120, 1, 260);
  const orbitReentryInitialA = stepSmart(orbitTargetBehavior, orbitReentryA, 0, 120);
  const orbitReentryInitialB = stepSmart(orbitTargetBehavior, orbitReentryB, 0, 120);
  const orbitReentryTargetA = stepSmart(orbitTargetBehavior, orbitReentryA, 1 / 60, 120);
  const orbitReentryTargetB = stepSmart(orbitTargetBehavior, orbitReentryB, 1 / 60, 120);
  approx(orbitReentryInitialA.x, orbitReentryInitialB.x, 0.00001);
  approx(orbitReentryInitialA.y, orbitReentryInitialB.y, 0.00001);
  approx(orbitReentryTargetA.x, orbitReentryTargetB.x, 0.00001);
  approx(orbitReentryTargetA.y, orbitReentryTargetB.y, 0.00001);

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
  for (const id of ["fsm.smart_tracker", "fsm.smart_aligner", "fsm.smart_evader", "fsm.smart_ranger", "fsm.smart_orbit_half", "fsm.smart_orbit_repeat"]) {
    assert(BEHAVIOR_GRAPHS[id], `expected test FSM graph ${id}`);
  }
  const enemies = new Set(CONTENT.enemyTypes.map((enemy) => enemy.id));
  for (const id of ["fsm_smart_tracker", "fsm_smart_aligner", "fsm_smart_evader", "fsm_smart_ranger", "fsm_smart_orbit_half", "fsm_smart_orbit_repeat"]) {
    assert(enemies.has(id), `expected test enemy ${id}`);
  }
}

function assertMovementGrouping(): void {
  const groups = buildMovementGroups();
  assert(groups.smart.track.includes("smart.track.soft"), "smart.track.soft must appear under Smart/Track");
  assert(groups.smart.track.includes("smart.track.aggressive"), "smart.track.aggressive must appear under Smart/Track");
  assert(groups.smart.align.includes("smart.align.attack"), "smart.align.attack must appear under Smart/Align");
  assert(groups.smart.evade.includes("smart.evade.axis"), "smart.evade.axis must appear under Smart/Evade");
  assert(groups.smart.range.includes("smart.range.close"), "smart.range.close must appear under Smart/Range");
  assert(groups.smart.orbit.includes("smart.orbit.repeat"), "smart.orbit.repeat must appear under Smart/Orbit");
  assert(groups.dumb.straight.includes("straight.basic"), "Dumb straight presets must remain under Dumb");
  assert(getPrimitiveFromPresetId("smart.track.soft") === "track", "smart primitive extraction must skip class prefix");
  assert(getPrimitiveFromPresetId("smart.orbit.repeat") === "orbit", "smart orbit primitive extraction must use orbit UI label");
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

function assertDevSummonerGroupPayload(): void {
  assert(normalizeGroupCount(-1) === 2, "group count must clamp low values");
  assert(normalizeGroupCount(11.9) === 10, "group count must clamp high values and floor decimals");
  assert(normalizeGroupCount("bad") === 5, "group count must default invalid values to 5");
  assert(normalizeGroupCount(undefined) === 5, "group count must default to 5");
  assert(stepGroupCount(5, -1) === 4, "group count decrement must step down by one");
  assert(stepGroupCount(5, 1) === 6, "group count increment must step up by one");
  assert(stepGroupCount(2, -1) === 2, "group count decrement must clamp at 2");
  assert(stepGroupCount(10, 1) === 10, "group count increment must clamp at 10");
  assert(normalizeGroupStepperValue("spacing", -1) === 16, "space stepper clamps low values");
  assert(stepGroupParamValue("spacing", 96, 1) === 96, "space stepper clamps high values");
  assert(normalizeGroupStepperValue("depth", Number.NaN) === 18, "depth stepper defaults invalid values");
  assert(stepGroupParamValue("depth", 8, -1) === 8, "depth stepper clamps at min");
  assert(normalizeGroupStepperValue("radius", -1) === 12, "radius stepper clamps low values");
  assert(stepGroupParamValue("radius", 140, 1) === 140, "radius stepper clamps high values");
  assert(normalizeGroupStepperValue("angle", Number.POSITIVE_INFINITY) === 100, "angle stepper defaults invalid values");
  assert(stepGroupParamValue("angle", 20, -1) === 20, "angle stepper clamps at min");
  assert(normalizeGroupStepperValue("startAngle" as any, -90) === 270, "start angle stepper wraps negative degrees");
  assert(stepGroupParamValue("startAngle" as any, 350, 1) === 5, "start angle stepper wraps above 360 degrees");
  assert(normalizeGroupStepperValue("response", 99) === 20, "tight stepper clamps high values");
  assert(stepGroupParamValue("response", 1, -1) === 1, "tight stepper clamps at min");
  assert(normalizeGroupStepperValue("maxCatchupSpeed", undefined, "elastic") === 260, "elastic catch stepper uses elastic default");
  assert(stepGroupParamValue("maxCatchupSpeed", 80, -1, "rigid") === 80, "catch stepper clamps at min");
  assert(ENEMY_GROUP_FORMATION_IDS.join(",") === "line.horizontal,wedge,column.vertical,arc.forward,ring", "group formation options must match canonical IDs");
  assert(ENEMY_GROUP_COHESION_IDS.join(",") === "rigid,elastic", "group cohesion options must match foundation IDs");
  const formationOptions = groupFormationSelectOptions();
  assert(formationOptions.find((option) => option.label === "Line")?.value === "line.horizontal", "visible Line option must emit line.horizontal");
  assert(formationOptions.find((option) => option.label === "Column")?.value === "column.vertical", "visible Column option must emit column.vertical");
  assert(!formationOptions.some((option) => option.value === "wedge.left" || option.value === "wedge.right" || option.value === "arc.backward" || option.value === "ring.rotated"), "formation variants must not add new canonical IDs");

  const payload = createDevSummonerGroupSpawnPayload({
    enemyTypeId: "red",
    count: "6.8",
    anchorX: 856,
    anchorY: 260,
    formationId: "wedge",
    movementPresetId: "smart.track.soft",
    cohesionId: "elastic",
    params: { formation: { spacing: 35.5, depth: 999, radius: 999, angle: 5, facing: "right", startAngle: 450 }, cohesion: { response: -4, maxCatchupSpeed: 100 } },
  });
  assert(payload, "valid group payload must be constructed");
  assert(payload.enemyTypeId === "red", "group payload must include canonical enemy type");
  assert(payload.count === 6, "group payload must normalize count");
  assert(payload.anchor.x === 856 && payload.anchor.y === 260, "group payload must include finite anchor");
  assert(payload.formationId === "wedge", "group payload must include canonical formation ID");
  assert(payload.movementPresetId === "smart.track.soft", "group payload must include anchor movement preset ID");
  assert(payload.cohesionId === "elastic", "group payload must include canonical cohesion ID");
  assert(payload.params?.formation?.spacing === 35.5, "group payload must preserve valid normalized spacing override");
  assert(payload.params?.formation?.depth === 80, "group payload must clamp depth override");
  assert(payload.params?.formation?.radius === 140, "group payload must clamp radius override");
  assert(payload.params?.formation?.angle === 20, "group payload must clamp angle override");
  assert(payload.params?.formation?.facing === "right", "visible Wedge Right/Arc Backward values map to canonical right");
  assert(payload.params?.formation?.startAngle === 90, "Ring Start is emitted and normalized in degrees");
  assert(payload.params?.cohesion?.response === 1, "group payload must clamp tight override");
  assert(payload.params?.cohesion?.maxCatchupSpeed === 100, "group payload must preserve valid catch override");
  assert(!(payload as any).behaviorPresetId, "grouped members must not receive an independent behavior preset from UI payload");

  assert(createDevSummonerGroupSpawnPayload({ enemyTypeId: "missing", count: 5, anchorX: 1, anchorY: 2, formationId: "wedge", movementPresetId: "straight.basic", cohesionId: "rigid" }) === null, "invalid enemy type must not emit group payload");
  assert(createDevSummonerGroupSpawnPayload({ enemyTypeId: "red", count: 5, anchorX: Number.NaN, anchorY: 2, formationId: "wedge", movementPresetId: "straight.basic", cohesionId: "rigid" }) === null, "invalid anchor must not emit group payload");
  assert(createDevSummonerGroupSpawnPayload({ enemyTypeId: "red", count: 5, anchorX: 1, anchorY: 2, formationId: "grid", movementPresetId: "straight.basic", cohesionId: "rigid" }) === null, "invalid formation must not emit group payload");
  assert(createDevSummonerGroupSpawnPayload({ enemyTypeId: "red", count: 5, anchorX: 1, anchorY: 2, formationId: "wedge", movementPresetId: "missing", cohesionId: "rigid" }) === null, "invalid movement preset must not emit group payload");
  assert(createDevSummonerGroupSpawnPayload({ enemyTypeId: "red", count: 5, anchorX: 1, anchorY: 2, formationId: "wedge", movementPresetId: "straight.basic", cohesionId: "loose" }) === null, "invalid cohesion must not emit group payload");
  const linePayload = createDevSummonerGroupSpawnPayload({ enemyTypeId: "red", count: 5, anchorX: 1, anchorY: 2, formationId: "line.horizontal", movementPresetId: "straight.basic", cohesionId: "rigid", params: { formation: { depth: 40 } } });
  assert(linePayload?.formationId === "line.horizontal", "group payload preserves line.horizontal");
  assert(linePayload?.params?.formation?.depth === 40, "line mode may carry normalized depth without making it a geometry dependency");
  const columnPayload = createDevSummonerGroupSpawnPayload({ enemyTypeId: "red", count: 5, anchorX: 1, anchorY: 2, formationId: "column.vertical", movementPresetId: "straight.basic", cohesionId: "rigid" });
  assert(columnPayload?.formationId === "column.vertical", "group payload preserves column.vertical");
  const enemyPayload = createDevSummonerSpawnPayload({ typeId: "red", spawnX: 1, spawnY: 2, behaviorPresetId: "straight.basic", devManualSpawnId: 7 });
  assert(!(enemyPayload as any).params, "Enemy mode payload remains unchanged by group params");
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
assertDevSummonerGroupPayload();
console.log("[MovementPresetNormalization] ok");
