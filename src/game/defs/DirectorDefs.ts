// src/game/defs/DirectorDefs.ts
import { CONTENT } from "../content/CONTENT";

export type EnemyTypeId = string;

export interface SpawnWave {
  startSec: number;
  durationSec: number;
  spawnEverySec: number;
  maxAlive: number;
  enemy: EnemyTypeId; // runtime validace probíhá v loadContent()
}

export interface DirectorDefs {
  waves: SpawnWave[];
}

export const DIRECTOR_DEFS_MVP: DirectorDefs = {
  waves: CONTENT.waves.map((w) => ({
    startSec: w.startSec,
    durationSec: w.durationSec,
    spawnEverySec: w.spawnEverySec,
    maxAlive: w.maxAlive,
    enemy: w.enemyTypeId,
  })),
};
