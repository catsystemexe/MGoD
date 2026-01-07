export type EnemyTypeId = "enemy.drone";

export interface EnemyDef {
  hp: number;
  radius: number;
  speed: number; // WU/sec
  scoreOnKill: number; // později můžeš emitovat do Flow
}

export const ENEMY_DEFS: Record<EnemyTypeId, EnemyDef> = {
  "enemy.drone": { hp: 6, radius: 4, speed: 40, scoreOnKill: 10 },
};
