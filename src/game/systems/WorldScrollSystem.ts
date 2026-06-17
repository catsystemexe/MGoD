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
  constructor(
    private readonly world: WorldState,
    private readonly player: PlayerData,
    private readonly logicW: number,
    private readonly logicH: number
  ) {}

  update(dt: number): void {
    // --- konstantní autoscroll doprava
    this.world.scrollX += this.world.speedX * dt;

    const H = this.logicH;

    // camera range in world-space
    const worldH = Number.isFinite((this.world as any).worldH) ? Number((this.world as any).worldH) : H;
    const camMinY = 0;
    const camMaxY = Math.max(0, worldH - H);

    // dead-band padding (top/bottom)
    const padTop = Number.isFinite((this.world as any).cameraPadTop) ? Number((this.world as any).cameraPadTop) : 140;
    const padBot = Number.isFinite((this.world as any).cameraPadBottom) ? Number((this.world as any).cameraPadBottom) : 140;

    const camY = Number((this.world as any).scrollY ?? 0);

    // player.pos.y is WORLD space. Convert to SCREEN to evaluate the dead-band,
    // which is defined in screen pixels (padTop from the top edge, padBot from the
    // bottom edge). Then express the desired camera back in WORLD space.
    const pyWorld = Number((this.player as any).pos?.y ?? (camY + H * 0.5));
    const pyScreen = pyWorld - camY;

    let desired = camY;
    if (pyScreen < padTop) desired = pyWorld - padTop;                  // player above top dead-band
    else if (pyScreen > (H - padBot)) desired = pyWorld - (H - padBot); // player below bottom dead-band

    desired = clamp(desired, camMinY, camMaxY);

    const ease = Number.isFinite((this.world as any).camEaseSec) ? Number((this.world as any).camEaseSec) : 0.12;
    (this.world as any).scrollY = smoothTo(camY, desired, ease, dt);
  }
}
