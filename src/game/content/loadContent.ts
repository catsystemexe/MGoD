import enemyTypesJson from "./enemyTypes.json";
import behaviorPresetsJson from "./behaviorPresets.json";
import directorWavesJson from "./directorWaves.json";
import behaviorGraphsRaw from "./behaviorGraphs.json";

import type { BehaviorPreset } from "../enemies/EnemyBehaviorTypes";
import type { BehaviorGraph } from "../enemies/fsm";
import { isEnemyBehaviorId } from "../enemies/EnemyBehaviorTypes";
import type { EnemyContentBundle, EnemyTypeContentDef, EnemyWaveContentDef } from "../defs/EnemyContentTypes";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error("[Content] " + msg);
}

function isNum(x: any) { return typeof x === "number" && Number.isFinite(x); }
function isStr(x: any) { return typeof x === "string" && x.length > 0; }


export function validateEnemyTypes(list: any[]): EnemyTypeContentDef[] {
  assert(Array.isArray(list), "enemyTypes must be an array");
  for (const e of list) {
    assert(e && typeof e === "object", "enemyTypes item must be object");
    assert(isStr(e.id), "enemyTypes.id must be string");
    assert(isNum(e.hp), `enemyTypes(${e.id}).hp must be number`);
    assert(isNum(e.radius), `enemyTypes(${e.id}).radius must be number`);
    assert(isNum(e.scoreOnKill), `enemyTypes(${e.id}).scoreOnKill must be number`);
    assert(isStr(e.behaviorPresetId), `enemyTypes(${e.id}).behaviorPresetId must be string`);

    const sprite = e?.render?.sprite;
    if (sprite !== undefined) {
      assert(sprite && typeof sprite === "object" && !Array.isArray(sprite), `enemyTypes(${e.id}).render.sprite must be object if provided`);
      assert(typeof sprite.id === "string" && sprite.id.trim().length > 0, `enemyTypes(${e.id}).render.sprite.id must be non-empty string`);
      if (sprite.scale !== undefined) {
        assert(isNum(sprite.scale) && sprite.scale > 0, `enemyTypes(${e.id}).render.sprite.scale must be positive finite number if provided`);
      }
      if (sprite.animation !== undefined) {
        const animation = sprite.animation;
        assert(animation && typeof animation === "object" && !Array.isArray(animation), `enemyTypes(${e.id}).render.sprite.animation must be object if provided`);
        assert(typeof animation.id === "string" && animation.id.trim().length > 0, `enemyTypes(${e.id}).render.sprite.animation.id must be non-empty string`);
        if (animation.speed !== undefined) {
          assert(isNum(animation.speed) && animation.speed > 0, `enemyTypes(${e.id}).render.sprite.animation.speed must be positive finite number if provided`);
        }
      }
    }
    // NOTE: allow extra fields like render
  }
  return list as EnemyTypeContentDef[];
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

function validateWaves(list: any[]): EnemyWaveContentDef[] {
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
  return list as EnemyWaveContentDef[];
}

export function loadContent(): EnemyContentBundle {
  const enemyTypes = validateEnemyTypes((enemyTypesJson as any).enemyTypes);
  const behaviorPresets = validateBehaviorPresets((behaviorPresetsJson as any).behaviorPresets);
  const waves = validateWaves((directorWavesJson as any).waves);
  const behaviorGraphs = behaviorGraphsRaw as Record<string, BehaviorGraph>;

  // cross-ref checks
  const presetIds = new Set(behaviorPresets.map(b => b.id));
  const graphIds = new Set(Object.keys(behaviorGraphs));

  for (const e of enemyTypes) {
    assert(
      presetIds.has(e.behaviorPresetId),
      `enemyType(${e.id}) references missing behaviorPresetId=${e.behaviorPresetId}`
    );

    if (typeof e.behaviorGraphId === "string" && e.behaviorGraphId.length) {
      assert(
        graphIds.has(e.behaviorGraphId),
        `enemyType(${e.id}) references missing behaviorGraphId=${e.behaviorGraphId}`
      );
    }
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

  return { enemyTypes, behaviorPresets, behaviorGraphs, waves };
}
