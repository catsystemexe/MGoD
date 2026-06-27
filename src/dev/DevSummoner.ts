import type { EventBus } from "../engine/core/EventBus";
import { EventType, type CMEventMap } from "../engine/core/events";
import type { WorldState } from "../game/data/WorldState";
import { ENEMY_DEFS } from "../game/defs/EnemyDefs";
import { EnemyBehaviorPresets } from "../game/enemies/EnemyBehaviorPresets";
import { BEHAVIOR_GRAPHS } from "../game/content/CONTENT";

const EMPTY_ENEMY_LAB = "No FSM enemy selected/spawned.";

function formatNum(value: unknown, digits = 0): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "?";
}

function describeTrigger(trigger: any): string {
  if (!trigger) return "none";
  if (trigger.kind === "xLessThan") return `screenX < ${formatNum(trigger.x)}`;
  if (trigger.kind === "timeInState") return `timeInState > ${formatNum(trigger.seconds)} s`;
  if (trigger.kind === "hpBelow") return `hp < ${formatNum(Number(trigger.ratio) * 100)}%`;
  if (trigger.kind === "offscreen") return `offscreen ${String(trigger.side ?? "?")}`;
  return String(trigger.kind ?? "unknown");
}

function describeNextTransition(state: any): string {
  return describeTrigger(state?.transitions?.[0]?.when);
}

function getEnemyHpLabel(enemy: any): string {
  const hp = Number(enemy?.hp?.value ?? enemy?.hp ?? 0);
  const maxHp = Number(enemy?.hp?.max ?? enemy?.maxHp ?? hp);
  return `${formatNum(hp)} / ${formatNum(maxHp)}`;
}

function getEnemyPositionDebug(enemy: any, scrollX: number) {
  const worldX = Number(enemy?.pos?.x ?? 0);
  const worldY = Number(enemy?.pos?.y ?? 0);
  return {
    screenX: worldX - scrollX,
    screenY: worldY,
    worldX,
    worldY,
  };
}

function getFsmRuntimeDebug(enemy: any) {
  const def = ENEMY_DEFS[String(enemy?.typeId)];
  const graphId = def?.behaviorGraphId ?? "";
  const graph = graphId ? BEHAVIOR_GRAPHS[graphId] : undefined;
  const stateId = String(enemy?.fsm?.current ?? graph?.initial ?? "?");
  const state = graph?.states?.[stateId];
  return {
    graphId,
    stateId,
    age: Number(enemy?.fsm?.age ?? 0),
    next: describeNextTransition(state),
    movement: String(state?.movementPresetId ?? "none"),
    attack: String(state?.attackProfileId ?? "none"),
  };
}

export class DevSummoner {
  private panel: HTMLElement | null = null;
  private latestManualSpawnId = 0;
  private refreshTimer: number | null = null;

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
      "border-radius:4px","display:flex","flex-direction:column","gap:6px",
      "min-width:230px",
    ].join(";");

    const title = document.createElement("pre");
    title.textContent = "Enemy Lab\n────────────";
    title.style.cssText = "font-weight:bold;letter-spacing:1px;margin:0 0 2px 0;";
    panel.appendChild(title);

    const spawnSection = document.createElement("div");
    spawnSection.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    panel.appendChild(spawnSection);

    const spawnTitle = document.createElement("div");
    spawnTitle.textContent = "Spawn";
    spawnTitle.style.cssText = "font-weight:bold;opacity:0.9;";
    spawnSection.appendChild(spawnTitle);

    const enemySelect = document.createElement("select");
    enemySelect.id = "ds-enemy";
    for (const id of Object.keys(ENEMY_DEFS)) {
      const opt = document.createElement("option");
      opt.value = id; opt.textContent = id;
      enemySelect.appendChild(opt);
    }
    spawnSection.appendChild(enemySelect);

    const behaviorSelect = document.createElement("select");
    behaviorSelect.id = "ds-behavior";
    for (const id of Object.keys(EnemyBehaviorPresets)) {
      const opt = document.createElement("option");
      opt.value = id; opt.textContent = id;
      behaviorSelect.appendChild(opt);
    }
    spawnSection.appendChild(behaviorSelect);

    const screenYWrap = document.createElement("label");
    screenYWrap.style.cssText = "display:flex;flex-direction:column;gap:2px;";
    const screenYLabel = document.createElement("span");
    screenYLabel.textContent = "screenY: 260";
    const screenYRow = document.createElement("div");
    screenYRow.style.cssText = "display:grid;grid-template-columns:1fr 56px;gap:4px;align-items:center;";
    const screenY = document.createElement("input");
    screenY.id = "ds-screen-y";
    screenY.type = "range";
    screenY.min = "0";
    screenY.max = String(Math.max(0, this.logicH));
    screenY.step = "1";
    screenY.value = "260";
    screenY.style.width = "100%";
    const screenYInput = document.createElement("input");
    screenYInput.id = "ds-screen-y-input";
    screenYInput.type = "number";
    screenYInput.min = screenY.min;
    screenYInput.max = screenY.max;
    screenYInput.step = screenY.step;
    screenYInput.value = screenY.value;
    screenYInput.style.cssText = "width:56px;box-sizing:border-box;";
    const setScreenY = (value: unknown) => {
      const maxY = Math.max(0, this.logicH);
      const raw = Number(value);
      const y = Number.isFinite(raw) ? Math.min(maxY, Math.max(0, raw)) : 260;
      screenY.value = String(y);
      screenYInput.value = String(y);
      screenYLabel.textContent = `screenY: ${formatNum(y)}`;
    };
    screenY.addEventListener("input", () => setScreenY(screenY.value));
    screenYInput.addEventListener("input", () => setScreenY(screenYInput.value));
    screenYRow.appendChild(screenY);
    screenYRow.appendChild(screenYInput);
    screenYWrap.appendChild(screenYLabel);
    screenYWrap.appendChild(screenYRow);
    spawnSection.appendChild(screenYWrap);

    const btn = document.createElement("button");
    btn.textContent = "RELEASE";
    btn.style.cssText = "cursor:pointer;margin-top:2px;";
    btn.addEventListener("click", () => {
      this.latestManualSpawnId += 1;
      this.bus.emitNext(EventType.SPAWN_ENEMY, {
        typeId: enemySelect.value,
        spawn: { x: this.logicW - 40, y: Number(screenY.value) },
        behaviorPresetId: behaviorSelect.value,
        devManualSpawnId: this.latestManualSpawnId,
      } as any);
    });
    spawnSection.appendChild(btn);

    const labPanel = document.createElement("pre");
    labPanel.id = "ds-enemy-lab-debug";
    labPanel.style.cssText = [
      "margin:0","padding:6px","min-width:210px",
      "background:rgba(255,255,255,0.06)","border:1px solid rgba(255,255,255,0.12)",
      "border-radius:4px","white-space:pre-wrap",
    ].join(";");
    labPanel.textContent = EMPTY_ENEMY_LAB;
    panel.appendChild(labPanel);

    document.body.appendChild(panel);
    this.panel = panel;
    this.refreshTimer = window.setInterval(() => this.refreshEnemyLab(), 250);
    this.refreshEnemyLab();
  }

  private refreshEnemyLab(): void {
    const out = this.panel?.querySelector("#ds-enemy-lab-debug") as HTMLPreElement | null;
    if (!out) return;

    const selected = this.findSelectedFsmEnemy();
    if (!selected) {
      out.textContent = EMPTY_ENEMY_LAB;
      return;
    }

    const runtime = getFsmRuntimeDebug(selected);
    const position = getEnemyPositionDebug(selected, Number((this.world as any)?.scrollX ?? 0));
    out.textContent = [
      "Runtime",
      "────────────",
      "Type:",
      String(selected.typeId ?? "?"),
      "",
      "HP:",
      getEnemyHpLabel(selected),
      "",
      "State:",
      runtime.stateId,
      "",
      "Age:",
      `${formatNum(runtime.age, 2)} s`,
      "",
      "Next:",
      runtime.next,
      "",
      "Position",
      "────────────",
      "screenX:",
      formatNum(position.screenX),
      "",
      "screenY:",
      formatNum(position.screenY),
      "",
      "worldX:",
      formatNum(position.worldX),
      "",
      "worldY:",
      formatNum(position.worldY),
      "",
      "Behavior",
      "────────────",
      "Movement:",
      runtime.movement,
      "",
      "Attack:",
      runtime.attack,
      "",
      "Graph:",
      runtime.graphId || "none",
    ].join("\n");
  }

  private findSelectedFsmEnemy(): any | null {
    const store = (window as any).__CM?.store;
    if (!store || typeof store.debugForEachAlive !== "function") return null;

    let selected: any | null = null;
    store.debugForEachAlive((_ref: any, ent: any) => {
      if (!ent || ent.kind !== "enemy" || ent.pendingKill) return;
      const def = ENEMY_DEFS[String(ent.typeId)];
      if (!def?.behaviorGraphId) return;
      if (!selected) selected = ent;
      if (this.latestManualSpawnId > 0 && ent.devManualSpawnId === this.latestManualSpawnId) selected = ent;
    });
    return selected;
  }

  destroy(): void {
    if (this.refreshTimer) window.clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    if (this.panel?.parentNode) this.panel.parentNode.removeChild(this.panel);
    this.panel = null;
  }
}
