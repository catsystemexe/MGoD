export type FlowLayerId = "far" | "mid" | "near";

export type FlowParallaxLayer = {
  layer: FlowLayerId;
  factor: number;      // parallax factor (world scroll multiplier)
  densityMul: number;  // density multiplier
  shearMul?: number;   // optional shear intensity per layer
};

export type FlowPreset = {
  id: string;
  name: string;
  type: "particles_segments";
  space: "world";
  direction: { x: number; y: number };

  parallax: FlowParallaxLayer[];

  spawn: {
    countBase: number;
    respawnPaddingPx: number;
    distribution: "lanes" | "uniform_y";
    lanes?: { count: number; jitterYPx: number };
    yJitterPx?: number;
  };

  motion: {
    speedPxPerSec: {
      base: number;
      laneJitterFrac?: number;
      layerMul: Record<FlowLayerId, number>;
    };

    yMeander?: {
      enabled: boolean;
      ampPx: { min: number; max: number };
      freqHz: { min: number; max: number };
      xPhaseCoupling: number;
    };

    shear?: {
      enabled: boolean;
      curve: "smoothstep";
      strengthPxPerSec: number;
      invert: boolean;
      lowFreqDrift: {
        enabled: boolean;
        targetIntervalSec: { min: number; max: number };
        targetJitterFrac: number;
        lerpRate: number;
      };
    };

    microWave?: {
      enabled: boolean;
      ampPx: number;
      freqHz: number;
      yCoupling: number;
    };

    accelLimitPxPerSec2: number;
    dampingPerSec: number;
  };

  segments: {
    thicknessPx: number;
    lengthPx: {
      min: number;
      max: number;
      laneCoherence?: number;
      speedCoupling?: {
        enabled: boolean;
        gain: number;
        clamp: { min: number; max: number };
      };
      drift: {
        enabled: boolean;
        targetIntervalSec: { min: number; max: number };
        lerpRate: number;
      };
    };
    alignToVelocity: boolean;
  };
  // optional: ribbon rendering (continuous “water bands”)
  ribbon?: {
    lanes?: number; // how many ribbons across screen (higher = more “water”)
    stepPx?: number; // sampling step along X (smaller = smoother/denser)
    thicknessMul?: Partial<Record<FlowLayerId, number>>;
  };

  
  rng: {
    seedMode: "perLevel";
    lowFreq: {
      enabled: boolean;
      globalDriftIntervalSec: { min: number; max: number };
      speedTargetJitterFrac?: number;
      densityTargetJitterFrac?: number;
      lerpRate: number;
    };
  };

  // render tuning (kept minimal on purpose)
  colors?: {
    far: [number, number, number, number];
    mid: [number, number, number, number];
    near: [number, number, number, number];
  };
};

export const FLOW_PRESETS: FlowPreset[] = [
  {
    id: "flow.laminar.segments.v1",
    name: "Laminar Drift (Segments)",
    type: "particles_segments",
    space: "world",
    direction: { x: -1, y: 0 },

    parallax: [
      { layer: "far",  factor: 0.25, densityMul: 0.60 },
      { layer: "mid",  factor: 0.55, densityMul: 0.85 },
      { layer: "near", factor: 1.00, densityMul: 1.00 },
    ],

    spawn: {
      countBase: 1400,          // ✅ hustota = souvislá voda
      respawnPaddingPx: 18,
      distribution: "uniform_y",
      yJitterPx: 10.0,          // ✅ rozbije “řádky”, udělá “fluid”
    },

      motion: {
        speedPxPerSec: {
          base: 44,                 // celkově rychlejší voda
          laneJitterFrac: 0.06,     // !!! zásadní: z 0.6 dolů
          layerMul: { far: 0.85, mid: 1.05, near: 1.25 },  // far už pojede viditelně
        },

        yMeander: {
          enabled: true,
          ampPx: { min: 0.25, max: 0.85 },   // jemnější
          freqHz: { min: 0.04, max: 0.10 },
          xPhaseCoupling: 0.006,
        },

      accelLimitPxPerSec2: 220,
      dampingPerSec: 2.2,
    },

    segments: {
      thicknessPx: 2,
      lengthPx: {
        min: 2,
        max: 12,
        laneCoherence: 0.45,
        drift: {
          enabled: true,
          targetIntervalSec: { min: 2.5, max: 6.0 },
          lerpRate: 0.08,
        },
      },
      alignToVelocity: true,
    },

    ribbon: {
      lanes: 180,
      stepPx: 6,
      thicknessMul: { far: 0.6, mid: 0.8, near: 1.0 },
    },

    
    rng: {
      seedMode: "perLevel",
      lowFreq: {
        enabled: true,
        globalDriftIntervalSec: { min: 3.0, max: 9.0 },
        speedTargetJitterFrac: 0.06,   // !!! z 5 dolů (typicky 0.03–0.10)
        lerpRate: 0.03,
      },
    },

    colors: {
      far:  [0.35, 0.60, 0.95, 0.10],
      mid:  [0.55, 0.85, 1.00, 0.14],
      near: [0.85, 0.95, 1.00, 0.18],
    },
  },

  {
    id: "flow.shear.segments.v1",
    name: "Shear Flow (Segments)",
    type: "particles_segments",
    space: "world",
    direction: { x: -1, y: 0 },

    parallax: [
      { layer: "far",  factor: 0.22, densityMul: 0.50, shearMul: 0.35 },
      { layer: "mid",  factor: 0.50, densityMul: 0.78, shearMul: 0.65 },
      { layer: "near", factor: 1.00, densityMul: 1.00, shearMul: 1.00 },
    ],

    spawn: {
      countBase: 320,
      respawnPaddingPx: 14,
      distribution: "uniform_y",
      yJitterPx: 2.0,
    },

    motion: {
      speedPxPerSec: {
        base: 24,
        layerMul: { far: 0.55, mid: 0.80, near: 1.0 },
      },

      shear: {
        enabled: true,
        curve: "smoothstep",
        strengthPxPerSec: 18,
        invert: false,
        lowFreqDrift: {
          enabled: true,
          targetIntervalSec: { min: 2.8, max: 6.5 },
          targetJitterFrac: 0.10,
          lerpRate: 0.035,
        },
      },

      microWave: {
        enabled: true,
        ampPx: 0.9,
        freqHz: 0.10,
        yCoupling: 0.012,
      },

      accelLimitPxPerSec2: 260,
      dampingPerSec: 2.0,
    },

    segments: {
      thicknessPx: 1,
      lengthPx: {
        min: 2,
        max: 7,
        speedCoupling: {
          enabled: true,
          gain: 0.06,
          clamp: { min: 2, max: 8 },
        },
        drift: {
          enabled: true,
          targetIntervalSec: { min: 2.0, max: 5.0 },
          lerpRate: 0.07,
        },
      },
      alignToVelocity: true,
    },

    rng: {
      seedMode: "perLevel",
      lowFreq: {
        enabled: true,
        globalDriftIntervalSec: { min: 3.0, max: 8.0 },
        densityTargetJitterFrac: 0.06,
        lerpRate: 0.02,
      },
    },

    colors: {
      far:  [0.45, 0.85, 0.75, 0.16],
      mid:  [0.65, 1.00, 0.85, 0.22],
      near: [0.90, 1.00, 0.95, 0.28],
    },
  },
];
