import type { BgPreset } from "../game/bg/schema/BgPreset";
import { BgLabBus, type BgChangeType } from "../game/bg/lab/BgLabBus";
import { createDefaultBgLabState, type BgLabState } from "../game/bg/lab/BgLabState";

import { bgBaseUiLayout, type UiControl, type UiSection } from "./bg/bgUiLayout";

import { mergeDeep } from "../game/bg/lab/mergeDeep";

function el<K extends keyof HTMLElementTagNameMap>(tag: K) {
  return document.createElement(tag);
}

type BgDevApi = {
  presets: () => BgPreset[];
  setPresetById: (id: string) => void;
  getActivePresetId: () => string | null;
};

function getGlobalLabState(): BgLabState {
  const g: any = globalThis as any;
  const cm = (g.__CM ??= {});
  if (!cm.bgLabState) cm.bgLabState = createDefaultBgLabState();
  return cm.bgLabState as BgLabState;
}

function setGlobalLabState(next: BgLabState): void {
  const g: any = globalThis as any;
  const cm = (g.__CM ??= {});
  cm.bgLabState = next;
}

function mapUiPathToOverridePath(uiPath: string): string {
  if (!uiPath || typeof uiPath !== "string") return uiPath;

  // only map base.* paths (bgBaseUiLayout)
  if (!uiPath.startsWith("base.")) return uiPath;

  const st: any = getGlobalLabState() as any;
  const activeIx = Number(st?.ui?.activeLayerIx ?? 0);

  const rest = uiPath.slice("base.".length);

  if (rest.startsWith("common.")) return "common." + rest.slice("common.".length);
  if (rest.startsWith("quality.")) return "quality." + rest.slice("quality.".length);

  if (rest.startsWith("flow."))
    return `layers.${activeIx}.params.flow.` + rest.slice("flow.".length);

  if (rest.startsWith("shader."))
    return `layers.${activeIx}.params.shader.` + rest.slice("shader.".length);

  if (rest == "kind") return `layers.${activeIx}.kind`;

  return uiPath;
}

function isObj(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function getByPath(root: any, path: string): any {
  const parts = path.split(".").filter(Boolean);
  let cur = root;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function isIndexKey(k: string): boolean {
  return String(Number(k)) === k;
}

function setByPath(root: any, path: string, value: any): any {
  const parts = String(path ?? "").split(".").filter(Boolean);
  if (parts.length === 0) return root;

  const out = Array.isArray(root) ? [...root] : { ...(root ?? {}) };
  let cur: any = out;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const nextKey = parts[i + 1];
    const nextIsIndex = isIndexKey(nextKey);

    if (Array.isArray(cur)) {
      const ix = Number(key);
      cur[ix] = cur[ix] ?? (nextIsIndex ? [] : {});
      if (nextIsIndex && !Array.isArray(cur[ix])) cur[ix] = [];
      if (!nextIsIndex && (cur[ix] == null || typeof cur[ix] !== "object" || Array.isArray(cur[ix]))) cur[ix] = {};
      cur = cur[ix];
    } else {
      cur[key] = cur[key] ?? (nextIsIndex ? [] : {});
      if (nextIsIndex && !Array.isArray(cur[key])) cur[key] = [];
      if (!nextIsIndex && (cur[key] == null || typeof cur[key] !== "object" || Array.isArray(cur[key]))) cur[key] = {};
      cur = cur[key];
    }
  }

  const last = parts[parts.length - 1];

  if (Array.isArray(cur) && isIndexKey(last)) {
    cur[Number(last)] = value;
  } else {
    cur[last] = value;
  }

  return out;
}


// IMPORTANT: stop leaking to canvas/game, but DO NOT preventDefault (or sliders & inputs break)
function stopProp(e: Event) {
  e.stopPropagation();
}

export class BgDevUI {
  private root: HTMLDivElement;
  private visible = false;

  // "rebuild pending" marker (UI-only)
  private rebuildDirty = false;

  constructor(private api: BgDevApi, opts?: { defaultVisible?: boolean }) {
    this.visible = !!opts?.defaultVisible;

    this.root = el("div");
    this.root.id = "bgdevui";
    this.root.style.cssText = [
      "position:fixed",
      "right:8px",
      "top:8px",
      "z-index:99999",
      "pointer-events:auto",
      "color:#fff",
      "font:10px monospace",
      "background:rgba(10,12,15,0.80)",
      "border:1px solid rgba(255,255,255,0.18)",
      "border-radius:9px",
      "padding:5px",
      "min-width:180px",
      "max-width:220px",
      `display:${this.visible ? "block" : "none"}`,
      "user-select:none",
      "max-height:calc(100vh - 16px)",
      "overflow:auto",
      "overflow-x:hidden",
    ].join(";");

    // Capture-phase stop so canvas never sees it.
    this.root.addEventListener("pointerdown", stopProp);
    this.root.addEventListener("pointerup", stopProp);
    this.root.addEventListener("click", stopProp);
    this.root.addEventListener("wheel", stopProp);

    document.body.appendChild(this.root);
    this.render();
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? "block" : "none";
    if (this.visible) this.render();
  }

  destroy(): void {
    this.root.remove();
  }

  private emit(changeType: BgChangeType, path: string) {
    BgLabBus.emit({ changeType, path });
  }

  private renderHeader(titleText: string) {
    const title = el("div");
    title.textContent = titleText;
    title.style.cssText = "font-weight:700;margin-bottom:8px;opacity:0.95;";
    this.root.appendChild(title);
  }



  
  private renderTopControls() {
    const row = el("div");
    row.style.cssText = "display:flex;gap:5px;justify-content:flex-end;margin:-2px 0 5px 0;";
    this.root.appendChild(row);

    const mkBtn = (label: string, onClick: () => void) => {
      const b = el("button");
      b.textContent = label;
      b.style.cssText = [
        "cursor:pointer",
        "background:rgba(255,255,255,0.08)",
        "border:1px solid rgba(255,255,255,0.15)",
        "color:white",
        "padding:3px 5px",
        "border-radius:9px",
        "font:10px monospace",
        "line-height:5px",
      ].join(";");
      b.onclick = (e) => {
        stopProp(e);
        onClick();
      };
      row.appendChild(b);
      return b;
    };

    mkBtn("Refresh", () => this.render());
    mkBtn("Close", () => this.toggle());
  }

  private renderActiveLine(active: string | null) {
    const act = el("div");
    act.textContent = `active: ${active ?? "(none)"}`;
    act.style.cssText = "opacity:0.9;margin-bottom:8px;";
    this.root.appendChild(act);
  }

  private renderPresetsList(presets: BgPreset[], active: string | null) {
    for (const p of presets) {
      const b = el("button");
      // BgPreset V2 doesn't have kind at top-level; keep label safe.
      const kind = (p as any).kind ?? (p as any).base?.kind ?? (p as any).layers?.[0]?.kind ?? "?";
      b.textContent = `${p.id}  [${String(kind)}]`;
      b.style.cssText = [
        "cursor:pointer",
        "background:rgba(255,255,255,0.08)",
        "border:1px solid rgba(255,255,255,0.15)",
        "color:white",
        "padding:5px 5px",
        "border-radius:9px",
        "font:10px monospace",
        "text-align:left",
        "width:100%",
        "margin:0 0 4px 0",
      ].join(";");

      if (active && p.id === active) {
        b.style.border = "1px solid rgba(120,255,180,0.55)";
        b.style.background = "rgba(120,255,180,0.10)";
      }

      b.onclick = (e) => {
        stopProp(e);
        this.api.setPresetById(p.id);
        const st = getGlobalLabState();
        setGlobalLabState({ ...st, activePresetId: p.id });
        this.render();
      };
      this.root.appendChild(b);
    }
  }

  private renderSectionHeader(sec: UiSection, st: BgLabState): boolean {
    const collapsed = !!st.ui.collapsedSections[sec.id];

    const head = el("div");
    head.style.cssText = [
      "margin-top:5px",
      "padding:5px 5px",
      "border:1px solid rgba(255,255,255,0.10)",
      "border-radius:9px",
      "background:rgba(255,255,255,0.04)",
      "display:flex",
      "justify-content:space-between",
      "align-items:center",
      "cursor:pointer",
    ].join(";");

    const left = el("div");
    left.textContent = (collapsed ? "▶ " : "▼ ") + sec.title;
    left.style.cssText = "font-weight:700;opacity:0.95;";
    head.appendChild(left);

    const right = el("div");
    right.style.cssText = "opacity:0.85;";
    right.textContent = "";
    head.appendChild(right);

    head.onclick = (e) => {
      stopProp(e);
      const cur = getGlobalLabState();
      const next = {
        ...cur,
        ui: {
          ...cur.ui,
          collapsedSections: {
            ...cur.ui.collapsedSections,
            [sec.id]: !collapsed,
          },
        },
      };
      setGlobalLabState(next);
      this.render();
    };

    this.root.appendChild(head);
    return !collapsed;
  }

  private renderControl(ctrl: UiControl, snapshot: any) {
    const wrap = el("div");
    wrap.style.cssText = "margin:5px 0px 4px 0px;";
    this.root.appendChild(wrap);

    if (ctrl.type !== "button") {
      const label = el("div");
      label.style.cssText = "opacity:0.9;margin-bottom:1px;";
      label.textContent = ctrl.path;
      wrap.appendChild(label);
    }

    const changeType = ctrl.type === "button" ? "realtime" : ctrl.change;

    // BUTTON
    if (ctrl.type === "button") {
      const b = el("button");
      b.textContent = ctrl.label;
      b.style.cssText = [
        "cursor:pointer",
        "background:rgba(255,255,255,0.08)",
        "border:1px solid rgba(255,255,255,0.15)",
        "color:white",
        "padding:3px 3px",
        "border-radius:9px",
        "font:10px monospace",
        "width:100%",
        "text-align:center",
      ].join(";");
      b.onclick = (e) => {
        stopProp(e);
        if (ctrl.action === "applyRebuild") {
          this.rebuildDirty = false;
          this.emit("rebuild", "*");
          this.render();
        }
      };
      wrap.appendChild(b);
      return;
    }

    // SELECT
    if (ctrl.type === "select") {
      const sel = el("select") as HTMLSelectElement;
      sel.style.cssText = [
        "width:100%",
        "background:rgba(0,0,0,0.35)",
        "border:1px solid rgba(255,255,255,0.15)",
        "border-radius:9px",
        "color:white",
        "padding:4px 4px",
        "font:10px monospace",
      ].join(";");

      const curVal = getByPath(snapshot, ctrl.path);
      for (const opt of ctrl.options) {
        const o = el("option") as HTMLOptionElement;
        o.value = String(opt);
        o.textContent = String(opt);
        if (String(curVal) === String(opt)) o.selected = true;
        sel.appendChild(o);
      }

      sel.onchange = (e) => {
        stopProp(e);
        const vRaw = sel.value;
        const v = vRaw === "auto" ? "auto" : isNaN(Number(vRaw)) ? vRaw : Number(vRaw);

        const cur = getGlobalLabState();
        const opath = mapUiPathToOverridePath(ctrl.path);
        const nextOverrides = setByPath(cur.overrides ?? {}, opath, v);
        setGlobalLabState({ ...cur, overrides: nextOverrides });

        if (changeType === "rebuild") this.rebuildDirty = true;
        this.emit(changeType as BgChangeType, ctrl.path);
        this.render();
      };

      wrap.appendChild(sel);
      return;
    }

    // SLIDER
    if (ctrl.type === "slider") {
      const curVal = Number(getByPath(snapshot, ctrl.path) ?? 0);

      const row = el("div");
      row.style.cssText = "display:grid;grid-template-columns: 1fr 50px;gap:4px;align-items:center;";
      wrap.appendChild(row);

      const range = el("input") as HTMLInputElement;
      range.type = "range";
      range.min = String(ctrl.min);
      range.max = String(ctrl.max);
      range.step = String(ctrl.step ?? 0.01);
      range.value = String(curVal);
      range.style.width = "100%";

      const num = el("input") as HTMLInputElement;
      num.type = "number";
      num.min = String(ctrl.min);
      num.max = String(ctrl.max);
      num.step = String(ctrl.step ?? 0.01);
      num.value = String(curVal);
      num.style.cssText = [
        "width:20px",
        "background:rgba(0,0,0,0.35)",
        "border:1px solid rgba(255,255,255,0.15)",
        "border-radius:9px",
        "color:white",
        "padding:4px 5px",
        "font:10px monospace",
      ].join(";");

      const applyValue = (v: number) => {
        const cur = getGlobalLabState();
        const opath = mapUiPathToOverridePath(ctrl.path);
        const nextOverrides = setByPath(cur.overrides ?? {}, opath, v);
        setGlobalLabState({ ...cur, overrides: nextOverrides });

        if (changeType === "rebuild") this.rebuildDirty = true;
        this.emit(changeType as BgChangeType, ctrl.path);
      };

      range.oninput = (e) => {
        stopProp(e);
        const v = Number(range.value);
        num.value = String(v);
        applyValue(v);
      };

      num.oninput = (e) => {
        stopProp(e);
        const v = Number(num.value);
        range.value = String(v);
        applyValue(v);
      };

      row.appendChild(range);
      row.appendChild(num);
      return;
    }
  }

  private renderLayout(layout: UiSection[], snapshot: any) {
    const st = getGlobalLabState();
    for (const sec of layout) {
      const expanded = this.renderSectionHeader(sec, st);
      if (!expanded) continue;

      const body = el("div");
      body.style.cssText = "padding:4px 4px 0px 6px;";
      this.root.appendChild(body);

      const oldAppend = this.root.appendChild.bind(this.root);
      (this.root as any).appendChild = body.appendChild.bind(body);
      try {
        for (const ctrl of sec.controls) this.renderControl(ctrl, snapshot);
      } finally {
        (this.root as any).appendChild = oldAppend;
      }
    }
  }

  // --- LAYERS list (Sprint 1 skeleton) -----------------------------------
  private renderLayerList(presetV2: any): void {
    const box = el("div");
    box.className = "cm-bg-layers";
    box.style.margin = "8px 0";
    box.style.padding = "8px";
    box.style.border = "1px solid rgba(255,255,255,0.15)";
    box.style.borderRadius = "8px";

    const title = el("div");
    title.textContent = "LAYERS";
    title.style.fontWeight = "700";
    title.style.marginBottom = "6px";
    box.appendChild(title);

    const layers: any[] = Array.isArray(presetV2?.layers) ? presetV2.layers : [];

    const st = getGlobalLabState() as any;
    const activeIx = Math.max(0, Math.min(layers.length - 1, Number(st?.ui?.activeLayerIx ?? 0)));

    // helper: ensure overrides.layers is ARRAY and has slot i
    const ensureOvLayerSlot = (i: number) => {
      const cur = getGlobalLabState() as any;
      const ov = (cur.overrides ?? {}) as any;

      ov.layers = Array.isArray(ov.layers) ? ov.layers : [];
      ov.layers[i] = ov.layers[i] ?? {};
      return { cur, ov };
    };

    const list = el("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "6px";

    layers.forEach((l: any, i: number) => {
      const row = el("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      row.style.cursor = "pointer";

      if (i === activeIx) {
        row.style.outline = "1px solid rgba(255,255,255,0.55)";
        row.style.borderRadius = "6px";
        row.style.padding = "3px";
      }

      row.onclick = () => {
        const cur = getGlobalLabState() as any;
        const next = { ...cur, ui: { ...(cur.ui ?? {}), activeLayerIx: i } };
        setGlobalLabState(next);
        this.render();
      };

      const chk = el("input") as HTMLInputElement;
      chk.type = "checkbox";
      chk.checked = l?.enabled !== false;
      chk.onclick = (ev) => stopProp(ev as any);
      chk.onchange = (ev) => {
        stopProp(ev as any);

        const { cur, ov } = ensureOvLayerSlot(i);
        ov.layers[i].enabled = chk.checked;

        setGlobalLabState({ ...cur, overrides: ov });
        this.emit("rebuild", `layers.${i}.enabled`);
        this.render();
      };

      const label = el("div");
      label.textContent = `${i + 1}. ${String(l?.kind ?? "?")}  (${String(l?.id ?? "")})`;
      label.style.flex = "1";

      const up = el("button");
      up.textContent = "↑";
      up.onclick = (ev) => {
        stopProp(ev as any);
        if (i <= 0) return;

        // reorder by writing FULL reordered layers array into overrides.layers
        const cur = getGlobalLabState() as any;
        const ov = (cur.overrides ?? {}) as any;

        const newLayers = [...layers];
        const tmp = newLayers[i - 1];
        newLayers[i - 1] = newLayers[i];
        newLayers[i] = tmp;

        ov.layers = newLayers;
        const nextActive = activeIx === i ? i - 1 : activeIx === i - 1 ? i : activeIx;

        setGlobalLabState({ ...cur, overrides: ov, ui: { ...(cur.ui ?? {}), activeLayerIx: nextActive } });
        this.emit("rebuild", "layers.reorder");
        this.render();
      };

      const down = el("button");
      down.textContent = "↓";
      down.onclick = (ev) => {
        stopProp(ev as any);
        if (i >= layers.length - 1) return;

        const cur = getGlobalLabState() as any;
        const ov = (cur.overrides ?? {}) as any;

        const newLayers = [...layers];
        const tmp = newLayers[i + 1];
        newLayers[i + 1] = newLayers[i];
        newLayers[i] = tmp;

        ov.layers = newLayers;
        const nextActive = activeIx === i ? i + 1 : activeIx === i + 1 ? i : activeIx;

        setGlobalLabState({ ...cur, overrides: ov, ui: { ...(cur.ui ?? {}), activeLayerIx: nextActive } });
        this.emit("rebuild", "layers.reorder");
        this.render();
      };

      row.appendChild(chk);
      row.appendChild(label);
      row.appendChild(up);
      row.appendChild(down);
      list.appendChild(row);
    });

    box.appendChild(list);

    // --- ACTIVE LAYER QUICK CONTROLS --------------------------------------
    if (layers.length > 0) {
      const layer = layers[activeIx] ?? null;

      const panel = el("div");
      panel.style.marginTop = "8px";
      panel.style.paddingTop = "8px";
      panel.style.borderTop = "1px solid rgba(255,255,255,0.12)";

      const t = el("div");
      t.textContent = `ACTIVE LAYER: ${activeIx + 1} (${String(layer?.kind ?? "?")})`;
      t.style.cssText = "font-weight:700;opacity:0.95;margin-bottom:6px;";
      panel.appendChild(t);

      // row helper
      const mkRow = (labelTxt: string) => {
        const r = el("div");
        r.style.cssText = "display:grid;grid-template-columns: 70px 1fr;gap:6px;align-items:center;margin:4px 0;";
        const lab = el("div");
        lab.textContent = labelTxt;
        lab.style.opacity = "0.9";
        r.appendChild(lab);
        return { r };
      };

      // blend select
      {
        const { r } = mkRow("blend");
        const sel = el("select") as HTMLSelectElement;
        sel.style.cssText =
          "width:100%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.15);border-radius:7px;color:white;padding:3px 4px;font:10px monospace;";
        for (const opt of ["alpha", "add"]) {
          const o = el("option") as HTMLOptionElement;
          o.value = opt;
          o.textContent = opt;
          sel.appendChild(o);
        }
        sel.value = String(layer?.blend ?? "alpha");
        sel.onpointerdown = (e) => stopProp(e);
        sel.onchange = (e) => {
          stopProp(e);
          const { cur, ov } = ensureOvLayerSlot(activeIx);
          ov.layers[activeIx].blend = String(sel.value);
          setGlobalLabState({ ...cur, overrides: ov });
          this.emit("rebuild", `layers.${activeIx}.blend`);
          this.render();
        };
        r.appendChild(sel);
        panel.appendChild(r);
      }

      // opacity slider
      {
        const { r } = mkRow("opacity");
        const range = el("input") as HTMLInputElement;
        range.type = "range";
        range.min = "0";
        range.max = "1";
        range.step = "0.01";
        range.value = String(Math.max(0, Math.min(1, Number(layer?.opacity ?? 1))));
        range.style.width = "100%";
        range.oninput = (e) => {
          stopProp(e);
          const v = Number(range.value);
          const { cur, ov } = ensureOvLayerSlot(activeIx);
          ov.layers[activeIx].opacity = v;
          setGlobalLabState({ ...cur, overrides: ov });
          this.rebuildDirty = true;
          this.emit("rebuild", `layers.${activeIx}.opacity`);
};
        r.appendChild(range);
        panel.appendChild(r);
      }

      // parallaxMul slider
      {
        const { r } = mkRow("parallax");
        const range = el("input") as HTMLInputElement;
        range.type = "range";
        range.min = "0";
        range.max = "4";
        range.step = "0.01";
        range.value = String(Number(layer?.parallaxMul ?? 1));
        range.style.width = "100%";
        range.oninput = (e) => {
          stopProp(e);
          const v = Number(range.value);
          const { cur, ov } = ensureOvLayerSlot(activeIx);
          ov.layers[activeIx].parallaxMul = v;
          setGlobalLabState({ ...cur, overrides: ov });
          this.rebuildDirty = true;
          this.emit("rebuild", `layers.${activeIx}.parallaxMul`);
};
        r.appendChild(range);
        panel.appendChild(r);
      }

      box.appendChild(panel);
    }

    // --- ADD LAYER ---------------------------------------------------------
    const addRow = el("div");
    addRow.style.display = "flex";
    addRow.style.gap = "6px";
    addRow.style.marginTop = "8px";

    const mkAddBtn = (txt: string) => {
      const b = el("button");
      b.textContent = txt;
      b.style.cssText = [
        "cursor:pointer",
        "background:rgba(255,255,255,0.08)",
        "border:1px solid rgba(255,255,255,0.15)",
        "color:white",
        "padding:3px 6px",
        "border-radius:9px",
        "font:10px monospace",
        "flex:1",
      ].join(";");
      return b;
    };

    const addShader = mkAddBtn("+ shader");
    addShader.onclick = (ev) => {
      stopProp(ev as any);

      const cur = getGlobalLabState() as any;
      const ov = (cur.overrides ?? {}) as any;

      const baseLayers = [...layers];
      const id = `layer.shader.${Date.now()}`;

      baseLayers.push({
        id,
        kind: "shader",
        enabled: true,
        opacity: 1,
        blend: "alpha",
        parallaxMul: 1,
        params: { shader: { preset: "gradient", a: 1, b: 1, warp: 0.5, grain: 0.2 }, flow: {} },
      });

      ov.layers = baseLayers;
      setGlobalLabState({ ...cur, overrides: ov, ui: { ...(cur.ui ?? {}), activeLayerIx: baseLayers.length - 1 } });
      this.emit("rebuild", "layers.add.shader");
      this.render();
    };

    const addFlow = mkAddBtn("+ flowSegments");
    addFlow.onclick = (ev) => {
      stopProp(ev as any);

      const cur = getGlobalLabState() as any;
      const ov = (cur.overrides ?? {}) as any;

      const baseLayers = [...layers];
      const id = `layer.flow.${Date.now()}`;

      baseLayers.push({
        id,
        kind: "flowSegments",
        enabled: true,
        opacity: 1,
        blend: "add",
        parallaxMul: 1,
        params: {
          shader: {},
          flow: {
            speed: 1,
            curl: 1,
            jitter: 0.2,
            thickness: 1,
            alpha: 0.12,
            segmentCount: 650,
            segmentLen: 16,
            gridW: 64,
            gridH: 64,
          },
        },
      });

      ov.layers = baseLayers;
      setGlobalLabState({ ...cur, overrides: ov, ui: { ...(cur.ui ?? {}), activeLayerIx: baseLayers.length - 1 } });
      this.emit("rebuild", "layers.add.flowSegments");
      this.render();
    };

    addRow.appendChild(addShader);
    addRow.appendChild(addFlow);
    box.appendChild(addRow);

    this.root.appendChild(box);
  }
 


  // --- Base Layer (MVP) -------------------------------------------------
  // Writes to BgLabState.overrides only. Runtime listens via BgLabBus.
  private getOverride(path: string): any {
    const st = getGlobalLabState();
    return getByPath(st.overrides, path);
  }

  private setOverride(changeType: BgChangeType, path: string, value: any): void {
    const cur = getGlobalLabState();
    const opath = mapUiPathToOverridePath(path);
    const nextOverrides = setByPath(cur.overrides ?? {}, opath, value);
    setGlobalLabState({ ...cur, overrides: nextOverrides });

    if (changeType === "rebuild" || changeType === "structural") {
      this.rebuildDirty = true;
    }

    // IMPORTANT: we emit only, runtime decides how to apply
    this.emit(changeType, path);
  }

  private mkLabel(text: string): HTMLDivElement {
    const d = el("div");
    d.textContent = text;
    d.style.cssText = "opacity:0.85;";
    return d;
  }

  private mkRow(): HTMLDivElement {
    const r = el("div");
    r.style.cssText = "display:grid;grid-template-columns:90px 1fr;gap:5px;align-items:center;margin:3px 0;";
    return r;
  }

  private mkNumber(value: number, opts: { step?: number; min?: number; max?: number } = {}): HTMLInputElement {
    const i = el("input");
    i.type = "number";
    i.value = String(value);
    if (opts.step != null) i.step = String(opts.step);
    if (opts.min != null) i.min = String(opts.min);
    if (opts.max != null) i.max = String(opts.max);
    i.style.cssText =
      "width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#fff;border-radius:3px;padding:3px 5px;";
    return i;
  }

  private mkSelect(value: string, options: string[]): HTMLSelectElement {
    const sel = el("select");
    sel.style.cssText =
      "width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#fff;border-radius:4px;padding:2px 3px;";
    for (const opt of options) {
      const o = el("option");
      o.value = opt;
      o.textContent = opt;
      sel.appendChild(o);
    }
    sel.value = value;
    return sel as HTMLSelectElement;
  }

  private renderBaseLayerControls(activePreset: any): void {
    const box = el("div");
    box.style.cssText =
      "margin-top:5px;padding:3px;border:1px solid rgba(255,255,255,0.10);border-radius:5px;background:rgba(255,255,255,0.03);";

    const head = el("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:3px;margin-bottom:6px;";

    const t = el("div");
    t.textContent = "BASE (Layer 1)";
    t.style.cssText = "font-weight:700;opacity:0.95;";
    head.appendChild(t);

    const right = el("div");
    right.style.cssText = "display:flex;gap:8px;align-items:center;";

    const dirty = el("div");
    dirty.textContent = this.rebuildDirty ? "⟳ rebuild pending" : "";
    dirty.style.cssText = "opacity:0.8;";
    right.appendChild(dirty);

    const apply = el("button");
    apply.textContent = "Apply Rebuild";
    apply.style.cssText = [
      "cursor:pointer",
      "background:rgba(255,255,255,0.08)",
      "border:1px solid rgba(255,255,255,0.15)",
      "color:white",
      "padding:3px 2px",
      "border-radius:9px",
      "font:10px monospace",
      "line-height:3px",
      this.rebuildDirty ? "opacity:1" : "opacity:0.5",
    ].join(";");
    apply.disabled = !this.rebuildDirty;
    apply.onclick = (e) => {
      stopProp(e);
      this.rebuildDirty = false;
      BgLabBus.emit({ changeType: "rebuild", path: "*" });
      this.render();
    };
    right.appendChild(apply);

    head.appendChild(right);
    box.appendChild(head);

    // seed (rebuild)
    {
      const r = this.mkRow();
      r.appendChild(this.mkLabel("seed"));
      const cur = Number(this.getOverride("seed") ?? activePreset?.seed ?? 1);
      const n = this.mkNumber(cur, { step: 1, min: 0, max: 999999 });
      n.onpointerdown = (e) => stopProp(e);
      n.oninput = (e) => stopProp(e);
      n.onchange = (e) => {
        stopProp(e);
        this.setOverride("rebuild", "seed", Number(n.value));
        this.render();
      };
      r.appendChild(n);
      box.appendChild(r);
    }

    // keep old shader selector only if legacy v1 is present
    if (activePreset?.base?.kind === "shader") {
      const r = this.mkRow();
      r.appendChild(this.mkLabel("shader.preset"));
      const cur = String(this.getOverride("base.shader.preset") ?? activePreset?.base?.shader?.preset ?? "gradient");
      const sel = this.mkSelect(cur, ["gradient", "plasma", "nebula", "stripes"]);
      sel.onpointerdown = (e) => stopProp(e);
      sel.onchange = (e) => {
        stopProp(e);
        this.setOverride("structural", "base.shader.preset", String(sel.value));
        this.render();
      };
      r.appendChild(sel);
      box.appendChild(r);
    }

    this.root.appendChild(box);
  }

  private render(): void {
    this.root.innerHTML = "";

    const presets = this.api.presets?.() ?? [];
    const active = this.api.getActivePresetId?.();

    this.renderHeader("BG DEV UI");
    this.renderTopControls();
    this.renderActiveLine(active ?? null);

    // sync active into lab state if missing
    const st0 = getGlobalLabState();
    if (active && st0.activePresetId !== active) {
      setGlobalLabState({ ...st0, activePresetId: active });
    }

    // choose base snapshot = active preset merged with overrides
    const basePreset = (active ? presets.find((p) => p.id === active) : null) ?? presets[0] ?? null;
    const st = getGlobalLabState();
    const merged = basePreset ? mergeDeep(basePreset, st.overrides ?? {}) : st.overrides ?? {};
    const p: any = merged ?? {};

    // Active layer (UI-selected)
    const layers: any[] = Array.isArray(p.layers) ? p.layers : [];
    const stUI = getGlobalLabState() as any;
    const activeIx = Number(stUI?.ui?.activeLayerIx ?? 0);
    const layerA = layers[activeIx] ?? layers[0] ?? null;

    // Build a V1-like view so existing bgBaseUiLayout paths keep working
    const snapshot = {
      base: {
        kind: String(layerA?.kind ?? (p as any).kind ?? "shader"),
        common: p.common ?? {},
        quality: p.quality ?? {},
        shader: layerA?.params?.shader ?? {},
        flow: layerA?.params?.flow ?? {},
      },
      v2: p,
    };

    this.renderPresetsList(presets, active ?? null);

    // NEW skeleton list
    this.renderLayerList(p);

    // existing base panel + layout
    this.renderBaseLayerControls(basePreset);
    this.renderLayout(bgBaseUiLayout, snapshot);
  }
}
