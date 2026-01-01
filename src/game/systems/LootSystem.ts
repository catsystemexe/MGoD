import type { UpgradeType } from "../types";
import type { EventBus } from "../../core/EventBus";
import type { GameEvents } from "../../core/events";

type Vec2 = { x: number; y: number };
type Pickup = { pos: Vec2; type: UpgradeType; r: number };

export class LootSystem {
  private pickups: Pickup[] = [];

  constructor(private bus?: EventBus<GameEvents>) {}

  setBus(bus: EventBus<GameEvents>) {
    this.bus = bus;
  }

  // Returns collected upgrades and also emits "upgrade.picked"
  update(dt: number, playerPos: Vec2): UpgradeType[] {
    void dt;

    const collected: UpgradeType[] = [];

    // Collection pass
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      const dx = p.pos.x - playerPos.x;
      const dy = p.pos.y - playerPos.y;

      if (dx * dx + dy * dy <= p.r * p.r) {
        this.pickups.splice(i, 1);
        collected.push(p.type);
        this.bus?.emit("upgrade.picked", { type: p.type });
      }
    }

    return collected;
  }

  // Temporary stub
  render(ctx: CanvasRenderingContext2D, cam: Vec2) {
    void ctx;
    void cam;
  }

  // Helper for debugging / future drops
  spawn(pos: Vec2, type: UpgradeType, r = 14) {
    this.pickups.push({ pos, type, r });
  }
}
