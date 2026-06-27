import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import type { CMEventMap } from "../../engine/core/events";
import type { PlayerData } from "../entities/PlayerTypes";
import { PlayerSystem } from "./PlayerSystem";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function nearly(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

function main() {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  const player: PlayerData = {
    pos: { x: 10, y: 10 },
    vel: { x: 0, y: 0 },
    aimDir: { x: 1, y: 0 },
    speed: 100,
  };

  const sys = new PlayerSystem(bus, player, {
    bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100 },
  });

  bus.beginTick(0);
  bus.enterPhase(Phase.Simulation);

  // Move right for 1 second, aim at (110, 10)
  sys.update(1.0, {
    move: { x: 1, y: 0 },
    aimTarget: { x: 110, y: 10 },
    firePrimary: false,
    fireSecondary: false,
    bombPressed: false,
    bombTarget: { x: 0, y: 0 },
  });

  assert(nearly(player.pos.x, 110), "pos.x should advance by speed*dt");
  assert(nearly(player.pos.y, 10), "pos.y unchanged");
  assert(nearly(player.aimDir.x, 1) && nearly(player.aimDir.y, 0), "aimDir should be +X");

  // Aim exactly at ship position => should keep last aimDir (sticky)
  sys.update(0.016, {
    move: { x: 0, y: 0 },
    aimTarget: { x: player.pos.x, y: player.pos.y },
    firePrimary: false,
    fireSecondary: false,
    bombPressed: false,
    bombTarget: { x: 0, y: 0 },
  });

  assert(nearly(player.aimDir.x, 1) && nearly(player.aimDir.y, 0), "aimDir must stay sticky");

  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  console.log("[SMOKE] PlayerSystem OK ✅");
}

main();
