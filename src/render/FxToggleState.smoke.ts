import {
  createFxToggleState,
  DEFAULT_POST_FX_ENABLED,
  shouldRenderAtmosphericFx,
  shouldRenderPostFx,
  togglePostFx,
} from "./FxToggleState";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let state = createFxToggleState();
assert(state.atmosphericFxEnabled === false, "initial Atmospheric FX state must be disabled");
assert(state.postFxEnabled === DEFAULT_POST_FX_ENABLED, "initial Post FX state must match the intended default");
assert(shouldRenderPostFx(state) === DEFAULT_POST_FX_ENABLED, "Post FX render gate must reflect Post FX state");
assert(shouldRenderAtmosphericFx(state) === false, "Atmospheric FX render gate must reflect Atmospheric FX state");

const initialAtmospheric = state.atmosphericFxEnabled;
state = togglePostFx(state);
assert(state.postFxEnabled === !DEFAULT_POST_FX_ENABLED, "F contract must toggle Post FX");
assert(state.atmosphericFxEnabled === initialAtmospheric, "F contract must not change Atmospheric FX");
assert(shouldRenderPostFx(state) === !DEFAULT_POST_FX_ENABLED, "Post FX gate must change after F toggle");
assert(shouldRenderAtmosphericFx(state) === false, "Atmospheric FX gate must stay disabled after F toggle");

for (let i = 0; i < 5; i++) state = togglePostFx(state);
assert(state.atmosphericFxEnabled === false, "repeated F toggles must leave Atmospheric FX disabled");

const independent = createFxToggleState({ postFxEnabled: false, atmosphericFxEnabled: true });
assert(independent.postFxEnabled === false, "Post FX can be disabled independently");
assert(independent.atmosphericFxEnabled === true, "Atmospheric FX can be enabled independently");
assert(shouldRenderPostFx(independent) === false, "Post FX gate respects independent false value");
assert(shouldRenderAtmosphericFx(independent) === true, "Atmospheric FX gate respects independent true value");

const afterToggle = togglePostFx(independent);
assert(afterToggle.postFxEnabled === true, "F toggles independent Post FX value");
assert(afterToggle.atmosphericFxEnabled === true, "F preserves independently enabled Atmospheric FX value");

console.log("FxToggleState smoke passed");
