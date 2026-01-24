import type { BgPreset } from "../game/bg/schema/BgPreset";

function el<K extends keyof HTMLElementTagNameMap>(tag: K) {
  return document.createElement(tag);
}

type BgDevApi = {
  presets: () => BgPreset[];
  setPresetById: (id: string) => void;
  getActivePresetId: () => string | null;
};

export class BgDevUI {
  private root: HTMLDivElement;
  private visible = false;

  constructor(private api: BgDevApi, opts?: { defaultVisible?: boolean }) {
    this.visible = !!opts?.defaultVisible;

    this.root = el("div");
    this.root.id = "bgdevui";
    this.root.style.cssText = [
      "position:fixed",
      "right:10px",
      "top:10px",
      "z-index:99999",
      "pointer-events:auto",
      "color:#fff",
      "font:11px monospace",
      "background:rgba(10,12,15,0.80)",
      "border:1px solid rgba(255,255,255,0.18)",
      "border-radius:10px",
      "padding:10px",
      "min-width:260px",
      `display:${this.visible ? "block" : "none"}`,
      "user-select:none",
    ].join(";");

    document.body.appendChild(this.root);
    this.render();
    }

    
    // MVP: cheap auto-refresh when visible (keeps "active" and highlight in sync)

  toggle(): void {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? "block" : "none";
    if (this.visible) this.render();
  }

  private render(): void {
    const presets = this.api.presets?.() ?? [];
    const active = this.api.getActivePresetId?.();

    this.root.innerHTML = "";

    const title = el("div");
    title.textContent = "BG DEV UI (U toggles)";
    title.style.cssText = "font-weight:700;margin-bottom:8px;opacity:0.95;";
    this.root.appendChild(title);

    // controls row
    const row = el("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin:-2px 0 8px 0;";
    this.root.appendChild(row);

    const mkBtn = (label: string, onClick: () => void) => {
      const b = el("button");
      b.textContent = label;
      b.style.cssText = [
        "cursor:pointer",
        "background:rgba(255,255,255,0.08)",
        "border:1px solid rgba(255,255,255,0.15)",
        "color:white",
        "padding:3px 8px",
        "border-radius:8px",
        "font:11px monospace",
        "line-height:12px",
      ].join(";");
      b.onclick = () => onClick();
      row.appendChild(b);
      return b;
    };

    mkBtn("Refresh", () => this.render());
    mkBtn("Close", () => this.toggle());

    
    const act = el("div");
    act.textContent = `active: ${active ?? "(none)"}`;
    act.style.cssText = "opacity:0.9;margin-bottom:8px;";
    this.root.appendChild(act);

    for (const p of presets) {
      const b = el("button");
      b.textContent = `${p.id}  [${p.kind}]`;
      b.style.cssText = [
        "cursor:pointer",
        "background:rgba(255,255,255,0.08)",
        "border:1px solid rgba(255,255,255,0.15)",
        "color:white",
        "padding:4px 8px",
        "border-radius:8px",
        "font:11px monospace",
        "text-align:left",
        "width:100%",
        "margin:0 0 6px 0",
      ].join(";");
      if (active && p.id === active) {
        b.style.border = "1px solid rgba(120,255,180,0.55)";
        b.style.background = "rgba(120,255,180,0.10)";
      }
      b.onclick = () => {
          this.api.setPresetById(p.id);
          this.render();
        };
this.root.appendChild(b);
    }
  }

  destroy(): void {
      this.root.remove();
    }
}
