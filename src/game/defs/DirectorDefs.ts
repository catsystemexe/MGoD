export type EnemyTypeId = "enemy.drone"; // MVP jen jeden typ

export interface SpawnWave {
  startSec: number;          // kdy začne tato vlna
  durationSec: number;       // jak dlouho trvá
  spawnEverySec: number;     // interval spawnů
  maxAlive: number;          // cap (aby se hra neutopila)
  enemy: EnemyTypeId;
}

export interface DirectorDefs {
  waves: SpawnWave[];
  // později: difficulty ramps, elite chances, etc.
}

export const DIRECTOR_DEFS_MVP: DirectorDefs = {
  waves: [
    {
      startSec: 0,
      durationSec: 20,
      spawnEverySec: 2.0,
      maxAlive: 6,
      enemy: "enemy.drone",
    },
    {
      startSec: 20,
      durationSec: 9999, // endless
      spawnEverySec: 1.4,
      maxAlive: 10,
      enemy: "enemy.sine",
    },
  ],
};
