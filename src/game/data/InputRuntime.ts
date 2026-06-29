import type { PlayerActions } from "../../engine/input/ActionSchema";

export type InputRuntime = {
  actions: PlayerActions;
};

export function makeDefaultActions(): PlayerActions {
  return {
    move: { x: 0, y: 0 },
    aimTarget: { x: 112, y: 128 },
    firePrimary: false,
    fireSecondary: false,
    bombPressed: false,
    bombTarget: { x: 112, y: 128 },
    cycleW1LevelPressed: false,
    cycleW2LevelPressed: false,
  };
}

export function makeInputRuntime(): InputRuntime {
  return { actions: makeDefaultActions() };
}