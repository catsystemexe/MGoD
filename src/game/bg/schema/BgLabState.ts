export interface BgLabState {
  schemaVersion: number;
  selectedPresetId: string | null;
  overrides: Partial<any>;
  debug: {
    freezeTime: boolean;
    stepFrame: boolean;
    showInfluenceMap: boolean;
  };
  ui: {
    collapsed: Record<string, boolean>;
  };
}
