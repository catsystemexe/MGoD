export class CAWorld {
  private grid: Uint8Array;
  private next: Uint8Array;
  constructor(private w: number, private h: number) {
    this.grid = new Uint8Array(w * h);
    this.next = new Uint8Array(w * h);
  }
  getWidth() { return this.w; }
  getHeight() { return this.h; }
  getCell(x: number, y: number) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return 0;
    return this.grid[y * this.w + x];
  }
  isAlive(x: number, y: number) {
    return this.getCell(x, y) === 1;
  }
  setAlive(x: number, y: number, alive: boolean) {
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.grid[y * this.w + x] = alive ? 1 : 0;
  }
  setCell(x: number, y: number, val: number) {
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.grid[y * this.w + x] = val;
  }
  
  spawnGlider(cx: number, cy: number) {
    // Standard Glider pattern
    // . O .
    // . . O
    // O O O
    const pattern = [
        {dx: 0, dy: -1},
        {dx: 1, dy: 0},
        {dx: -1, dy: 1},
        {dx: 0, dy: 1},
        {dx: 1, dy: 1}
    ];
    
    // Clear area first to ensure glider form works
    for(let y=-2; y<=2; y++) {
        for(let x=-2; x<=2; x++) {
            this.setCell(cx+x, cy+y, 0);
        }
    }

    for (const p of pattern) {
        this.setAlive(cx + p.dx, cy + p.dy, true);
    }
  }

  splashLife(cx: number, cy: number, radius: number) {
      for(let dy = -radius; dy <= radius; dy++) {
          for(let dx = -radius; dx <= radius; dx++) {
              if (dx*dx + dy*dy < radius*radius) {
                  // Randomly seed life to create chaos/CA reaction
                  if (Math.random() > 0.5) {
                      this.setAlive(cx + dx, cy + dy, true);
                  } else {
                      this.setCell(cx + dx, cy + dy, 0);
                  }
              }
          }
      }
  }

  tick() {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const val = this.grid[y*this.w+x];
        if (val === 2) {
            // Decay
            this.next[y*this.w+x] = Math.random() > 0.5 ? 0 : 2;
            continue;
        }
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (this.getCell(x + dx, y + dy) === 1) n++;
          }
        }
        const alive = val === 1;
        // Conway's Game of Life Rules:
        // 1. Underpopulation: < 2 dies
        // 2. Survival: 2 or 3 lives
        // 3. Overpopulation: > 3 dies
        // 4. Reproduction: 3 dead becomes alive
        this.next[y*this.w+x] = (alive && (n === 2 || n === 3)) || (!alive && n === 3) ? 1 : 0;
      }
    }
    [this.grid, this.next] = [this.next, this.grid];
  }
  seedTestPattern(seed: number) {
    for (let i = 0; i < 5000; i++) this.setAlive(Math.floor(Math.random()*this.w), Math.floor(Math.random()*this.h), true);
  }
}
