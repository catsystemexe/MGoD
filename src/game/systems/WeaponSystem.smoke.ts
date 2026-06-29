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

function makeBus(): EventBus<CMEventMap> {
  return new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });
}

function drainNextSimulation(bus: EventBus<CMEventMap>, tick: number) {
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();
  bus.beginTick(tick);
  bus.enterPhase(Phase.Simulation);
  return bus.drainPhase(Phase.Simulation);
}

const shipRef: EntityRef = { slot: 1, gen: 1 };
const shipPos = { x: 100, y: 50 };
const snap = { shipPos, shipRef, bombs: 1 };
const expectedOffsets: Record<number, number[]> = {
  1: [0],
  2: [-5, 5],
  3: [-10, 0, 10],
  4: [-15, -5, 5, 15],
  5: [-20, -10, 0, 10, 20],
};

function makeWeaponSystem(opts: ConstructorParameters<typeof WeaponSystem>[4] = {}) {
  const bus = makeBus();
  const ws = new WeaponSystem(bus, WEAPONS_MVP, WEAPON_DB, { scrollX: 0, scrollY: 0 }, opts);
  return { bus, ws };
}

function assertDefinitionIntegrity(): void {
  const w1Def = resolveWeaponDefinition(ACTIVE_W1_WEAPON_ID, WEAPON_DB);
  const w2Def = resolveWeaponDefinition(ACTIVE_W2_WEAPON_ID, WEAPON_DB);
  assert(w1Def.fireKind === "projectile", "active W1 must be projectile");
  assert(w2Def.fireKind === "beam", "active W2 must be beam");
  assert(!Object.prototype.hasOwnProperty.call(WEAPON_DB, "w2.basic"), "unused projectile-style w2.basic must be absent");
  assert(WEAPONS_MVP.primary === ACTIVE_W1_WEAPON_ID, "primary slot ID must be w1.basic");
  assert(WEAPONS_MVP.secondary === ACTIVE_W2_WEAPON_ID, "secondary slot ID must be canonical laser ID");

  assert(w1Def.levels?.length === 5, "W1 must define exactly five levels");
  assert(w2Def.levels?.length === 5, "W2 must define exactly five levels");
  for (let level = 1; level <= 5; level++) {
    const w1 = resolveEffectiveWeaponSpec({ slot: "w1", weaponId: ACTIVE_W1_WEAPON_ID, level, cooldownRemainingSec: 0, active: false } satisfies WeaponInstance, WEAPON_DB);
    const w2 = resolveEffectiveWeaponSpec({ slot: "w2", weaponId: ACTIVE_W2_WEAPON_ID, level, cooldownRemainingSec: 0, active: false } satisfies WeaponInstance, WEAPON_DB);
    assert(w1.maxLevel === 5 && w2.maxLevel === 5, "max level must be 5");
    assert(w1.projectileCount === level, `W1 L${level} projectile count must equal level`);
    assert(approx(w2.beam?.durationSec ?? 0, level), `W2 L${level} duration must equal level seconds`);
    assert(approx(w1.cooldownSec, 0.12), "W1 cooldown must remain 0.12 at every level");
    assert(w1.projectile?.damage === 3, "W1 damage must remain 3 at every level");
    assert(w1.projectile?.speed === 1100, "W1 speed must remain 1100 at every level");
    assert(w1.projectile?.ttlSec === 3, "W1 TTL must remain 3 at every level");
    assert(w1.projectile?.radius === 5, "W1 radius must remain 5 at every level");
    assert(approx(w2.cooldownSec, 10.0), "W2 cooldown must remain 10.0 at every level");
    assert(w2.beam?.damage === 15, "W2 damage must remain 15 at every level");
    assert(approx(w2.beam?.hitIntervalSec ?? 0, 0.08), "W2 hit interval must remain 0.08 at every level");
  }

  const effectiveW1 = resolveEffectiveWeaponSpec({ slot: "w1", weaponId: ACTIVE_W1_WEAPON_ID, level: 1, cooldownRemainingSec: 0, active: false } satisfies WeaponInstance, WEAPON_DB);
  assert(effectiveW1.projectile !== w1Def.projectile, "effective projectile spec must be copied");
  assert(effectiveW1.levels !== w1Def.levels, "effective level specs must be copied");
}

function assertLevelApi(): void {
  const { ws } = makeWeaponSystem();
  let snapshot = ws.getSnapshot();
  assert(ws.getLevel("w1") === 1 && ws.getLevel("w2") === 1, "both slots must start at level 1");
  assert(ws.getMaxLevel("w1") === 5 && ws.getMaxLevel("w2") === 5, "both active slots must report max level 5");
  assert(snapshot.slots.w1.maxLevel === 5 && snapshot.slots.w2.maxLevel === 5, "snapshot must expose max levels");

  ws.setLevel("w1", 3);
  assert(ws.getLevel("w1") === 3 && ws.getLevel("w2") === 1, "setLevel(w1) must not affect W2");
  ws.setLevel("w2", 4);
  assert(ws.getLevel("w1") === 3 && ws.getLevel("w2") === 4, "setLevel(w2) must not affect W1");
  ws.setLevel("w1", -99);
  ws.setLevel("w2", 99);
  assert(ws.getLevel("w1") === 1, "below-min levels clamp to 1");
  assert(ws.getLevel("w2") === 5, "above-max levels clamp to 5");
  ws.setLevel("w1", 4);
  ws.setLevel("w1", Number.NaN);
  assert(ws.getLevel("w1") === 4, "non-finite level changes must not corrupt current level");
  ws.upgradeSlot("w1");
  assert(ws.getLevel("w1") === 5, "upgradeSlot must increment one level");
  ws.upgradeSlot("w1");
  assert(ws.getLevel("w1") === 5, "upgradeSlot at level 5 must remain level 5");

  snapshot = ws.getSnapshot();
  snapshot.slots.w1.level = 1;
  snapshot.slots.w1.weaponId = "mutated";
  snapshot.slots.w1.projectileCount = 99;
  assert(ws.getLevel("w1") === 5, "snapshot mutation must not change internal W1 level");
  assert(ws.getSnapshot().slots.w1.weaponId === ACTIVE_W1_WEAPON_ID, "snapshot mutation must not change internal W1 ID");
}

function assertW1Firing(): void {
  for (let level = 1; level <= 5; level++) {
    let fireFeedback = 0;
    const { bus, ws } = makeWeaponSystem({ onSpawnProjectile: () => { fireFeedback++; } });
    ws.setLevel("w1", level);
    bus.beginTick(0);
    bus.enterPhase(Phase.Simulation);
    ws.update(0.016, actions({ firePrimary: true }), snap);
    const snapshot = ws.getSnapshot();
    assert(snapshot.slots.w1.projectileCount === level, `W1 L${level} snapshot projectile count must equal level`);
    assert(snapshot.slots.w1.cooldownRemainingSec > 0, `W1 L${level} cooldown should be consumed once`);
    assert(fireFeedback === 1, `W1 L${level} should invoke fire feedback once`);

    const tick1Projectiles = drainNextSimulation(bus, 1).filter((e) => e.type === EventType.SPAWN_PROJECTILE);
    assert(tick1Projectiles.length === level, `W1 L${level} should emit exactly ${level} projectile events`);
    const offsets = tick1Projectiles.map((e) => (e as any).payload.origin.y - shipPos.y);
    assert(JSON.stringify(offsets) === JSON.stringify(expectedOffsets[level]), `W1 L${level} offsets must be ${JSON.stringify(expectedOffsets[level])}`);
    for (const e of tick1Projectiles) {
      const payload = (e as any).payload;
      assert(payload.weaponTypeId === ACTIVE_W1_WEAPON_ID, "projectile event must use weaponTypeId w1.basic");
      assert(approx(payload.dir.x, 1) && approx(payload.dir.y, 0), "all W1 projectiles must keep parallel forward direction");
    }

    for (let i = 0; i < 7; i++) ws.update(0.016, actions({ firePrimary: true }), snap);
    assert(drainNextSimulation(bus, 2).filter((e) => e.type === EventType.SPAWN_PROJECTILE).length === 0, `W1 L${level} must not refire before 0.12s cooldown`);
  }
}

function assertW2Firing(): void {
  for (let level = 1; level <= 5; level++) {
    let laserStarts = 0;
    let laserEnds = 0;
    const { bus, ws } = makeWeaponSystem({
      onLaserStart: () => { laserStarts++; },
      onLaserEnd: () => { laserEnds++; },
    });
    ws.setLevel("w2", level);
    bus.beginTick(0);
    bus.enterPhase(Phase.Simulation);
    ws.update(0.016, actions({ fireSecondary: true }), snap);
    let snapshot = ws.getSnapshot();
    assert(snapshot.slots.w2.active, `W2 L${level} should start active`);
    assert(approx(snapshot.slots.w2.durationSec ?? 0, level), `W2 L${level} active duration must equal level seconds`);
    assert(snapshot.slots.w2.damage === 15, "W2 damage must remain 15");
    assert(approx(snapshot.slots.w2.hitIntervalSec ?? 0, 0.08), "W2 hit interval must remain 0.08");
    assert(approx(snapshot.slots.w2.cooldownTotalSec, 10), "W2 cooldown must remain 10 seconds");
    assert(Number.isFinite(snapshot.slots.w2.charge01) && snapshot.slots.w2.charge01 >= 0 && snapshot.slots.w2.charge01 <= 1, "W2 active charge must remain finite in [0,1]");
    assert(laserStarts === 1, "laser start callback should fire once");
    assert(drainNextSimulation(bus, 1).filter((e) => e.type === EventType.SPAWN_PROJECTILE).length === 0, "W2 laser must not emit SPAWN_PROJECTILE");

    ws.update(0.016, actions({ fireSecondary: false }), snap);
    snapshot = ws.getSnapshot();
    assert(!snapshot.slots.w2.active, "W2 release should end laser immediately");
    assert(snapshot.slots.w2.cooldownRemainingSec > 9.9, "W2 release should start 10s recharge");
    assert(laserEnds === 1, "laser end callback should fire once on release");
    ws.update(5.0, actions(), snap);
    assert(approx(ws.getSnapshot().slots.w2.charge01, 0.5), "W2 recharge should be half full after 5 seconds");
    ws.update(5.0, actions(), snap);
    assert(approx(ws.getSnapshot().slots.w2.charge01, 1), "W2 recharge should be full after 10 seconds");

    ws.update(0.016, actions({ fireSecondary: true }), snap);
    assert(ws.getSnapshot().slots.w2.active, "W2 should restart after recharge");
    ws.update(level, actions({ fireSecondary: true }), snap);
    assert(!ws.getSnapshot().slots.w2.active, `W2 L${level} should end after level-second duration depletion`);
    assert(laserEnds === 2, "laser end callback should fire on depletion");
  }
}

function assertMidActivationLevelChange(): void {
  const { ws } = makeWeaponSystem();
  ws.setLevel("w2", 2);
  ws.update(0.016, actions({ fireSecondary: true }), snap);
  assert(ws.getSnapshot().slots.w2.active, "W2 level 2 activation should start");
  assert(approx(ws.getSnapshot().slots.w2.durationSec ?? 0, 2), "W2 active duration should be captured as 2 seconds");
  ws.setLevel("w2", 5);
  assert(approx(ws.getSnapshot().slots.w2.durationSec ?? 0, 2), "mid-activation level change must not stretch active duration");
  ws.update(1.5, actions({ fireSecondary: true }), snap);
  assert(ws.getSnapshot().slots.w2.active, "level 2 activation should still be active before 2 seconds deplete");
  ws.update(0.6, actions({ fireSecondary: true }), snap);
  assert(!ws.getSnapshot().slots.w2.active, "level 2 activation should end near its captured duration despite level 5 setting");
  ws.update(10.0, actions(), snap);
  ws.update(0.016, actions({ fireSecondary: true }), snap);
  assert(approx(ws.getSnapshot().slots.w2.durationSec ?? 0, 5), "next W2 activation should use newly selected level 5 duration");
}

function assertIndependenceAndBombCompatibility(): void {
  let bombConsumes = 0;
  const { bus, ws } = makeWeaponSystem({ onConsumeBomb: () => { bombConsumes++; } });
  ws.setLevel("w1", 5);
  ws.setLevel("w2", 4);
  bus.beginTick(0);
  bus.enterPhase(Phase.Simulation);
  ws.update(0.016, actions({ firePrimary: true, fireSecondary: true }), snap);
  let snapshot = ws.getSnapshot();
  assert(snapshot.slots.w1.projectileCount === 5, "W2 level must not affect W1 projectile count");
  assert(approx(snapshot.slots.w2.durationSec ?? 0, 4), "W1 level must not affect W2 duration");
  assert(snapshot.slots.w1.cooldownRemainingSec > 0 && snapshot.slots.w2.active, "W1 cooldown and W2 active state must coexist independently");

  ws.update(0.016, actions({ fireSecondary: false }), snap);
  snapshot = ws.getSnapshot();
  assert(!snapshot.slots.w2.active && snapshot.slots.w1.cooldownRemainingSec > 0, "W2 release/recharge must not reset W1 cooldown");

  ws.update(10.0, actions(), snap);
  ws.update(0.016, actions({ bombPressed: true, bombTarget: { x: 123, y: 77 } }), snap);
  const bombs = drainNextSimulation(bus, 1).filter((e) => e.type === EventType.SPAWN_BOMB);
  assert(bombs.length === 1, "bomb path should still emit one SPAWN_BOMB when inventory is present");
  assert(bombConsumes === 1, "bomb path should still call onConsumeBomb once");
  assert((bombs[0] as any).payload.target.x === 123 && (bombs[0] as any).payload.target.y === 77, "bomb target must remain unchanged");
}

function main() {
  assertDefinitionIntegrity();
  assertLevelApi();
  assertW1Firing();
  assertW2Firing();
  assertMidActivationLevelChange();
  assertIndependenceAndBombCompatibility();
  console.log("[SMOKE] WeaponSystem OK ✅");
}

main();
