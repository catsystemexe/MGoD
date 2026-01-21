// src/game/data/WorldState.ts

export type WorldState = {
  scrollX: number;
  scrollY: number;
  speedX: number;

  // === vertical camera / world ===
  worldW: number;
  worldH: number;

  cameraPadTop: number;
  cameraPadBottom: number;

  camEaseSec: number;
};

export function createWorldState(): WorldState {
  return {
    scrollX: 0,
    scrollY: 0,
    speedX: 60, // px/sec autoscroll X

    // === WORLD SIZE (Y > screen) ===
    worldW: 999999, // prakticky nekonečno doprava
    worldH: 900,    // VYŠŠÍ než LOGIC_H

    // === CAMERA SPRING SETTINGS ===
    cameraPadTop: 140,
    cameraPadBottom: 140,
    camEaseSec: 0.12, // menší = tvrdší kamera, větší = gumovější
  };
}