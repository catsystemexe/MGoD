export type BgKind = "shader" | "flowRibbon" | "flowSegments";

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

export function defaultBgLabState(): BgLabState {
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
  if (!g.__CM_BG_LAB__) g.__CM_BG_LAB__ = defaultBgLabState();
  return g.__CM_BG_LAB__ as BgLabState;
}

export function setBgGlobalsFromState(st: BgLabState): void {
  const g = globalThis as any;

  // BG režim řídí výhradně st.kind (UI selection)
  if (st.kind === "shader") g.__CM_BG_KIND__ = "shader";
  else g.__CM_BG_KIND__ = "flow";

  // renderer čte __CM_BG_LAB__.kind (flowRibbon / flowSegments)
  g.__CM_BG_LAB__ = st;

  // presetIndex globál
  if (Number.isFinite((st as any).presetIndex)) {
    g.__CM_BG_PRESET__ = ((st as any).presetIndex | 0);
  }
}

// Exposed helpers for BG renderers (FlowRibbonBg/FlowSegmentsBg currently read these)
export function installBgLabGlobals(): void {
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
