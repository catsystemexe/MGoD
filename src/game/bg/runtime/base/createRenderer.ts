import { BaseRenderer } from "./BaseRenderer";
import { ShaderBgRenderer } from "./ShaderBgRenderer";
import { FlowSegmentsRenderer } from "./FlowSegmentsRenderer";

export function createRenderer(kind: string): BaseRenderer {
  switch (kind) {
    case "flowSegments":
      return new FlowSegmentsRenderer();
    case "shader":
    default:
      return new ShaderBgRenderer();
  }
}
