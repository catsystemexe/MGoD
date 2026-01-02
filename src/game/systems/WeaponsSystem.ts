import type { EventBus } from "../../core/EventBus";
import type { GameEvents } from "../../core/events";
import type { HUDWeapon } from "../../ui/HUD"; // ✅ přidat

import { Vec2 } from "../../utils/math";

export class WeaponsSystem {
  private bus?: EventBus<GameEvents>;

  private timer = 0;
  private level = 1;
  private secTimer = 0;
  private secLevel = 1;

  constructor(bus?: EventBus<GameEvents>) {
    this.bus = bus;
  }

  setBus(bus: EventBus<GameEvents>) {
    this.bus = bus;
  }

  update(dt: number) {
    if (this.timer > 0) this.timer -= dt;
    if (this.secTimer > 0) this.secTimer -= dt;
  }

  updatePrimary(
    dt: number,
    active: boolean,
    projectiles: any,
    pos: Vec2,
    aim: Vec2,
    effects: any
  ) {
    void dt;
    void effects;

    if (active && this.timer <= 0) {
      const angle = Math.atan2(aim.y - pos.y, aim.x - pos.x);
      const refire = Math.max(0.05, 0.15 - this.level * 0.02);

      projectiles.spawn(pos, angle, 600, "mg");
      this.bus?.emit("weapon.primary.fired", {});
      this.timer = refire;
    }
  }

  tryFireSecondary(projectiles: any, pos: Vec2, aim: Vec2, effects: any) {
    void effects;

    if (this.secTimer <= 0) {
      const angle = Math.atan2(aim.y - pos.y, aim.x - pos.x);

      for (let i = 0; i < 5 + this.secLevel * 2; i++) {
        projectiles.spawn(
          pos,
          angle + (Math.random() - 0.5) * 0.5,
          500 + Math.random() * 200,
          "shotgun"
        );
      }

      this.bus?.emit("weapon.secondary.fired", {});
      this.secTimer = 1.0;
    }
  }

  throwBomb(projectiles: any, pos: Vec2, aim: Vec2) {
    projectiles.spawnBomb(pos, aim);
  }

  upgradePrimary() { this.level++; }
  upgradeSecondary() { this.secLevel++; }

  getStatus() {
    return { w1Level: this.level, w2Level: this.secLevel, w2Ready: this.secTimer <= 0 };
  }

  // ✅ HUD helper
  getHUDStatus(): HUDWeapon[] {
    const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

    const primaryRefire = Math.max(0.05, 0.15 - this.level * 0.02);
    const secondaryRefire = 1.0;

    const pri = clamp01(primaryRefire > 0 ? this.timer / primaryRefire : 0);
    const sec = clamp01(secondaryRefire > 0 ? this.secTimer / secondaryRefire : 0);

    return [
      { name: "PRI", cooldown01: pri },
      { name: "SEC", cooldown01: sec },
    ];
  }
}