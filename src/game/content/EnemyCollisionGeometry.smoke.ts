import { ENEMY_DEFS } from "../defs/EnemyDefs";
import { WEAPON_DB } from "../defs/WeaponDB";
import attackProfiles from "./attackProfiles.json";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function approx(actual: number, expected: number, eps = 0.02): boolean {
  return Math.abs(actual - expected) <= eps;
}

const spriteEnemyIds = [
  "basic_1",
  "basic_2",
  "shooter_1",
  "void_1",
  "crawler_1",
  "mine_1",
  "fsm_turret",
  "fsm_hover",
  "fsm_charge",
  "fsm_zigzag",
  "fsm_smart_tracker",
  "fsm_smart_aligner",
  "fsm_smart_evader",
  "fsm_smart_ranger",
  "fsm_smart_orbit_half",
  "fsm_smart_orbit_repeat",
];

function main(): void {
  for (const [id, def] of Object.entries(ENEMY_DEFS)) {
    assert(Number.isFinite(def.radius) && def.radius > 0, `${id} must have a positive finite radius`);
  }

  for (const id of spriteEnemyIds) {
    assert(ENEMY_DEFS[id]?.radius === 24, `${id} sprite-backed radius should be 24`);
  }

  const mandala = ENEMY_DEFS.mandala;
  assert(mandala?.radius === 24, "mandala collision radius should be 24");
  assert(approx(Number(mandala?.render?.sdf?.size), 0.58), "mandala sdf.size should preserve visual product near 0.58");
  assert(approx(24 * Number(mandala?.render?.sdf?.size), 7 * 2.0, 0.12), "mandala radius*sdf.size product should stay close to original");

  const sniper = ENEMY_DEFS.sniper_aimed;
  assert(sniper?.radius === 24, "sniper_aimed collision radius should be 24");
  assert(approx(Number(sniper?.render?.sdf?.size), 0.65), "sniper_aimed sdf.size should preserve visual product near 0.65");
  assert(approx(24 * Number(sniper?.render?.sdf?.size), 12 * 1.3, 0.02), "sniper_aimed radius*sdf.size product should stay close to original");

  assert(WEAPON_DB["w1.basic"].projectile?.radius === 5, "W1 projectile radius must remain unchanged");
  assert(WEAPON_DB["b1.basic"].bomb?.radius === 10, "weapon DB bomb radius must remain unchanged");
  for (const [id, profile] of Object.entries(attackProfiles as Record<string, any>)) {
    assert(profile.projectileRadius === 4, `${id} enemy projectile radius must remain unchanged`);
  }

  console.log("[SMOKE] EnemyCollisionGeometry OK ✅");
}

main();
