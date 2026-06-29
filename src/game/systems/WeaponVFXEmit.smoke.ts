// src/game/systems/WeaponVFXEmit.smoke.ts
//
// Guard that firing the primary weapon actually emits the muzzle + tracer VFX
// callbacks. These (opts.onSpawnProjectile / opts.onTracer) were wired in
// createGame.ts but never invoked inside WeaponSystem — i.e. dead code, no muzzle
// or tracer ever appeared. This test proves WeaponSystem now calls them at the
// projectile spawn point, with the correct world-space position and direction.

import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

import { WeaponSystem } from "./WeaponSystem";
import { WEAPON_DB } from "../defs/WeaponDB";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

type VfxCall = { x: number; y: number; dx: number; dy: number };

function main() {
  const bus = new EventBus(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });
  // Store is unused by WeaponSystem but keeps the smoke self-contained/consistent.
  void new EntityStore<any>(8);

  const muzzle: VfxCall[] = [];
  const tracer: VfxCall[] = [];

  const weaponsCfg: any = { primary: "w1.basic", secondary: "w2.laser", bomb: "b", bombCooldownSec: 0.8 };
  const ws = new WeaponSystem(bus as any, weaponsCfg, WEAPON_DB as any, { scrollX: 0, scrollY: 0 } as any, {
    onSpawnProjectile: (p: VfxCall) => muzzle.push(p),
    onTracer: (p: VfxCall) => tracer.push(p),
  });

  const ship: EntityRef = { slot: 1, gen: 1 };

  bus.beginTick(0);
  bus.enterPhase(Phase.Simulation);
  ws.update(1 / 60, {
    move: { x: 0, y: 0 },
    aimTarget: { x: 0, y: 0 },
    firePrimary: true,
    fireSecondary: false,
    bombPressed: false,
    bombTarget: { x: 0, y: 0 },
  } as any, {
    shipRef: ship,
    shipPos: { x: 100, y: 50 },
  } as any);
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  // Both VFX hooks must fire exactly once on a single primary shot.
  assert(muzzle.length === 1, "onSpawnProjectile must be called once on primary fire (got " + muzzle.length + ")");
  assert(tracer.length === 1, "onTracer must be called once on primary fire (got " + tracer.length + ")");

  // WeaponSystem fires forward (dir = {1,0}) from a MUZZLE=12 offset ahead of the ship.
  const m = muzzle[0];
  assert(Math.abs(m.x - 112) < 1e-6 && Math.abs(m.y - 50) < 1e-6,
    "muzzle VFX must spawn at the muzzle point (112,50) — got (" + m.x + "," + m.y + ")");
  assert(Math.abs(m.dx - 1) < 1e-6 && Math.abs(m.dy - 0) < 1e-6,
    "muzzle VFX direction must be forward (1,0) — got (" + m.dx + "," + m.dy + ")");

  console.log("[SMOKE] WeaponVFXEmit OK ✅");
}

main();
