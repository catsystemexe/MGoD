import assert from "node:assert/strict";
import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";
import { WEAPON_DB } from "../defs/WeaponDB";
import { createWorldState } from "../data/WorldState";
import { SpawnSystem, type SpawnableEntity } from "../systems/SpawnSystem";
import { EnemySystem } from "../systems/EnemySystem";
import { EnemyGroupRegistry, formationOffset, normalizeEnemyGroupParams } from "./EnemyGroups";

const DT = 1 / 60;
const close = (a: number, b: number, eps = 0.001) => Math.abs(a - b) <= eps;

function sim(capacity = 128) {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP);
  const store = new EntityStore<SpawnableEntity>(capacity);
  const world = createWorldState();
  const groups = new EnemyGroupRegistry();
  const spawn = new SpawnSystem(store, { rng01: () => 0.5, logicSize: { w: 320, h: 180 }, weaponDb: WEAPON_DB }, world, groups);
  const enemies = new EnemySystem(store as any, 320, 180, world as any, groups);
  return { bus, store, groups, spawn, enemies };
}

function spawnGroup(formationId: string, movementPresetId: string, cohesionId: string, count = 3, params?: CMEventMap[typeof EventType.SPAWN_ENEMY_GROUP]["params"]) {
  const s = sim();
  s.bus.emitNext(EventType.SPAWN_ENEMY_GROUP, {
    enemyTypeId: "red",
    count,
    anchor: { x: 200, y: 90 },
    formationId,
    movementPresetId,
    cohesionId,
    spacing: 20,
    params,
  });
  s.bus.beginTick(0);
  s.bus.enterPhase(Phase.Cleanup);
  s.bus.endTickAndSwap();
  s.bus.beginTick(1);
  s.bus.enterPhase(Phase.Simulation);
  s.spawn.update({ dt: DT, tick: 1, time: DT } as any, s.bus.drainPhase(Phase.Simulation) as any);
  return s;
}

function enemiesOf(store: EntityStore<any>) {
  const out: any[] = [];
  store.debugForEachAlive((_ref, e: any) => { if (e.kind === "enemy") out.push(e); });
  return out.sort((a, b) => a.group.slotIndex - b.group.slotIndex);
}

{
  assert.deepEqual([0, 1, 2].map((i) => formationOffset("line.horizontal", i, 3, 20).y), [-20, 0, 20]);
  assert.deepEqual([0, 1, 2, 3].map((i) => formationOffset("line.horizontal", i, 4, 20).y), [-30, -10, 10, 30]);
  const wedge = [0, 1, 2, 3, 4].map((i) => formationOffset("wedge", i, 5, 20));
  assert.deepEqual(wedge, [{ x: 0, y: 0 }, { x: 20, y: -20 }, { x: 20, y: 20 }, { x: 40, y: -40 }, { x: 40, y: 40 }]);
  assert.equal(CM_EVENT_OWNERSHIP[EventType.SPAWN_ENEMY_GROUP], Phase.Simulation);
}

{
  const defaults = normalizeEnemyGroupParams(undefined, "rigid");
  assert.deepEqual([0, 1, 2].map((i) => formationOffset("line.horizontal", i, 3, defaults).y), [-18, 0, 18], "omitted params preserve default line spacing");
  assert.deepEqual([0, 1, 2].map((i) => formationOffset("wedge", i, 3, defaults)), [{ x: 0, y: 0 }, { x: 18, y: -18 }, { x: 18, y: 18 }], "omitted params preserve default wedge spacing/depth");
  const malformed = normalizeEnemyGroupParams({ formation: { spacing: Number.NaN, depth: -4 }, cohesion: { response: Infinity, maxCatchupSpeed: 9999 } }, "elastic");
  assert.equal(malformed.formation.spacing, defaults.formation.spacing, "invalid spacing falls back to default");
  assert.equal(malformed.formation.depth, 8, "finite low depth clamps to min");
  assert.equal(malformed.cohesion.response, defaults.cohesion.response, "invalid response falls back to default");
  assert.equal(malformed.cohesion.maxCatchupSpeed, 600, "finite high catch-up clamps to max");
}

{
  const narrow = normalizeEnemyGroupParams({ formation: { spacing: 16, depth: 12 } }, "rigid");
  const wide = normalizeEnemyGroupParams({ formation: { spacing: 40, depth: 12 } }, "rigid");
  assert.deepEqual([0, 1, 2].map((i) => formationOffset("line.horizontal", i, 3, narrow).y), [-16, 0, 16]);
  assert.deepEqual([0, 1, 2].map((i) => formationOffset("line.horizontal", i, 3, wide).y), [-40, 0, 40]);
  assert.deepEqual([0, 1, 2].map((i) => formationOffset("line.horizontal", i, 3, wide).x), [0, 0, 0], "line spacing does not change anchor axis");
  const shallow = normalizeEnemyGroupParams({ formation: { spacing: 24, depth: 12 } }, "rigid");
  const deep = normalizeEnemyGroupParams({ formation: { spacing: 24, depth: 48 } }, "rigid");
  assert.deepEqual([1, 2, 3, 4].map((i) => formationOffset("wedge", i, 5, shallow).y), [-24, 24, -48, 48], "wedge spacing controls lateral spread");
  assert.deepEqual([1, 2, 3, 4].map((i) => formationOffset("wedge", i, 5, deep).y), [-24, 24, -48, 48], "wedge depth does not change lateral spread");
  assert.deepEqual([1, 2, 3, 4].map((i) => formationOffset("wedge", i, 5, shallow).x), [12, 12, 24, 24]);
  assert.deepEqual([1, 2, 3, 4].map((i) => formationOffset("wedge", i, 5, deep).x), [48, 48, 96, 96], "wedge depth controls longitudinal rows only");
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => formationOffset("wedge", i, 5, wide).y), [0, -40, 40, -80, 80], "wedge symmetry and slot order remain stable");
  assert.deepEqual([0, 1, 2].map((i) => formationOffset("line.horizontal", i, 3, deep).y), [-24, 0, 24], "depth does not affect horizontal line geometry");
}

{
  const { store, groups, enemies } = spawnGroup("line.horizontal", "straight.basic", "rigid", 3);
  let es = enemiesOf(store);
  assert.equal(groups.size(), 1);
  assert.deepEqual(es.map((e) => e.group.slotIndex), [0, 1, 2]);
  assert.equal(new Set(es.map((e) => e.group.groupId)).size, 1);
  assert(es.every((e, i) => close(e.pos.x, 200) && close(e.pos.y, [70, 90, 110][i])), "members spawn at deterministic formation targets");
  assert(es.every((e) => e.behaviorId === "none"), "grouped members do not retain individual movement presets");
  enemies.update({ dt: DT, tick: 2, time: DT * 2 } as any);
  es = enemiesOf(store);
  assert(es.every((e, i) => close(e.pos.y, [70, 90, 110][i])), "rigid line members preserve centered relative Y offsets");
  assert(es.every((e) => e.pos.x < 200), "anchor movement uses straight.basic preset");
}


{
  const groups = new EnemyGroupRegistry();
  const groupId = groups.create({
    enemyTypeId: "red",
    count: 1,
    anchor: { x: 0, y: 0 },
    formationId: "line.horizontal",
    movementPresetId: "none.hold",
    cohesionId: "rigid",
  });
  const ent: any = { pos: { x: 10000, y: -10000 }, vel: { x: 0, y: 0 } };
  assert.equal(groups.applyMemberCohesion(ent, { groupId, slotIndex: 0 }, DT), true);
  const speed = Math.hypot(ent.vel.x, ent.vel.y);
  assert(Number.isFinite(speed), "rigid cohesion velocity remains finite under large displacement");
  assert(speed <= 480.001, "rigid cohesion velocity is bounded under large displacement");
}

{
  const groups = new EnemyGroupRegistry();
  const slowId = groups.create({ enemyTypeId: "red", count: 1, anchor: { x: 0, y: 0 }, formationId: "line.horizontal", movementPresetId: "none.hold", cohesionId: "elastic", params: { cohesion: { response: 2, maxCatchupSpeed: 600 } } });
  const fastId = groups.create({ enemyTypeId: "red", count: 1, anchor: { x: 0, y: 0 }, formationId: "line.horizontal", movementPresetId: "none.hold", cohesionId: "elastic", params: { cohesion: { response: 10, maxCatchupSpeed: 600 } } });
  const slow: any = { pos: { x: 10, y: 0 }, vel: { x: 0, y: 0 } };
  const fast: any = { pos: { x: 10, y: 0 }, vel: { x: 0, y: 0 } };
  groups.applyMemberCohesion(slow, { groupId: slowId, slotIndex: 0 }, DT);
  groups.applyMemberCohesion(fast, { groupId: fastId, slotIndex: 0 }, DT);
  assert(Math.abs(fast.vel.x) > Math.abs(slow.vel.x), "elastic response changes convergence strength deterministically");
  const capped: any = { pos: { x: 10000, y: 0 }, vel: { x: 0, y: 0 } };
  groups.applyMemberCohesion(capped, { groupId: slowId, slotIndex: 0 }, DT);
  assert(Math.hypot(capped.vel.x, capped.vel.y) <= 600.001, "elastic catch-up speed is a hard bound");
}

{
  const groups = new EnemyGroupRegistry();
  const groupId = groups.create({ enemyTypeId: "red", count: 1, anchor: { x: 0, y: 0 }, formationId: "line.horizontal", movementPresetId: "none.hold", cohesionId: "rigid", params: { cohesion: { maxCatchupSpeed: 120 } } });
  const ent: any = { pos: { x: 10000, y: -10000 }, vel: { x: 0, y: 0 } };
  assert.equal(groups.applyMemberCohesion(ent, { groupId, slotIndex: 0 }, DT), true);
  const speed = Math.hypot(ent.vel.x, ent.vel.y);
  assert(Number.isFinite(speed), "custom rigid catch-up remains finite");
  assert(speed <= 120.001, "custom rigid catch-up is bounded by supplied cap");
}

{
  const { store, enemies } = spawnGroup("wedge", "smart.track.soft", "elastic", 5);
  store.spawn((e: any) => { e.kind = "player"; e.pos = { x: 40, y: 130 }; e.vel = { x: 0, y: 0 }; e.radius = 4; e.pendingKill = false; });
  let maxSpeed = 0;
  for (let i = 0; i < 90; i++) {
    enemies.update({ dt: DT, tick: i + 2, time: DT * (i + 2) } as any);
    for (const e of enemiesOf(store)) maxSpeed = Math.max(maxSpeed, Math.hypot(e.vel.x, e.vel.y));
  }
  assert(maxSpeed <= 260.001, "elastic cohesion must bound catch-up speed");
  assert(enemiesOf(store).some((e) => Math.abs(e.pos.y - 90) > 1), "smart anchor movement uses player context");
}

{
  const a = spawnGroup("line.horizontal", "straight.basic", "rigid", 3);
  const b = spawnGroup("line.horizontal", "straight.basic", "rigid", 3);
  for (let i = 0; i < 10; i++) { a.enemies.update({ dt: DT } as any); b.enemies.update({ dt: DT } as any); }
  assert.deepEqual(enemiesOf(a.store).map((e) => ({ x: e.pos.x, y: e.pos.y, g: e.group })), enemiesOf(b.store).map((e) => ({ x: e.pos.x, y: e.pos.y, g: e.group })));
}

{
  const { store, groups, enemies } = spawnGroup("line.horizontal", "straight.basic", "rigid", 3);
  const refs: any[] = [];
  store.debugForEachAlive((ref, e: any) => { if (e.kind === "enemy") refs[e.group.slotIndex] = ref; });
  store.markKill(refs[1]);
  enemies.update({ dt: DT } as any);
  assert.deepEqual(groups.snapshot()[0].members.map((m) => m.slotIndex), [0, 2]);
  store.markKill(refs[0]); store.markKill(refs[2]);
  enemies.update({ dt: DT } as any);
  assert.equal(groups.size(), 0);
  groups.reset();
  assert.equal(groups.size(), 0);
}

{
  const groups = new EnemyGroupRegistry();
  const shared: any = { formation: { spacing: 24, depth: 12 }, cohesion: { response: 3, maxCatchupSpeed: 120 } };
  const a = groups.create({ enemyTypeId: "red", count: 1, anchor: { x: 0, y: 0 }, formationId: "line.horizontal", movementPresetId: "none.hold", cohesionId: "elastic", params: shared });
  const b = groups.create({ enemyTypeId: "red", count: 1, anchor: { x: 0, y: 0 }, formationId: "line.horizontal", movementPresetId: "none.hold", cohesionId: "elastic", params: shared });
  shared.formation.spacing = 96;
  (groups.get(a) as any).params.formation.spacing = 32;
  assert.equal((groups.get(b) as any).params.formation.spacing, 24, "separate groups do not share mutable parameter objects");
}

{
  const s = sim();
  s.bus.emitNext(EventType.SPAWN_ENEMY_GROUP, {
    enemyTypeId: "red",
    count: 3,
    anchor: { x: 50, y: 50 },
    formationId: "line.horizontal",
    movementPresetId: "none.hold",
    cohesionId: "elastic",
    params: { formation: { spacing: 36 }, cohesion: { response: 4, maxCatchupSpeed: 140 } },
  });
  s.bus.beginTick(0);
  s.bus.enterPhase(Phase.Cleanup);
  s.bus.endTickAndSwap();
  s.bus.beginTick(1);
  s.bus.enterPhase(Phase.Simulation);
  s.spawn.update({ dt: DT } as any, s.bus.drainPhase(Phase.Simulation) as any);
  const [snapshot] = s.groups.snapshot();
  assert.deepEqual(snapshot.members.map((m) => m.slotIndex), [0, 1, 2], "new payload overrides are accepted through spawn event");
  assert.equal((s.groups.get(snapshot.id) as any).params.formation.spacing, 36, "new payload overrides reach the group registry");
  assert.equal((s.groups.get(snapshot.id) as any).params.cohesion.maxCatchupSpeed, 140, "cohesion override reaches the group registry");
}

{
  const s = sim();
  s.store.spawn((e: any) => { e.kind = "enemy"; e.typeId = "red"; e.pos = { x: 10, y: 10 }; e.vel = { x: 0, y: 0 }; e.radius = 4; e.hp = 1; e.behaviorId = "none"; e.behavior = {}; e.bState = { t: 0 }; e.pendingKill = false; });
  s.enemies.update({ dt: DT } as any);
  assert.equal(enemiesOf(s.store)[0].group, undefined, "ungrouped enemies remain unaffected");
}

{
  const s = sim();
  s.bus.emitNext(EventType.SPAWN_ENEMY, { typeId: "red", spawn: { x: 12, y: 34 }, behaviorPresetId: "straight.basic" });
  s.bus.beginTick(0);
  s.bus.enterPhase(Phase.Cleanup);
  s.bus.endTickAndSwap();
  s.bus.beginTick(1);
  s.bus.enterPhase(Phase.Simulation);
  s.spawn.update({ dt: DT } as any, s.bus.drainPhase(Phase.Simulation) as any);
  const [enemy] = enemiesOf(s.store);
  assert.equal(s.groups.size(), 0, "ordinary SPAWN_ENEMY does not create group state");
  assert.equal(enemy.group, undefined, "ordinary SPAWN_ENEMY leaves group membership unset");
  assert.equal(enemy.behaviorId, "straight", "ordinary SPAWN_ENEMY preserves requested movement preset");
  assert(close(enemy.pos.x, 12) && close(enemy.pos.y, 34), "ordinary SPAWN_ENEMY preserves spawn coordinates");
}

{
  const zero = spawnGroup("line.horizontal", "straight.basic", "rigid", 0);
  assert.equal(zero.groups.size(), 0, "zero-count group request does not retain an empty group");

  const invalid = sim();
  invalid.bus.emitNext(EventType.SPAWN_ENEMY_GROUP, {
    enemyTypeId: "missing.enemy",
    count: 3,
    anchor: { x: 10, y: 10 },
    formationId: "line.horizontal",
    movementPresetId: "straight.basic",
    cohesionId: "rigid",
  });
  invalid.bus.beginTick(0);
  invalid.bus.enterPhase(Phase.Cleanup);
  invalid.bus.endTickAndSwap();
  invalid.bus.beginTick(1);
  invalid.bus.enterPhase(Phase.Simulation);
  invalid.spawn.update({ dt: DT } as any, invalid.bus.drainPhase(Phase.Simulation) as any);
  assert.equal(invalid.groups.size(), 0, "invalid group enemy type does not retain an empty group");

  const limited = sim(2);
  limited.bus.emitNext(EventType.SPAWN_ENEMY_GROUP, {
    enemyTypeId: "red",
    count: 3,
    anchor: { x: 20, y: 60 },
    formationId: "line.horizontal",
    movementPresetId: "straight.basic",
    cohesionId: "rigid",
  });
  limited.bus.beginTick(0);
  limited.bus.enterPhase(Phase.Cleanup);
  limited.bus.endTickAndSwap();
  limited.bus.beginTick(1);
  limited.bus.enterPhase(Phase.Simulation);
  limited.spawn.update({ dt: DT } as any, limited.bus.drainPhase(Phase.Simulation) as any);
  assert.equal(enemiesOf(limited.store).length, 2, "capacity-limited group keeps successfully spawned members");
  assert.equal(limited.groups.snapshot()[0].members.length, 2, "capacity-limited group retains registered partial membership");
}

console.log("[EnemyGroups] ok");
