import { EventType } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";
import { PowerupSystem } from "./PowerupSystem";
import { WeaponSystem } from "./WeaponSystem";
import { WEAPONS_MVP } from "../defs/Weapons";
import { WEAPON_DB } from "../defs/WeaponDB";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function applyPickup(powerups: PowerupSystem, defId: string): void {
  powerups.onFlowEvents([{ type: EventType.PLAYER_PICKUP, payload: { player: { slot: 0, gen: 1 }, pickup: { slot: 1, gen: 1 }, defId } } as any]);
}

function main(): void {
  const store = new EntityStore<any>(8);
  const playerRef = store.spawn((e: any) => {
    e.kind = "player";
    e.energy = 1;
    e.energyMax = 3;
    e.bombs = 2;
    e.pendingKill = false;
  });
  const session = { score: 10 };
  const weaponSystem = new WeaponSystem({ emitNext: () => {} } as any, WEAPONS_MVP, WEAPON_DB, { scrollX: 0, scrollY: 0 });
  const powerups = new PowerupSystem(session, store as any, () => playerRef, {
    upgradeWeaponSlot: (slot) => { weaponSystem.upgradeSlot(slot); },
  });

  const player = store.get(playerRef) as any;

  assert(weaponSystem.getLevel("w1") === 1, "W1 must start at L1");
  applyPickup(powerups, "w1");
  assert(weaponSystem.getLevel("w1") === 2, "w1 pickup must upgrade W1 L1 -> L2");
  weaponSystem.setLevel("w1", 5);
  applyPickup(powerups, "w1");
  assert(weaponSystem.getLevel("w1") === 5, "w1 pickup at L5 must stay L5 without wrap");

  assert(weaponSystem.getLevel("w2") === 1, "W2 must start at L1");
  applyPickup(powerups, "w2");
  assert(weaponSystem.getLevel("w2") === 2, "w2 pickup must upgrade W2 L1 -> L2");
  weaponSystem.setLevel("w2", 5);
  applyPickup(powerups, "w2");
  assert(weaponSystem.getLevel("w2") === 5, "w2 pickup at L5 must stay L5 without wrap");

  applyPickup(powerups, "energy");
  assert(player.energy === 2, "energy pickup must raise energy by 1");

  applyPickup(powerups, "energy");
  applyPickup(powerups, "energy");
  assert(player.energy === 3, "energy pickup must clamp to energyMax");

  applyPickup(powerups, "bomb");
  assert(player.bombs === 3, "bomb pickup must increment bomb inventory by 1");

  applyPickup(powerups, "score");
  assert(session.score === 60, "score pickup must add 50 points");

  applyPickup(powerups, "unknown");
  assert(player.energy === 3 && player.bombs === 3 && session.score === 60 && weaponSystem.getLevel("w1") === 5 && weaponSystem.getLevel("w2") === 5, "unknown pickup must be ignored");

  console.log("[SMOKE] PowerupSystem OK ✅");
}

main();
