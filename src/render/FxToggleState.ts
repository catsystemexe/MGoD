export type FxToggleSnapshot = {
  postFxEnabled: boolean;
  atmosphericFxEnabled: boolean;
};

export const DEFAULT_POST_FX_ENABLED = true;
export const DEFAULT_ATMOSPHERIC_FX_ENABLED = false;

export function createFxToggleState(
  initial?: Partial<FxToggleSnapshot>,
): FxToggleSnapshot {
  return {
    postFxEnabled: initial?.postFxEnabled ?? DEFAULT_POST_FX_ENABLED,
    atmosphericFxEnabled: initial?.atmosphericFxEnabled ?? DEFAULT_ATMOSPHERIC_FX_ENABLED,
  };
}

export function togglePostFx(state: FxToggleSnapshot): FxToggleSnapshot {
  return {
    ...state,
    postFxEnabled: !state.postFxEnabled,
  };
}

export function shouldRenderPostFx(state: FxToggleSnapshot): boolean {
  return state.postFxEnabled;
}

export function shouldRenderAtmosphericFx(state: FxToggleSnapshot): boolean {
  return state.atmosphericFxEnabled;
}
