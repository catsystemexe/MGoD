import type { BaseRenderer } from "./BaseRenderer";
import { ShaderBgRenderer } from "./ShaderBgRenderer";
import { FlowSegmentsRenderer } from "./FlowSegmentsRenderer";
import { FlowRibbonRenderer } from "./FlowRibbonRenderer";
import { MeshTerrainRenderer } from "./MeshTerrainRenderer";

export function createRenderer(kind: string): BaseRenderer {
  switch (kind) {
    case "mesh":
    case "meshTerrain":
      return new MeshTerrainRenderer();
    case "flowSegments":
      return new FlowSegmentsRenderer();
    case "flowRibbon":
      return new FlowRibbonRenderer();
    case "shader":
    default:
      return new ShaderBgRenderer();
  }
}
