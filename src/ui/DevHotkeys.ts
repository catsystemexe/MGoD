type HotkeyItem = { key: string; id: string };

function el<K extends keyof HTMLElementTagNameMap>(tag: K) {
  return document.createElement(tag);
}

/**
 * Minimal overlay that does NOT block canvas (pointer-events:none).
 * Reads mapping from window.__CM.devWaveHotkeys.
 */
export class DevHotkeys {
  private root: HTMLDivElement;

  constructor() {
    this.root = el("div");
    this.root.id = "devhotkeys";
    this.root.style.cssText = [
      "position:fixed",
      "left:8px",
      "top:8px",
      "z-index:99999",
      "pointer-events:none",
      "user-select:none",
      "white-space:pre",
      "font:10px monospace",
      "color:rgba(255,255,255,0.9)",
      "text-shadow:0 1px 2px rgba(0,0,0,0.75)",
    ].join(";");

    document.body.appendChild(this.root);
    this.refresh();
  }

  refresh(): void {
    const cm = (window as any).__CM;
    const list = (cm?.devWaveHotkeys as HotkeyItem[] | undefined) ?? [];

    if (!Array.isArray(list) || list.length === 0) {
      this.root.textContent = "";
      return;
    }

    // format:
    // 1  wave.red
    // 2  wave.green
    const lines = list.map(it => `${it.key}  ${it.id}`);
    this.root.textContent = lines.join("\n");
  }

  destroy(): void {
    this.root.remove();
  }
}
