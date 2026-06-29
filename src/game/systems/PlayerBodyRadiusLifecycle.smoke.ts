import { EventType } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";
import { spawnPlayer } from "../entities/spawnPlayer";
import { RespawnSystem } from "./RespawnSystem";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function testSpawnPlayerDefaults(): void {
  const store = new EntityStore<any>(8);
  const { ref } = spawnPlayer(store, 10, 20);
  const p = store.get(ref) as any;
  assert(p.radius === 3, "spawnPlayer combat radius should match production radius 3");
  assert(p.bodyRadius === 20, "spawnPlayer bodyRadius should match production body radius 20");
}

function testRespawnPreservesBodyRadius(): void {
  const store = new EntityStore<any>(8);
  const ref = store.spawn((e: any) => {
    e.kind = "player";
    e.pos = { x: 40, y: 50 };
    e.vel = { x: 1, y: 1 };
    e.radius = 3;
    e.bodyRadius = 20;
    e.energyMax = 5;
    e.energy = 0;
    e.pendingKill = false;
  });
  const session = { lives: 2, gameOver: false };
  const respawn = new RespawnSystem(session, store, () => ref, 896, 504, {
    respawnDelayTicks: 1,
    invulnSec: 1,
    spawnEnergy: 5,
  });

  respawn.onFlowEvents([{ type: EventType.ENTITY_KILLED, payload: { target: ref, source: "test", isPlayer: true } } as any]);
  respawn.tick();

  const p = store.get(ref) as any;
  assert(p.radius === 3, "respawn must preserve combat radius 3");
  assert(p.bodyRadius === 20, "respawn must preserve bodyRadius 20");
}

function testRespawnFallbackBodyRadius(): void {
  const store = new EntityStore<any>(8);
  const ref = store.spawn((e: any) => {
    e.kind = "player";
    e.pos = { x: 40, y: 50 };
    e.vel = { x: 1, y: 1 };
    e.radius = 3;
    e.bodyRadius = 0;
    e.pendingKill = false;
  });
  const session = { lives: 2, gameOver: false };
  const respawn = new RespawnSystem(session, store, () => ref, 896, 504, {
    respawnDelayTicks: 1,
    invulnSec: 1,
    spawnEnergy: 5,
  });

  respawn.onFlowEvents([{ type: EventType.ENTITY_KILLED, payload: { target: ref, source: "test", isPlayer: true } } as any]);
  respawn.tick();

  const p = store.get(ref) as any;
  assert(p.radius === 3, "respawn fallback must preserve combat radius 3");
  assert(p.bodyRadius === 20, "respawn fallback must restore production bodyRadius 20");
}

function main(): void {
  testSpawnPlayerDefaults();
  testRespawnPreservesBodyRadius();
  testRespawnFallbackBodyRadius();
  console.log("[SMOKE] PlayerBodyRadiusLifecycle OK ✅");
}

main();
