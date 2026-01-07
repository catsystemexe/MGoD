import { EventBus, Phase } from "../core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../core/events";
import { EntityStore } from "../ecs/EntityStore";
import type { BaseEntity } from "../ecs/ComponentTypes";
import { SpawnSystem, type SpawnFactory } from "./SpawnSystem";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

interface TestEntity extends BaseEntity {
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function main() {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  const store = new EntityStore<TestEntity>(16);

  const factory: SpawnFactory<TestEntity> = {
    spawnEnemy: (s, p) =>
      s.spawn(e => {
        e.kind = `enemy:${p.defId}`;
        e.x = p.x; e.y = p.y;
        e.vx = 0; e.vy = 0;
      }),
    spawnProjectile: (s, p) =>
      s.spawn(e => {
        e.kind = `proj:${p.defId}`;
        e.x = p.x; e.y = p.y;
        e.vx = p.vx; e.vy = p.vy;
      }),
    spawnPickup: (s, p) =>
      s.spawn(e => {
        e.kind = `pickup:${p.defId}`;
        e.x = p.x; e.y = p.y;
        e.vx = 0; e.vy = 0;
      }),
  };

  const spawnSys = new SpawnSystem(bus, store, factory);

  bus.beginTick(0);

  // Emit spawn requests (owned by Director phase)
  bus.enterPhase(Phase.Director);
  bus.emit(EventType.SPAWN_ENEMY, { defId: "drone", x: 10, y: 20 });
  bus.emit(EventType.SPAWN_PROJECTILE, { defId: "laser", x: 1, y: 2, vx: 3, vy: 4 });
  bus.emit(EventType.SPAWN_PICKUP, { defId: "energy", x: 7, y: 8 });

  // Run spawn system
  spawnSys.update();

  assert(store.getAliveCount() === 3, "Spawned 3 entities");

  // End tick (no leftover spawn events)
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  console.log("[SMOKE] SpawnSystem OK ✅");
}

main();
