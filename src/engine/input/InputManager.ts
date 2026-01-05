import type { PlayerActions, Vec2 } from "./ActionSchema";
import type { DisplayInfo } from "./DisplayContract";

type InputOptions = {
  // bomb press buffering in ticks (so press slightly before tick isn't lost)
  bombBufferTicks: number;

  // When true, prevent default browser actions (space scroll, RMB menu, etc.)
  preventDefaults: boolean;
};

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function normalizeMove(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (len <= 1e-6) return { x: 0, y: 0 };
  if (len <= 1) return v;
  return { x: v.x / len, y: v.y / len };
}

export class InputManager {
  private readonly el: HTMLCanvasElement;
  private readonly opts: InputOptions;

  // --- keyboard state
  private keyDown = new Set<string>();

  // --- mouse state (client coords)
  private mouseClient: Vec2 = { x: 0, y: 0 };
  private lmbDown = false;
  private rmbDown = false;

  // --- buffering (ticks)
  private bombBuffer = 0;
  private bombTargetBuffered: Vec2 = { x: 0, y: 0 };

  // --- display mapping
  private displayInfo: DisplayInfo | null = null;

  // --- lifecycle guard
  private attached = false;

  constructor(canvas: HTMLCanvasElement, options?: Partial<InputOptions>) {
    this.el = canvas;
    this.opts = {
      bombBufferTicks: 6,
      preventDefaults: true,
      ...options,
    };
  }

  /** Must be called on boot (dev/prod) */
  attach(): void {
    if (this.attached) return;
    this.attached = true;

    // keyboard
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp, { passive: false });

    // mouse - we listen on the canvas for deterministic canvas-relative aim
    this.el.addEventListener("mousemove", this.onMouseMove, { passive: false });
    this.el.addEventListener("mousedown", this.onMouseDown, { passive: false });
    this.el.addEventListener("mouseup", this.onMouseUp, { passive: false });
    this.el.addEventListener("contextmenu", this.onContextMenu, { passive: false });
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;

    window.removeEventListener("keydown", this.onKeyDown as any);
    window.removeEventListener("keyup", this.onKeyUp as any);

    this.el.removeEventListener("mousemove", this.onMouseMove as any);
    this.el.removeEventListener("mousedown", this.onMouseDown as any);
    this.el.removeEventListener("mouseup", this.onMouseUp as any);
    this.el.removeEventListener("contextmenu", this.onContextMenu as any);

    this.keyDown.clear();
    this.lmbDown = false;
    this.rmbDown = false;
    this.bombBuffer = 0;
  }

  /** Called from DisplayRenderer each resize/recompute */
  setDisplayInfo(info: DisplayInfo): void {
    this.displayInfo = info;
  }

  /**
   * Phase 0: Input Snapshot
   * Returns actions for the CURRENT tick.
   * Also decrements buffers (bombBuffer).
   */
  sampleActions(): PlayerActions {
    const move = this.readMove();
    const aim = this.readAimLogic();
    const firePrimary = this.lmbDown;
    const fireSecondary = this.rmbDown;

    // bombPressed is true only if buffer > 0, and we consume it now (1 tick)
    let bombPressed = false;
    let bombTarget = { ...aim };

    if (this.bombBuffer > 0) {
      bombPressed = true;
      bombTarget = { ...this.bombTargetBuffered };
      this.bombBuffer = 0; // consume (single trigger)
    }

    return {
      move,
      aim,
      firePrimary,
      fireSecondary,
      bombPressed,
      bombTarget,
    };
  }

  /**
   * Called once per tick end (optional).
   * If you prefer buffer decay tied to ticks, call this in Cleanup phase.
   */
  endTick(): void {
    if (this.bombBuffer > 0) this.bombBuffer--;
  }

  // --------------------------
  // Input read helpers
  // --------------------------
  private readMove(): Vec2 {
    const left = this.isDown("KeyA") || this.isDown("ArrowLeft");
    const right = this.isDown("KeyD") || this.isDown("ArrowRight");
    const up = this.isDown("KeyW") || this.isDown("ArrowUp");
    const down = this.isDown("KeyS") || this.isDown("ArrowDown");

    const x = (right ? 1 : 0) + (left ? -1 : 0);
    const y = (down ? 1 : 0) + (up ? -1 : 0);

    return normalizeMove({ x, y });
  }

  private readAimLogic(): Vec2 {
    // If we have no displayInfo yet, return center-ish fallback
    if (!this.displayInfo) return { x: 0, y: 0 };

    const rect = this.el.getBoundingClientRect();
    const cx = this.mouseClient.x - rect.left;
    const cy = this.mouseClient.y - rect.top;

    const { viewport, logicW, logicH } = this.displayInfo;

    // Map canvas-local CSS px -> viewport-local -> normalized -> logic
    const nx = (cx - viewport.x) / Math.max(1, viewport.w);
    const ny = (cy - viewport.y) / Math.max(1, viewport.h);

    // clamp inside viewport so aiming outside doesn't explode
    const ux = clamp01(nx);
    const uy = clamp01(ny);

    return {
      x: ux * logicW,
      y: uy * logicH,
    };
  }

  private isDown(code: string): boolean {
    return this.keyDown.has(code);
  }

  // --------------------------
  // DOM handlers
  // --------------------------
  private onKeyDown = (ev: KeyboardEvent) => {
    if (this.opts.preventDefaults) {
      // avoid page scroll & browser shortcuts during play
      if (ev.code === "Space" || ev.code.startsWith("Arrow")) ev.preventDefault();
    }

    // bomb trigger = Space press (buffered)
    if (ev.code === "Space") {
      // Only on initial press, not repeat
      if (!ev.repeat) {
        this.bombBuffer = Math.max(this.bombBuffer, this.opts.bombBufferTicks);
        // capture target at press time (deterministic)
        this.bombTargetBuffered = { ...this.readAimLogic() };
      }
    }

    this.keyDown.add(ev.code);
  };

  private onKeyUp = (ev: KeyboardEvent) => {
    if (this.opts.preventDefaults) {
      if (ev.code === "Space" || ev.code.startsWith("Arrow")) ev.preventDefault();
    }
    this.keyDown.delete(ev.code);
  };

  private onMouseMove = (ev: MouseEvent) => {
    if (this.opts.preventDefaults) ev.preventDefault();
    this.mouseClient = { x: ev.clientX, y: ev.clientY };
  };

  private onMouseDown = (ev: MouseEvent) => {
    if (this.opts.preventDefaults) ev.preventDefault();
    this.mouseClient = { x: ev.clientX, y: ev.clientY };

    if (ev.button === 0) this.lmbDown = true;
    if (ev.button === 2) this.rmbDown = true;
  };

  private onMouseUp = (ev: MouseEvent) => {
    if (this.opts.preventDefaults) ev.preventDefault();
    this.mouseClient = { x: ev.clientX, y: ev.clientY };

    if (ev.button === 0) this.lmbDown = false;
    if (ev.button === 2) this.rmbDown = false;
  };

  private onContextMenu = (ev: MouseEvent) => {
    if (this.opts.preventDefaults) ev.preventDefault();
  };
}
