import type { EventBus } from "../../core/EventBus";
import type { GameEvents } from "../../core/events";
import type { UpgradeType } from "../types";
import type { WeaponsSystem } from "./WeaponsSystem";
import type { SnakeSystem } from "./SnakeSystem";

export class UpgradeSystem {
  private attached = false;

  constructor(
    private bus: EventBus<GameEvents>,
    private deps: {
      weapons: WeaponsSystem;
      snake: SnakeSystem;
      getEnergy: () => number;
      setEnergy: (v: number) => void;
      maxEnergy: number;
    }
  ) {}

  attach() {
    if (this.attached) return;
    this.attached = true;

    this.bus.on("upgrade.picked", (e) => this.apply(e.type));
  }

  private apply(type: UpgradeType) {
    if (type === "w1") {
      this.deps.weapons.upgradePrimary();
    } else if (type === "w2") {
      this.deps.weapons.upgradeSecondary();
    } else if (type === "hp") {
      this.deps.setEnergy(
        Math.min(this.deps.maxEnergy, this.deps.getEnergy() + 20)
      );
    } else if (type === "bomb") {
      this.deps.snake.addBomb();
      this.bus.emit("bomb.gain", {});
    }

    this.bus.emit("upgrade.applied", { type });
  }
}