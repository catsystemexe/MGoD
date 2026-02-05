import { BaseRenderer } from "./BaseRenderer";
import { ShaderBgRenderer } from "./ShaderBgRenderer";
import { FlowSegmentsRenderer } from "./FlowSegmentsRenderer";
import { FlowRibbonRenderer } from "./FlowRibbonRenderer";

export function createRenderer(kind: string): BaseRenderer {
  switch (kind) {
    case "flowSegments":
      return new FlowSegmentsRenderer();
    case "flowRibbon":
      return new FlowRibbonRenderer();
    case "shader":
    default:
      return new ShaderBgRenderer();
  }
}
