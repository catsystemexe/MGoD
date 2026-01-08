import { createGame } from "../boot/createGame";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function main() {
  const { loop, store, session } = createGame();

  // tickujeme 3 sekundy (180 ticků @60Hz)
  for (let i = 0; i < 180; i++) loop.stepOneTick();

  const alive = store.getAliveCount();
  console.log("[SMOKE] alive:", alive, "timeSec:", session.timeSec.toFixed(2));

  // očekávání: Director už měl emitovat SPAWN_ENEMY a SpawnSystem už je aplikoval
  // Pozn.: maxAlive v wave 0 je 6, takže alive by mělo být >0 a <= 6 (pokud nic nezabíjíš).
  assert(alive > 0, "expected at least 1 spawned enemy after 3s");
  assert(alive <= 6, "expected alive <= wave.maxAlive (6) in first wave");

  console.log("[SMOKE] DirectorSpawn OK ✅");
}

main();
