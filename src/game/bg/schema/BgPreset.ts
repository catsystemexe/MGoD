import type { BgBase } from "./BgBase";

export type BgPreset = {
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
