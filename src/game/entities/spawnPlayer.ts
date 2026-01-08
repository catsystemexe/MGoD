import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { PlayerData } from "./PlayerTypes";

export function spawnPlayer(store: EntityStore<any>, x: number, y: number): { ref: EntityRef; data: PlayerData } {
  let player!: PlayerData;

  const ref = store.spawn((e: any) => {
    e.kind = "player";
    e.pos = { x, y };
    e.vel = { x: 0, y: 0 };
    e.aimDir = { x: 1, y: 0 };
    e.speed = 140;
    e.radius = 4;

    player = e as PlayerData;
  });

  return { ref, data: player };
}
