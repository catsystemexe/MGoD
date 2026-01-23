type BgKind = "shader" | "flowRibbon" | "flowSegments";

export type BgLabState = {
  enabled: boolean;
  kind: BgKind;
  presetIndex: number;

  flow?: {
    // colors (hex) + alpha
    colorsFar?: string;   // "#RRGGBB"
    colorsMid?: string;
    colorsNear?: string;
    alphaFar?: number;    // 0..1
    alphaMid?: number;
    alphaNear?: number;

    // ribbon
    ribbonLanes?: number;
    ribbonStepPx?: number;
    thicknessMulFar?: number;
    thicknessMulMid?: number;
    thicknessMulNear?: number;

    // segments
    segCountBase?: number;
    segYJitterPx?: number;
    segSpeedBase?: number;

    // blend mode for BG-only pass
    blend?: "alpha" | "add";
  };
};

const LS_KEY = "CM_BG_LAB_PRESETS_v1";

function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

function hexToRgb01(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return [r / 255, g / 255, b / 255];
}

function safeJsonParse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function defaultState(): BgLabState {
  return {
    enabled: false,
    kind: "shader",
    presetIndex: 0,
    flow: {
      colorsFar: "#5aa0ff",
      colorsMid: "#8fefff",
      colorsNear: "#e6ffff",
      alphaFar: 0.10,
      alphaMid: 0.14,
      alphaNear: 0.18,

      ribbonLanes: 90,
      ribbonStepPx: 6,
      thicknessMulFar: 0.8,
      thicknessMulMid: 1.0,
      thicknessMulNear: 1.2,

      segCountBase: 1400,
      segYJitterPx: 10,
      segSpeedBase: 44,

      blend: "add",
    },
  };
}

export function getBgLabState(): BgLabState {
  const g = globalThis as any;
  if (!g.__CM_BG_LAB__) g.__CM_BG_LAB__ = defaultState();
  return g.__CM_BG_LAB__ as BgLabState;
}

export function setBgGlobalsFromState(st: BgLabState): void {
  const g = globalThis as any;

  // když je BG Lab aktivní, vynutíme flow pass
  if (st.enabled) {
    g.__CM_BG_KIND__ = "flow";
  }

  // pokud chceš mít možnost Lab vypnout a vrátit shader:
  // else g.__CM_BG_KIND__ = "shader";

  // zachovej presetIndex pokud existuje v state (jestli ho tam máš)
  if (Number.isFinite((st as any).presetIndex)) {
    g.__CM_BG_PRESET__ = ((st as any).presetIndex | 0);
  }
}

type StoredPreset = { name: string; state: BgLabState };
type StoredDb = { presets: StoredPreset[] };

function loadDb(): StoredDb {
  const raw = localStorage.getItem(LS_KEY) ?? "";
  const db = safeJsonParse<StoredDb>(raw, { presets: [] });
  if (!db.presets) db.presets = [];
  return db;
}

function saveDb(db: StoredDb): void {
  localStorage.setItem(LS_KEY, JSON.stringify(db));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

function row(label: string): HTMLDivElement {
  const r = el("div", "cm-bglab-row");
  const l = el("div", "cm-bglab-lbl");
  l.textContent = label;
  r.appendChild(l);
  return r;
}

function btn(text: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", "cm-bglab-btn") as HTMLButtonElement;
  b.textContent = text;
  b.onclick = onClick;
  return b;
}

function numInput(value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLInputElement {
  const i = el("input", "cm-bglab-in") as HTMLInputElement;
  i.type = "number";
  i.value = String(value);
  i.min = String(min);
  i.max = String(max);
  i.step = String(step);
  i.oninput = () => {
    const v = clamp(Number(i.value), min, max);
    if (Number.isFinite(v)) onChange(v);
  };
  return i;
}

function slider(value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLInputElement {
  const s = el("input", "cm-bglab-sl") as HTMLInputElement;
  s.type = "range";
  s.value = String(value);
  s.min = String(min);
  s.max = String(max);
  s.step = String(step);
  s.oninput = () => onChange(Number(s.value));
  return s;
}

function colorInput(value: string, onChange: (v: string) => void): HTMLInputElement {
  const c = el("input", "cm-bglab-color") as HTMLInputElement;
  c.type = "color";
  c.value = value;
  c.oninput = () => onChange(c.value);
  return c;
}

// Exposed helper for BG renderers
function installGlobals(): void {
  const g = globalThis as any;

  // color getter: returns vec4 [r,g,b,a] or null
  g.__CM_BG_LAB_getFlowColor__ = (which: "far"|"mid"|"near") => {
    const st = getBgLabState();
    const f = st.flow ?? {};
    const hex =
      which === "far" ? (f.colorsFar ?? "#ffffff") :
      which === "mid" ? (f.colorsMid ?? "#ffffff") :
                        (f.colorsNear ?? "#ffffff");
    const a =
      which === "far" ? clamp(Number(f.alphaFar ?? 0.10), 0, 1) :
      which === "mid" ? clamp(Number(f.alphaMid ?? 0.14), 0, 1) :
                        clamp(Number(f.alphaNear ?? 0.18), 0, 1);
    const rgb = hexToRgb01(hex);
    return rgb ? [rgb[0], rgb[1], rgb[2], a] : null;
  };

  g.__CM_BG_LAB_getFlowOverrides__ = () => {
    const st = getBgLabState();
    return st.flow ?? {};
  };
}

export class BgLabUI {
  private root: HTMLDivElement;
  private visible = false;

  constructor() {
    const st = getBgLabState();
    setBgGlobalsFromState(st);
    installGlobals();

    const root = el("div", "cm-bglab") as HTMLDivElement;
    this.root = root;
    root.style.display = "none";

    const style = el("style");
    style.textContent = `
      .cm-bglab{
        position:fixed; right:10px; top:10px; width:360px; z-index:99999;
        background:rgba(0,0,0,0.78); color:#eaeaea; border:1px solid rgba(255,255,255,0.12);
        border-radius:10px; padding:10px 10px 12px 10px; font:12px/1.25 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
      }
      .cm-bglab h3{margin:0 0 8px 0; font-size:13px; font-weight:700; letter-spacing:0.2px;}
      .cm-bglab small{opacity:0.75}
      .cm-bglab-row{display:flex; align-items:center; gap:8px; margin:6px 0;}
      .cm-bglab-lbl{width:120px; opacity:0.85;}
      .cm-bglab-in{width:92px; padding:3px 6px; border-radius:6px; border:1px solid rgba(255,255,255,0.14); background:rgba(0,0,0,0.35); color:#fff;}
      .cm-bglab-sl{flex:1;}
      .cm-bglab-btn{padding:4px 8px; border-radius:7px; border:1px solid rgba(255,255,255,0.16); background:rgba(255,255,255,0.06); color:#fff; cursor:pointer;}
      .cm-bglab-btn:hover{background:rgba(255,255,255,0.10);}
      .cm-bglab-select{flex:1; padding:3px 6px; border-radius:6px; border:1px solid rgba(255,255,255,0.14); background:rgba(0,0,0,0.35); color:#fff;}
      .cm-bglab-color{width:44px; height:24px; padding:0; border:0; background:transparent;}
      .cm-bglab-hr{height:1px; background:rgba(255,255,255,0.10); margin:8px 0;}
      .cm-bglab-text{width:100%; height:84px; resize:vertical; padding:6px; border-radius:8px; border:1px solid rgba(255,255,255,0.14); background:rgba(0,0,0,0.35); color:#fff;}
    `;

    const h = el("h3");
    h.textContent = "BG Lab · Flow / Ribbon / Shader";
    const hint = el("div");
    hint.innerHTML = `<small>Toggle: <b>F7</b> · Apply: auto · Saves: localStorage</small>`;
    root.appendChild(h);
    root.appendChild(hint);

    const rKind = row("BG kind");
    const sel = el("select", "cm-bglab-select") as HTMLSelectElement;
    for (const k of ["shader","flowRibbon","flowSegments"] as BgKind[]) {
      const o = el("option") as HTMLOptionElement;
      o.value = k; o.textContent = k;
      sel.appendChild(o);
    }
    sel.value = st.kind;
    sel.onchange = () => {
      st.kind = sel.value as BgKind;
      setBgGlobalsFromState(st);
    };
    rKind.appendChild(sel);
    root.appendChild(rKind);

    const rPreset = row("presetIndex");
    const inPreset = numInput(st.presetIndex, -999, 999, 1, (v) => {
      st.presetIndex = v | 0;
      setBgGlobalsFromState(st);
    });
    rPreset.appendChild(inPreset);
    rPreset.appendChild(btn("prev", () => { st.presetIndex--; inPreset.value = String(st.presetIndex); setBgGlobalsFromState(st); }));
    rPreset.appendChild(btn("next", () => { st.presetIndex++; inPreset.value = String(st.presetIndex); setBgGlobalsFromState(st); }));
    root.appendChild(rPreset);

    root.appendChild(el("div","cm-bglab-hr"));

    // blend
    const rBlend = row("flow.blend");
    const selBlend = el("select","cm-bglab-select") as HTMLSelectElement;
    for (const b of ["add","alpha"] as const) {
      const o = el("option") as HTMLOptionElement;
      o.value = b; o.textContent = b;
      selBlend.appendChild(o);
    }
    selBlend.value = st.flow?.blend ?? "add";
    selBlend.onchange = () => {
      st.flow ??= {};
      st.flow.blend = selBlend.value as any;
    };
    rBlend.appendChild(selBlend);
    root.appendChild(rBlend);

    const addColorRow = (label: string, keyHex: "colorsFar"|"colorsMid"|"colorsNear", keyA: "alphaFar"|"alphaMid"|"alphaNear") => {
      const r = row(label);
      const f = st.flow ??= {};
      const hex = (f[keyHex] ?? "#ffffff") as string;
      const a = clamp(Number(f[keyA] ?? 0.15), 0, 1);
      const c = colorInput(hex, (v) => { f[keyHex] = v; });
      const aIn = numInput(a, 0, 1, 0.01, (v) => { f[keyA] = v; });
      r.appendChild(c);
      r.appendChild(aIn);
      const s = slider(a, 0, 1, 0.01, (v) => { f[keyA] = v; aIn.value = v.toFixed(2); });
      r.appendChild(s);
      root.appendChild(r);
    };

    addColorRow("color far", "colorsFar", "alphaFar");
    addColorRow("color mid", "colorsMid", "alphaMid");
    addColorRow("color near","colorsNear","alphaNear");

    root.appendChild(el("div","cm-bglab-hr"));

    const addNumRow = (label: string, get: () => number, min: number, max: number, step: number, set: (v: number) => void) => {
      const r = row(label);
      const v0 = get();
      const ni = numInput(v0, min, max, step, (v) => set(v));
      const sl = slider(v0, min, max, step, (v) => { set(v); ni.value = String(v); });
      r.appendChild(ni);
      r.appendChild(sl);
      root.appendChild(r);
    };

    addNumRow("ribbon.lanes",
      () => Number(st.flow?.ribbonLanes ?? 90),
      10, 220, 1,
      (v) => { st.flow ??= {}; st.flow.ribbonLanes = v | 0; }
    );

    addNumRow("ribbon.stepPx",
      () => Number(st.flow?.ribbonStepPx ?? 6),
      2, 24, 1,
      (v) => { st.flow ??= {}; st.flow.ribbonStepPx = v | 0; }
    );

    addNumRow("thickMul far",
      () => Number(st.flow?.thicknessMulFar ?? 0.8),
      0.2, 2.5, 0.05,
      (v) => { st.flow ??= {}; st.flow.thicknessMulFar = v; }
    );
    addNumRow("thickMul mid",
      () => Number(st.flow?.thicknessMulMid ?? 1.0),
      0.2, 2.5, 0.05,
      (v) => { st.flow ??= {}; st.flow.thicknessMulMid = v; }
    );
    addNumRow("thickMul near",
      () => Number(st.flow?.thicknessMulNear ?? 1.2),
      0.2, 2.5, 0.05,
      (v) => { st.flow ??= {}; st.flow.thicknessMulNear = v; }
    );

    root.appendChild(el("div","cm-bglab-hr"));

    addNumRow("seg.countBase",
      () => Number(st.flow?.segCountBase ?? 1400),
      0, 6000, 10,
      (v) => { st.flow ??= {}; st.flow.segCountBase = v | 0; }
    );
    addNumRow("seg.yJitterPx",
      () => Number(st.flow?.segYJitterPx ?? 10),
      0, 60, 1,
      (v) => { st.flow ??= {}; st.flow.segYJitterPx = v; }
    );
    addNumRow("seg.speedBase",
      () => Number(st.flow?.segSpeedBase ?? 44),
      0, 200, 1,
      (v) => { st.flow ??= {}; st.flow.segSpeedBase = v; }
    );

    root.appendChild(el("div","cm-bglab-hr"));

    // presets
    const rSave = row("presets");
    const nameIn = el("input","cm-bglab-in") as HTMLInputElement;
    nameIn.placeholder = "name…";
    nameIn.style.width = "120px";
    const selP = el("select","cm-bglab-select") as HTMLSelectElement;
    selP.style.flex = "1";

    const refreshPresetList = () => {
      const db = loadDb();
      selP.innerHTML = "";
      const opt0 = el("option") as HTMLOptionElement;
      opt0.value = ""; opt0.textContent = "(select)";
      selP.appendChild(opt0);
      for (const p of db.presets) {
        const o = el("option") as HTMLOptionElement;
        o.value = p.name;
        o.textContent = p.name;
        selP.appendChild(o);
      }
    };
    refreshPresetList();

    rSave.appendChild(nameIn);
    rSave.appendChild(btn("save", () => {
      const nm = nameIn.value.trim();
      if (!nm) return;
      const db = loadDb();
      const copy: BgLabState = JSON.parse(JSON.stringify(getBgLabState()));
      const i = db.presets.findIndex(p => p.name === nm);
      if (i >= 0) db.presets[i] = { name: nm, state: copy };
      else db.presets.push({ name: nm, state: copy });
      saveDb(db);
      refreshPresetList();
      selP.value = nm;
    }));

    rSave.appendChild(selP);

    rSave.appendChild(btn("load", () => {
      const nm = selP.value;
      if (!nm) return;
      const db = loadDb();
      const p = db.presets.find(x => x.name === nm);
      if (!p) return;
      (globalThis as any).__CM_BG_LAB__ = p.state;
      setBgGlobalsFromState(getBgLabState());
      location.reload(); // simplest: ensure UI reflects all controls
    }));

    root.appendChild(rSave);

    // json
    const rJson = row("json");
    rJson.style.alignItems = "flex-start";
    const ta = el("textarea","cm-bglab-text") as HTMLTextAreaElement;
    ta.value = JSON.stringify(getBgLabState(), null, 2);
    const col = el("div");
    col.style.display = "flex";
    col.style.flexDirection = "column";
    col.style.gap = "6px";
    col.appendChild(btn("refresh", () => { ta.value = JSON.stringify(getBgLabState(), null, 2); }));
    col.appendChild(btn("apply", () => {
      const next = safeJsonParse<any>(ta.value, getBgLabState());
      (globalThis as any).__CM_BG_LAB__ = next;
      setBgGlobalsFromState(getBgLabState());
    }));
    col.appendChild(btn("copy", async () => {
      try { await navigator.clipboard.writeText(ta.value); } catch {}
    }));
    rJson.appendChild(ta);
    rJson.appendChild(col);
    root.appendChild(rJson);

    document.head.appendChild(style);
    document.body.appendChild(root);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? "block" : "none";
    const st = getBgLabState();
    st.enabled = this.visible;
  }
}
