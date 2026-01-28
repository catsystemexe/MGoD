import type { BgBase } from "./BgBase";

export type BgBlend = "alpha" | "add";

export type BgLayerV2 = {
  id: string;
  kind: BgBase["kind"] | "flowRibbon" | "particles" | "vector" | string;
  enabled: boolean;
  opacity: number;        // 0..1
  blend: BgBlend;         // MVP: alpha|add
  parallaxMul: number;    // 0..?
  seed?: number;
  params: Record<string, any>; // kind-specific blocks (shader/flow/...)
};

export type BgPresetV2 = {
  id: string;
  name: string;
  schemaVersion: 2;
  seed: number;
  common: BgBase["common"];
  quality: BgBase["quality"];
  layers: BgLayerV2[];

  fx?: Record<string, unknown>;
  aug?: Record<string, unknown>;
  interaction?: Record<string, unknown>;
  audio?: Record<string, unknown>;
};

// Legacy typed “engine preset” (interní; content v1 to stejně nepoužívá přímo)
export type BgPresetV1 = {
  id: string;
  name: string;
  kind: BgBase["kind"];
  schemaVersion: number;
  seed: number;
  base: BgBase;

  fx?: Record<string, unknown>;
  aug?: Record<string, unknown>;
  interaction?: Record<string, unknown>;
  audio?: Record<string, unknown>;
};

// Pipeline bude pracovat s V2 (po wrapperu), ale necháme union kvůli postupné migraci.
export type BgPreset = BgPresetV2 | BgPresetV1;