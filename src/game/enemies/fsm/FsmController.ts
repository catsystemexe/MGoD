import type {
  BehaviorGraph,
  BehaviorState,
  FsmState,
  FsmUpdateArgs,
  FsmUpdateResult,
  Trigger,
} from "./FsmTypes";
function getHpRatio(ent: any): number {
  const hp = Number(ent?.hp?.value ?? ent?.hp ?? 1);
  const maxHp = Number(ent?.hp?.max ?? ent?.maxHp ?? (hp || 1));
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return 1;
  return hp / maxHp;
}
function getX(ent: any): number {
  return Number(ent?.pos?.x ?? ent?.x ?? 0);
}
function isOffscreen(ent: any, ctx: { scrollX: number; logicW: number }, side: "left" | "right"): boolean {
  const x = getX(ent);
  if (side === "left") return x < ctx.scrollX - 96;
  return x > ctx.scrollX + ctx.logicW + 96;
}
function evalTrigger(
  trigger: Trigger,
  ent: any,
  ctx: { scrollX: number; logicW: number; age: number },
): boolean {
  switch (trigger.kind) {
    case "timeInState":
      return ctx.age >= trigger.seconds;
    case "hpBelow":
      return getHpRatio(ent) < trigger.ratio;
    case "xLessThan":
      return getX(ent) < trigger.x;
    case "offscreen":
      return isOffscreen(ent, ctx, trigger.side);
    default:
      return false;
  }
}
function ensureFsm(ent: any, graph: BehaviorGraph): FsmState {
  const current = String(ent?.fsm?.current ?? graph.initial);
  const age = Number(ent?.fsm?.age ?? 0);
  ent.fsm = {
    current,
    age: Number.isFinite(age) ? age : 0,
  };
  return ent.fsm;
}
function getState(graph: BehaviorGraph, id: string): BehaviorState {
  return graph.states[id] ?? graph.states[graph.initial] ?? {};
}
export function updateFsm(args: FsmUpdateArgs): FsmUpdateResult {
  const { ent, graph, scrollX, logicW, dt } = args;
  const fsm = ensureFsm(ent, graph);
  const previous = fsm.current;
  const currentState = getState(graph, fsm.current);
  for (const transition of currentState.transitions ?? []) {
    if (evalTrigger(transition.when, ent, { scrollX, logicW, age: fsm.age })) {
      fsm.current = transition.goto;
      fsm.age = 0;
      return {
        switched: true,
        previous,
        current: fsm.current,
        state: getState(graph, fsm.current),
      };
    }
  }
  fsm.age += dt;
  return {
    switched: false,
    previous,
    current: fsm.current,
    state: currentState,
  };
}
