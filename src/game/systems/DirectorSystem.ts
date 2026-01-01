import { Config } from "../../core/Config";

export class DirectorSystem {
  private timer = 2;
  private wave = 1;
  update(dt: number, enemies: any) {
    this.timer -= dt;
    if (this.timer <= 0) { 
        // Spawn around player but not too close
        const angle = Math.random() * Math.PI * 2;
        const dist = 300 + Math.random() * 200;
        const x = 512 + Math.cos(angle) * dist;
        const y = 512 + Math.sin(angle) * dist;
        
        // Random enemy type selection
        const rnd = Math.random();
        let type = 'kamikaze';
        
        // UPRAVENO: Blob (Orbiter) dostupný hned od začátku (30% šance)
        if (rnd > 0.7) type = 'orbiter';
        
        // UPRAVENO: Turret dostupný už od 2. vlny (přepisuje předchozí volbu)
        if (this.wave >= 2 && rnd > 0.85) type = 'turret';

        enemies.spawn(x, y, type); 
        
        // Base delay * Spawn Rate Multiplier (Lower multiplier = faster spawns)
        const baseDelay = Math.max(0.5, 2.0 - (this.wave * 0.1));
        // Inverse the multiplier so higher spawn rate number = faster
        const rate = Math.max(0.1, 1.0 / (Config.SPAWN_RATE_MULT || 1.0));
        
        this.timer = baseDelay * rate;
        
        // UPRAVENO: Rychlejší nárůst obtížnosti (25% šance na zvýšení vlny)
        if (Math.random() < 0.25) this.wave++;
    }
  }
  reset(enemies: any) { this.timer = 2; this.wave = 1; }
  getHUDInfo() { return { current: this.wave, difficulty: 'RISING' }; }
}
