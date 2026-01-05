import type { PlayerActions } from "./ActionSchema";
import type { KeyBindings } from "./InputBindings";
import { DEFAULT_BINDINGS } from "./InputBindings";
import type { InputTape } from "./InputTape";

type KeyState = {
  down: boolean;
  // for trigger buffering:
  pressedAtFrame: number; // last frame index when keydown occurred
};

export type InputManagerOptions = {
  bindings?: KeyBindings;
  triggerBufferFrames?: number; // default 3 (≈50ms @60Hz)
};

export class InputManager {
  private bindings: KeyBindings;
  private triggerBufferFrames: number;

  // key -> state
  private keys = new Map<string, KeyState>();

  // monotonically increasing "frames" counter for buffering
  private frameCounter = 0;

  // latest sampled actions snapshot
  private snapshot: PlayerActions = this.makeZeroActions();

  // optional replay
  private tape: InputTape | null = null;

  // DOM handlers refs (so we can detach)
  private onKeyDown = (ev: KeyboardEvent) => this.handleKeyDown(ev);
  private onKeyUp = (ev: KeyboardEvent) => this.handleKeyUp(ev);

  constructor(opts: InputManagerOptions = {}) {
    this.bindings = opts.bindings ?? DEFAULT_BINDINGS;
    this.triggerBufferFrames = opts.triggerBufferFrames ?? 3;
  }

  /** Attach DOM listeners (call from Bootstrap in browser build) */
  public attach(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  /** Detach DOM listeners */
  public detach(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  /** Set replay tape (optional). If present, overrides live input per tick. */
  public setTape(tape: InputTape | null): void {
    this.tape = tape;
  }

  /**
   * Phase 0: Input Snapshot (per tick).
   * tick is used for tape injection only; live input ignores tick.
   */
  public sample(tick: number): PlayerActions {
    this.frameCounter++;

    // Replay overrides everything (determinism tool)
    const taped = this.tape?.getActionsForTick(tick) ?? null;
    if (taped) {
      this.snapshot = taped;
      return this.snapshot;
    }

    const move = this.computeMoveAxis();
    const firePrimary = this.isAnyDown(this.bindings.firePrimary);
    const fireBomb = this.consumeTrigger(this.bindings.fireBomb);
    const pause = this.consumeTrigger(this.bindings.pause);

    this.snapshot = { move, firePrimary, fireBomb, pause };
    return this.snapshot;
  }

  /** Read-only access to last sampled snapshot */
  public getSnapshot(): PlayerActions {
    return this.snapshot;
  }

  // ----------------- internals -----------------

  private handleKeyDown(ev: KeyboardEvent): void {
    // prevent browser scroll etc for arrows/space when focused
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(ev.code)) {
      ev.preventDefault();
    }
    const state = this.keys.get(ev.code) ?? { down: false, pressedAtFrame: -999999 };
    if (!state.down) {
      state.down = true;
      state.pressedAtFrame = this.frameCounter; // note: frameCounter increments in sample()
    }
    this.keys.set(ev.code, state);
  }

  private handleKeyUp(ev: KeyboardEvent): void {
    const state = this.keys.get(ev.code) ?? { down: false, pressedAtFrame: -999999 };
    state.down = false;
    this.keys.set(ev.code, state);
  }

  private computeMoveAxis(): { x: number; y: number } {
    const left = this.isAnyDown(this.bindings.left);
    const right = this.isAnyDown(this.bindings.right);
    const up = this.isAnyDown(this.bindings.up);
    const down = this.isAnyDown(this.bindings.down);

    const x = (right ? 1 : 0) + (left ? -1 : 0);
    const y = (down ? 1 : 0) + (up ? -1 : 0);

    // normalize diagonal lightly (optional; keeps speed consistent)
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.sqrt(2);
      return { x: x * inv, y: y * inv };
    }
    return { x, y };
  }

  private isAnyDown(codes: string[]): boolean {
    for (const code of codes) {
      if (this.keys.get(code)?.down) return true;
    }
    return false;
  }

  /**
   * Trigger buffering:
   * - returns true if any bound key was pressed recently (within buffer window)
   * - consumes the trigger (won't re-fire until re-pressed)
   */
  private consumeTrigger(codes: string[]): boolean {
    // Find the most recent press among bound keys
    let bestCode: string | null = null;
    let bestPressedAt = -999999;

    for (const code of codes) {
      const st = this.keys.get(code);
      if (!st) continue;
      if (st.pressedAtFrame > bestPressedAt) {
        bestPressedAt = st.pressedAtFrame;
        bestCode = code;
      }
    }

    if (!bestCode) return false;

    const age = this.frameCounter - bestPressedAt;
    if (age < 0) return false;

    if (age <= this.triggerBufferFrames) {
      // consume: set pressedAtFrame far in past
      const st = this.keys.get(bestCode)!;
      st.pressedAtFrame = -999999;
      this.keys.set(bestCode, st);
      return true;
    }

    return false;
  }

  /** DEV ONLY: simulate key state for smoke tests (no DOM). */
  public __devSetKey(code: string, down: boolean): void {
    const state = this.keys.get(code) ?? { down: false, pressedAtFrame: -999999 };
    if (down && !state.down) {
      state.down = true;
      state.pressedAtFrame = this.frameCounter;
    } else if (!down) {
      state.down = false;
    }
    this.keys.set(code, state);
  }
  
  private makeZeroActions(): PlayerActions {
    return { move: { x: 0, y: 0 }, firePrimary: false, fireBomb: false, pause: false };
  }
}
