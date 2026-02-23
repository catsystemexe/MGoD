import type { BgPresetV2 } from "../schema/BgPreset";

export const DEFAULT_MESH_TERRAIN_PRESET: BgPresetV2 = {
  id: "bg.meshTerrain.default",
  name: "Mesh Terrain Default",
  schemaVersion: 2,
  seed: 0,
  common: {
    timeScale: 1,
    scrollSpeedX: -60,
    scrollX: 0,
    scrollY: 0,
    exposure: 1,
    contrast: 1,
    gamma: 1,
    colorize: 0,
    vignette: 0,
    bgFade: 0,
  },
  quality: {
    logicScale: 1,
    noiseTexSize: 128,
    internalResolution: "auto",
  },
  layers: [
    {
      id: "layer0",
      kind: "meshTerrain",
      enabled: true,
      opacity: 1,
      blend: "alpha",
      parallaxMul: 1,
      params: {
        mesh: {
          amp: 0.24,
          freq: 5.4,
          speed: 0.23,

          amp2: 0.12,
          freq2: 14.0,
          speed2: 0.55,

          warpAmp: 0.24,
          warpFreq: 1.8,
          warpSpeed: 0.30,

          bumpAmp: 0.11,
          bumpFreq: 16.0,
          bumpSpeed: 0.48,
          bumpSharp: 1.60,

          depthAmpPow: 1.0,

          ampDepthNear: 0.120,
          ampDepthFar: 12.6,
          ampDepthBias: 0.72,
          ampDepthPow: 2.6,

          bumpDepthNear: 0.06,
          bumpDepthFar: 2.25,
          bumpDepthBias: 0.74,
          bumpDepthPow: 2.6,

          tilt: 1.65,
          persp: 1.48,
          xSpan: 2.8,

          lineAlpha: 0.22,
          gridX: 120,
          gridZ: 80,
        },
      },
    },
  ],
};