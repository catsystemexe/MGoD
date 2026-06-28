import type { EventBus } from "../engine/core/EventBus";
import { EventType, type CMEventMap } from "../engine/core/events";
import type { WorldState } from "../game/data/WorldState";
import { ENEMY_DEFS } from "../game/defs/EnemyDefs";
import { EnemyBehaviorPresets } from "../game/enemies/EnemyBehaviorPresets";
import { BEHAVIOR_GRAPHS } from "../game/content/CONTENT";

const EMPTY_ENEMY_LAB = "No FSM enemy selected/spawned.";
type MovementClassId = "dumb" | "smart";

type MovementGroups = Record<MovementClassId, Record<string, string[]>>;

type CompactSelectOption = { value: string; label: string; disabled?: boolean };

const KNOWN_PRIMITIVE_ORDER = ["straight", "diagonal", "sine", "zigzag", "loop", "invaders", "none"] as const;
const KNOWN_PRIMITIVE_INDEX = new Map<string, number>(KNOWN_PRIMITIVE_ORDER.map((id, index) => [id, index]));

function formatNum(value: unknown, digits = 0): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "?";
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


function describeTrigger(trigger: any): string {
  if (!trigger) return "none";
  if (trigger.kind === "xLessThan") return `screenX < ${formatNum(trigger.x)}`;
  if (trigger.kind === "timeInState") return `timeInState > ${formatNum(trigger.seconds)}s`;
  if (trigger.kind === "hpBelow") return `hp < ${formatNum(Number(trigger.ratio) * 100)}%`;
  if (trigger.kind === "offscreen") return `offscreen ${String(trigger.side ?? "?")}`;
  return String(trigger.kind ?? "unknown");
}

function describeNextTransition(state: any): string {
  return describeTrigger(state?.transitions?.[0]?.when);
}

function describeStateMovement(state: any): string {
  return String(state?.movementPresetId ?? "none");
}

function describeStateAttack(state: any): string {
  return String(state?.attackProfileId ?? "none");
}

function renderFsmGraphView(graphId: string, currentStateId: string): string {
  const graph = graphId ? BEHAVIOR_GRAPHS[graphId] : undefined;
  if (!graph?.states) return `<div><b>FSM Graph</b><br>none</div>`;

  const blocks: string[] = [`<div style="margin-top:6px;font-weight:bold;font-size:12px;">FSM Graph</div>`];

  for (const [stateId, state] of Object.entries(graph.states)) {
    const active = stateId === currentStateId;
    const title = `${active ? "▶ " : ""}${esc(stateId)}`;

    const transitions = (state as any)?.transitions;
    const next = Array.isArray(transitions) && transitions.length > 0
    ? transitions.map((t: any) => describeTrigger(t?.when)).join(" | ")
    : "none";

    blocks.push(`<div style="margin-top:3px;padding:3px 5px;background:rgba(255,255,255,0.08);border-radius:3px;font-size:11px;line-height:1.15;">
<div style="font-weight:bold;background:rgba(255,255,255,0.10);padding:1px 3px;margin:-1px -3px 2px -3px;border-radius:2px;">${title}</div>
<div><b>mov:</b> ${esc(describeStateMovement(state))}</div>
<div><b>atk:</b> ${esc(describeStateAttack(state))}</div>
<div><b>next:</b> ${esc(next)}</div>
</div>`);
  }

  return blocks.join("");
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

function createSelectLabel(text: string): HTMLLabelElement {
  const label = document.createElement("label");
  label.style.cssText = "display:flex;flex-direction:column;gap:2px;";
  const span = document.createElement("span");
  span.textContent = text;
  label.appendChild(span);
  return label;
}

function appendOption(select: HTMLSelectElement, value: string, text = value, disabled = false): void {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = text;
  opt.disabled = disabled;
  select.appendChild(opt);
}

function formatPrimitiveLabel(primitive: string): string {
  if (primitive === "none") return "Hold";
  if (primitive === "loop") return "Loop";
  return primitive;
}

function sortPrimitiveIds(primitives: string[]): string[] {
  return [...primitives].sort((a, b) => {
    const ai = KNOWN_PRIMITIVE_INDEX.get(a);
    const bi = KNOWN_PRIMITIVE_INDEX.get(b);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.localeCompare(b);
  });
}

function createCompactSelect(id: string): {
  root: HTMLDivElement;
  button: HTMLButtonElement;
  value: string;
  disabled: boolean;
  setOptions(options: CompactSelectOption[], nextValue?: string): void;
  addEventListener(type: "change", listener: () => void): void;
  destroy(): void;
} {
  const root = document.createElement("div");
  root.id = id;
  root.style.cssText = "position:relative;width:100%;";

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.style.cssText = [
    "width:100%",
    "box-sizing:border-box",
    "text-align:left",
    "font:12px monospace",
    "padding:2px 18px 2px 4px",
    "background:#111",
    "color:#eee",
    "border:1px solid #555",
    "border-radius:2px",
    "cursor:pointer",
  ].join(";");
  root.appendChild(button);

  const list = document.createElement("div");
  list.setAttribute("role", "listbox");
  list.style.cssText = [
    "display:none",
    "position:absolute",
    "left:0",
    "right:0",
    "top:100%",
    "z-index:10000",
    "max-height:132px",
    "overflow:auto",
    "background:#111",
    "border:1px solid #666",
    "border-radius:2px",
    "box-shadow:0 3px 8px rgba(0,0,0,0.45)",
  ].join(";");
  root.appendChild(list);

  let options: CompactSelectOption[] = [];
  let value = "";
  const listeners: Array<() => void> = [];

  const close = () => {
    list.style.display = "none";
    button.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    if (button.disabled) return;
    list.style.display = "block";
    button.setAttribute("aria-expanded", "true");
  };
  const selectedLabel = () => options.find((option) => option.value === value)?.label ?? "(none)";

  const choose = (nextValue: string) => {
    if (value === nextValue) {
      close();
      return;
    }
    value = nextValue;
    button.textContent = selectedLabel();
    close();
    for (const listener of listeners) listener();
  };

  const renderOptions = () => {
    list.replaceChildren();
    for (const option of options) {
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.value === value));
      item.disabled = !!option.disabled;
      item.textContent = option.label;
      item.style.cssText = [
        "display:block",
        "width:100%",
        "box-sizing:border-box",
        "text-align:left",
        "font:12px monospace",
        "padding:3px 5px",
        "background:" + (option.value === value ? "#26384f" : "#111"),
        "color:#eee",
        "border:0",
        "cursor:pointer",
      ].join(";");
      item.addEventListener("click", () => choose(option.value));
      list.appendChild(item);
    }
  };

  button.addEventListener("click", () => {
    if (list.style.display === "none") open();
    else close();
  });
  button.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      close();
      return;
    }
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp" && ev.key !== "Enter" && ev.key !== " ") return;
    ev.preventDefault();
    if (ev.key === "Enter" || ev.key === " ") {
      open();
      return;
    }
    const enabled = options.filter((option) => !option.disabled);
    if (!enabled.length) return;
    const currentIndex = Math.max(0, enabled.findIndex((option) => option.value === value));
    const delta = ev.key === "ArrowDown" ? 1 : -1;
    choose(enabled[(currentIndex + delta + enabled.length) % enabled.length].value);
  });
  const handleDocumentClick = (ev: MouseEvent) => {
    if (!root.contains(ev.target as Node)) close();
  };
  document.addEventListener("click", handleDocumentClick);

  return {
    root,
    button,
    get value() { return value; },
    get disabled() { return button.disabled; },
    set disabled(next: boolean) { button.disabled = next; },
    setOptions(nextOptions: CompactSelectOption[], nextValue?: string) {
      options = nextOptions;
      value = nextValue && options.some((option) => option.value === nextValue) ? nextValue : (options.find((option) => !option.disabled)?.value ?? options[0]?.value ?? "");
      button.disabled = options.length === 0 || options.every((option) => option.disabled);
      button.textContent = selectedLabel();
      renderOptions();
      close();
    },
    addEventListener(_type: "change", listener: () => void) {
      listeners.push(listener);
    },
    destroy() {
      document.removeEventListener("click", handleDocumentClick);
    },
  };
}

function getPrimitiveFromPresetId(presetId: string): string {
  return presetId.split(".")[0] || presetId;
}


export function createDevSummonerSpawnPayload(input: {
  typeId: string;
  spawnX: number;
  spawnY: number;
  behaviorPresetId: string;
  devManualSpawnId: number;
}) {
  return {
    typeId: input.typeId,
    spawn: { x: input.spawnX, y: input.spawnY },
    behaviorPresetId: input.behaviorPresetId,
    devManualSpawnId: input.devManualSpawnId,
  };
}

function buildMovementGroups(): MovementGroups {
  const groups: MovementGroups = { dumb: {}, smart: {} };

  for (const presetId of Object.keys(EnemyBehaviorPresets)) {
    const movementClass: MovementClassId = presetId.startsWith("smart.") ? "smart" : "dumb";
    const primitive = getPrimitiveFromPresetId(presetId);
    groups[movementClass][primitive] ??= [];
    groups[movementClass][primitive].push(presetId);
  }

  for (const classGroups of Object.values(groups)) {
    for (const presets of Object.values(classGroups)) presets.sort();
  }

  return groups;
}

export class DevSummoner {
  private panel: HTMLElement | null = null;
  private latestManualSpawnId = 0;
  private refreshTimer: number | null = null;
  private readonly cleanupHandlers: Array<() => void> = [];

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
      "color:#eee","font:12px monospace","padding:3px",
      "border-radius:2px","display:flex","flex-direction:column","gap:3px",
      "width:220px",
      "min-width:220px",
      "max-width:220px",
      "box-sizing:border-box",
      "overflow:hidden",
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

    const movementGroups = buildMovementGroups();
    const movementClassSelect = document.createElement("select");
    movementClassSelect.id = "ds-movement-class";
    const primitiveSelect = createCompactSelect("ds-movement-primitive");
    const presetSelect = createCompactSelect("ds-movement-preset");
    this.cleanupHandlers.push(() => primitiveSelect.destroy(), () => presetSelect.destroy());

    const movementClassWrap = createSelectLabel("Movement Class");
    const primitiveWrap = createSelectLabel("Primitive");
    const presetWrap = createSelectLabel("Preset");
    movementClassWrap.appendChild(movementClassSelect);
    primitiveWrap.appendChild(primitiveSelect.root);
    presetWrap.appendChild(presetSelect.root);
    const movementPresetRow = document.createElement("div");
    movementPresetRow.style.cssText = "display:grid;grid-template-columns:minmax(0,0.9fr) minmax(0,1.1fr);gap:4px;align-items:end;";
    movementPresetRow.appendChild(primitiveWrap);
    movementPresetRow.appendChild(presetWrap);
    spawnSection.appendChild(movementClassWrap);
    spawnSection.appendChild(movementPresetRow);

    const hasSmartPresets = Object.keys(movementGroups.smart).length > 0;
    appendOption(movementClassSelect, "dumb", "Dumb");
    appendOption(movementClassSelect, "smart", hasSmartPresets ? "Smart" : "Smart (none)", !hasSmartPresets);

    const repopulatePresetSelect = () => {
      const movementClass = movementClassSelect.value as MovementClassId;
      const primitive = primitiveSelect.value;
      const presets = movementGroups[movementClass]?.[primitive] ?? [];
      if (presets.length === 0) {
        presetSelect.setOptions([{ value: "", label: "(none)", disabled: true }]);
        return;
      }
      presetSelect.setOptions(presets.map((presetId) => ({ value: presetId, label: presetId })), presetSelect.value);
    };

    const repopulatePrimitiveSelect = () => {
      const movementClass = movementClassSelect.value as MovementClassId;
      const primitives = sortPrimitiveIds(Object.keys(movementGroups[movementClass] ?? {}));
      if (primitives.length === 0) {
        primitiveSelect.setOptions([{ value: "", label: "(none)", disabled: true }]);
        repopulatePresetSelect();
        return;
      }
      primitiveSelect.setOptions(primitives.map((primitive) => ({
        value: primitive,
        label: formatPrimitiveLabel(primitive),
      })));
      repopulatePresetSelect();
    };

    movementClassSelect.addEventListener("change", repopulatePrimitiveSelect);
    primitiveSelect.addEventListener("change", repopulatePresetSelect);
    repopulatePrimitiveSelect();

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
      this.bus.emitNext(EventType.SPAWN_ENEMY, createDevSummonerSpawnPayload({
        typeId: enemySelect.value,
        spawnX: this.logicW - 40,
        spawnY: Number(screenY.value),
        behaviorPresetId: presetSelect.value,
        devManualSpawnId: this.latestManualSpawnId,
      }) as any);
    });
    spawnSection.appendChild(btn);

    const labPanel = document.createElement("div");
    labPanel.id = "ds-enemy-lab-debug";
    labPanel.style.cssText = [
      "margin:0",
      "padding:4px",
      "background:rgba(255,255,255,0.06)",
      "border:0px solid rgba(255,255,255,0.12)",
      "border-radius:0px",
      "font:12px monospace",
      "line-height:2",
      "box-sizing:border-box"
    ].join(";");
    labPanel.textContent = EMPTY_ENEMY_LAB;
    panel.appendChild(labPanel);

    document.body.appendChild(panel);
    this.panel = panel;
    this.refreshTimer = window.setInterval(() => this.refreshEnemyLab(), 250);
    this.refreshEnemyLab();
  }

  private refreshEnemyLab(): void {
    const out = this.panel?.querySelector("#ds-enemy-lab-debug") as HTMLElement | null;
    if (!out) return;

    const selected = this.findSelectedFsmEnemy();
    if (!selected) {
      out.textContent = EMPTY_ENEMY_LAB;
      return;
    }

    const runtime = getFsmRuntimeDebug(selected);
    const position = getEnemyPositionDebug(selected, Number((this.world as any)?.scrollX ?? 0));
    const graphView = renderFsmGraphView(runtime.graphId, runtime.stateId);

    out.innerHTML = `<div style="display:grid;grid-template-columns:1fr auto;column-gap:10px;row-gap:2px;align-items:start;">
<div style="white-space:nowrap;">
<b>Type:</b> ${esc(String(selected.typeId ?? "?"))}<br>
<b>Beh:</b> ${esc(runtime.movement)}<br>
<b>Atk:</b> ${esc(runtime.attack)}<br>
<b>HP:</b> ${esc(getEnemyHpLabel(selected))}<br>
<b>State:</b> ${esc(runtime.stateId)}<br>
<b>Age:</b> ${esc(formatNum(runtime.age, 2))} s
</div>
<div style="white-space:nowrap;">
<b>scrX:</b> ${esc(formatNum(position.screenX))}<br>
<b>scrY:</b> ${esc(formatNum(position.screenY))}<br>
<b>wX:</b> ${esc(formatNum(position.worldX))}<br>
<b>wY:</b> ${esc(formatNum(position.worldY))}
</div>
</div>
<div style="margin-top:6px;">${graphView}</div>`;
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
    while (this.cleanupHandlers.length) this.cleanupHandlers.pop()?.();
    if (this.panel?.parentNode) this.panel.parentNode.removeChild(this.panel);
    this.panel = null;
  }
}
