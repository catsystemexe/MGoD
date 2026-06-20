type GridState = {
  waveHeight: number;
  waveSpeed: number;
  gridDensity: number;
  horizon: number;
  glowIntensity: number;
};

const DEFAULTS: GridState = {
  waveHeight: 0.8,
  waveSpeed: 0.15,
  gridDensity: 8,
  horizon: 0.5,
  glowIntensity: 0.8,
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
  key: keyof GridState;
  label: string;
  min: number;
  max: number;
  step: number;
};

const SLIDERS: SliderDef[] = [
  { key: "waveHeight", label: "Wave H", min: 0, max: 3, step: 0.01 },
  { key: "waveSpeed", label: "Wave Spd", min: 0, max: 3, step: 0.05 },
  { key: "gridDensity", label: "Density", min: 2, max: 20, step: 0.5 },
  { key: "horizon", label: "Horizon", min: 0.3, max: 0.7, step: 0.01 },
  { key: "glowIntensity", label: "Glow", min: 0, max: 2, step: 0.05 },
];

export class GridLabUI {
  private root: HTMLDivElement;
  private visible = false;
  private state: GridState;

  constructor() {
    this.state = { ...DEFAULTS };
    this.sync();

    const root = el("div", "cm-grid");
    this.root = root;
    root.style.display = "none";

    const style = el("style");
    style.textContent = `
      .cm-grid{
        position:fixed;left:10px;bottom:10px;width:190px;z-index:100000;
        background:rgba(0,0,0,0.72);color:#e6f7ff;
        border:1px solid rgba(120,220,255,0.18);border-radius:8px;padding:8px;
        font:11px/1.3 ui-monospace,Menlo,Consolas,monospace;
        -webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);
        pointer-events:auto;
      }
      .cm-grid h4{margin:0 0 6px;font-size:11px;letter-spacing:.5px;color:#7fdfff;}
      .cm-grid-row{display:flex;align-items:center;gap:4px;margin:3px 0;}
      .cm-grid-lbl{width:58px;opacity:.85;flex-shrink:0;}
      .cm-grid-val{width:34px;text-align:right;opacity:.7;flex-shrink:0;}
      .cm-grid input[type=range]{flex:1;height:3px;cursor:pointer;}
    `;

    const h = el("h4");
    h.textContent = "Grid Lab [G]";
    root.appendChild(style);
    root.appendChild(h);

    for (const sd of SLIDERS) {
      const row = el("div", "cm-grid-row");

      const lbl = el("span", "cm-grid-lbl");
      lbl.textContent = sd.label;

      const val = el("span", "cm-grid-val");
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
        val.textContent = v.toFixed(2);
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
    (globalThis as any).__CM_GRID__ = { ...this.state };
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
