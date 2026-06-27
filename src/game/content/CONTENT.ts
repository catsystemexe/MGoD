import { loadContent } from "./loadContent";
import behaviorGraphsRaw from "./behaviorGraphs.json";
import type { BehaviorGraph } from "../enemies/fsm";

export const CONTENT: ReturnType<typeof loadContent> = loadContent();
export const BEHAVIOR_GRAPHS = behaviorGraphsRaw as Record<string, BehaviorGraph>;
