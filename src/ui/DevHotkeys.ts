type HotkeyItem = { key: string; id: string };

function el<K extends keyof HTMLElementTagNameMap>(tag: K) {
  return document.createElement(tag);
}

/**
 * Minimal overlay that does NOT block canvas (pointer-events:none).
 * Reads mapping from window.__CM.devWaveHotkeys.
 *
 * Requirements:
 * - default hidden (keys still active elsewhere)
 * - positioned below top dev UI (roughly mid-screen)
 * - toggle visibility via "I" key handled in createGame.ts
 */
export class DevHotkeys {
  private root: HTMLDivElement;
  private visible = false;

  constructor(opts?: { defaultVisible?: boolean; top?: string; left?: string }) {
    this.visible = !!opts?.defaultVisible;

    this.root = el("div");
    this.root.id = "devhotkeys";

    const left = opts?.left ?? "8px";
    // Put it under the top debug/dev overlays. "50vh" ≈ middle of canvas/screen.
    const top = opts?.top ?? "50vh";

    this.root.style.cssText = [
      "position:fixed",
      `left:${left}`,
      `top:${top}`,
      "z-index:99999",
      "pointer-events:none",
      "user-select:none",
      "white-space:pre",
      "font:10px monospace",
      "color:rgba(255,255,255,0.9)",
      "text-shadow:0 1px 2px rgba(0,0,0,0.75)",
      `display:${this.visible ? "block" : "none"}`,
    ].join(";");

    document.body.appendChild(this.root);
    this.refresh();
  }

  setVisible(on: boolean): void {
    this.visible = !!on;
    this.root.style.display = this.visible ? "block" : "none";
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  isVisible(): boolean {
    return this.visible;
  }

  refresh(): void {
    const cm = (window as any).__CM;
    const list = (cm?.devWaveHotkeys as HotkeyItem[] | undefined) ?? [];

    if (!Array.isArray(list) || list.length === 0) {
      this.root.textContent = "";
      return;
    }

    const lines = list.map((it) => `${it.key}  ${it.id}`);
    this.root.textContent = lines.join("\n");
  }

  destroy(): void {
    this.root.remove();
  }
}
