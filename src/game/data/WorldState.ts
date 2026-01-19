export type WorldState = {
  scrollX: number;
  scrollY: number;
  speedX: number;
};

export function createWorldState(): WorldState {
  return {
    scrollX: 0,
    scrollY: 0,
    speedX: 60, // px/sec autoscroll
  };
}
