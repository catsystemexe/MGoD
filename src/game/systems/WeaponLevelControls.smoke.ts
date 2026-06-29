import { strict as assert } from "node:assert";
import { EventBus } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import type { CMEventMap } from "../../engine/core/events";
import type { PlayerActions } from "../../engine/input/ActionSchema";
import { WEAPON_DB } from "../defs/WeaponDB";
import { WEAPONS_MVP } from "../defs/Weapons";
import { WeaponSystem } from "./WeaponSystem";
import { applyWeaponLevelControlActions } from "./WeaponLevelControls";

function makeWeaponSystem(): WeaponSystem {
  return new WeaponSystem(
    new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP),
    WEAPONS_MVP,
    WEAPON_DB,
    { scrollX: 0, scrollY: 0 },
  );
}

function actions(patch: Partial<PlayerActions> = {}): PlayerActions {
  return {
    move: { x: 0, y: 0 },
    aimTarget: { x: 0, y: 0 },
    firePrimary: false,
    fireSecondary: false,
    bombPressed: false,
    bombTarget: { x: 0, y: 0 },
    cycleW1LevelPressed: false,
    cycleW2LevelPressed: false,
    ...patch,
  };
}

{
  const ws = makeWeaponSystem();
  assert.equal(ws.getLevel("w1"), 1, "W1 starts at level 1");
  assert.equal(ws.getLevel("w2"), 1, "W2 starts at level 1");

  applyWeaponLevelControlActions(ws, actions({ cycleW1LevelPressed: true }));
  assert.equal(ws.getLevel("w1"), 2, "one W1 cycle action changes it to 2");
  assert.equal(ws.getLevel("w2"), 1, "W1 cycling does not affect W2");

  applyWeaponLevelControlActions(ws, actions({ cycleW1LevelPressed: false }));
  assert.equal(ws.getLevel("w1"), 2, "holding without a new key edge does not repeatedly cycle");

  applyWeaponLevelControlActions(ws, actions({ cycleW1LevelPressed: true }));
  applyWeaponLevelControlActions(ws, actions({ cycleW1LevelPressed: true }));
  applyWeaponLevelControlActions(ws, actions({ cycleW1LevelPressed: true }));
  assert.equal(ws.getLevel("w1"), 5, "repeated distinct W1 presses reach 5");

  applyWeaponLevelControlActions(ws, actions({ cycleW1LevelPressed: true }));
  assert.equal(ws.getLevel("w1"), 1, "W1 wraps from 5 to 1");
}

{
  const ws = makeWeaponSystem();
  applyWeaponLevelControlActions(ws, actions({ cycleW2LevelPressed: true }));
  assert.equal(ws.getLevel("w2"), 2, "one W2 cycle action changes it to 2");
  assert.equal(ws.getLevel("w1"), 1, "W2 cycling does not affect W1");

  applyWeaponLevelControlActions(ws, actions({ cycleW2LevelPressed: true }));
  applyWeaponLevelControlActions(ws, actions({ cycleW2LevelPressed: true }));
  applyWeaponLevelControlActions(ws, actions({ cycleW2LevelPressed: true }));
  assert.equal(ws.getLevel("w2"), 5, "repeated distinct W2 presses reach 5");

  applyWeaponLevelControlActions(ws, actions({ cycleW2LevelPressed: true }));
  assert.equal(ws.getLevel("w2"), 1, "W2 wraps from 5 to 1");
}

console.log("WeaponLevelControls.smoke passed");
