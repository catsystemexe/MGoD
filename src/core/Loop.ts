export class Loop {
  private lastTime = 0;
  private accum = 0;
  private caAccum = 0;
  constructor(private hz: number, private caHz: number) {}
  
  setCAHz(hz: number) {
      this.caHz = hz;
  }

  start(callbacks: { fixedUpdate: (dt: number) => void, caUpdate: () => void, render: (alpha: number, frameDt: number) => void }) {
    const step = 1 / this.hz;
    
    const frame = (time: number) => {
      if (!this.lastTime) this.lastTime = time;
      const dt = Math.min(0.1, (time - this.lastTime) / 1000);
      this.lastTime = time;
      
      this.accum += dt;
      this.caAccum += dt;
      
      while (this.accum >= step) {
        callbacks.fixedUpdate(step);
        this.accum -= step;
      }
      
      // Dynamic CA Step calculation to allow runtime changes
      const caStep = 1 / this.caHz;
      if (this.caAccum >= caStep) {
        callbacks.caUpdate();
        this.caAccum -= caStep;
      }
      
      callbacks.render(this.accum / step, dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
