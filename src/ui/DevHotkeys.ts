type HotkeyItem = { key: string; id: string };

function el<K extends keyof HTMLElementTagNameMap>(tag: K) {
  return document.createElement(tag);
}

/**
 * Minimal overlay that does NOT block canvas (pointer-events:none).
 * Reads mapping from window.__CM.devWaveHotkeys.
 *
 * Responsibilities:
 * - display only (NO key handling)
 * - default hidden
 * - safe against missing __CM
 * - auto-refresh (MVP)
 */
export class DevHotkeys {
  private root: HTMLDivElement;
  private visible = false;

  constructor(opts?: { defaultVisible?: boolean; top?: string; left?: string }) {
    this.visible = !!opts?.defaultVisible;

    this.root = el("div");
    this.root.id = "devhotkeys";

    const left = opts?.left ?? "8px";
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

    // MVP auto-refresh loop (cheap, safe)
    const tick = () => {
      if (!document.body.contains(this.root)) return;
      this.refresh();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
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
    const g: any = window as any;
    const cm = g.__CM;

    if (!cm || !Array.isArray(cm.devWaveHotkeys)) {
      this.root.textContent = "";
      return;
    }

    const list = cm.devWaveHotkeys as HotkeyItem[];
    if (list.length === 0) {
      this.root.textContent = "";
      return;
    }

    this.root.textContent = list
      .map(it => `${it.key.padEnd(3)} ${it.id}`)
      .join("\n");
  }

  destroy(): void {
    this.root.remove();
  }
}