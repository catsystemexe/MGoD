// src/smoke/runSmokes.ts
const SMOKES = [
  "../engine/core/EventBus.smoke",
  "../engine/ecs/EntityStore.smoke",
  "../game/systems/PlayerSystem.smoke",
  "../game/systems/WeaponSystem.smoke",
  "../game/systems/SimulationLoop.smoke",
  "../game/systems/DirectorSystem.smoke",
  "../game/systems/SpawnSystem.smoke",
  "../game/systems/DirectorSpawn.smoke",
  "../game/systems/SpawnDelayOneTick.smoke",
  "../game/systems/EnemyCapRespected.smoke",
  "../game/systems/CollisionSystem.smoke",
  "../game/systems/ProjectileSystem.smoke",
  "../game/systems/ProjectileConsumedKillsSameTick.smoke",
  "../game/systems/ProjectileTTL.smoke",
  "../game/systems/CombatLoop.smoke",
  "../game/systems/CollisionScrollInvariance.smoke",
  "../game/systems/LootPickupChain.smoke",
  "../game/systems/BombExplosionChain.smoke",
  "../game/systems/WeaponVFXEmit.smoke",
  "../render/webgl/bg/FlowDisturbanceKick.smoke",
  "../game/systems/Flow.smoke",
  "../game/systems/StartToSpawn.integration.smoke",
  "../game/systems/SpawnOwnership.contract.smoke",
  "../game/systems/DirectorToSimulationSpawn.integration.smoke",
];

async function main() {
  for (const p of SMOKES) {
    await import(p);
  }
  console.log("[SMOKE RUNNER] OK");
}

main().catch((e) => {
  console.error("[SMOKE RUNNER] FAIL");
  console.error(e);
  process.exit(1);
});
