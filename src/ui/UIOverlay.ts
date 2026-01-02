import type { HUD } from "./HUD";

export class UIOverlay {
  private visible = true;

  constructor(private hud: HUD) {}

  toggle() { this.visible = !this.visible; }
  setVisible(v: boolean) { this.visible = v; }
  isVisible() { return this.visible; }

  render(opts: {
    ctx: CanvasRenderingContext2D;
    virtualW: number;
    virtualH: number;

    energy: number;
    maxEnergy: number;

    // dočasně: mana je separátní (zatím nemáš systém many)
    mana: number;
    maxMana: number;

    score: number;

    // dočasně: ikonky zbraní
    weapons: { name: string; cooldown01?: number; ammo?: number }[];
  }) {
    if (!this.visible) return;

    const { ctx, virtualW, virtualH, energy, maxEnergy, mana, maxMana, score, weapons } = opts;

    // čistý hi-res canvas space (už nastavený v Game.ts setTransform(dpr,...))
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    this.hud.render(ctx, virtualW, virtualH, energy, maxEnergy, mana, maxMana, score, weapons);

    ctx.restore();
  }
}
