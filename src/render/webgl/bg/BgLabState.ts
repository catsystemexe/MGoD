export type BgLabState = {
  enabled?: boolean;
  kind?: "shader" | "flowRibbon" | "flowSegments" | string;
  presetIndex?: number;
  flow?: any;
  shader?: any;
};

/**
 * LEGACY BG LAB DISABLED (cleanup before new BG engine).
 * Intentionally: NO global side-effects, NO BG legacy global symbols.
 */

export function defaultBgLabState(): BgLabState {
  return { enabled: false, kind: "shader", presetIndex: 0, flow: {}, shader: {} };
}

export function getBgLabState(): BgLabState {
  return defaultBgLabState();
}

export function setBgGlobalsFromState(_st: BgLabState): void {
  // legacy disabled
}

export function installBgLabGlobals(): void {
  // legacy disabled
}
