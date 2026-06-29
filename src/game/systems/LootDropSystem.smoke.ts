import { EventType } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";
import { LootDropSystem, selectPickupDefId, type PickupDefId } from "./LootDropSystem";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function makeRng(values: number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error("rng sequence exhausted");
    return values[i++];
  };
}

function assertSelection(rngValue: number, expected: PickupDefId): void {
  const actual = selectPickupDefId(() => rngValue);
  assert(actual === expected, `weighted selector at ${rngValue} should return ${expected} (got ${actual})`);
}

function assertSystemDrop(typeRoll: number, expected: PickupDefId): void {
  const store = new EntityStore<any>(4);
  const enemyRef = store.spawn((e: any) => {
    e.kind = "enemy";
    e.pos = { x: 12, y: 34 };
    e.pendingKill = false;
  });
  const emitted: any[] = [];
  const bus = {
    emitNext: (type: string, payload: any) => { emitted.push({ type, payload }); },
  };
  const loot = new LootDropSystem(bus as any, store as any, { dropChance: 0.25, rng01: makeRng([0.25, typeRoll]) });

  loot.onFlowEvents([{ type: EventType.ENTITY_KILLED, payload: { target: enemyRef, source: "test" } } as any]);

  assert(emitted.length === 1, "successful drop gate must emit exactly one pickup spawn");
  assert(emitted[0].type === EventType.SPAWN_PICKUP, "loot drop must emitNext SPAWN_PICKUP");
  assert(emitted[0].payload.defId === expected, `type roll ${typeRoll} should emit ${expected}`);
}

function main(): void {
  assertSelection(0.00, "energy");
  assertSelection(0.34, "energy");
  assertSelection(0.35, "bomb");
  assertSelection(0.49, "bomb");
  assertSelection(0.50, "score");
  assertSelection(0.69, "score");
  assertSelection(0.70, "w1");
  assertSelection(0.84, "w1");
  assertSelection(0.85, "w2");
  assertSelection(1.00, "w2");

  assertSystemDrop(0.00, "energy");
  assertSystemDrop(0.35, "bomb");
  assertSystemDrop(0.50, "score");
  assertSystemDrop(0.70, "w1");
  assertSystemDrop(1.00, "w2");

  const store = new EntityStore<any>(4);
  const enemyRef = store.spawn((e: any) => {
    e.kind = "enemy";
    e.pos = { x: 1, y: 2 };
    e.pendingKill = false;
  });
  const emitted: any[] = [];
  const loot = new LootDropSystem({ emitNext: (_type: string, payload: any) => { emitted.push(payload); } } as any, store as any, {
    dropChance: 0.25,
    rng01: makeRng([0.251]),
  });
  loot.onFlowEvents([{ type: EventType.ENTITY_KILLED, payload: { target: enemyRef, source: "test" } } as any]);
  assert(emitted.length === 0, "failed drop gate must not consume a type-selection roll or emit a pickup");

  console.log("[SMOKE] LootDropSystem OK ✅");
}

main();
