import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { AnyEvent } from "../../engine/core/Loop";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { PlayerActions } from "../../engine/input/ActionSchema";

import { WeaponSystem } from "./WeaponSystem";
import { WEAPON_DB } from "../defs/WeaponDB";
import { WEAPONS_MVP } from "../defs/Weapons";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}

function actions(overrides: Partial<PlayerActions> = {}): PlayerActions {
  return {
    move: { x: 0, y: 0 },
    aimTarget: { x: 0, y: 0 },
    firePrimary: false,
    fireSecondary: false,
    bombPressed: false,
    bombTarget: { x: 0, y: 0 },
    ...overrides,
  };
}

function makeBus(): EventBus<CMEventMap> {
  return new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });
}

const shipRef: EntityRef = { slot: 1, gen: 1 };
const snap = { shipRef, shipPos: { x: 100, y: 50 }, shipVel: { x: 0, y: 0 }, bombs: 1 };

function updateAndDrainNext(
  bus: EventBus<CMEventMap>,
  ws: WeaponSystem,
  tick: number,
  dt: number,
  firePrimary: boolean,
): AnyEvent<CMEventMap>[] {
  bus.beginTick(tick);
  bus.enterPhase(Phase.Simulation);
  ws.update(dt, actions({ firePrimary }), snap);
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();
  bus.beginTick(tick + 1);
  bus.enterPhase(Phase.Simulation);
  return bus.drainPhase(Phase.Simulation) as AnyEvent<CMEventMap>[];
}

function projectileEvents(events: AnyEvent<CMEventMap>[]): AnyEvent<CMEventMap>[] {
  return events.filter((e) => e.type === EventType.SPAWN_PROJECTILE);
}

function eventAngles(events: AnyEvent<CMEventMap>[]): number[] {
  return events.map((e) => {
    const p = (e as any).payload;
    return Math.round(Math.atan2(p.dir.y, p.dir.x) * 180 / Math.PI);
  });
}

function assertProjectileVolley(events: AnyEvent<CMEventMap>[], weaponTypeId: string, level: number, angles: number[]): void {
  assert(events.length === angles.length, `${weaponTypeId} L${level} should emit ${angles.length} projectile events, got ${events.length}`);
  assert(JSON.stringify(eventAngles(events)) === JSON.stringify(angles), `${weaponTypeId} L${level} angles should be ${JSON.stringify(angles)}, got ${JSON.stringify(eventAngles(events))}`);
  for (const e of events) {
    const p = (e as any).payload;
    assert(p.weaponTypeId === weaponTypeId, `projectile event should use weaponTypeId ${weaponTypeId}`);
    assert(p.weaponLevel === level, `projectile event should preserve W1 slot level ${level}`);
    assert(Number.isFinite(p.origin.x) && Number.isFinite(p.origin.y), "projectile event origin should be finite");
    assert(Number.isFinite(p.dir.x) && Number.isFinite(p.dir.y), "projectile event direction should be finite");
    assert(approx(Math.hypot(p.dir.x, p.dir.y), 1), "projectile event direction should be normalized");
  }
}

function assertHeldFireSwitch(level: number, spreadAngles: number[]): void {
  const bus = makeBus();
  const ws = new WeaponSystem(bus, WEAPONS_MVP, WEAPON_DB, { scrollX: 0, scrollY: 0 });
  ws.setLevel("w1", level);

  assert(ws.getSnapshot().slots.w1.weaponId === "w1.basic", "initial active W1 should be Basic");
  const basicEvents = projectileEvents(updateAndDrainNext(bus, ws, 0, 1 / 60, true));
  assertProjectileVolley(basicEvents, "w1.basic", level, new Array(level).fill(0));

  const cooldownBeforeToggle = ws.getSnapshot().slots.w1.cooldownRemainingSec;
  const toggled = ws.toggleW1Weapon();
  const afterToggle = ws.getSnapshot().slots.w1;
  assert(toggled === "w1.spread", "toggleW1Weapon should return w1.spread");
  assert(afterToggle.weaponId === "w1.spread", "snapshot should read w1.spread after toggle");
  assert(afterToggle.level === level, "Basic -> Spread should preserve W1 slot level");
  assert(afterToggle.cooldownRemainingSec > 0 && approx(afterToggle.cooldownRemainingSec, cooldownBeforeToggle), "weapon switch should preserve active cooldown without freezing it");

  const blockedEvents = projectileEvents(updateAndDrainNext(bus, ws, 2, afterToggle.cooldownRemainingSec - 0.001, true));
  assert(blockedEvents.length === 0, "preserved cooldown should still block fire until it expires");
  assert(ws.getSnapshot().slots.w1.weaponId === "w1.spread", "snapshot should still read w1.spread while held fire waits on cooldown");

  const spreadEvents = projectileEvents(updateAndDrainNext(bus, ws, 4, 0.002, true));
  assertProjectileVolley(spreadEvents, "w1.spread", level, spreadAngles);

  ws.toggleW1Weapon();
  const backToBasic = ws.getSnapshot().slots.w1;
  assert(backToBasic.weaponId === "w1.basic", "second toggle should return to Basic");
  assert(backToBasic.level === level, "Spread -> Basic should preserve W1 slot level");

  const basicAgainEvents = projectileEvents(updateAndDrainNext(bus, ws, 6, backToBasic.cooldownRemainingSec + 1 / 60, true));
  assertProjectileVolley(basicAgainEvents, "w1.basic", level, new Array(level).fill(0));
}

function main(): void {
  assertHeldFireSwitch(1, [-15, 15]);
  assertHeldFireSwitch(3, [-45, -30, 30, 45]);
  assertHeldFireSwitch(4, [-45, -30, 0, 30, 45]);
  console.log("[SMOKE] WeaponFireSwitch integration OK ✅");
}

main();
