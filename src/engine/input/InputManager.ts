import type { PlayerActions } from "./ActionSchema";

/**
 * InputManager (MVP)
 * - drží realtime stav kláves a myši
 * - v Input phase ho "sample()" přepíše do PlayerActions (snapshot pro tick)
 *
 * aimTarget je v LOGIC coords, myš mapujeme jen do "present rect" (letterbox viewport),
 * aby aim seděl s WebGL prezentací.
 *
 * IMPORTANT:
 * - present rect je v CSS px (ne device px)
 * - ox/oy jsou relativně k canvas elementu (ne k oknu)
 */
export class InputManager {
  private present = { ox: 0, oy: 0, dw: 0, dh: 0 }; // CSS px in canvas space

  public setPresentRect(ox: number, oy: number, dw: number, dh: number) {
    this.present.ox = ox;
    this.present.oy = oy;
    this.present.dw = dw;
    this.present.dh = dh;
  }

  private keys = new Set<string>();

  private mouseClientX = 0;
  private mouseClientY = 0;
  private mouseDownL = false;
  private mouseDownR = false;

  private prevBombDown = false;
  private bombDown = false;

  constructor(private readonly getCanvas: () => HTMLCanvasElement | null) {
    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    window.addEventListener("mousemove", (e) => {
      this.mouseClientX = e.clientX;
      this.mouseClientY = e.clientY;
    });

    window.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.mouseDownL = true;
      if (e.button === 2) this.mouseDownR = true;
      if (e.button === 1) this.bombDown = true; // middle click
    });

    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDownL = false;
      if (e.button === 2) this.mouseDownR = false;
      if (e.button === 1) this.bombDown = false;
    });

    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }


  public getAimTargetNow(logicW: number, logicH: number): { x: number; y: number } {
    return this.clientToLogic(logicW, logicH);
  }
  
  /** snapshot actions for current tick (Input phase) */
  sample(out: PlayerActions, logicW: number, logicH: number): void {
    // Move vector (WASD + arrows)
    const left = this.isDown("KeyA") || this.isDown("ArrowLeft");
    const right = this.isDown("KeyD") || this.isDown("ArrowRight");
    const up = this.isDown("KeyW") || this.isDown("ArrowUp");
    const down = this.isDown("KeyS") || this.isDown("ArrowDown");

    let mx = (right ? 1 : 0) + (left ? -1 : 0);
    let my = (down ? 1 : 0) + (up ? -1 : 0);

    const len = Math.hypot(mx, my);
    if (len > 1e-6) {
      mx /= len;
      my /= len;
    } else {
      mx = 0;
      my = 0;
    }

    out.move.x = mx;
    out.move.y = my;

    // Aim target (mouse -> logic coords)
    const { x, y } = this.clientToLogic(logicW, logicH);
    out.aimTarget.x = x;
    out.aimTarget.y = y;

    // Fire
    out.firePrimary = this.mouseDownL;
    out.fireSecondary = this.mouseDownR;

    // Bomb (buffered press)
    const bombPressed = this.bombDown && !this.prevBombDown;
    this.prevBombDown = this.bombDown;

    out.bombPressed = bombPressed;
    out.bombTarget.x = x;
    out.bombTarget.y = y;
  }

  private isDown(code: string): boolean {
    return this.keys.has(code);
  }

  private clientToLogic(logicW: number, logicH: number): { x: number; y: number } {
    const c = this.getCanvas();
    if (!c) return { x: logicW * 0.5, y: logicH * 0.5 };

    const r = c.getBoundingClientRect();

    const pw = this.present.dw;
    const ph = this.present.dh;
    const usePresent = pw > 1 && ph > 1;

    const left = (usePresent ? (r.left + this.present.ox) : r.left);
    const top  = (usePresent ? (r.top + this.present.oy) : r.top);
    const w    = (usePresent ? Math.max(1, pw) : Math.max(1, r.width));
    const h    = (usePresent ? Math.max(1, ph) : Math.max(1, r.height));

    const nx = (this.mouseClientX - left) / w;
    const ny = (this.mouseClientY - top) / h;

    const cx = Math.min(1, Math.max(0, nx));
    const cy = Math.min(1, Math.max(0, ny));

    return { x: cx * logicW, y: cy * logicH };
  }
}