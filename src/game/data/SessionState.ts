// src/game/data/SessionState.ts
export type SessionState = {
  tick: number;
  timeSec: number;
  score: number;
  lives: number;
  wave: number;
  gameOver: boolean;
};

export function makeSessionState(): SessionState {
  return {
    tick: 0,
    timeSec: 0,
    score: 0,
    lives: 3,
    wave: 1,
    gameOver: false,
  };
}