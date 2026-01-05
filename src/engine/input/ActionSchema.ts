export type PlayerActions = {
  move: { x: number; y: number }; // normalized-ish (-1..1)
  firePrimary: boolean;           // hold
  fireBomb: boolean;              // trigger (buffered)
  pause: boolean;                 // trigger (buffered)
};
