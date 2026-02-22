import enemyTypesJson from "./enemyTypes.json";
import bgPresetsJson from "./bgPresets.json";
import bgBindingsJson from "./bgBindings.json";
import behaviorPresetsJson from "./behaviorPresets.json";
import directorWavesJson from "./directorWaves.json";

import { isEnemyBehaviorId } from "../enemies/EnemyBehaviorTypes";
import type {
  ContentBundle, EnemyTypeDef, BehaviorPreset, WaveDef,
  BgPresetsFile, BgBindingsFile,
} from "../enemies/EnemyBehaviorTypes";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error("[Content] " + msg);
}

function isNum(x: any) { return typeof x === "number" && Number.isFinite(x); }
function isStr(x: any) { return typeof x === "string" && x.length > 0; }


function validateEnemyTypes(list: any[]): EnemyTypeDef[] {
  assert(Array.isArray(list), "enemyTypes must be an array");
  for (const e of list) {
    assert(e && typeof e === "object", "enemyTypes item must be object");
    assert(isStr(e.id), "enemyTypes.id must be string");
    assert(isNum(e.hp), `enemyTypes(${e.id}).hp must be number`);
    assert(isNum(e.radius), `enemyTypes(${e.id}).radius must be number`);
    assert(isNum(e.scoreOnKill), `enemyTypes(${e.id}).scoreOnKill must be number`);
    assert(isStr(e.behaviorPresetId), `enemyTypes(${e.id}).behaviorPresetId must be string`);
    // NOTE: allow extra fields like render
  }
  return list as EnemyTypeDef[];
}

function validateBehaviorPresets(list: any[]): BehaviorPreset[] {
  assert(Array.isArray(list), "behaviorPresets must be an array");
  for (const b of list) {
    assert(b && typeof b === "object", "behaviorPresets item must be object");
    assert(isStr(b.id), "behaviorPresets.id must be string");
    assert(isStr(b.behaviorId), `behaviorPresets(${b.id}).behaviorId must be string`);
    assert(isEnemyBehaviorId(b.behaviorId), `behaviorPresets(${b.id}).behaviorId unknown: ${String(b.behaviorId)}`);
    assert(b.params && typeof b.params === "object", `behaviorPresets(${b.id}).params must be object`);
  }
  return list as BehaviorPreset[];
}

function validateWaves(list: any[]): WaveDef[] {
  assert(Array.isArray(list), "waves must be an array");
  for (const w of list) {
    assert(w && typeof w === "object", "waves item must be object");
    assert(isStr(w.id), "waves.id must be string");
    assert(isNum(w.startSec), `waves(${w.id}).startSec must be number`);
    assert(isNum(w.durationSec), `waves(${w.id}).durationSec must be number`);
    assert(isNum(w.spawnEverySec), `waves(${w.id}).spawnEverySec must be number`);
    assert(isNum(w.maxAlive), `waves(${w.id}).maxAlive must be number`);
    assert(isStr(w.enemyTypeId), `waves(${w.id}).enemyTypeId must be string`);

    if (w.behaviorPresetId !== undefined) {
      assert(isStr(w.behaviorPresetId), `waves(${w.id}).behaviorPresetId must be string if provided`);
    }
    // NOTE: allow pattern:any (data-first)
  }
  return list as WaveDef[];
}

function clamp01(x: any): number {
  const n = Number(x ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function wrapPresetV1ToV2(p: any): any {
  // Legacy content preset shape:
  // { id,name,kind, flow?:{}, shader?:{} }
  const kind = String(p?.kind ?? "shader");

  // Default common/quality for Sprint 1
  const common = {
    timeScale: 1,
    scrollSpeedX: 0,
    scrollX: 0,
    scrollY: 0,
    exposure: 1,
    contrast: 1,
    gamma: 1,
    colorize: 0,
    vignette: 0,
    bgFade: 0,
  };

  const quality = {
    logicScale: 1,
    noiseTexSize: 256,
    internalResolution: "auto",
  };

  const layer = {
    id: "layer1",
    kind,
    enabled: true,
    opacity: 1,
    blend: (p?.flow?.blend === "add" ? "add" : "alpha"),
    parallaxMul: 1,
    params: {
      // keep legacy blocks as-is
      shader: (p?.shader ?? {}),
      flow: (p?.flow ?? {}),
      // keep possible future blocks
    },
  };

  return {
    id: String(p.id),
    name: String(p.name),
    schemaVersion: 2,
    seed: Number(p.seed ?? 0) || 0,
    common,
    quality,
    layers: [layer],
  };
}


function validateBgPresetsFile(raw: any): BgPresetsFile {
  assert(raw && typeof raw === "object", "bgPresets must be an object");
  assert(isNum(raw.schemaVersion), "bgPresets.schemaVersion must be number");
  assert(raw.schemaVersion === 1 || raw.schemaVersion === 2, "bgPresets.schemaVersion must be 1 or 2");

  const presets = raw.presets;
  assert(Array.isArray(presets), "bgPresets.presets must be an array");

  for (const p of presets as any[]) {
    assert(p && typeof p === "object", "bgPresets.presets item must be object");
    assert(isStr(p.id), "bgPresets.presets.id must be string");
    assert(isStr(p.name), `bgPresets(${String(p.id)}).name must be string`);
    assert(isStr(p.kind), `bgPresets(${String(p.id)}).kind must be string`);
    assert(
      p.kind === "shader" || p.kind === "flowRibbon" || p.kind === "flowSegments",
      `bgPresets(${String(p.id)}).kind invalid: ${String(p.kind)}`
    );

    if (p.flow !== undefined) {
      assert(p.flow && typeof p.flow === "object", `bgPresets(${String(p.id)}).flow must be object if provided`);
      const f = p.flow;
      const nums = [
        "alphaFar","alphaMid","alphaNear",
        "ribbonLanes","ribbonStepPx","thicknessMulFar","thicknessMulMid","thicknessMulNear",
        "segCountBase","segYJitterPx","segSpeedBase",
      ] as const;
      for (const k of nums) {
        if (f[k] !== undefined) assert(isNum(f[k]), `bgPresets(${String(p.id)}).flow.${k} must be number if provided`);
      }

      if (p.shader !== undefined) {
        assert(p.shader && typeof p.shader === "object", `bgPresets(${String(p.id)}).shader must be object if provided`);
        const s = p.shader as any;
        if (s.presetIndex !== undefined) {
          assert(isNum(s.presetIndex), `bgPresets(${String(p.id)}).shader.presetIndex must be number if provided`);
        }
      }
      if (f.blend !== undefined) {
        assert(f.blend === "alpha" || f.blend === "add", `bgPresets(${String(p.id)}).flow.blend invalid`);
      }
    }
  }

  // Normalize to V2 for runtime/UI
  if (raw.schemaVersion === 2) {
    // minimal sanity: presets are objects with layers[]
    for (const p of presets as any[]) {
      assert(Array.isArray(p.layers), `bgPresets(${String(p.id)}).layers must be array (v2)`);
    }
    return raw as BgPresetsFile;
  }

  // schemaVersion === 1 -> wrap all to V2
  const v2 = {
    schemaVersion: 2,
    presets: (presets as any[]).map(wrapPresetV1ToV2),
  };
  return v2 as any;
}

function validateBgBindingsFile(raw: any): BgBindingsFile {
  assert(raw && typeof raw === "object", "bgBindings must be an object");
  assert(isNum(raw.schemaVersion), "bgBindings.schemaVersion must be number");
  assert(raw.schemaVersion === 1, "bgBindings.schemaVersion must be 1 (MVP)");
  assert(isStr(raw.defaultPresetId), "bgBindings.defaultPresetId must be string");

  if (raw.bindings !== undefined) {
    assert(Array.isArray(raw.bindings), "bgBindings.bindings must be array if provided");
    for (const b of raw.bindings as any[]) {
      assert(b && typeof b === "object", "bgBindings.bindings item must be object");
      assert(isStr(b.levelId), "bgBindings.bindings.levelId must be string");
      assert(isStr(b.presetId), "bgBindings.bindings.presetId must be string");
    }
  }

  return raw as BgBindingsFile;
}

export function loadContent(): ContentBundle {
  const enemyTypes = validateEnemyTypes((enemyTypesJson as any).enemyTypes);
  const behaviorPresets = validateBehaviorPresets((behaviorPresetsJson as any).behaviorPresets);
  const waves = validateWaves((directorWavesJson as any).waves);



  // cross-ref checks
  const presetIds = new Set(behaviorPresets.map(b => b.id));

  for (const e of enemyTypes) {
    assert(
      presetIds.has(e.behaviorPresetId),
      `enemyType(${e.id}) references missing behaviorPresetId=${e.behaviorPresetId}`
    );
  }

  const typeIds = new Set(enemyTypes.map(e => e.id));
  for (const w of waves) {
    assert(typeIds.has(w.enemyTypeId), `wave(${w.id}) references missing enemyTypeId=${w.enemyTypeId}`);

    if (typeof w.behaviorPresetId === "string" && w.behaviorPresetId.length) {
      assert(
        presetIds.has(w.behaviorPresetId),
        `wave(${w.id}) references missing behaviorPresetId=${w.behaviorPresetId}`
      );
    }
  }
  return { enemyTypes, behaviorPresets, waves };
}
