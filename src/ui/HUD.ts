export type HUDWeapon = { name: string; cooldown01?: number; ammo?: number };

export class HUD {
  render(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    energy: number,
    maxEnergy: number,
    mana: number,
    maxMana: number,
    score: number,
    weapons: HUDWeapon[]
  ) {
    // ---------- helpers ----------
    const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

    const bar = (
      x: number,
      y: number,
      bw: number,
      bh: number,
      p01: number,
      fill: string,
      label: string
    ) => {
      ctx.save();
      ctx.globalAlpha = 0.9;

      // bg
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(x, y, bw, bh);

      // frame
      ctx.strokeStyle = "rgba(0,255,102,0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);

      // fill
      const innerPad = 2;
      const iw = bw - innerPad * 2;
      const ih = bh - innerPad * 2;
      ctx.fillStyle = fill;
      ctx.fillRect(x + innerPad, y + innerPad, Math.floor(iw * p01), ih);

      // text
      ctx.globalAlpha = 1;
      ctx.font = "10px monospace";
      ctx.fillStyle = "#00ff66";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(label, x + 6, y + bh / 2);

      ctx.restore();
    };

    // ---------- base ----------
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // ---------- layout ----------
    const pad = 10;

    // Left-top: health + mana
    const barW = 160;
    const barH = 12;
    const gap = 8;

    const hp01 = clamp01(maxEnergy > 0 ? energy / maxEnergy : 0);
    bar(pad, pad, barW, barH, hp01, "#ff3b3b", "HP");

    const mana01 = clamp01(maxMana > 0 ? mana / maxMana : 0);
    bar(pad, pad + barH + gap, barW, barH, mana01, "#2aa3ff", "MP");

    // Right-top: score (no box)
    ctx.save();
    ctx.font = "14px monospace";
    ctx.fillStyle = "#00ff66";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(String(score), w - pad, pad);
    ctx.restore();

    // Right-bottom: weapon icons (simple boxes)
    const icon = 38;
    const iconGap = 8;
    const totalW = weapons.length * icon + Math.max(0, weapons.length - 1) * iconGap;
    const wx = w - pad - totalW;
    const wy = h - pad - icon;

    for (let i = 0; i < weapons.length; i++) {
      const it = weapons[i];
      const x = wx + i * (icon + iconGap);
      const y = wy;

      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(x, y, icon, icon);

      ctx.strokeStyle = "rgba(0,255,102,0.9)";
      ctx.strokeRect(x + 0.5, y + 0.5, icon - 1, icon - 1);

      // cooldown overlay
      const cd = clamp01(it.cooldown01 ?? 0);
      if (cd > 0) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "rgba(0,0,0,0.9)";
        const ch = Math.floor(icon * cd);
        ctx.fillRect(x, y + (icon - ch), icon, ch);
      }

      // label
      ctx.globalAlpha = 1;
      ctx.font = "9px monospace";
      ctx.fillStyle = "#00ff66";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(it.name.slice(0, 3).toUpperCase(), x + icon / 2, y + 4);

      // ammo
      if (typeof it.ammo === "number") {
        ctx.textBaseline = "bottom";
        ctx.textAlign = "right";
        ctx.fillText(String(it.ammo), x + icon - 4, y + icon - 3);
      }

      ctx.restore();
    }

    ctx.restore();
  }
}