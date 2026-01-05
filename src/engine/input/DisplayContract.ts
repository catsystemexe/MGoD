/**
 * Minimal contract for mapping DOM pointer -> logic space.
 * viewport is in CSS pixels relative to the canvas' client rect.
 */
export type DisplayInfo = {
  logicW: number;
  logicH: number;

  // viewport inside the canvas (CSS px)
  viewport: { x: number; y: number; w: number; h: number };

  // scale from logic->present (integer scale in your display system)
  scale: number;
};
