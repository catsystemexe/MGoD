import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { PlayerActions } from "../../engine/input/ActionSchema";

import { WeaponSystem } from "./WeaponSystem";
import { WEAPON_DB } from "../defs/WeaponDB";
import {
  ACTIVE_W1_WEAPON_ID,
  ACTIVE_W2_WEAPON_ID,
  WEAPONS_MVP,
  resolveEffectiveWeaponSpec,
  resolveWeaponDefinition,
  type WeaponInstance,
} from "../defs/Weapons";

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

function drainNextSimulation(bus: EventBus<CMEventMap>, tick: number) {
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();
  bus.beginTick(tick);
  bus.enterPhase(Phase.Simulation);
  return bus.drainPhase(Phase.Simulation);
}

function main() {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  let laserStarts = 0;
  let laserEnds = 0;
  let bombConsumes = 0;
  const ws = new WeaponSystem(
    bus,
    WEAPONS_MVP,
    WEAPON_DB,
    { scrollX: 0, scrollY: 0 },
    {
      onConsumeBomb: () => { bombConsumes++; },
      onLaserStart: () => { laserStarts++; },
      onLaserEnd: () => { laserEnds++; },
    },
  );

  const shipRef: EntityRef = { slot: 1, gen: 1 };
  const shipPos = { x: 100, y: 50 };
  const snap = { shipPos, shipRef, bombs: 1 };

  const w1Def = resolveWeaponDefinition(ACTIVE_W1_WEAPON_ID, WEAPON_DB);
  const w2Def = resolveWeaponDefinition(ACTIVE_W2_WEAPON_ID, WEAPON_DB);
  assert(w1Def.fireKind === "projectile", "active W1 must be projectile");
  assert(w2Def.fireKind === "beam", "active W2 must be beam");
  assert(!Object.prototype.hasOwnProperty.call(WEAPON_DB, "w2.basic"), "unused projectile-style w2.basic must be absent");
  assert(WEAPONS_MVP.primary === ACTIVE_W1_WEAPON_ID, "primary slot ID must be w1.basic");
  assert(WEAPONS_MVP.secondary === ACTIVE_W2_WEAPON_ID, "secondary slot ID must be canonical laser ID");
  assert(approx(w1Def.cooldownSec, 0.12), "W1 cooldown must remain 0.12");
  assert(w1Def.projectile?.damage === 3, "W1 damage must remain 3");
  assert(w1Def.projectile?.speed === 1100, "W1 speed must remain 1100");
  assert(w1Def.projectile?.ttlSec === 3, "W1 TTL must remain 3");
  assert(w1Def.projectile?.radius === 5, "W1 radius must remain 5");
  assert(approx(w2Def.cooldownSec, 10.0), "W2 cooldown must remain 10.0");
  assert(approx(w2Def.beam?.durationSec ?? 0, 5.0), "W2 duration must remain 5.0");
  assert(w2Def.beam?.damage === 15, "W2 damage must remain 15");
  assert(approx(w2Def.beam?.hitIntervalSec ?? 0, 0.08), "W2 hit interval must remain 0.08");

  const effectiveW1 = resolveEffectiveWeaponSpec({ slot: "w1", weaponId: ACTIVE_W1_WEAPON_ID, level: 1, cooldownRemainingSec: 0, active: false } satisfies WeaponInstance, WEAPON_DB);
  assert(effectiveW1.projectile !== w1Def.projectile, "effective projectile spec must be copied");

  let snapshot = ws.getSnapshot();
  assert(snapshot.slots.w1.weaponId === ACTIVE_W1_WEAPON_ID, "snapshot W1 ID must be w1.basic");
  assert(snapshot.slots.w2.weaponId === ACTIVE_W2_WEAPON_ID, "snapshot W2 ID must be w2.laser");
  assert(snapshot.slots.w1.level === 1 && snapshot.slots.w2.level === 1, "both weapon levels must start at 1");
  assert(snapshot.slots.w1.fireKind === "projectile", "snapshot W1 fire kind must be projectile");
  assert(snapshot.slots.w2.fireKind === "beam", "snapshot W2 fire kind must be beam");

  // Mutating a returned snapshot must not corrupt internal runtime state.
  snapshot.slots.w1.weaponId = "mutated";
  snapshot.slots.w1.level = 99;
  snapshot = ws.getSnapshot();
  assert(snapshot.slots.w1.weaponId === ACTIVE_W1_WEAPON_ID, "snapshot mutation must not change internal W1 ID");
  assert(snapshot.slots.w1.level === 1, "snapshot mutation must not change internal W1 level");

  // TICK 0: held primary fires one next-tick projectile; secondary starts laser without projectile.
  bus.beginTick(0);
  bus.enterPhase(Phase.Simulation);
  ws.update(0.016, actions({ firePrimary: true, fireSecondary: true }), snap);
  snapshot = ws.getSnapshot();
  assert(snapshot.slots.w1.cooldownRemainingSec > 0, "W1 cooldown should be active after firing");
  assert(snapshot.slots.w2.active, "right-button hold should start W2 laser");
  assert(approx(snapshot.slots.w2.charge01, 1), "W2 charge should start full while laser begins");
  assert(laserStarts === 1, "laser start callback should fire once");
  const tick1 = drainNextSimulation(bus, 1);
  const tick1Projectiles = tick1.filter((e) => e.type === EventType.SPAWN_PROJECTILE);
  assert(tick1Projectiles.length === 1, "held primary should emit exactly one next-tick projectile");
  assert((tick1Projectiles[0] as any).payload.weaponTypeId === ACTIVE_W1_WEAPON_ID, "projectile event must use weaponTypeId w1.basic");

  // Hold primary through the old 0.12s cadence: seven 16ms updates do not fire; the eighth does.
  for (let i = 0; i < 7; i++) {
    ws.update(0.016, actions({ firePrimary: true, fireSecondary: true }), snap);
  }
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();
  bus.beginTick(2);
  bus.enterPhase(Phase.Simulation);
  assert(bus.drainPhase(Phase.Simulation).filter((e) => e.type === EventType.SPAWN_PROJECTILE).length === 0, "W1 should not fire before 0.12s cooldown elapses");

  ws.update(0.016, actions({ firePrimary: true, fireSecondary: true }), snap);
  const tick3 = drainNextSimulation(bus, 3);
  assert(tick3.filter((e) => e.type === EventType.SPAWN_PROJECTILE).length === 1, "W1 should fire again on the old 0.12s cadence");
  assert(ws.getSnapshot().slots.w2.active, "W2 active state must be independent of W1 cooldown");

  // Release secondary: laser ends immediately and enters the old 10s recharge; W2 never emits projectiles.
  ws.update(0.016, actions({ fireSecondary: false }), snap);
  snapshot = ws.getSnapshot();
  assert(!snapshot.slots.w2.active, "W2 release should end laser immediately");
  assert(snapshot.slots.w2.cooldownRemainingSec > 9.9, "W2 release should start 10s recharge");
  assert(laserEnds === 1, "laser end callback should fire once on release");
  const tick4 = drainNextSimulation(bus, 4);
  assert(tick4.filter((e) => e.type === EventType.SPAWN_PROJECTILE).length === 0, "W2 laser must not emit SPAWN_PROJECTILE");

  // Recharge fill remains old behavior: halfway after 5 seconds, ready after 10 seconds.
  ws.update(5.0, actions(), snap);
  assert(approx(ws.getSnapshot().slots.w2.charge01, 0.5), "W2 recharge should be half full after 5 seconds");
  ws.update(5.0, actions(), snap);
  assert(approx(ws.getSnapshot().slots.w2.charge01, 1), "W2 recharge should be full after 10 seconds");

  // Depletion ends the beam and starts recharge without converting W2 into a projectile.
  ws.update(0.016, actions({ fireSecondary: true }), snap);
  assert(ws.getSnapshot().slots.w2.active, "W2 should restart after recharge");
  ws.update(5.0, actions({ fireSecondary: true }), snap);
  assert(!ws.getSnapshot().slots.w2.active, "W2 should end after 5s duration depletion");
  assert(laserEnds === 2, "laser end callback should fire on depletion");

  // Bomb compatibility: inventory-gated bomb path still emits SPAWN_BOMB and consumes inventory callback.
  ws.update(10.0, actions(), snap);
  ws.update(0.016, actions({ bombPressed: true, bombTarget: { x: 123, y: 77 } }), snap);
  const tick5 = drainNextSimulation(bus, 5);
  const bombs = tick5.filter((e) => e.type === EventType.SPAWN_BOMB);
  assert(bombs.length === 1, "bomb path should still emit one SPAWN_BOMB when inventory is present");
  assert(bombConsumes === 1, "bomb path should still call onConsumeBomb once");
  assert((bombs[0] as any).payload.target.x === 123 && (bombs[0] as any).payload.target.y === 77, "bomb target must remain unchanged");

  console.log("[SMOKE] WeaponSystem OK ✅");
}

main();
