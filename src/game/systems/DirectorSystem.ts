import { EnemySystem } from "./EnemySystem";

type WaveDef = {
  id: number;
  name: string;
  duration: number; // Sekundy
  spawnRate: number;
  maxEnemies: number;
  types: ("skiff" | "miner")[];
};

const WAVES: WaveDef[] = [
  { id: 1, name: "WARMUP", duration: 15, spawnRate: 3.0, maxEnemies: 3, types: ["miner"] },
  { id: 2, name: "CONTACT", duration: 20, spawnRate: 2.5, maxEnemies: 5, types: ["skiff"] },
  { id: 3, name: "CHAOS", duration: 30, spawnRate: 1.5, maxEnemies: 8, types: ["miner", "skiff"] },
  { id: 4, name: "SURVIVAL", duration: 9999, spawnRate: 1.0, maxEnemies: 12, types: ["miner", "skiff"] }
];

export class DirectorSystem {
  private currentWaveIdx = 0;
  private waveTimer = 0;
  private waveInfo = "";

  constructor() {}

  reset(enemySystem: EnemySystem) {
    this.currentWaveIdx = 0;
    this.waveTimer = 0;
    this.startWave(enemySystem);
  }

  update(dtSec: number, enemySystem: EnemySystem) {
    const wave = WAVES[this.currentWaveIdx];
    this.waveTimer += dtSec;

    // Check wave end
    if (this.waveTimer >= wave.duration && this.currentWaveIdx < WAVES.length - 1) {
      this.currentWaveIdx++;
      this.waveTimer = 0;
      this.startWave(enemySystem);
    }

    this.waveInfo = `WAVE ${wave.id}: ${wave.name}`;
  }

  private startWave(enemySystem: EnemySystem) {
    const wave = WAVES[this.currentWaveIdx];
    console.log(`Starting Wave ${wave.id}: ${wave.name}`);
    enemySystem.setDifficulty(wave.spawnRate, wave.maxEnemies, wave.types);
  }

  getHUDInfo(): string {
    const wave = WAVES[this.currentWaveIdx];
    const timeLeft = Math.max(0, wave.duration - this.waveTimer);
    return `${this.waveInfo} (${timeLeft.toFixed(0)}s)`;
  }
}
