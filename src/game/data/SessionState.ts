export type SessionState = {
  tick: number;
  timeSec: number;

  score: number;

  // MVP: life state
  gameOver: boolean;
};

export function makeSessionState(): SessionState {
  return {
    tick: 0,
    timeSec: 0,
    score: 0,
    gameOver: false,
  };
}
