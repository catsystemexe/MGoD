export interface BgLabState {
  schemaVersion: number;
  selectedPresetId: string | null;
  // runtime i UI budou mířit na V2 snapshot (po wrapperu v loaderu)
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
