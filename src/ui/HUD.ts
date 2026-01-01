export class HUD {
  private scoreDisplay = 0;

  render(ctx: CanvasRenderingContext2D, w: number, h: number, energy: number, maxEnergy: number, score: number, waveInfo: any, snakeLen: number, wStatus: any, spinCD: number) {
    const margin = 10; 
    
    // Plynulé přičítání skóre
    if (this.scoreDisplay < score) {
        this.scoreDisplay += Math.max(1, Math.floor((score - this.scoreDisplay) * 0.1));
    } else if (this.scoreDisplay > score) {
        this.scoreDisplay = score;
    }

    ctx.save();
    
    // --- TOP LEFT (Energy) ---
    const barW = 60;
    const barH = 6;
    const perc = Math.max(0, energy / maxEnergy);
    
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(margin, margin, barW + 4, barH + 12);
    
    ctx.fillStyle = "#111";
    ctx.fillRect(margin + 2, margin + 10, barW, barH);
    
    const color = perc < 0.3 ? "#FF0055" : "#00FFFF";
    ctx.fillStyle = color;
    ctx.fillRect(margin + 2, margin + 10, barW * perc, barH);
    
    ctx.fillStyle = "#fff";
    ctx.font = "bold 6px monospace";
    ctx.textAlign = "left";
    ctx.fillText("INTEGRITY", margin + 2, margin + 7);

    // --- TOP RIGHT (Score) ---
    ctx.textAlign = "right";
    ctx.font = "bold 12px monospace";
    ctx.fillStyle = "#00FF66";
    ctx.fillText(this.scoreDisplay.toString().padStart(6, '0'), w - margin, margin + 10);
    
    ctx.font = "5px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("DATA_STREAMS", w - margin, margin + 17);

    // --- BOTTOM LEFT (Sector) ---
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px sans-serif";

    ctx.font = "5px monospace";
    ctx.fillStyle = "#00FFFF";
   
    
    // Show Spin Cooldown state
    ctx.font = "5px monospace";
    if (spinCD > 0) {
        ctx.fillStyle = "#555";
        ctx.fillText(`SPIN_RECHARGE ${Math.ceil(spinCD * 10) / 10}s`, w - margin, h - margin);
    } else {
        ctx.fillStyle = "#00FF00";
        ctx.fillText("SPIN_READY [SHIFT]", w - margin, h - margin);
    }

    // --- WEAPON HUD (Center Bottom) ---
    if (wStatus) {
       this.drawWeaponIcon(ctx, w/2 - 12, h - 18, "P", wStatus.w1Level, true, "#00FFFF");
       this.drawWeaponIcon(ctx, w/2 + 12, h - 18, "S", wStatus.w2Level, wStatus.w2Ready, "#FF8800");
    }

    ctx.restore();
  }

  private drawWeaponIcon(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, lvl: number, ready: boolean, color: string) {
    const size = 16;
    ctx.lineWidth = 1;
    ctx.strokeStyle = ready ? color : "#333";
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.strokeRect(x - size/2, y - size/2, size, size);
    ctx.fillRect(x - size/2, y - size/2, size, size);
    
    ctx.textAlign = "center";
    ctx.fillStyle = ready ? "#fff" : "#444";
    ctx.font = "bold 7px monospace";
    ctx.fillText(label, x, y + 1);
    
    ctx.font = "4px monospace";
    ctx.fillStyle = ready ? color : "#222";
    ctx.fillText(`L${lvl}`, x, y + size/2 - 2);
  }
}
