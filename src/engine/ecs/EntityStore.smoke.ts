import { EntityStore } from "./EntityStore";
import type { BaseEntity } from "./ComponentTypes";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

interface TestEntity extends BaseEntity {
  hp: number;
}

function main() {
  const store = new EntityStore<TestEntity>(4);

  // spawn
  const a = store.spawn(e => { e.hp = 10; });
  const b = store.spawn(e => { e.hp = 20; });

  assert(store.getAliveCount() === 2, "Alive count after spawn");

  // safe access
  assert(store.get(a)?.hp === 10, "Access entity A");
  assert(store.get(b)?.hp === 20, "Access entity B");

  // mark + cleanup
  store.markKill(a);
  assert(store.get(a) !== null, "A still accessible before cleanup");

  store.cleanup();

  assert(store.get(a) === null, "A invalid after cleanup");
  assert(store.getAliveCount() === 1, "Alive count after cleanup");

  // generation invalidation
  const a2 = store.spawn(e => { e.hp = 99; });
  assert(a2.slot === a.slot, "Reused slot");
  assert(a2.gen !== a.gen, "Generation bumped");

  // idempotent kill
  store.markKill(a2);
  store.markKill(a2);
  store.cleanup();
  assert(store.get(a2) === null, "Idempotent kill ok");

  console.log("[SMOKE] EntityStore OK ✅");
}

main();
