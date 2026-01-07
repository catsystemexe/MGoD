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
    // 0–30s: lehké tempo
    { startSec: 0,  durationSec: 30, spawnEverySec: 2.0, maxAlive: 6, enemy: "enemy.drone" },
    // 30–90s: zrychlení
    { startSec: 30, durationSec: 60, spawnEverySec: 1.2, maxAlive: 10, enemy: "enemy.drone" },
  ],
};
