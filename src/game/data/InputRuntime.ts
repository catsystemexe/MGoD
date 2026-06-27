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
  };
}

export function makeInputRuntime(): InputRuntime {
  return { actions: makeDefaultActions() };
}