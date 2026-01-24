export type ChangeType = "realtime" | "rebuild" | "structural";

export type UiControl =
  | { type: "slider"; path: string; min: number; max: number; step?: number; change: "realtime" | "rebuild" }
  | { type: "select"; path: string; options: any[]; change: ChangeType }
  | { type: "button"; label: string; action: string };

export type UiSection = {
  id: string;
  title: string;
  controls: UiControl[];
};

/**
 * BG Dev UI Layout (Layer 1 / Base)
 *
 * Paths are written into BgLabState.overrides (Partial<BgPreset>).
 * Runtime decides what is realtime vs rebuild vs structural.
 *
 * Convention:
 * - realtime: uniforms / cheap params
 * - rebuild: buffers/textures regenerate (counts, grids, sizes)
 * - structural: pipeline branch / renderer kind / preset switches
 */
export const bgBaseUiLayout: UiSection[] = [
  {
    id: "base-common",
    title: "Base / Common",
    controls: [
      { type: "slider", path: "base.common.timeScale", min: 0, max: 3, step: 0.01, change: "realtime" },
      { type: "slider", path: "base.common.scrollX", min: -2, max: 2, step: 0.01, change: "realtime" },
      { type: "slider", path: "base.common.scrollY", min: -2, max: 2, step: 0.01, change: "realtime" },

      { type: "slider", path: "base.common.exposure", min: 0, max: 2, step: 0.01, change: "realtime" },
      { type: "slider", path: "base.common.contrast", min: 0, max: 2, step: 0.01, change: "realtime" },
      { type: "slider", path: "base.common.gamma", min: 0.5, max: 2.5, step: 0.01, change: "realtime" },

      { type: "slider", path: "base.common.colorize", min: 0, max: 1, step: 0.01, change: "realtime" },
      { type: "slider", path: "base.common.vignette", min: 0, max: 1, step: 0.01, change: "realtime" },
      { type: "slider", path: "base.common.bgFade", min: 0, max: 1, step: 0.01, change: "realtime" },
    ],
  },

  {
    id: "base-quality",
    title: "Base / Quality ⟳",
    controls: [
      { type: "select", path: "base.quality.logicScale", options: [0.5, 1, 1.5, 2], change: "rebuild" },
      { type: "select", path: "base.quality.noiseTexSize", options: [64, 128, 256, 512], change: "rebuild" },
      { type: "select", path: "base.quality.internalResolution", options: ["auto", 0.5, 1, 2], change: "rebuild" },
      { type: "button", label: "Apply Rebuild", action: "applyRebuild" },
    ],
  },

  // --- FLOW (FlowSegments) -------------------------------------------------
  {
    id: "base-flowsegments-rt",
    title: "Base / FlowSegments (rt)",
    controls: [
      { type: "slider", path: "base.flow.speed", min: 0, max: 3, step: 0.01, change: "realtime" },
      { type: "slider", path: "base.flow.curl", min: 0, max: 3, step: 0.01, change: "realtime" },
      { type: "slider", path: "base.flow.jitter", min: 0, max: 2, step: 0.01, change: "realtime" },
      { type: "slider", path: "base.flow.thickness", min: 0.1, max: 4, step: 0.01, change: "realtime" },
      { type: "slider", path: "base.flow.alpha", min: 0, max: 1, step: 0.01, change: "realtime" },
    ],
  },
  {
    id: "base-flowsegments-rebuild",
    title: "Base / FlowSegments (rebuild) ⟳",
    controls: [
      { type: "slider", path: "base.flow.segmentCount", min: 64, max: 4096, step: 1, change: "rebuild" },
      { type: "slider", path: "base.flow.segmentLen", min: 2, max: 64, step: 1, change: "rebuild" },
      { type: "slider", path: "base.flow.gridW", min: 8, max: 256, step: 1, change: "rebuild" },
      { type: "slider", path: "base.flow.gridH", min: 8, max: 256, step: 1, change: "rebuild" },
      { type: "button", label: "Apply Rebuild", action: "applyRebuild" },
    ],
  },

  // --- SHADER (optional; safe to keep even if not used by current preset) ---
  {
    id: "base-shader-struct",
    title: "Base / Shader (struct) ⚙︎",
    controls: [
      { type: "select", path: "base.shader.preset", options: ["gradient", "plasma", "nebula", "stripes"], change: "structural" },
    ],
  },
  {
    id: "base-shader-rt",
    title: "Base / Shader (rt)",
    controls: [
      { type: "slider", path: "base.shader.a", min: 0, max: 5, step: 0.01, change: "realtime" },
      { type: "slider", path: "base.shader.b", min: 0, max: 5, step: 0.01, change: "realtime" },
      { type: "slider", path: "base.shader.warp", min: 0, max: 5, step: 0.01, change: "realtime" },
      { type: "slider", path: "base.shader.grain", min: 0, max: 2, step: 0.01, change: "realtime" },
    ],
  },
];
