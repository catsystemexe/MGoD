export type BgBaseCommon = {
  timeScale: number;
  scrollSpeedX?: number; // px/sec
  scrollX: number;
  scrollY: number;
  exposure: number;
  contrast: number;
  gamma: number;
  colorize: number;
  vignette: number;
  bgFade: number;
};

export type BgBaseQuality = {
  logicScale: number;
  noiseTexSize: 64 | 128 | 256 | 512;
  internalResolution: "auto" | 0.5 | 1 | 2;
};

export type BgShaderBase = {
  preset: "gradient" | "plasma" | "nebula" | "stripes";
  a: number;
  b: number;
  warp: number;
  grain: number;
};

export type BgFlowSegmentsBase = {
  // NOTE: runtime FlowSegmentsBg uses FLOW_PRESETS via presetIndex
  presetId?: string;
  presetIndex?: number;

  speed: number;
  curl: number;
  jitter: number;
  thickness: number;
  alpha: number;
  segmentCount: number;
  segmentLen: number;
  gridW: number;
  gridH: number;
};

export type BgBase =
  | {
      kind: "shader";
      common: BgBaseCommon;
      quality: BgBaseQuality;
      shader: BgShaderBase;
    }
  | {
      kind: "flowSegments";
      common: BgBaseCommon;
      quality: BgBaseQuality;
      flow: BgFlowSegmentsBase;
    };
