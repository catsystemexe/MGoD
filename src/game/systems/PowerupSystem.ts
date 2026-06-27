import { EventType, type CMEventMap } from "../../engine/core/events";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

type AnyCMEvent = { type: keyof CMEventMap; payload: CMEventMap[keyof CMEventMap] };

type SessionLike = {
  score: number;
};

export class PowerupSystem {
  constructor(
    private readonly session: SessionLike,
    private readonly store: EntityStore<any>,
    private readonly getPlayerRef: () => EntityRef,
  ) {}

  onFlowEvents(events: AnyCMEvent[]): void {
    for (const e of events) {
      if (e.type !== EventType.PLAYER_PICKUP) continue;

      const p = e.payload as any;
      const defId = String(p?.defId ?? "unknown");

      const pref = this.getPlayerRef();
      const player: any = this.store.get(pref);
      if (!player) continue;

      switch (defId) {
        case "energy": {
          const max = Number(player.energyMax ?? 5);
          const cur = Number(player.energy ?? 0);
          player.energy = Math.min(max, cur + 1);
          break;
        }
        case "bomb": {
          player.bombs = Number(player.bombs ?? 0) + 1;
          break;
        }
        case "score": {
          this.session.score += 50;
          break;
        }
        default:
          // ignore unknown pickups
          break;
      }
    }
  }
}
