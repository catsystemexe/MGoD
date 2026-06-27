export interface BehaviorState {
  movementPresetId?: string;
  attackProfileId?: string;
  transitions?: Transition[];
}
export interface Transition {
  when: Trigger;
  goto: string;
}
export type Trigger =
  | { kind: "timeInState"; seconds: number }
  | { kind: "hpBelow"; ratio: number }
  | { kind: "xLessThan"; x: number }
  | { kind: "offscreen"; side: "left" | "right" };
export interface BehaviorGraph {
  initial: string;
  states: Record<string, BehaviorState>;
}
export interface FsmState {
  current: string;
  age: number;
}
export interface FsmUpdateArgs {
  ent: any;
  graph: BehaviorGraph;
  scrollX: number;
  logicW: number;
  dt: number;
}
export interface FsmUpdateResult {
  switched: boolean;
  previous: string;
  current: string;
  state: BehaviorState;
}
