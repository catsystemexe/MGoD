export type UiControl =
  | { type: "slider"; path: string; min: number; max: number; step?: number; change: "realtime" | "rebuild" }
  | { type: "select"; path: string; options: any[]; change: "realtime" | "structural" }
  | { type: "button"; label: string; action: string };

export type UiSection = {
  id: string;
  title: string;
  controls: UiControl[];
};

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
    ],
  },
  {
    id: "base-quality",
    title: "Base / Quality ⟳",
    controls: [
      { type: "select", path: "base.quality.logicScale", options: [0.5, 1, 1.5, 2], change: "rebuild" },
      { type: "select", path: "base.quality.noiseTexSize", options: [64,128,256,512], change: "rebuild" },
      { type: "select", path: "base.quality.internalResolution", options: ["auto",0.5,1,2], change: "rebuild" },
      { type: "button", label: "Apply Rebuild", action: "applyRebuild" },
    ],
  },
];
