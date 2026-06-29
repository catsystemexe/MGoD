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

  // EXISTUJÍCÍ
  private mouseClientX = 0;
  private mouseClientY = 0;
  private mouseDownL = false;
  private mouseDownR = false;

  // NOVÝ KÓD (ponech existující a doplň hned pod ně)
  private mouseMoveActive = false;
  private mousePrevX = 0;
  private mousePrevY = 0;

  private prevBombDown = false;
  private bombDown = false;
  private prevCycleW1Down = false;
  private prevCycleW2Down = false;
  private bound = false;

  constructor(private readonly getCanvas: () => HTMLCanvasElement | null) {
    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    // global fallback: kill context menu
    window.addEventListener("contextmenu", (e) => e.preventDefault());

    // safety: when focus is lost, avoid stuck buttons
    window.addEventListener("blur", () => {
      this.mouseDownL = false;
      this.mouseDownR = false;
      this.bombDown = false;
      this.prevBombDown = false;
      this.prevCycleW1Down = false;
      this.prevCycleW2Down = false;
    });
  }

  private bindCanvasEvents(): void {
    if (this.bound) return;

    const c = this.getCanvas();
    if (!c) return;

    this.bound = true;

    // make canvas focusable (keyboard input)
    try {
      (c as any).tabIndex = 0;
      (c.style as any).outline = "none";
    } catch {}

    // kill touch/drag defaults (Replit popup wrapper)
   
    c.style.touchAction = "none";
    c.style.userSelect = "none";
    (c.style as any).webkitUserSelect = "none";
    (c.style as any).webkitTouchCallout = "none";
    c.style.cursor = "none";

    const syncButtons = (buttons: number) => {
      this.mouseDownL = (buttons & 1) !== 0;
      this.mouseDownR = (buttons & 2) !== 0;
      this.bombDown = (buttons & 4) !== 0;
    };

    // Pointer move (reliable in popup wrapper)
    c.addEventListener(
      "pointermove",
      (e) => {
        e.preventDefault();
        e.stopPropagation();

        this.mouseClientX = e.clientX;
        this.mouseClientY = e.clientY;

        const buttons = (e as any).buttons ?? 0;
        syncButtons(buttons);
      },
      { passive: false },
    );

    c.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        e.stopPropagation();

        // focus canvas so arrows/WASD go to the game
        try {
          (c as any).focus?.();
        } catch {}

        // start mouse-move drag baseline
        this.mouseMoveActive = true;
        this.mousePrevX = e.clientX;
        this.mousePrevY = e.clientY;
        
        // capture pointer so we keep getting events
        try {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } catch {}

        const buttons = (e as any).buttons ?? 0;
        if (buttons) {
          syncButtons(buttons);
        } else {
          // fallback (some browsers)
          if (e.button === 0) this.mouseDownL = true;
          if (e.button === 2) this.mouseDownR = true;
          if (e.button === 1) this.bombDown = true;
        }
      },
      { passive: false, capture: true },
    );

    c.addEventListener(
      "pointerup",
      (e) => {
        e.preventDefault();
        e.stopPropagation();

        try {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        } catch {}

        const buttons = (e as any).buttons ?? 0;
        if (buttons) {
          syncButtons(buttons);
        } else {

        
          // fallback
          if (e.button === 0) this.mouseDownL = false;
          if (e.button === 2) this.mouseDownR = false;
          if (e.button === 1) this.bombDown = false;
        }
      },
      { passive: false, capture: true },
    );

    this.mouseMoveActive = false;
    
    c.addEventListener(
      "pointercancel",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.mouseDownL = false;
        this.mouseDownR = false;
        this.bombDown = false;
      },
      { passive: false, capture: true },
    );
    this.mouseMoveActive = false;

    
    // if capture is lost unexpectedly, reset buttons
    c.addEventListener(
      "lostpointercapture",
      (_e) => {
        this.mouseDownL = false;
        this.mouseDownR = false;
        this.bombDown = false;
      },
      { passive: true },
      
    );
    this.mouseMoveActive = false;

    
    // disable context menu on canvas (RMB)
    c.addEventListener(
      "contextmenu",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      { passive: false, capture: true },
    );
  }

  public getAimTargetNow(logicW: number, logicH: number): { x: number; y: number } {
    return this.clientToLogic(logicW, logicH);
  }

  /** snapshot actions for current tick (Input phase) */
  public sample(out: PlayerActions, logicW: number, logicH: number): void {
    this.bindCanvasEvents();

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

    // default from keyboard
    let outMx = mx;
    let outMy = my;

    // mouse drag => analog move (dx/dy in client px)
    if (this.mouseMoveActive) {
      const dx = this.mouseClientX - this.mousePrevX;
      const dy = this.mouseClientY - this.mousePrevY;

      this.mousePrevX = this.mouseClientX;
      this.mousePrevY = this.mouseClientY;

      const scale = 4;
      const boost = 2;

      const sx = dx / scale;
      const sy = dy / scale;

      const mdx = Math.tanh(Math.sign(sx) * Math.pow(Math.abs(sx), 0.75) * boost);
      const mdy = Math.tanh(Math.sign(sy) * Math.pow(Math.abs(sy), 0.75) * boost);
      // if mouse moved enough, override keyboard
      if (Math.abs(mdx) > 0.001 || Math.abs(mdy) > 0.001) {
        outMx = mdx;
        outMy = mdy;
      }
    }

    out.move.x = outMx;
    out.move.y = outMy;

    // Aim target (mouse -> logic coords)
    const { x, y } = this.clientToLogic(logicW, logicH);
    out.aimTarget.x = x;
    out.aimTarget.y = y;
    // Fire (held)
    out.firePrimary = this.mouseDownL;
    out.fireSecondary = this.mouseDownR;

    // Bomb (buffered press)
    const bombPressed = this.bombDown && !this.prevBombDown;
    this.prevBombDown = this.bombDown;

    out.bombPressed = bombPressed;
    out.bombTarget.x = x;
    out.bombTarget.y = y;

    // Temporary weapon level controls. Minus/Equal are intentionally used
    // instead of Digit1/Digit2 (dev wave hotkeys) or Brackets (BG preset hotswap).
    const cycleW1Down = this.isDown("Minus");
    const cycleW2Down = this.isDown("Equal");
    out.cycleW1LevelPressed = cycleW1Down && !this.prevCycleW1Down;
    out.cycleW2LevelPressed = cycleW2Down && !this.prevCycleW2Down;
    this.prevCycleW1Down = cycleW1Down;
    this.prevCycleW2Down = cycleW2Down;
  }

  private isDown(code: string): boolean {
    return this.keys.has(code);
  }

  private clientToLogic(logicW: number, logicH: number): { x: number; y: number } {
    const pw = this.present.dw;
    const ph = this.present.dh;
    const usePresent = pw > 1 && ph > 1;

    let left = 0;
    let top = 0;
    let w = 1;
    let h = 1;

    const c = this.getCanvas();
    if (!c) return { x: logicW * 0.5, y: logicH * 0.5 };

    const r = c.getBoundingClientRect();

    if (usePresent) {
      // present rect is RELATIVE to canvas (CSS px), therefore + r.left/top
      left = r.left + this.present.ox;
      top = r.top + this.present.oy;
      w = Math.max(1, this.present.dw);
      h = Math.max(1, this.present.dh);
    } else {
      left = r.left;
      top = r.top;
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
    }

    const nx = (this.mouseClientX - left) / w;
    const ny = (this.mouseClientY - top) / h;

    const cx = Math.min(1, Math.max(0, nx));
    const cy = Math.min(1, Math.max(0, ny));

    return { x: cx * logicW, y: cy * logicH };
  }
}