import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EntityStore } from "../../engine/ecs/EntityStore";
import { EventType } from "../../engine/core/events";
import { CollisionSystem } from "./CollisionSystem";
import { DEFAULT_PICKUP_SPAWN_CONFIG, SpawnSystem } from "./SpawnSystem";
import { WEAPON_DB } from "../defs/WeaponDB";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function spawnPickup(store: EntityStore<any>, bus: EventBus<any>) {
  const spawn = new SpawnSystem(store as any, {
    rng01: () => 0,
    logicSize: { w: 896, h: 504 },
    weaponDb: WEAPON_DB as any,
    pickup: DEFAULT_PICKUP_SPAWN_CONFIG,
  } as any, { scrollX: 0, scrollY: 0 } as any);

  bus.beginTick(0);
  bus.enterPhase(Phase.Simulation);
  spawn.update({ tick: 0, dt: 1 / 60 }, [{ type: EventType.SPAWN_PICKUP, payload: { defId: "w1", pos: { x: 100, y: 100 } } }] as any);
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();
}

function runPickupCollision(playerDistanceFromPickupCenter: number) {
  const bus = new EventBus(CM_EVENT_OWNERSHIP, { maxEventsPerTick: 64, failFast: true });
  const store = new EntityStore<any>(16);
  const world = { scrollX: 0, scrollY: 0 };

  const playerRef = store.spawn((e: any) => {
    e.kind = "player";
    e.pos = { x: 100 + playerDistanceFromPickupCenter, y: 100 };
    e.radius = 3;
    e.pendingKill = false;
    e.invulnT = 999;
  });

  spawnPickup(store, bus as any);

  let pickupRadius = NaN;
  store.debugForEachAlive((_ref, e: any) => {
    if (e?.kind === "pickup") pickupRadius = Number(e.radius);
  });

  const collision = new CollisionSystem(bus as any, store as any, world as any);
  bus.beginTick(1);
  bus.enterPhase(Phase.Collision);
  collision.update(1 / 60);
  collision.update(1 / 60);
  bus.enterPhase(Phase.Flow);
  const events = bus.drainPhase(Phase.Flow).filter((e: any) => e.type === EventType.PLAYER_PICKUP);

  let pendingKill = false;
  store.debugForEachAlive((_ref, e: any) => {
    if (e?.kind === "pickup") pendingKill = Boolean(e.pendingKill);
  });

  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  return { events, pendingKill, pickupRadius, player: store.get(playerRef) as any };
}

function main() {
  const expectedRadius = DEFAULT_PICKUP_SPAWN_CONFIG.radius;
  assert(expectedRadius === 7.5, "production pickup radius should be half of a 30px square at canonical 2x scale");

  const edgeOverlap = runPickupCollision(expectedRadius + 3 - 0.01);
  assert(edgeOverlap.pickupRadius === expectedRadius, "test must use the production spawn pickup radius");
  assert(edgeOverlap.events.length === 1, "player overlapping the visible pickup edge should collect exactly once");
  assert(edgeOverlap.pendingKill === true, "collected pickup should be pendingKill-protected before cleanup");
  assert(edgeOverlap.player?.kind === "player", "player should remain alive after pickup collision smoke");

  const outside = runPickupCollision(expectedRadius + 3 + 1);
  assert(outside.pickupRadius === expectedRadius, "outside case must use the production spawn pickup radius");
  assert(outside.events.length === 0, "player clearly outside the visible pickup should not collect it");
  assert(outside.pendingKill === false, "uncollected pickup should not become pendingKill");

  console.log("[SMOKE] PickupCollisionRadius OK ✅");
}

main();
