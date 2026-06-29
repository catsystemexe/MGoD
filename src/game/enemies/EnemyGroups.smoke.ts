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
  return { bus, store, world, groups, spawn, enemies };
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
  const s = sim();
  s.world.scrollX = 300;
  s.world.scrollY = 40;
  s.bus.emitNext(EventType.SPAWN_ENEMY_GROUP, {
    enemyTypeId: "red",
    count: 3,
    anchor: { x: 200, y: 90 },
    formationId: "line.horizontal",
    movementPresetId: "diagonal.down",
    cohesionId: "rigid",
    params: { cohesion: { maxCatchupSpeed: 600 } },
  });
  s.bus.beginTick(0);
  s.bus.enterPhase(Phase.Cleanup);
  s.bus.endTickAndSwap();
  s.bus.beginTick(1);
  s.bus.enterPhase(Phase.Simulation);
  s.spawn.update({ dt: DT } as any, s.bus.drainPhase(Phase.Simulation) as any);
  let [group] = s.groups.snapshot();
  let es = enemiesOf(s.store);
  assert(close(group.anchor.x, 500) && close(group.anchor.y, 130), "group anchor is materialized in world coordinates when the camera is scrolled");
  assert(es.every((e, i) => close(e.pos.x, 500) && close(e.pos.y, [112, 130, 148][i])), "scrolled group members spawn at the same world-space formation targets as the anchor");
  s.enemies.update({ dt: DT, tick: 2, time: DT * 2 } as any);
  group = s.groups.snapshot()[0];
  es = enemiesOf(s.store);
  assert(group.anchor.y > 130, "diagonal.down group anchor Y increases from its scrolled world start");
  assert(es.every((e, i) => e.pos.y > [112, 130, 148][i]), "diagonal.down group members follow increasing world Y under scrolled camera state");
}

{
  const s = sim();
  s.world.scrollX = 240;
  s.world.scrollY = 30;
  s.bus.emitNext(EventType.SPAWN_ENEMY_GROUP, {
    enemyTypeId: "red",
    count: 3,
    anchor: { x: 200, y: 90 },
    formationId: "line.horizontal",
    movementPresetId: "sine.wide",
    cohesionId: "rigid",
    params: { cohesion: { maxCatchupSpeed: 600 } },
  });
  s.bus.beginTick(0);
  s.bus.enterPhase(Phase.Cleanup);
  s.bus.endTickAndSwap();
  s.bus.beginTick(1);
  s.bus.enterPhase(Phase.Simulation);
  s.spawn.update({ dt: DT } as any, s.bus.drainPhase(Phase.Simulation) as any);
  const initialY = enemiesOf(s.store)[1].pos.y;
  const deltas: number[] = [];
  let previousY = initialY;
  for (let i = 0; i < 150; i++) {
    s.enemies.update({ dt: DT, tick: i + 2, time: DT * (i + 2) } as any);
    const y = enemiesOf(s.store)[1].pos.y;
    deltas.push(y - previousY);
    previousY = y;
  }
  assert(deltas.some((dy) => dy > 0.01), "sine.wide group member Y increases during the wave");
  assert(deltas.some((dy) => dy < -0.01), "sine.wide group member Y reverses direction during the wave");
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


{
  const params = normalizeEnemyGroupParams({ formation: { spacing: 20, radius: 48, angle: 100 } }, "rigid");
  assert.deepEqual([0].map((i) => formationOffset("column.vertical", i, 1, params)), [{ x: 0, y: 0 }]);
  assert.deepEqual([0, 1, 2, 3].map((i) => formationOffset("column.vertical", i, 4, params)), [{ x: 0, y: -30 }, { x: 0, y: -10 }, { x: 0, y: 10 }, { x: 0, y: 30 }]);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => formationOffset("column.vertical", i, 5, params)), [{ x: 0, y: -40 }, { x: 0, y: -20 }, { x: 0, y: 0 }, { x: 0, y: 20 }, { x: 0, y: 40 }]);
}

{
  const params = normalizeEnemyGroupParams({ formation: { radius: 60, angle: 120 } }, "rigid");
  assert.deepEqual(formationOffset("arc.forward", 0, 1, params), { x: 0, y: 0 });
  const arc3 = [0, 1, 2].map((i) => formationOffset("arc.forward", i, 3, params));
  assert(close(arc3[0].y, -arc3[2].y) && close(arc3[1].y, 0), "arc top and bottom mirror around anchor Y");
  assert(close(arc3[1].x, 0), "arc center slot is forward-most at anchor X");
  assert(arc3[0].x > arc3[1].x && arc3[2].x > arc3[1].x, "arc outer slots trail center in positive X for right-to-left travel");
  assert(Math.abs(arc3[0].y) > Math.abs(arc3[1].y), "arc outer slots have greater absolute Y");
  assert(arc3.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), "arc offsets remain finite");
  const arc5 = [0, 1, 2, 3, 4].map((i) => formationOffset("arc.forward", i, 5, params));
  assert(close(arc5[0].y, -arc5[4].y) && close(arc5[1].y, -arc5[3].y), "arc five-slot order is symmetric");
  const wider = [0, 1, 2].map((i) => formationOffset("arc.forward", i, 3, normalizeEnemyGroupParams({ formation: { radius: 80, angle: 160 } }, "rigid")));
  assert(wider[0].x > arc3[0].x && Math.abs(wider[0].y) > Math.abs(arc3[0].y), "arc radius and angle affect geometry");
}

{
  const params = normalizeEnemyGroupParams({ formation: { radius: 40 } }, "rigid");
  assert.deepEqual(formationOffset("ring", 0, 1, params), { x: 0, y: 0 });
  const ring2 = [0, 1].map((i) => formationOffset("ring", i, 2, params));
  assert(close(ring2[0].x, 40) && close(ring2[0].y, 0), "ring slot 0 starts at the rightmost point");
  assert(close(ring2[1].x, -40) && close(ring2[1].y, 0), "ring count two uses opposite points");
  const ring4 = [0, 1, 2, 3].map((i) => formationOffset("ring", i, 4, params));
  assert(ring4.every((p) => close(Math.hypot(p.x, p.y), 40)), "ring count four keeps each member on radius");
  assert(close(ring4[0].x, 40) && close(ring4[1].y, 40) && close(ring4[2].x, -40) && close(ring4[3].y, -40), "ring count four uses cardinal points");
  const ring8 = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => formationOffset("ring", i, 8, params));
  const chord = Math.hypot(ring8[1].x - ring8[0].x, ring8[1].y - ring8[0].y);
  for (let i = 0; i < ring8.length; i++) {
    const next = ring8[(i + 1) % ring8.length];
    assert(close(Math.hypot(next.x - ring8[i].x, next.y - ring8[i].y), chord), "ring adjacent spacing is uniform");
    assert(Number.isFinite(ring8[i].x) && Number.isFinite(ring8[i].y), "ring offsets remain finite");
  }
}

{
  const defaults = normalizeEnemyGroupParams({}, "rigid");
  assert.equal(defaults.formation.radius, 48, "omitted radius uses default");
  assert.equal(defaults.formation.angle, 100, "omitted angle uses default degrees");
  const malformed = normalizeEnemyGroupParams({ formation: { spacing: 4, depth: 999, radius: -99, angle: Infinity } }, "rigid");
  assert.equal(malformed.formation.spacing, 16, "existing spacing clamp remains unchanged");
  assert.equal(malformed.formation.depth, 80, "existing depth clamp remains unchanged");
  assert.equal(malformed.formation.radius, 12, "negative radius clamps safely");
  assert.equal(malformed.formation.angle, 100, "invalid angle falls back safely");
  const high = normalizeEnemyGroupParams({ formation: { radius: 999, angle: 999 } }, "rigid");
  assert.equal(high.formation.radius, 140, "excessive radius clamps");
  assert.equal(high.formation.angle, 180, "excessive angle clamps");
}

{
  for (const formationId of ["column.vertical", "arc.forward", "ring"] as const) {
    const { store, groups } = spawnGroup(formationId, "none.hold", "rigid", 4, { formation: { spacing: 20, radius: 40, angle: 120 }, cohesion: { maxCatchupSpeed: 600 } });
    const [snapshot] = groups.snapshot();
    const group = groups.get(snapshot.id) as any;
    const es = enemiesOf(store);
    assert.equal(group.formationId, formationId, `${formationId} is stored on group registry`);
    assert.equal(group.params.formation.radius, 40, `${formationId} normalized radius is stored`);
    assert.equal(group.params.formation.angle, 120, `${formationId} normalized angle is stored`);
    assert.deepEqual(es.map((e) => e.group.slotIndex), [0, 1, 2, 3], `${formationId} stable slot IDs are preserved`);
    for (let i = 0; i < es.length; i++) {
      const expected = formationOffset(formationId, i, 4, group.params);
      assert(close(es[i].pos.x, 200 + expected.x) && close(es[i].pos.y, 90 + expected.y), `${formationId} members spawn at anchor plus offset`);
    }
  }
}

{
  const diagonal = spawnGroup("column.vertical", "diagonal.down", "rigid", 3, { formation: { spacing: 20 }, cohesion: { maxCatchupSpeed: 600 } });
  const before = enemiesOf(diagonal.store).map((e) => ({ x: e.pos.x, y: e.pos.y }));
  diagonal.enemies.update({ dt: DT, tick: 2, time: DT * 2 } as any);
  const after = enemiesOf(diagonal.store);
  assert(after.every((e, i) => e.pos.x < before[i].x && e.pos.y > before[i].y), "column formation follows diagonal.down without deformation");

  const sine = spawnGroup("ring", "sine.wide", "rigid", 4, { formation: { radius: 32 }, cohesion: { maxCatchupSpeed: 600 } });
  const initial = enemiesOf(sine.store).map((e) => ({ x: e.pos.x, y: e.pos.y }));
  for (let i = 0; i < 90; i++) sine.enemies.update({ dt: DT, tick: i + 2, time: DT * (i + 2) } as any);
  const moved = enemiesOf(sine.store);
  const initialDx = initial[0].x - initial[2].x;
  const movedDx = moved[0].pos.x - moved[2].pos.x;
  assert(!close(moved[0].pos.y, initial[0].y), "ring follows sine.wide anchor movement");
  assert(close(movedDx, initialDx, 0.01), "ring rigid cohesion preserves formation width under sine movement");
}

console.log("[EnemyGroups] ok");
