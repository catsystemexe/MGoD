import assert from "node:assert/strict";
import { EntityStore } from "../../engine/ecs/EntityStore";
import { EnemyGroupRegistry } from "../enemies/EnemyGroups";
import { EnemySystem } from "./EnemySystem";

const DT = 1 / 60;
const LOGIC_W = 320;
const LOGIC_H = 180;
const LEFT_BOUNDARY = -4 - 160;

type Harness = {
  store: EntityStore<any>;
  groups: EnemyGroupRegistry;
  system: EnemySystem;
  world: { scrollX: number; scrollY: number };
};

function makeHarness(): Harness {
  const store = new EntityStore<any>(64);
  const groups = new EnemyGroupRegistry();
  const world = { scrollX: 0, scrollY: 0 };
  return {
    store,
    groups,
    world,
    system: new EnemySystem(store, LOGIC_W, LOGIC_H, world, groups),
  };
}

function spawnEnemy(store: EntityStore<any>, init: Partial<any> = {}) {
  return store.spawn((e: any) => {
    e.kind = "enemy";
    e.typeId = "red";
    e.pos = { x: 100, y: 90, ...(init.pos ?? {}) };
    e.posPrev = { x: e.pos.x, y: e.pos.y };
    e.vel = { x: 0, y: 0, ...(init.vel ?? {}) };
    e.radius = init.radius ?? 4;
    e.hp = init.hp ?? 1;
    e.behaviorId = init.behaviorId ?? "none";
    e.behavior = init.behavior ?? {};
    e.bState = init.bState ?? { t: 0 };
    if (init.group) e.group = init.group;
    e.pendingKill = false;
  });
}

function tick(h: Harness): void {
  h.system.update({ dt: DT, fixedDt: DT, tick: 0, time: 0 } as any);
}

function getEnemy(h: Harness, ref: { slot: number; gen: number }) {
  const e = h.store.get(ref);
  assert(e && e.kind === "enemy", "enemy should exist");
  return e;
}

function assertAliveAfterCleanup(h: Harness, ref: { slot: number; gen: number }, message: string): void {
  h.store.cleanup();
  assert(h.store.get(ref), message);
}

{
  const h = makeHarness();
  const ref = spawnEnemy(h.store, {
    behaviorId: "straight",
    behavior: { speedX: 0, speedY: 0 },
    bState: { t: 0, baseX: -150, baseY: 90, vx: 0, vy: 0, hasInterpolation: false },
    pos: { x: -150, y: 90 },
  });
  tick(h);
  assert.equal(getEnemy(h, ref).pendingKill, false, "straight enemy inside left band survives");

  const e = getEnemy(h, ref);
  e.pos.x = LEFT_BOUNDARY - 10;
  e.bState.baseX = e.pos.x;
  tick(h);
  assert.equal(getEnemy(h, ref).pendingKill, true, "straight enemy crossing left cleanup boundary is marked");
  h.store.cleanup();
  assert.equal(h.store.get(ref), null, "straight enemy crossing left cleanup boundary is removed");
}

{
  const h = makeHarness();
  const ref = spawnEnemy(h.store, { pos: { x: 100, y: -400 } });
  tick(h);
  assert.equal(getEnemy(h, ref).pendingKill, false, "enemy above old top viewport cull survives");
  assertAliveAfterCleanup(h, ref, "enemy above viewport remains alive after cleanup");
}

{
  const h = makeHarness();
  const ref = spawnEnemy(h.store, { pos: { x: 100, y: LOGIC_H + 400 } });
  tick(h);
  assert.equal(getEnemy(h, ref).pendingKill, false, "enemy below old bottom viewport cull survives");
  assertAliveAfterCleanup(h, ref, "enemy below viewport remains alive after cleanup");
}

{
  const h = makeHarness();
  const ref = spawnEnemy(h.store, {
    behaviorId: "loop",
    behavior: { speedX: 0, speedY: 0, radiusX: 52, radiusY: 48, repeat: true },
    bState: { t: 0, baseX: 0, baseY: 90, speedX: 0, speedY: 0, radiusX: 52, radiusY: 48, angularSpeed: Math.PI * 2, direction: 1, initialAngle: 0, totalAngle: Math.PI * 2, repeat: true },
    pos: { x: LEFT_BOUNDARY - 100, y: 90 },
  });
  tick(h);
  assert.equal(getEnemy(h, ref).pendingKill, false, "loop temporary left excursion survives while base path is valid");
  assertAliveAfterCleanup(h, ref, "loop temporary left excursion remains alive after cleanup");

  const e = getEnemy(h, ref);
  e.pos.x = 0;
  e.bState.baseX = LEFT_BOUNDARY - 20;
  e.bState.speedX = 0;
  tick(h);
  assert.equal(getEnemy(h, ref).pendingKill, true, "loop is removed after persistent base path crosses left boundary");
}

{
  const h = makeHarness();
  const ref = spawnEnemy(h.store, {
    behaviorId: "orbitTarget",
    behavior: {},
    bState: { t: 1, initialized: true, centerX: 0, centerY: 90 },
    pos: { x: LEFT_BOUNDARY - 120, y: 90 },
  });
  tick(h);
  assert.equal(getEnemy(h, ref).pendingKill, false, "orbit temporary left excursion survives while center is valid");
  assertAliveAfterCleanup(h, ref, "orbit temporary left excursion remains alive after cleanup");

  const e = getEnemy(h, ref);
  e.bState.centerX = LEFT_BOUNDARY - 20;
  tick(h);
  assert.equal(getEnemy(h, ref).pendingKill, true, "orbit is removed after initialized center crosses left boundary");
}

{
  const h = makeHarness();
  const groupId = h.groups.create({ enemyTypeId: "red", count: 1, anchor: { x: 0, y: 90 }, formationId: "ring", movementPresetId: "none.hold", cohesionId: "rigid", params: { formation: { radius: 140 } } });
  const ref = spawnEnemy(h.store, { pos: { x: LEFT_BOUNDARY - 40, y: 90 }, group: { groupId, slotIndex: 0 } });
  h.groups.addMember(groupId, ref, 0);
  tick(h);
  assert.equal(getEnemy(h, ref).pendingKill, false, "group member left excursion from offset/cohesion survives while anchor is valid");
  assert.equal(h.groups.size(), 1, "group remains registered while anchor is valid");
  assertAliveAfterCleanup(h, ref, "group member excursion remains alive after cleanup");
}

{
  const h = makeHarness();
  const groupId = h.groups.create({ enemyTypeId: "red", count: 2, anchor: { x: LEFT_BOUNDARY - 20, y: 90 }, formationId: "line.horizontal", movementPresetId: "none.hold", cohesionId: "rigid" });
  const a = spawnEnemy(h.store, { pos: { x: 0, y: 90 }, group: { groupId, slotIndex: 0 } });
  const b = spawnEnemy(h.store, { pos: { x: 10, y: 90 }, group: { groupId, slotIndex: 1 } });
  h.groups.addMember(groupId, a, 0);
  h.groups.addMember(groupId, b, 1);
  tick(h);
  assert.equal(getEnemy(h, a).pendingKill, true, "group permanent left exit marks first member");
  assert.equal(getEnemy(h, b).pendingKill, true, "group permanent left exit marks second member");
  h.store.cleanup();
  h.groups.reconcile(h.store);
  assert.equal(h.groups.size(), 0, "empty group is removed after permanent exit cleanup");
}

{
  const h = makeHarness();
  const groupId = h.groups.create({ enemyTypeId: "red", count: 1, anchor: { x: 0, y: -500 }, formationId: "line.horizontal", movementPresetId: "none.hold", cohesionId: "rigid" });
  const ref = spawnEnemy(h.store, { pos: { x: 0, y: -500 }, group: { groupId, slotIndex: 0 } });
  h.groups.addMember(groupId, ref, 0);
  tick(h);
  assert.equal(getEnemy(h, ref).pendingKill, false, "grouped vertical viewport excursion survives");
  assertAliveAfterCleanup(h, ref, "grouped vertical viewport excursion remains alive after cleanup");
}

console.log("[SMOKE] EnemyCulling OK ✅");
