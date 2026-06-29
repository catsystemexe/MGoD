import { strict as assert } from "node:assert";
import { getHudWeaponLevels } from "./HUDArcade";

{
  const levels = getHudWeaponLevels({
    weapons: {
      slots: {
        w1: { level: 4, maxLevel: 5 },
        w2: { level: 3, maxLevel: 5 },
      },
    },
  });
  assert.equal(levels.w1Level, 4, "W1 HUD level comes from W1 snapshot");
  assert.equal(levels.w2Level, 3, "W2 HUD level comes from W2 snapshot");
}

{
  const levels = getHudWeaponLevels({});
  assert.equal(levels.w1Level, 1, "missing W1 weapon snapshot safely displays level 1");
  assert.equal(levels.w2Level, 1, "missing W2 weapon snapshot safely displays level 1");
}

{
  const player: any = {
    bombs: 1,
    w2: { active: true, charge01: 0.5 },
    weapons: { slots: { w1: { level: 1, maxLevel: 5 }, w2: { level: 2, maxLevel: 5 } } },
  };
  let levels = getHudWeaponLevels(player);
  assert.equal(levels.w1Level, 1, "initial W1 HUD level is visible");
  assert.equal(levels.w2Level, 2, "initial W2 HUD level is visible");
  player.weapons = { slots: { w1: { level: 5, maxLevel: 5 }, w2: { level: 4, maxLevel: 5 } } };
  levels = getHudWeaponLevels(player);
  assert.equal(levels.w1Level, 5, "level changes are visible on the next HUD update");
  assert.equal(levels.w2Level, 4, "W2 level changes are visible on the next HUD update");
  assert.equal(player.w2.charge01, 0.5, "W2 charge state remains available");
  assert.equal(player.bombs, 1, "bomb count remains unchanged");
}

console.log("HUDArcade.smoke passed");
