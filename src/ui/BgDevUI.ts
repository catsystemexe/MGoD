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

  const st: any = getGlobalLabState() as any;
  const activeIx = Number(st?.ui?.activeLayerIx ?? 0);

  // IMPORTANT:
  // - v1 presets have NO layers => renderer reads preset.flow / preset.shader / preset.kind
  // - v2 presets have layers[] => renderer reads layers[ix].params.flow / layers[ix].params.shader / layers[ix].kind
  const hasLayers = !!st?.ui?.activePresetHasLayers;

  // allow "base.*" paths from layouts
  if (uiPath.startsWith("base.")) {
    const rest = uiPath.slice("base.".length);

    if (rest.startsWith("common.")) return "common." + rest.slice("common.".length);
    if (rest.startsWith("quality.")) return "quality." + rest.slice("quality.".length);

    if (rest.startsWith("flow.")) {
      const tail = rest.slice("flow.".length);
      return hasLayers ? `layers.${activeIx}.params.flow.${tail}` : `flow.${tail}`;
    }

    if (rest.startsWith("shader.")) {
      const tail = rest.slice("shader.".length);
      return hasLayers ? `layers.${activeIx}.params.shader.${tail}` : `shader.${tail}`;
    }

    if (rest === "kind") return hasLayers ? `layers.${activeIx}.kind` : "kind";
    return uiPath;
  }

  // direct short paths (legacy)
  if (uiPath.startsWith("flow.")) {
    const tail = uiPath.slice("flow.".length);
    return hasLayers ? `layers.${activeIx}.params.flow.${tail}` : uiPath;
  }

  if (uiPath.startsWith("shader.")) {
    const tail = uiPath.slice("shader.".length);
    return hasLayers ? `layers.${activeIx}.params.shader.${tail}` : uiPath;
  }

  if (uiPath.startsWith("common.")) return uiPath;
  if (uiPath.startsWith("quality.")) return uiPath;
  if (uiPath === "kind") return hasLayers ? `layers.${activeIx}.kind` : "kind";

  return uiPath;
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
      "min-width:270px",
      "max-width:330px",
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

  private async writeClipboard(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    // fallback
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = (document as any).execCommand?.("copy");      document.body.removeChild(ta);
      return !!ok;
    } catch {
      return false;
    }
  }

  private async copyComposition(): Promise<void> {
    const st = getGlobalLabState() as any;

    // Spec: whole composition = overrides + activePresetId + UI activeLayerIx
    const payload = {
      activePresetId: st.activePresetId ?? (this.api.getActivePresetId?.() ?? null),
      overrides: st.overrides ?? {},
      ui: {
        ...(st.ui ?? {}),
        activeLayerIx: Number(st?.ui?.activeLayerIx ?? 0),
      },
    };

    const json = JSON.stringify(payload, null, 2);
    const ok = await this.writeClipboard(json);
    if (!ok) console.warn("[BG DEV UI] clipboard copy failed");
  }

  private async pasteComposition(): Promise<void> {
    const raw = prompt("Paste BG composition JSON");
    if (!raw) return;

    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.warn("[BG DEV UI] invalid JSON", e);
      return;
    }

    const cur = getGlobalLabState() as any;

    // Accept either full payload {activePresetId, overrides, ui}
    // or legacy direct overrides object
    const nextActivePresetId = (parsed && typeof parsed === "object" && "activePresetId" in parsed)
      ? parsed.activePresetId ?? null
      : cur.activePresetId ?? null;

    const nextOverrides = (parsed && typeof parsed === "object" && "overrides" in parsed)
      ? (parsed.overrides ?? {})
      : (parsed ?? {});

    const nextUiActiveLayerIx = (parsed && typeof parsed === "object" && parsed.ui && typeof parsed.ui === "object")
      ? Number(parsed.ui.activeLayerIx ?? (cur?.ui?.activeLayerIx ?? 0))
      : Number(cur?.ui?.activeLayerIx ?? 0);

    setGlobalLabState({
      ...cur,
      activePresetId: nextActivePresetId,
      overrides: nextOverrides,
      ui: { ...(cur.ui ?? {}), activeLayerIx: nextUiActiveLayerIx },
    });

    this.rebuildDirty = true;
    BgLabBus.emit({ changeType: "rebuild", path: "*" });
    this.render();
  }


  private emit(changeType: BgChangeType, path: string) {
    BgLabBus.emit({ changeType, path });
  }
  private renderTopControls() {
    const row = el("div");
    row.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:8px;margin:-2px 0 8px 0;";
    this.root.appendChild(row);

    // left title
    const left = el("div");
    left.textContent = "BG DEV UI";
    left.style.cssText = "font-weight:700;opacity:0.95;";
    row.appendChild(left);

    // right controls
    const right = el("div");
    right.style.cssText = "display:flex;align-items:center;gap:6px;";
    row.appendChild(right);

    const warn = el("div");
    warn.textContent = this.rebuildDirty ? "⚠️" : "";
    warn.style.cssText = "opacity:0.95;font-weight:700;margin-right:2px;";
    right.appendChild(warn);

    const apply = el("button");
    apply.textContent = "APPLY";
    apply.style.cssText = [
      "cursor:pointer",
      "background:rgba(255,255,255,0.08)",
      "border:1px solid rgba(255,255,255,0.15)",
      "color:white",
      "padding:2px 4px",
      "border-radius:9px",
      "font:10px monospace",
      "line-height:10px",
      this.rebuildDirty ? "opacity:1" : "opacity:0.45",
    ].join(";");
    apply.disabled = !this.rebuildDirty;
    apply.onclick = (e) => {
      stopProp(e);
      if (!this.rebuildDirty) return;
      this.rebuildDirty = false;
      BgLabBus.emit({ changeType: "rebuild", path: "*" });
      this.render();
    };
    right.appendChild(apply);

    const mkBtn = (label: string, onClick: () => void) => {
      const b = el("button");
      b.textContent = label;
      b.style.cssText = [
        "cursor:pointer",
        "background:rgba(255,255,255,0.08)",
        "border:1px solid rgba(255,255,255,0.15)",
        "color:white",
        "padding:2px 4px",
        "border-radius:9px",
        "font:10px monospace",
        "line-height:10px",
      ].join(";");
      b.onclick = (ev) => {
        stopProp(ev);
        onClick();
      };
      right.appendChild(b);
      return b;
    };

    mkBtn("SAVE COMP", () => void this.copyComposition());
    mkBtn("LOAD COMP", () => void this.pasteComposition());
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
  // --- LEGACY: minimal FLOW controls (kind = flowSegments) ------------------
  private renderLegacyFlowControls(body: HTMLDivElement, activePreset: any): void {
    // NOTE:
    // - UI paths "base.flow.*" jsou schvalne: mapUiPathToOverridePath() je premapuje do layers.{activeIx}.params.flow.*
    // - changeType: realtime vs rebuild

    const flow0 = (activePreset?.layers?.[0]?.params?.flow ?? activePreset?.flow ?? activePreset?.base?.flow ?? {}) as any;

    const getUiOverride = (uiPath: string): any => {
      const st = getGlobalLabState() as any;
      const opath = mapUiPathToOverridePath(uiPath);
      return getByPath(st.overrides, opath);
    };

    // --- minimalisticky "tile" slider (label + value v hlavičce; slider pod tím) ---
    const mkTile = (
      label: string,
      cur: number,
      opts: { min: number; max: number; step: number },
      change: BgChangeType,
      path: string,
    ) => {
      const tile = el("div");
      // bez "karet" – jen spacing
      tile.style.cssText = [
        "display:flex",
        "flex-direction:column",
        "gap:2px",
        "padding:0",
        "margin:0",
      ].join(";");

      // header: "Depth 1" (value nahoře vedle labelu)
      const head = el("div");
      head.style.cssText = [
        "display:flex",
        "align-items:baseline",
        "justify-content:space-between",
        "gap:6px",
        "padding:0 1px 1px 1px",
      ].join(";");

      const lab = el("div");
      lab.textContent = label;
      lab.style.cssText = "font:10px monospace;opacity:0.85;letter-spacing:0.2px;";

      const num = el("input") as HTMLInputElement;
      num.type = "number";
      num.min = String(opts.min);
      num.max = String(opts.max);
      num.step = String(opts.step ?? 0.01);
      num.value = String(cur);
      // malé, bez rámečku, zarovnané doprava (žádné okýnko)
      num.style.cssText = [
        "width:40px",
        "background:transparent",
        "border:none",
        "outline:none",
        "color:rgba(255,255,255,0.92)",
        "padding:0",
        "margin:0",
        "font:10px monospace",
        "text-align:right",
        "appearance:textfield",
      ].join(";");

      head.appendChild(lab);
      head.appendChild(num);
      tile.appendChild(head);

      const row = el("div");
      // slider přes celou šířku
      row.style.cssText = "display:block;padding:0 1px 1px 1px;";

      const range = el("input") as HTMLInputElement;
      range.type = "range";
      range.min = String(opts.min);
      range.max = String(opts.max);
      range.step = String(opts.step ?? 0.01);
      range.value = String(cur);
      range.style.width = "100%";
      (range.style as any).height = "14px";

      const applyValue = (v: number) => this.setOverride(change, path, v);

      range.onpointerdown = (e) => stopProp(e);
      range.oninput = (e) => {
        stopProp(e);
        const v = Number(range.value);
        num.value = String(v);
        applyValue(v);
      };
      range.onchange = (e) => {
        stopProp(e);
        this.render();
      };

      num.onpointerdown = (e) => stopProp(e);
      num.oninput = (e) => stopProp(e);
      num.onchange = (e) => {
        stopProp(e);
        const v = Number(num.value);
        range.value = String(v);
        applyValue(v);
        this.render();
      };

      row.appendChild(range);
      tile.appendChild(row);
      body.appendChild(tile);
    };

    const mkGroup = (title: string) => {
      const wrap = el("div");
      wrap.style.cssText = "margin:6px 0 8px 0;";

      const h = el("div");
      h.textContent = title;
      h.style.cssText = "font:10px monospace;opacity:0.55;margin:0 0 4px 2px;letter-spacing:0.6px;";
      wrap.appendChild(h);

      const grid = el("div");
      grid.style.cssText = [
        "display:grid",
        "grid-template-columns:repeat(3, minmax(0, 1fr))",
        "gap:6px",
      ].join(";");
      wrap.appendChild(grid);

      body.appendChild(wrap);
      return grid;
    };

    const addTo = (grid: HTMLDivElement, fn: () => void) => {
      const oldAppend = body.appendChild.bind(body);
      (body as any).appendChild = grid.appendChild.bind(grid);
      try {
        fn();
      } finally {
        (body as any).appendChild = oldAppend;
      }
    };

    // --- GROUPS (3-up) ---

    // 1) Speed + alpha + curl
    {
      const g = mkGroup("FLOW");
      addTo(g, () => {
        const curSpeed = Number(getUiOverride("base.flow.speed") ?? flow0?.speed ?? 1);
        mkTile("speed", curSpeed, { min: 0, max: 3, step: 0.01 }, "realtime", "base.flow.speed");

        const curAlpha = Number(this.getOverride("base.flow.alpha") ?? flow0?.alpha ?? 0.7);
        mkTile("alpha", curAlpha, { min: 0, max: 1, step: 0.01 }, "realtime", "base.flow.alpha");

        const curCurl = Number(this.getOverride("base.flow.curl") ?? flow0?.curl ?? 0.8);
        mkTile("curl", curCurl, { min: 0, max: 3, step: 0.01 }, "realtime", "base.flow.curl");
      });
    }

    // 2) Depth + spread + bias
    {
      const g = mkGroup("PARALLAX (rebuild)");
      addTo(g, () => {
        const curDepth = Number(getUiOverride("base.flow.parallaxDepth") ?? 1);
        mkTile("depth", curDepth, { min: 0, max: 2, step: 0.01 }, "rebuild", "base.flow.parallaxDepth");

        const curSpread = Number(getUiOverride("base.flow.parallaxSpread") ?? 1);
        mkTile("spread", curSpread, { min: 0, max: 2, step: 0.01 }, "rebuild", "base.flow.parallaxSpread");

        const curBias = Number(getUiOverride("base.flow.parallaxBias") ?? 0);
        mkTile("bias", curBias, { min: -1, max: 1, step: 0.01 }, "rebuild", "base.flow.parallaxBias");
      });
    }

    // 3) FarAlpha + MidAlpha + NearAlpha (paths zustavaji farOpacity... kvuli kompatibilite)
    {
      const g = mkGroup("LAYER ALPHA");
      addTo(g, () => {
        const curFarOp = Number(getUiOverride("base.flow.farOpacity") ?? 1);
        mkTile("farAlpha", curFarOp, { min: 0, max: 1, step: 0.01 }, "realtime", "base.flow.farOpacity");

        const curMidOp = Number(getUiOverride("base.flow.midOpacity") ?? 1);
        mkTile("midAlpha", curMidOp, { min: 0, max: 1, step: 0.01 }, "realtime", "base.flow.midOpacity");

        const curNearOp = Number(getUiOverride("base.flow.nearOpacity") ?? 1);
        mkTile("nearAlpha", curNearOp, { min: 0, max: 1, step: 0.01 }, "realtime", "base.flow.nearOpacity");
      });
    }

    // 4) FarSpeed + MidSpeed + NearSpeed
    {
      const g = mkGroup("LAYER SPEED");
      addTo(g, () => {
        const curFarSp = Number(getUiOverride("base.flow.farSpeedMul") ?? flow0?.motion?.speedPxPerSec?.layerMul?.far ?? 0.6);
        mkTile("farSpeed", curFarSp, { min: 0, max: 2, step: 0.01 }, "realtime", "base.flow.farSpeedMul");

        const curMidSp = Number(getUiOverride("base.flow.midSpeedMul") ?? flow0?.motion?.speedPxPerSec?.layerMul?.mid ?? 0.85);
        mkTile("midSpeed", curMidSp, { min: 0, max: 2, step: 0.01 }, "realtime", "base.flow.midSpeedMul");

        const curNearSp = Number(getUiOverride("base.flow.nearSpeedMul") ?? flow0?.motion?.speedPxPerSec?.layerMul?.near ?? 1.0);
        mkTile("nearSpeed", curNearSp, { min: 0, max: 2, step: 0.01 }, "realtime", "base.flow.nearSpeedMul");
      });
    }

    // 5) Count + Length + Thickness
    {
      const g = mkGroup("SEGMENTS");
      addTo(g, () => {
        const curCount = Number(this.getOverride("base.flow.segmentCount") ?? flow0?.segmentCount ?? 512);
        mkTile("count", curCount, { min: 64, max: 4096, step: 1 }, "rebuild", "base.flow.segmentCount");

        const curLen = Number(this.getOverride("base.flow.segmentLen") ?? flow0?.segmentLen ?? 12);
        mkTile("length", curLen, { min: 2, max: 64, step: 1 }, "rebuild", "base.flow.segmentLen");

        const curTh = Number(this.getOverride("base.flow.thickness") ?? flow0?.thickness ?? 1);
        mkTile("thickness", curTh, { min: 0.1, max: 4, step: 0.01 }, "realtime", "base.flow.thickness");
      });
    }

  }


    // --- LAYERS list (Sprint 1 skeleton) -----------------------------------
  private renderLayerList(presetV2: any): void {


const box = el("div");
box.className = "cm-bg-layers";
box.style.margin = "8px 0";
box.style.padding = "6px";
box.style.border = "1px solid rgba(255,255,255,0.15)";
box.style.borderRadius = "8px";
    

    

    const head = el("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:flex-start;gap:8px;margin-bottom:6px;";

    const title = el("div");
    title.textContent = "LAYERS";
    title.style.cssText = "font-weight:700;opacity:0.95;";

    const add = el("button");
    add.textContent = "ADD";
    add.style.cssText = [
      "cursor:pointer",
      "background:rgba(120,255,180,0.10)",
      "border:1px solid rgba(120,255,180,0.45)",
      "color:rgba(120,255,180,0.95)",
      "padding:2px 10px",
      "border-radius:9px",
      "font:10px monospace",
      "line-height:10px",
    ].join(";");

    add.onclick = (ev) => {
      stopProp(ev as any);
      // TODO: později otevřeme kind picker + vytvoříme layer
    };

    head.appendChild(title);
    head.appendChild(add);
    box.appendChild(head);

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

      row.style.padding = "0";
      row.style.borderRadius = "0";
      
      if (i === activeIx) {
        row.style.outline = "rgba(255,255,255,0.55)";
        row.style.borderRadius = "0";
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
      label.textContent = `${i + 1}. ${String(l?.kind ?? "?")}`;
      label.style.flex = "1";

      const mkIconBtn = (txt: string) => {
        const b = el("button");
        b.textContent = txt;
        b.style.cssText = [
          "cursor:pointer",
          "background:transparent",
          "border:none",
          "color:rgba(255,255,255,0.9)",
          "padding:0 2px",
          "font:16px monospace",
          "line-height:16px",
          "min-width:10px",
        ].join(";");

        // hover feedback (jemně)
        b.onmouseenter = () => (b.style.color = "rgba(120,255,180,0.95)");
        b.onmouseleave = () => (b.style.color = "rgba(255,255,255,0.9)");

        return b;
      };

      const reset = mkIconBtn("⟲");
      reset.title = "Reset overrides for this layer";
      reset.onclick = (ev) => {
        stopProp(ev as any);

        const cur = getGlobalLabState() as any;
        const ov = (cur.overrides ?? {}) as any;

        if (Array.isArray(ov.layers) && ov.layers[i] != null) {
          // remove only per-layer override slot; keep array shape stable
          ov.layers[i] = {};
          setGlobalLabState({ ...cur, overrides: ov });
          this.rebuildDirty = true;
          this.emit("rebuild", `layers.${i}.reset`);
          this.render();
        }
      };

      const del = mkIconBtn("✖");
      del.title = "Delete layer";
      del.onclick = (ev) => {
        stopProp(ev as any);

        const cur = getGlobalLabState() as any;
        const ov = (cur.overrides ?? {}) as any;

        const baseLayers = [...layers];
        if (baseLayers.length <= 1) return; // safety: keep at least 1 layer for now

        baseLayers.splice(i, 1);

        // keep overrides.layers consistent as full array
        ov.layers = baseLayers;

        const nextActive = Math.max(0, Math.min(baseLayers.length - 1, activeIx === i ? i - 1 : activeIx));
        setGlobalLabState({ ...cur, overrides: ov, ui: { ...(cur.ui ?? {}), activeLayerIx: nextActive } });

        this.rebuildDirty = true;
        this.emit("rebuild", "layers.delete");
        this.render();
      };

      
      const up = mkIconBtn("︿");     // úzký glyph
      
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

      const down = mkIconBtn("﹀");   // úzký glyph
      
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

      row.appendChild(chk);   // on/off (zatím checkbox)

      row.appendChild(del);   // ✖
      row.appendChild(reset); // ⟲

      // upload/download placeholder
      const upLd = mkIconBtn("⤒");
      upLd.title = "Upload layer";
      upLd.onclick = (ev) => { stopProp(ev as any); /* TODO */ };

      const dnLd = mkIconBtn("⤓");
      dnLd.title = "Download layer";
      dnLd.onclick = (ev) => { stopProp(ev as any); /* TODO */ };

      row.appendChild(upLd);
      row.appendChild(dnLd);

      row.appendChild(label);

  row.appendChild(up);
  row.appendChild(down);

  list.appendChild(row);
  });

  box.appendChild(list);
  this.root.appendChild(box);
  }
      


  // --- Base Layer (MVP) -------------------------------------------------
  // Writes to BgLabState.overrides only. Runtime listens via BgLabBus.
  private getOverride(path: string): any {
    const st = getGlobalLabState();

    // Read must mirror write mapping; otherwise legacy sliders always read undefined
    const opath = mapUiPathToOverridePath(path);

    // Prefer mapped path, fallback to raw for older stored overrides
    const v = getByPath(st.overrides, opath);
    return v !== undefined ? v : getByPath(st.overrides, path);
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

  
  private renderGlobalControls(activePreset: any): void {
    const box = el("div");
    box.style.cssText =
      "margin-top:5px;padding:3px;border:1px solid rgba(255,255,255,0.10);border-radius:5px;background:rgba(255,255,255,0.03);";

    // ---- HEADER --------------------------------------------------------
    const head = el("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;";

    const left = el("div");
    left.style.cssText = "display:flex;flex-direction:column;gap:2px;";

    const t = el("div");
    t.textContent = "GLOBAL (BG)";
    t.style.cssText = "font-weight:700;opacity:0.95;";
    left.appendChild(t);

    const sub = el("div");
    sub.textContent = "postprocess for BG layers only";
    sub.style.cssText = "opacity:0.65;font:9px monospace;";
    left.appendChild(sub);

    head.appendChild(left);

    const right = el("div");
    right.style.cssText = "display:flex;gap:8px;align-items:center;";

    const dirty = el("div");
    dirty.textContent = this.rebuildDirty ? "⟳ rebuild pending" : "";
    dirty.style.cssText = "opacity:0.8;";
    right.appendChild(dirty);

    head.appendChild(right);
    box.appendChild(head);

    // ---- helpers: collapsible sections (BG-only) -----------------------
    const stNow: any = getGlobalLabState() as any;

    const isCollapsed = (id: string, def: boolean) =>
      !!(stNow?.ui?.collapsedSections && (id in stNow.ui.collapsedSections))
        ? !!stNow.ui.collapsedSections[id]
        : def;

    const setCollapsed = (id: string, val: boolean) => {
      const cur = getGlobalLabState();
      setGlobalLabState({
        ...cur,
        ui: {
          ...(cur.ui ?? {}),
          collapsedSections: {
            ...(cur.ui?.collapsedSections ?? {}),
            [id]: val,
          },
        },
      });
    };

    const mkSection = (title: string, id: string, collapsedDefault: boolean, buildBody: (body: HTMLDivElement) => void) => {
      const wrap = el("div");
      wrap.style.cssText = "margin-top:6px;border:1px solid rgba(255,255,255,0.08);border-radius:6px;overflow:hidden;";

      const collapsed = isCollapsed(id, collapsedDefault);

      const h = el("div");
      h.style.cssText =
        "display:flex;align-items:center;justify-content:space-between;" +
        "gap:8px;padding:5px 7px;cursor:pointer;user-select:none;background:rgba(255,255,255,0.02);";

      const ttl = el("div");
      ttl.textContent = title;
      ttl.style.cssText = "font-weight:700;opacity:0.92;font:10px monospace;";
      h.appendChild(ttl);

      const che = el("div");
      che.textContent = collapsed ? "▸" : "▾";
      che.style.cssText = "opacity:0.85;font:12px monospace;";
      h.appendChild(che);

      h.onclick = (e) => {
        stopProp(e);
        setCollapsed(id, !collapsed);
        this.render();
      };

      wrap.appendChild(h);

      if (!collapsed) {
        const body = el("div");
        body.style.cssText = "padding:6px 6px 2px 6px;";
        wrap.appendChild(body);
        buildBody(body);
      }

      box.appendChild(wrap);
    };

    // ---- COMPOSITE (safe, known keys) ----------------------------------
    mkSection("COMPOSITE", "bg.global.composite", false, (body) => {
      // seed (rebuild) - BG-global
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
        body.appendChild(r);
      }

      // vignette (realtime) - BG global common
      {
        const r = this.mkRow();
        r.appendChild(this.mkLabel("vignette"));
        const cur = Number(this.getOverride("common.vignette") ?? activePreset?.common?.vignette ?? 0);
        const n = this.mkNumber(cur, { step: 0.01, min: 0, max: 1 });
        n.onpointerdown = (e) => stopProp(e);
        n.oninput = (e) => stopProp(e);
        n.onchange = (e) => {
          stopProp(e);
          this.setOverride("realtime", "common.vignette", Number(n.value));
          this.render();
        };
        r.appendChild(n);
        body.appendChild(r);
      }

      // noiseTexSize (rebuild) - BG global quality
      {
        const r = this.mkRow();
        r.appendChild(this.mkLabel("noiseTexSize"));
        const cur = String(this.getOverride("quality.noiseTexSize") ?? activePreset?.quality?.noiseTexSize ?? 256);
        const sel = this.mkSelect(cur, ["64", "128", "256", "512"]);
        sel.onpointerdown = (e) => stopProp(e);
        sel.onchange = (e) => {
          stopProp(e);
          this.setOverride("rebuild", "quality.noiseTexSize", Number(sel.value));
          this.render();
        };
        r.appendChild(sel);
        body.appendChild(r);
      }
    });

    // ---- STYLE (placeholder only; no overrides yet) ---------------------
    mkSection("STYLE", "bg.global.style", true, (body) => {
      const d = el("div");
      d.textContent = "TODO: color grade / quantize / dither (BG-only)";
      d.style.cssText = "opacity:0.65;margin:2px 0 6px 0;";
      body.appendChild(d);
    });

    // ---- MOTION (placeholder only; no overrides yet) --------------------
    mkSection("MOTION", "bg.global.motion", true, (body) => {
      const d = el("div");
      d.textContent = "TODO: global drift / wobble / time scale (BG-only)";
      d.style.cssText = "opacity:0.65;margin:2px 0 6px 0;";
      body.appendChild(d);
    });

    this.root.appendChild(box);
  }

  private render(): void {

    this.root.innerHTML = "";

    const presets = this.api.presets?.() ?? [];
    const active = this.api.getActivePresetId?.();

    this.renderTopControls();

    // sync active into lab state if missing
    const st0 = getGlobalLabState();
    if (active && st0.activePresetId !== active) {
      setGlobalLabState({ ...st0, activePresetId: active });
    }

    // choose base snapshot = active preset merged with overrides
    const basePreset = (active ? presets.find((p) => p.id === active) : null) ?? presets[0] ?? null;
      // Let mapUiPathToOverridePath know whether active preset is v1 or v2 (layers present)
      {
        const cur = getGlobalLabState() as any;
        const hasLayers = Array.isArray((basePreset as any)?.layers);
        if (cur?.ui?.activePresetHasLayers !== hasLayers) {
          setGlobalLabState({
            ...cur,
            ui: {
              ...(cur.ui ?? {}),
              activePresetHasLayers: hasLayers,
            },
          } as any);
        }
      }
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


    // NEW skeleton list
    this.renderLayerList(p);

    // existing base panel + layout
this.renderGlobalControls(basePreset);

// --- LEGACY PANEL (V1 layout) --------------------------------------
  const stNow = getGlobalLabState();
  const legacyId = "legacy.panel";
  
const collapsed = (stNow?.ui?.collapsedSections?.[legacyId] ?? true);


  const wrap = el("div");
  wrap.style.cssText =
    "margin-top:8px;border:1px solid rgba(255,255,255,0.10);" +
    "border-radius:7px;overflow:hidden;background:rgba(255,255,255,0.03);";

  const head = el("div");
  head.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;" +
    "gap:8px;padding:6px 8px;cursor:pointer;user-select:none;";

  const title = el("div");
  title.textContent = "LEGACY (v1)";
  title.style.cssText = "font-weight:700;opacity:0.95;font:11px monospace;";
  head.appendChild(title);

  const che = el("div");
  che.textContent = collapsed ? "▸" : "▾";
  che.style.cssText = "opacity:0.85;font:12px monospace;";
  head.appendChild(che);

  head.onclick = (e) => {
    stopProp(e);
    const cur = getGlobalLabState();
    setGlobalLabState({
      ...cur,
      ui: {
        ...(cur.ui ?? {}),
        collapsedSections: {
          ...(cur.ui?.collapsedSections ?? {}),
          [legacyId]: !((cur.ui?.collapsedSections ?? {})[legacyId]),
        },
      },
    });
    this.render();
  };

  wrap.appendChild(head);

    if (!collapsed) {
      const body = el("div");
      body.style.cssText = "padding:6px 6px 2px 6px;";
      wrap.appendChild(body);
      this.root.appendChild(wrap);

      if (snapshot?.base?.kind === "flowSegments") {
        this.renderLegacyFlowControls(body, basePreset);
      } else {
        this.renderLayout(bgBaseUiLayout, snapshot);
      }
    } else {
      this.root.appendChild(wrap);
    }
    }
  }