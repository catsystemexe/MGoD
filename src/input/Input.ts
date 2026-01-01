export class Input {
  private keys = new Set<string>();
  private prevKeys = new Set<string>();
  private mouse = { x: 0, y: 0 };
  constructor(private win: Window, private el: HTMLElement) {}
  attach() {
    this.win.addEventListener("keydown", (e) => this.keys.add(e.code));
    this.win.addEventListener("keyup", (e) => this.keys.delete(e.code));
    this.el.addEventListener("pointermove", (e) => {
      const rect = this.el.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    });
  }
  isDown(code: string) { return this.keys.has(code); }
  wasPressed(code: string) { return this.keys.has(code) && !this.prevKeys.has(code); }
  postUpdate() { this.prevKeys = new Set(this.keys); }
  getMouse() { return this.mouse; }
}
