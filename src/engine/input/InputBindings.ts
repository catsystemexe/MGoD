export type KeyBindings = {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  firePrimary: string[];
  fireBomb: string[];
  pause: string[];
};

export const DEFAULT_BINDINGS: KeyBindings = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  firePrimary: ["Space"],
  fireBomb: ["KeyX"],
  pause: ["Escape", "KeyP"],
};
