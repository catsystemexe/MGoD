import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";

import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

import { SpawnSystem } from "./SpawnSystem";
import { WeaponSystem } from "./WeaponSystem";
import { ProjectileSystem } from "./ProjectileSystem";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function countProjectiles(store: EntityStore<any>): number {
  let n = 0;
  store.debugForEachAlive((_ref, e: any) => {
    if (e.kind === "projectile" && !e.pendingKill) n++;
  });
  return n;
}

function tick(
  bus: EventBus<CMEventMap>,
  phase: Phase,
  tickNo: number,
  fn: (events: Array<{ type: keyof CMEventMap; payload: CMEventMap[keyof CMEventMap] }>) => void
) {
  bus.enterPhase(phase);
  const events = bus.drainPhase(phase) as any[];
  fn(events);
}

function main() {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  const store = new EntityStore<any>(128);

  // SpawnSystem (Director phase consumes spawn requests)
  const spawn = new SpawnSystem(store as any, {
    rng01: () => 0.5,
    logicSize: { w: 224, h: 256 },
    projectile: {
      primary: { speed: 220, ttlSec: 0.25, damage: 3, radius: 2 },
      secondary: { speed: 200, ttlSec: 0.25, damage: 2, radius: 2 },
    },
    bomb: { travelSec: 0.4, damage: 10, radius: 10, ttlSec: 0.4 },
  });

  // WeaponSystem (Simulation emits SPAWN_PROJECTILE via emitNext -> Director next tick)
  const weapons = new WeaponSystem(
    bus,
    {
      primary: { cooldownSec: 0.10 },
      secondary: { cooldownSec: 0.10 },
      bombCooldownSec: 0.50,
    } as any
  );

  // ProjectileSystem (Simulation TTL + move)
  const projectiles = new ProjectileSystem(bus, store);

  const ship: EntityRef = { slot: 1, gen: 1 };

  // Minimal PlayerActions shape (použijeme jen firePrimary/bombPressed/bombTarget)
  const actions: any = {
    firePrimary: true,
    fireSecondary: false,
    bombPressed: false,
    bombTarget: { x: 0, y: 0 },
    // zbytek ActionSchema se tady neřeší
    move: { x: 0, y: 0 },
    aimTarget: { x: 1, y: 0 },
  };

  const snap: any = {
    shipPos: { x: 10, y: 10 },
    shipRef: ship,
  };

  const dt = 1 / 60;

  // ------------------------------------------------------------
  // Tick 0: Simulation emitNext -> v tomhle ticku se NESPAWNUJE
  // ------------------------------------------------------------
  bus.beginTick(0);

  tick(bus, Phase.Simulation, 0, (_events) => {
    weapons.update(dt, actions, snap);
    projectiles.update(dt);
  });

  tick(bus, Phase.Director, 0, (events) => {
    // Director phase drains SPAWN_* from PREVIOUS tick (tady zatím nic)
    spawn.update({ tick: 0, dt }, events as any);
  });

  tick(bus, Phase.Cleanup, 0, (_events) => store.cleanup());

  bus.endTickAndSwap();

  assert(store.getAliveCount() === 0, "tick0: no projectile should spawn yet (emitNext -> next tick)");

  // ------------------------------------------------------------
  // Tick 1..N: Director consumes spawn requests and creates projectiles
  // ------------------------------------------------------------
  const stopFireAt = 20;     // ~0.33s (20 * 1/60)
  const totalTicks = 120;    // 2s total, dost času na doběh TTL
  let maxAlive = 0;

  for (let t = 1; t <= totalTicks; t++) {
    // po stopFireAt přestaň střílet
    actions.firePrimary = t < stopFireAt;

    bus.beginTick(t);

    // ✅ SPRÁVNĚ
    tick(bus, Phase.Simulation, t, (events) => {
      spawn.update({ tick: t, dt }, events as any);
    });

    // Simulation: emitNext more requests + move/ttl
    tick(bus, Phase.Simulation, t, (_events) => {
      weapons.update(dt, actions, snap);
      projectiles.update(dt);
    });

    tick(bus, Phase.Cleanup, t, (_events) => store.cleanup());

    bus.endTickAndSwap();

    const aliveNow = countProjectiles(store);
    if (aliveNow > maxAlive) maxAlive = aliveNow;
  }

  assert(maxAlive > 0, "projectiles should appear (spawned in Director from emitNext)");
  assert(store.getAliveCount() === 0, "after stopping fire, TTL should clean everything");
  console.log(`[SMOKE] maxAliveProjectiles: ${maxAlive}`);
  console.log("[SMOKE] SimulationLoop OK ✅");
}

main();
