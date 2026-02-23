import type { WorldState } from "../data/WorldState";
import type { PlayerData } from "../entities/PlayerTypes";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function smoothTo(cur: number, target: number, easeSec: number, dt: number): number {
  const tau = Math.max(0.0001, Number.isFinite(easeSec) ? easeSec : 0.12);
  const a = 1 - Math.exp(-dt / tau);
  const c = Number.isFinite(cur) ? cur : 0;
  const t = Number.isFinite(target) ? target : c;
  return c + (t - c) * a;
}

export class WorldScrollSystem {
  private initialized = false;

  constructor(
    private readonly world: WorldState,
    private readonly player: PlayerData,
    private readonly logicW: number,
    private readonly logicH: number
  ) {}

    update(dt: number): void {
      // autoscroll světa je nyní řízen pouze BG pipeline (common.scrollSpeedX)
      // world.speedX ignorujeme, aby nevznikal dvojitý drift

        const H = this.logicH;

    // camera range in world-space
    const worldH = Number.isFinite((this.world as any).worldH) ? Number((this.world as any).worldH) : H;
    const worldMinY = 0;
    const worldMaxY = Math.max(0, worldH - H);

    // --- start-centered camera window (user UX) ---
    // Start je "střed" a kamera může jen trochu nahoru/dolů kolem startu.
    const startY = Number.isFinite((this.world as any).cameraStartY) ? Number((this.world as any).cameraStartY) : 50;
    const rangeDown = Number.isFinite((this.world as any).cameraRangeDown) ? Number((this.world as any).cameraRangeDown) : 50;
    const rangeUp   = Number.isFinite((this.world as any).cameraRangeUp)   ? Number((this.world as any).cameraRangeUp)   : 50;

    const camMinY = Math.max(worldMinY, startY - rangeDown);
    const camMaxY = Math.min(worldMaxY, startY + rangeUp);

    if (!this.initialized) {
      (this.world as any).scrollY = clamp(startY, camMinY, camMaxY);
      this.initialized = true;
    }

    // --- init: defaultně drž kameru co nejníž (min Y-scroll efekt / max scrollY)
    // takže start není "nahoře", ale "dole". Pak už běží standardní follow logika.
    if (!this.initialized) {
      (this.world as any).scrollY = camMaxY;
      this.initialized = true;
    }


    // dead-band padding (top/bottom)
    const padTop = Number.isFinite((this.world as any).cameraPadTop) ? Number((this.world as any).cameraPadTop) : 140;
    const padBot = Number.isFinite((this.world as any).cameraPadBottom) ? Number((this.world as any).cameraPadBottom) : 140;

    const py = Number((this.player as any).pos?.y ?? H * 0.5);

    const camY = Number((this.world as any).scrollY ?? 0);
    const topLine = camY + padTop;
    const botLine = camY + (H - padBot);

    let desired = camY;
    if (py < topLine) desired = py - padTop;
    else if (py > botLine) desired = py - (H - padBot);

    desired = clamp(desired, camMinY, camMaxY);

    const ease = Number.isFinite((this.world as any).camEaseSec) ? Number((this.world as any).camEaseSec) : 0.12;
    (this.world as any).scrollY = smoothTo(camY, desired, ease, dt);
  }
}
