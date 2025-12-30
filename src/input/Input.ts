// src/input/Input.ts
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private attached = false;

  // mouse
  private mouseDown = new Set<number>();     // 0 LMB, 1 MMB, 2 RMB
  private mousePressed = new Set<number>();  // edge-triggered per frame
  private mouse = { x: 0, y: 0, inside: false };
  private wheelAcc = 0;

  constructor(private target: Window, private canvas: HTMLCanvasElement) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;

      // Block page scroll / browser actions for game keys
      if (code === "Space" || code.startsWith("Arrow")) {
        e.preventDefault();
      }

      if (!this.down.has(code)) {
        this.pressed.add(code);
      }
      this.down.add(code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      this.down.delete(code);
    };

    const onBlur = () => {
      this.down.clear();
      this.pressed.clear();
      this.mouseDown.clear();
      this.mousePressed.clear();
      this.mouse.inside = false;
      this.wheelAcc = 0;
    };

    // --- mouse helpers ---
    const updateMouseFromEvent = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left; // CSS px
      this.mouse.y = e.clientY - rect.top;  // CSS px
      this.mouse.inside =
        this.mouse.x >= 0 && this.mouse.y >= 0 &&
        this.mouse.x <= rect.width && this.mouse.y <= rect.height;
    };

    const onMouseMove = (e: MouseEvent) => {
      updateMouseFromEvent(e);
    };

    const onMouseDown = (e: MouseEvent) => {
      updateMouseFromEvent(e);
      const b = e.button;

      // prevent selecting text / drag / context menu
      e.preventDefault();

      if (!this.mouseDown.has(b)) this.mousePressed.add(b);
      this.mouseDown.add(b);
    };

    const onMouseUp = (e: MouseEvent) => {
      updateMouseFromEvent(e);
      this.mouseDown.delete(e.button);
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      // invert? zatím necháme přirozeně: + dolů, - nahoru (podle zařízení)
      // normalizace: jen sign, pro “přehazování pořadí bomb”
      this.wheelAcc += Math.sign(e.deltaY);
      e.preventDefault();
    };

    // Capture on BOTH window and document (iframes + iPad behave inconsistently)
    this.target.addEventListener("keydown", onKeyDown as any, { capture: true } as any);
    this.target.addEventListener("keyup", onKeyUp as any, { capture: true } as any);
    window.addEventListener("blur", onBlur);

    document.addEventListener("keydown", onKeyDown as any, { capture: true } as any);
    document.addEventListener("keyup", onKeyUp as any, { capture: true } as any);

    // mouse on canvas (nejčistší)
    this.canvas.addEventListener("mousemove", onMouseMove as any, { passive: false } as any);
    this.canvas.addEventListener("mousedown", onMouseDown as any, { passive: false } as any);
    this.canvas.addEventListener("mouseup", onMouseUp as any, { passive: false } as any);
    this.canvas.addEventListener("contextmenu", onContextMenu as any, { passive: false } as any);
    this.canvas.addEventListener("wheel", onWheel as any, { passive: false } as any);

    // stash handlers for detach
    (this as any)._handlers = {
      onKeyDown, onKeyUp, onBlur,
      onMouseMove, onMouseDown, onMouseUp, onContextMenu, onWheel
    };
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;

    const h = (this as any)._handlers;
    if (!h) return;

    this.target.removeEventListener("keydown", h.onKeyDown as any, { capture: true } as any);
    this.target.removeEventListener("keyup", h.onKeyUp as any, { capture: true } as any);
    window.removeEventListener("blur", h.onBlur);

    document.removeEventListener("keydown", h.onKeyDown as any, { capture: true } as any);
    document.removeEventListener("keyup", h.onKeyUp as any, { capture: true } as any);

    this.canvas.removeEventListener("mousemove", h.onMouseMove as any);
    this.canvas.removeEventListener("mousedown", h.onMouseDown as any);
    this.canvas.removeEventListener("mouseup", h.onMouseUp as any);
    this.canvas.removeEventListener("contextmenu", h.onContextMenu as any);
    this.canvas.removeEventListener("wheel", h.onWheel as any);

    this.down.clear();
    this.pressed.clear();
    this.mouseDown.clear();
    this.mousePressed.clear();
    this.wheelAcc = 0;
  }

  beginFrame(): void {
    // clear edge-triggered presses once per visual frame
    this.pressed.clear();
    this.mousePressed.clear();
    // wheelAcc NEresetuj tady – to se čte přes consumeWheel()
  }

  // ----- keyboard -----
  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  // ----- mouse -----
  getMouse(): { x: number; y: number; inside: boolean } {
    return { ...this.mouse };
  }

  isMouseDown(button: number): boolean {
    return this.mouseDown.has(button);
  }

  wasMousePressed(button: number): boolean {
    return this.mousePressed.has(button);
  }

  consumeWheel(): number {
    const v = this.wheelAcc;
    this.wheelAcc = 0;
    return v;
  }
}