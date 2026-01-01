import type { EventBus } from "../../core/EventBus";
import type { GameEvents } from "../../core/events";

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

      // Spawn 'mg' variant
      projectiles.spawn(pos, angle, 600, "mg");

      // ✅ truth event: fired
      this.bus?.emit("weapon.primary.fired", {});

      this.timer = refire;
    }
  }

  tryFireSecondary(projectiles: any, pos: Vec2, aim: Vec2, effects: any) {
    void effects;

    if (this.secTimer <= 0) {
      const angle = Math.atan2(aim.y - pos.y, aim.x - pos.x);

      for (let i = 0; i < 5 + this.secLevel * 2; i++) {
        // Spawn 'shotgun' variant
        projectiles.spawn(
          pos,
          angle + (Math.random() - 0.5) * 0.5,
          500 + Math.random() * 200,
          "shotgun"
        );
      }

      // ✅ truth event: fired
      this.bus?.emit("weapon.secondary.fired", {});

      this.secTimer = 1.0;
    }
  }

  // Helper to spawn bomb projectile
  throwBomb(projectiles: any, pos: Vec2, aim: Vec2) {
    projectiles.spawnBomb(pos, aim);
  }

  upgradePrimary() {
    this.level++;
  }

  upgradeSecondary() {
    this.secLevel++;
  }

  getStatus() {
    return { w1Level: this.level, w2Level: this.secLevel, w2Ready: this.secTimer <= 0 };
  }
}
