import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import type { CMEventMap } from "../../engine/core/events";

import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import { ProjectileSystem } from "./ProjectileSystem";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

type TestEntity =
  | {
      kind: "projectile";
      owner: EntityRef;
      weapon: "primary";
      pos: { x: number; y: number };
      vel: { x: number; y: number };
      ttl: number;
      damage: number;
      radius: number;
      pendingKill: boolean;
      consumed: boolean;
    }
  | { kind: "enemy"; pos: { x: number; y: number }; radius: number; hp: number; pendingKill: boolean };

function main() {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  const store = new EntityStore<TestEntity>(16);
  const sys = new ProjectileSystem(bus, store);

  const ship: EntityRef = { slot: 1, gen: 1 };

  const p1 = store.spawn(e => {
    e.kind = "projectile";
    e.owner = ship;
    e.weapon = "primary";
    e.pos = { x: 0, y: 0 };
    e.vel = { x: 60, y: 0 };
    e.ttl = 1.0;
    e.damage = 3;
    e.radius = 2;
    e.pendingKill = false;
    e.consumed = false;
  });

  const p2 = store.spawn(e => {
    e.kind = "projectile";
    e.owner = ship;
    e.weapon = "primary";
    e.pos = { x: 0, y: 0 };
    e.vel = { x: 0, y: 0 };
    e.ttl = 1.0;
    e.damage = 3;
    e.radius = 2;
    e.pendingKill = false;
    e.consumed = true; // will be killed immediately
  });

  const p3 = store.spawn(e => {
    e.kind = "projectile";
    e.owner = ship;
    e.weapon = "primary";
    e.pos = { x: 0, y: 0 };
    e.vel = { x: 0, y: 0 };
    e.ttl = 0.01; // will expire
    e.damage = 3;
    e.radius = 2;
    e.pendingKill = false;
    e.consumed = false;
  });

  bus.beginTick(0);
  bus.enterPhase(Phase.Simulation);

  sys.update(1 / 60);

  const a = store.get(p1)!;
  const b = store.get(p2)!;
  const c = store.get(p3)!;

  assert(a.kind === "projectile" && a.pos.x > 0, "p1 should move forward");
  assert(b.kind === "projectile" && b.pendingKill === true, "p2 consumed => pendingKill");
  // p3 may or may not expire at 1/60 depending on ttl; force 2nd update
  sys.update(1 / 60);

  const c2 = store.get(p3)!;
  assert(c2.kind === "projectile" && c2.pendingKill === true, "p3 ttl <= 0 => pendingKill");

  bus.enterPhase(Phase.Cleanup);
  store.cleanup();
  bus.endTickAndSwap();

  assert(store.get(p2) === null, "p2 removed after cleanup");
  assert(store.get(p3) === null, "p3 removed after cleanup");

  console.log("[SMOKE] ProjectileSystem OK ✅");
}

main();
