import type { EventBus } from "../engine/core/EventBus";
import { EventType, type CMEventMap } from "../engine/core/events";
import type { WorldState } from "../game/data/WorldState";
import { ENEMY_DEFS } from "../game/defs/EnemyDefs";
import { EnemyBehaviorPresets } from "../game/enemies/EnemyBehaviorPresets";

export class DevSummoner {
  private panel: HTMLElement | null = null;

  constructor(
    private bus: EventBus<CMEventMap>,
    private world: WorldState,
    private logicW: number,
    private logicH: number,
  ) {}

  init(): void {
    if (this.panel) return;
    const panel = document.createElement("div");
    panel.id = "dev-summoner";
    panel.style.cssText = [
      "position:fixed","top:8px","right:8px","z-index:9999",
      "background:rgba(0,0,0,0.75)","border:1px solid #444",
      "color:#eee","font:12px monospace","padding:8px",
      "border-radius:4px","display:flex","flex-direction:column","gap:4px",
    ].join(";");

    const title = document.createElement("div");
    title.textContent = "☠ SUMMONER";
    title.style.cssText = "font-weight:bold;letter-spacing:1px;margin-bottom:2px;";
    panel.appendChild(title);

    const enemySelect = document.createElement("select");
    enemySelect.id = "ds-enemy";
    for (const id of Object.keys(ENEMY_DEFS)) {
      const opt = document.createElement("option");
      opt.value = id; opt.textContent = id;
      enemySelect.appendChild(opt);
    }
    panel.appendChild(enemySelect);

    const behaviorSelect = document.createElement("select");
    behaviorSelect.id = "ds-behavior";
    for (const id of Object.keys(EnemyBehaviorPresets)) {
      const opt = document.createElement("option");
      opt.value = id; opt.textContent = id;
      behaviorSelect.appendChild(opt);
    }
    panel.appendChild(behaviorSelect);

    const btn = document.createElement("button");
    btn.textContent = "RELEASE";
    btn.style.cssText = "cursor:pointer;margin-top:2px;";
    btn.addEventListener("click", () => {
      this.bus.emitNext(EventType.SPAWN_ENEMY, {
        typeId: enemySelect.value,
        spawn: { x: this.logicW - 40, y: this.logicH * 0.5 },
        behaviorPresetId: behaviorSelect.value,
      });
    });
    panel.appendChild(btn);

    document.body.appendChild(panel);
    this.panel = panel;
  }

  destroy(): void {
    if (this.panel?.parentNode) this.panel.parentNode.removeChild(this.panel);
    this.panel = null;
  }
}
