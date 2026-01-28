import type { BgPreset } from "../schema/BgPreset";

export const BG_SCHEMA_VERSION = 1;

export type BgLabState = {
  schemaVersion: number;

  // LIVE (not exported)
  activePresetId: string | null;
  overrides: Partial<BgPreset>;
  debug: {
    freezeTime: boolean;
    stepFrame: boolean;
    showInfluenceMap: boolean;
  };
  ui: {
    collapsedSections: Record<string, boolean>;
    activeLayerIx: number;
  };
};

export function createDefaultBgLabState(): BgLabState {
  return {
    schemaVersion: BG_SCHEMA_VERSION,
    activePresetId: null,
    overrides: {},
    debug: {
      freezeTime: false,
      stepFrame: false,
      showInfluenceMap: false,
    },
    ui: {
      collapsedSections: {},
      activeLayerIx: 0,
    },
  };
}

// migration stub (future-proof)
export function migrateBgLabState(
  state: BgLabState,
  fromVersion: number
): BgLabState {
  if (fromVersion === BG_SCHEMA_VERSION) return state;
  // future migrations here
  return { ...state, schemaVersion: BG_SCHEMA_VERSION };
}
