type SpaceState = {
  flowSpeed: number;
  kickScale: number;
  meander: number;
  density: number;
};

const DEFAULTS: SpaceState = {
  flowSpeed: 1.0,
  kickScale: 1.2,
  meander: 1.0,
  density: 80,
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

type SliderDef = {
  key: keyof SpaceState;
  label: string;
  min: number;
  max: number;
  step: number;
  decimals?: number;
};

const SLIDERS: SliderDef[] = [
  { key: "flowSpeed", label: "Flow Spd", min: 0.1, max: 3.0, step: 0.05 },
  { key: "kickScale", label: "Kick", min: 0.1, max: 3.0, step: 0.05 },
  { key: "meander", label: "Meander", min: 0.0, max: 2.0, step: 0.05 },
  { key: "density", label: "Density", min: 10, max: 200, step: 1, decimals: 0 },
];

export class SpaceLabUI {
  private root: HTMLDivElement;
  private visible = false;
  private state: SpaceState;

  constructor() {
    this.state = { ...DEFAULTS };
    this.sync();

    const root = el("div", "cm-space");
    this.root = root;
    root.style.display = "none";

    const style = el("style");
    style.textContent = `
      .cm-space{
        position:fixed;right:10px;bottom:10px;width:190px;z-index:100000;
        background:rgba(0,0,0,0.72);color:#e6f7ff;
        border:1px solid rgba(120,220,255,0.18);border-radius:8px;padding:8px;
        font:11px/1.3 ui-monospace,Menlo,Consolas,monospace;
        -webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);
        pointer-events:auto;
      }
      .cm-space h4{margin:0 0 6px;font-size:11px;letter-spacing:.5px;color:#7fdfff;}
      .cm-space-row{display:flex;align-items:center;gap:4px;margin:3px 0;}
      .cm-space-lbl{width:58px;opacity:.85;flex-shrink:0;}
      .cm-space-val{width:34px;text-align:right;opacity:.7;flex-shrink:0;}
      .cm-space input[type=range]{flex:1;height:3px;cursor:pointer;}
    `;

    const h = el("h4");
    h.textContent = "Space Lab [L]";
    root.appendChild(style);
    root.appendChild(h);

    for (const sd of SLIDERS) {
      const row = el("div", "cm-space-row");

      const lbl = el("span", "cm-space-lbl");
      lbl.textContent = sd.label;

      const val = el("span", "cm-space-val");
      val.textContent = String(this.state[sd.key]);

      const slider = el("input");
      slider.type = "range";
      slider.min = String(sd.min);
      slider.max = String(sd.max);
      slider.step = String(sd.step);
      slider.value = String(this.state[sd.key]);
      slider.oninput = () => {
        const v = clamp(Number(slider.value), sd.min, sd.max);
        this.state[sd.key] = v;
        val.textContent = v.toFixed(sd.decimals ?? 2);
        this.sync();
      };

      row.appendChild(lbl);
      row.appendChild(slider);
      row.appendChild(val);
      root.appendChild(row);
    }

    document.body.appendChild(root);
  }

  private sync(): void {
    (globalThis as any).__CM_SPACE__ = { ...this.state };
  }

  show(): void {
    this.visible = true;
    this.root.style.display = "";
  }

  hide(): void {
    this.visible = false;
    this.root.style.display = "none";
  }

  toggle(): void {
    if (this.visible) this.hide(); else this.show();
  }
}
