import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { EntityRef } from "../../engine/ecs/EntityRef";

import { WeaponSystem } from "./WeaponSystem";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function main() {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  const ws = new WeaponSystem(bus, {
    primary: { cooldownSec: 0.2 },
    secondary: { cooldownSec: 0.5 },
    bombCooldownSec: 0.8,
  });

  const shipRef: EntityRef = { slot: 1, gen: 1 };
  const shipPos = { x: 100, y: 50 };
  const aimDir = { x: 1, y: 0 };

  // ---------------------------
  // TICK 0: Simulation emitsNext
  // ---------------------------
  bus.beginTick(0);
  bus.enterPhase(Phase.Simulation);

  ws.update(
    0.016,
    {
      move: { x: 0, y: 0 },
      aimTarget: { x: 0, y: 0 },
      firePrimary: true,
      fireSecondary: false,
      bombPressed: false,
      bombTarget: { x: 0, y: 0 },
    },
    { shipPos , shipRef }
  );

  // Nothing should be drainable yet in tick 0 (emitNext goes to qNext)
  const sim0 = bus.drainPhase(Phase.Simulation);
  assert(sim0.length === 0, "no owned-by-Simulation events expected (spawn requests are owned by Director)");

  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  // ---------------------------
  // TICK 1: Director drains spawn requests
  // ---------------------------
  bus.beginTick(1);
  bus.enterPhase(Phase.Simulation);
  const sim1 = bus.drainPhase(Phase.Simulation);
  const proj1 = sim1.filter(e => e.type === EventType.SPAWN_PROJECTILE);
  assert(proj1.length === 1, "primary should spawn 1 projectile in next tick Director (emitNext)");

  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  // ---------------------------
  // TICK 2: cooldown still active, so no new projectile request
  // (we still call update to advance cooldown by dt)
  // ---------------------------
  bus.beginTick(2);
  bus.enterPhase(Phase.Simulation);

  ws.update(
    0.016,
    {
      move: { x: 0, y: 0 },
      aimTarget: { x: 0, y: 0 },
      firePrimary: true,
      fireSecondary: false,
      bombPressed: true,
      bombTarget: { x: 123, y: 77 },
    },
    { shipPos, shipRef }
  );

  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  // ---------------------------
  // TICK 3: Director drains; bomb should be there, projectile should NOT
  // ---------------------------
  bus.beginTick(3);
  bus.enterPhase(Phase.Simulation);
  const dir3 = bus.drainPhase(Phase.Simulation);
  const proj3 = dir3.filter((e) => e.type === EventType.SPAWN_PROJECTILE);
  const bomb3 = dir3.filter((e) => e.type === EventType.SPAWN_BOMB);

  assert(proj3.length === 0, "primary should NOT spawn due to cooldown");
  assert(bomb3.length === 1, "bomb should spawn (emitNext) and be drained in Director");
  // payload shape check (non-generic access)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (bomb3[0] as any).payload;
  assert(p.target.x === 123 && p.target.y === 77, "bomb target must match captured target");

  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  console.log("[SMOKE] WeaponSystem OK ✅");
}

main();
