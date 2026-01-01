import type { HUD } from "./HUD";
import type { DevUI, DevParams } from "./DevUI";
import type { EventLog } from "../debug/EventLog";

export class UIOverlay {
  private visible = true;

  constructor(
    private hud: HUD,
    private eventLog: EventLog,
    private devUI: DevUI
  ) {}

  toggle() {
    this.visible = !this.visible;
  }

  setVisible(v: boolean) {
    this.visible = v;
  }

  isVisible() {
    return this.visible;
  }

  render(opts: {
    ctx: CanvasRenderingContext2D;
    dpr: number;
    virtualW: number;
    virtualH: number;
    energy: number;
    maxEnergy: number;
    score: number;
    hudInfo: any;
    snakeLen: number;
    weaponsStatus: any;
    spinCooldown: number;
    devParams: DevParams;
    isDevOpen: boolean;
  }) {
    const {
      ctx, dpr, virtualW, virtualH,
      energy, maxEnergy, score, hudInfo, snakeLen, weaponsStatus, spinCooldown,
      devParams, isDevOpen,
    } = opts;

    if (!this.visible) return;

    // UI base
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // vertikální úzký pás vlevo
    const pad = 8;
    const gap = 8;
    const sidebarW = 170;
    const sidebarX = pad;
    let cursorY = pad;

    // .16;
    ctx.fillStyle = "#00130a";
    ctx.fillRect(sidebarX, 0, sidebarW, virtualH);
    ctx.restore();

    // .28;
    ctx.strokeStyle = "#00ff66";
    ctx.beginPath();
    ctx.moveTo(sidebarX + sidebarW + 0.5, 0);
    ctx.lineTo(sidebarX + sidebarW + 0.5, virtualH);
    ctx.stroke();
    ctx.restore();

    // text styl
    ctx.font = "12px monospace";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#00ff66";

    // 1) HUD
    const hudH = 120;
    ctx.save();
    ctx.translate(sidebarX, cursorY);
    ctx.beginPath();
    ctx.rect(0, 0, sidebarW, hudH);
    ctx.clip();

    this.hud.render(
      ctx,
      sidebarW,
      hudH,
      energy,
      maxEnergy,
      score,
      hudInfo,
      snakeLen,
      weaponsStatus,
      spinCooldown
    );

    ctx.restore();
    cursorY += hudH + gap;

    // 2) EVENT LOG
    ctx.fillStyle = "#00ff66";
    ctx.fillText("EVENT LOG", sidebarX + 6, cursorY);
    cursorY += 16;

    const logH = 160;

    // jemný podklad pod log
    ctx.save();
    ctx.globalAlpha = 0.77;
    ctx.fillStyle = "#000000";
      ctx.fillRect(sidebarX + 4, cursorY - 6, sidebarW - 8, logH + 10);
    ctx.restore();

    this.eventLog.render(ctx, sidebarX + 6, cursorY);
    cursorY += logH + gap;

    // 3) DEV UI
    this.devUI.render(
      ctx,
      sidebarW,
      virtualH - cursorY - pad,
      devParams,
      isDevOpen
    );
  }
}
