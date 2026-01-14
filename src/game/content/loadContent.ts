import enemyTypesJson from "./enemyTypes.json";
import behaviorPresetsJson from "./behaviorPresets.json";
import directorWavesJson from "./directorWaves.json";

import type { ContentBundle, EnemyTypeDef, BehaviorPreset, WaveDef } from "../enemies/EnemyBehaviorTypes";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error("[Content] " + msg);
}

function isNum(x: any) { return typeof x === "number" && Number.isFinite(x); }
function isStr(x: any) { return typeof x === "string" && x.length > 0; }

function isBehaviorId(x: any): boolean {
  // keep in sync with EnemyBehaviorId union
  return x === "none" || x === "straight" || x === "sine" || x === "invaders";
}

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
    assert(isBehaviorId(b.behaviorId), `behaviorPresets(${b.id}).behaviorId unknown: ${String(b.behaviorId)}`);
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
