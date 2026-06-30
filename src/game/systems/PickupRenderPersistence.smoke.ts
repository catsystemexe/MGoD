import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import { CollisionSystem } from "./CollisionSystem";
import { DamageSystem } from "./DamageSystem";
import { FlowDispatcher } from "./FlowDispatcher";
import { FlowSystem } from "./FlowSystem";
import { LootDropSystem } from "./LootDropSystem";
import { PickupSystem } from "./PickupSystem";
import { ProjectileSystem } from "./ProjectileSystem";
import { SpawnSystem, DEFAULT_PICKUP_SPAWN_CONFIG } from "./SpawnSystem";
import { WEAPON_DB } from "../defs/WeaponDB";
import { isPickupRenderEligible } from "../../render/webgl/WebGLSceneRenderer";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

const bus = new EventBus(CM_EVENT_OWNERSHIP, { maxEventsPerTick: 256, failFast: true, dropLeftoversInProd: true });
const store = new EntityStore<any>(96);
const world = { scrollX: 0, scrollY: 0 };
const refs: EntityRef[] = [];

store.spawn((e: any) => {
  e.kind = "player";
  e.pos = { x: 800, y: 400 };
  e.posPrev = { x: 800, y: 400 };
  e.radius = 3;
  e.bodyRadius = 20;
  e.pendingKill = false;
});

for (let i = 0; i < 3; i++) {
  refs.push(store.spawn((e: any) => {
    e.kind = "pickup";
    e.defId = i === 0 ? "energy" : i === 1 ? "w1" : "score";
    e.pos = { x: 100 + i * 40, y: 120 };
    e.posPrev = { x: 100 + i * 40, y: 120 };
    e.vel = { x: 0, y: 0 };
    e.radius = DEFAULT_PICKUP_SPAWN_CONFIG.radius;
    e.ttl = 10;
    e.pendingKill = false;
  }));
}

const enemy = store.spawn((e: any) => {
  e.kind = "enemy";
  e.typeId = "basic_1";
  e.pos = { x: 300, y: 120 };
  e.posPrev = { x: 300, y: 120 };
  e.vel = { x: 0, y: 0 };
  e.radius = 9;
  e.hp = 3;
  e.maxHp = 3;
  e.render = { color: "#ffffff" };
  e.pendingKill = false;
});

const projectileOwner: EntityRef = { slot: 0, gen: 1 };
store.spawn((e: any) => {
  e.kind = "projectile";
  e.owner = projectileOwner;
  e.pos = { x: 300, y: 120 };
  e.posPrev = { x: 300, y: 120 };
  e.vel = { x: 0, y: 0 };
  e.ttl = 1;
  e.damage = 3;
  e.radius = 2;
  e.pendingKill = false;
  e.consumed = false;
});

const collision = new CollisionSystem(bus as any, store as any, world as any);
const damage = new DamageSystem(bus as any, store as any, {} as any, { projectileHitEnemyDamage: 3, playerHitEnemyDamage: 999 });
let rngCalls = 0;
const loot = new LootDropSystem(bus as any, store as any, { dropChance: 1, rng01: () => (rngCalls++ === 0 ? 0 : 0.7) });
const flow = new FlowSystem(new FlowDispatcher([loot]));
const pickupSystem = new PickupSystem(store as any);
const projectileSystem = new ProjectileSystem(bus as any, store as any, 896, 504, world as any);
const spawn = new SpawnSystem(store as any, { rng01: () => 0, logicSize: { w: 896, h: 504 }, weaponDb: WEAPON_DB as any } as any, world as any);

function assertOriginals(label: string, previousTtl: number): number {
  let minTtl = Infinity;
  for (const ref of refs) {
    const e = store.get(ref) as any;
    assert(e, `${label}: original pickup ref should stay valid`);
    assert(e.kind === "pickup", `${label}: original ref should remain pickup`);
    assert(e.pendingKill === false, `${label}: original pickup pendingKill should remain false`);
    assert(["energy", "w1", "score"].includes(e.defId), `${label}: original defId should remain stable`);
    assert(Number.isFinite(e.pos?.x) && Number.isFinite(e.pos?.y), `${label}: pickup pos should remain finite`);
    assert(Number.isFinite(e.posPrev?.x) && Number.isFinite(e.posPrev?.y), `${label}: pickup posPrev should remain finite`);
    assert(isPickupRenderEligible(e), `${label}: pickup should remain render eligible`);
    minTtl = Math.min(minTtl, e.ttl);
  }
  assert(minTtl < previousTtl, `${label}: pickup ttl should decrease normally`);
  return minTtl;
}

let lastTtl = 10.001;
bus.beginTick(0);
bus.enterPhase(Phase.Collision); collision.update(1 / 60);
bus.enterPhase(Phase.Impact); damage.update();
bus.enterPhase(Phase.Flow); flow.update({ tick: 0, dt: 1 / 60 }, bus.drainPhase(Phase.Flow) as any);
bus.enterPhase(Phase.Cleanup); store.cleanup();
bus.endTickAndSwap();
assert(store.get(enemy) === null, "enemy should be cleaned after death");
lastTtl = assertOriginals("after enemy death cleanup", lastTtl);

for (let tick = 1; tick <= 8; tick++) {
  bus.beginTick(tick);
  bus.enterPhase(Phase.Simulation);
  pickupSystem.update(1 / 60);
  projectileSystem.update(1 / 60);
  spawn.update({ tick, dt: 1 / 60 }, bus.drainPhase(Phase.Simulation) as any);
  bus.enterPhase(Phase.Cleanup); store.cleanup();
  bus.endTickAndSwap();
  lastTtl = assertOriginals(`post-fx tick ${tick}`, lastTtl);
}

let pickupCount = 0;
store.debugForEachAlive((_ref: any, e: any) => { if (e?.kind === "pickup" && !e.pendingKill) pickupCount++; });
assert(pickupCount >= refs.length + 1, "loot pickup may be added without affecting original pickups");

console.log("[SMOKE] PickupRenderPersistence OK ✅");
