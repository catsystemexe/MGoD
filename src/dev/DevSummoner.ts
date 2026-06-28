import type { EventBus } from "../engine/core/EventBus";
import { EventType, type CMEventMap } from "../engine/core/events";
import type { WorldState } from "../game/data/WorldState";
import { ENEMY_DEFS } from "../game/defs/EnemyDefs";
import { EnemyBehaviorPresets } from "../game/enemies/EnemyBehaviorPresets";
import { BEHAVIOR_GRAPHS } from "../game/content/CONTENT";
import { ENEMY_GROUP_COHESION_IDS, ENEMY_GROUP_FORMATION_IDS, ENEMY_GROUP_PARAM_LIMITS, normalizeEnemyGroupParams } from "../game/enemies/EnemyGroups";
import type { CohesionId, FormationId } from "../game/enemies/EnemyGroups";

const EMPTY_ENEMY_LAB = "No FSM enemy selected/spawned.";
type MovementClassId = "dumb" | "smart";
type SpawnMode = "enemy" | "group";

type MovementGroups = Record<MovementClassId, Record<string, string[]>>;

type CompactSelectOption = { value: string; label: string; disabled?: boolean };

const KNOWN_PRIMITIVE_ORDER = ["straight", "diagonal", "sine", "zigzag", "loop", "track", "align", "evade", "range", "orbit", "invaders", "none"] as const;
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
  if (primitive === "track") return "Track";
  if (primitive === "align") return "Align";
  if (primitive === "evade") return "Evade";
  if (primitive === "range") return "Range";
  if (primitive === "orbit") return "Orbit";
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

export function getPrimitiveFromPresetId(presetId: string): string {
  const parts = presetId.split(".");
  return presetId.startsWith("smart.") ? (parts[1] || presetId) : (parts[0] || presetId);
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

export function normalizeGroupCount(value: unknown): number {
  const raw = Number(value);
  const n = Number.isFinite(raw) ? Math.floor(raw) : 5;
  return Math.min(10, Math.max(2, n));
}

export function stepGroupCount(value: unknown, delta: -1 | 1): number {
  return normalizeGroupCount(normalizeGroupCount(value) + delta);
}

type GroupParamKey = "spacing" | "depth" | "response" | "maxCatchupSpeed";

export function normalizeGroupStepperValue(key: GroupParamKey, value: unknown, cohesionId: CohesionId = "rigid"): number {
  const params = normalizeEnemyGroupParams({
    formation: {
      spacing: key === "spacing" ? Number(value) : undefined,
      depth: key === "depth" ? Number(value) : undefined,
    },
    cohesion: {
      response: key === "response" ? Number(value) : undefined,
      maxCatchupSpeed: key === "maxCatchupSpeed" ? Number(value) : undefined,
    },
  }, cohesionId);
  if (key === "spacing") return params.formation.spacing;
  if (key === "depth") return params.formation.depth;
  if (key === "response") return params.cohesion.response;
  return params.cohesion.maxCatchupSpeed;
}

export function stepGroupParamValue(key: GroupParamKey, value: unknown, delta: -1 | 1, cohesionId: CohesionId = "rigid"): number {
  const limits = key === "spacing" ? ENEMY_GROUP_PARAM_LIMITS.formation.spacing
    : key === "depth" ? ENEMY_GROUP_PARAM_LIMITS.formation.depth
      : key === "response" ? ENEMY_GROUP_PARAM_LIMITS.cohesion.response
        : ENEMY_GROUP_PARAM_LIMITS.cohesion.maxCatchupSpeed;
  return normalizeGroupStepperValue(key, normalizeGroupStepperValue(key, value, cohesionId) + delta * limits.step, cohesionId);
}

function isValidEnemyTypeId(typeId: string): boolean {
  return !!ENEMY_DEFS[typeId];
}

function isValidFormationId(id: string): id is FormationId {
  return (ENEMY_GROUP_FORMATION_IDS as readonly string[]).includes(id);
}

function isValidCohesionId(id: string): id is CohesionId {
  return (ENEMY_GROUP_COHESION_IDS as readonly string[]).includes(id);
}

function isValidMovementPresetId(id: string): boolean {
  return !!EnemyBehaviorPresets[id];
}

export function createDevSummonerGroupSpawnPayload(input: {
  enemyTypeId: string;
  count: unknown;
  anchorX: number;
  anchorY: number;
  formationId: string;
  movementPresetId: string;
  cohesionId: string;
  params?: CMEventMap[typeof EventType.SPAWN_ENEMY_GROUP]["params"];
}): CMEventMap[typeof EventType.SPAWN_ENEMY_GROUP] | null {
  if (!isValidEnemyTypeId(input.enemyTypeId)) return null;
  if (!isValidFormationId(input.formationId)) return null;
  if (!isValidCohesionId(input.cohesionId)) return null;
  if (!isValidMovementPresetId(input.movementPresetId)) return null;
  if (!Number.isFinite(input.anchorX) || !Number.isFinite(input.anchorY)) return null;
  const params = normalizeEnemyGroupParams(input.params, input.cohesionId);
  return {
    enemyTypeId: input.enemyTypeId,
    count: normalizeGroupCount(input.count),
    anchor: { x: input.anchorX, y: input.anchorY },
    formationId: input.formationId,
    movementPresetId: input.movementPresetId,
    cohesionId: input.cohesionId,
    params,
  };
}

export function buildMovementGroups(): MovementGroups {
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

    const modeRow = document.createElement("div");
    modeRow.style.cssText = "display:grid;grid-template-columns:auto 1fr;gap:6px;align-items:center;";
    const modeLabel = document.createElement("span");
    modeLabel.textContent = "Spawn Mode";
    modeLabel.style.cssText = "opacity:0.85;white-space:nowrap;";
    const modeSegment = document.createElement("div");
    modeSegment.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:0;min-width:0;";
    const enemyModeButton = document.createElement("button");
    const groupModeButton = document.createElement("button");
    modeSegment.appendChild(enemyModeButton);
    modeSegment.appendChild(groupModeButton);
    modeRow.appendChild(modeLabel);
    modeRow.appendChild(modeSegment);
    spawnSection.appendChild(modeRow);

    let spawnMode: SpawnMode = "enemy";
    const styleSegmentButton = (button: HTMLButtonElement, active: boolean, disabled = false) => {
      button.style.cssText = [
        "font:12px monospace",
        "padding:2px 6px",
        "border:1px solid #555",
        "background:" + (active ? "#26384f" : "#111"),
        "color:" + (disabled ? "#777" : active ? "#fff" : "#bbb"),
        "cursor:" + (disabled ? "not-allowed" : "pointer"),
        "box-sizing:border-box",
        "min-width:0",
      ].join(";");
    };

    const enemyControls = document.createElement("div");
    enemyControls.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    const groupControls = document.createElement("div");
    groupControls.style.cssText = "display:none;flex-direction:column;gap:4px;";
    spawnSection.appendChild(enemyControls);
    spawnSection.appendChild(groupControls);

    const enemySelect = document.createElement("select");
    enemySelect.id = "ds-enemy";
    for (const id of Object.keys(ENEMY_DEFS)) {
      const opt = document.createElement("option");
      opt.value = id; opt.textContent = id;
      enemySelect.appendChild(opt);
    }
    enemyControls.appendChild(enemySelect);

    const groupTypeRow = document.createElement("div");
    groupTypeRow.style.cssText = "display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:end;";
    const groupEnemyWrap = createSelectLabel("Type");
    const groupEnemySelect = document.createElement("select");
    groupEnemySelect.id = "ds-group-enemy";
    groupEnemySelect.style.cssText = "width:100%;min-width:0;box-sizing:border-box;";
    for (const id of Object.keys(ENEMY_DEFS)) appendOption(groupEnemySelect, id);
    groupEnemyWrap.appendChild(groupEnemySelect);
    groupTypeRow.appendChild(groupEnemyWrap);

    let groupCount = 5;
    const countSegment = document.createElement("div");
    countSegment.id = "ds-group-count";
    countSegment.setAttribute("role", "spinbutton");
    countSegment.setAttribute("aria-label", "Group count");
    countSegment.style.cssText = "display:grid;grid-template-columns:28px 34px 28px;gap:0;align-items:stretch;";
    const countDecButton = document.createElement("button");
    const countValue = document.createElement("span");
    const countIncButton = document.createElement("button");
    countDecButton.type = "button";
    countIncButton.type = "button";
    countDecButton.textContent = "−";
    countIncButton.textContent = "+";
    countDecButton.setAttribute("aria-label", "Decrease group count");
    countIncButton.setAttribute("aria-label", "Increase group count");
    countValue.textContent = String(groupCount);
    countValue.style.cssText = "display:flex;align-items:center;justify-content:center;border-top:1px solid #555;border-bottom:1px solid #555;background:#111;color:#eee;min-height:24px;box-sizing:border-box;";
    const styleCountButton = (button: HTMLButtonElement) => {
      button.style.cssText = "font:12px monospace;padding:2px 6px;border:1px solid #555;background:#111;color:#bbb;cursor:pointer;box-sizing:border-box;min-width:28px;min-height:24px;";
    };
    const refreshGroupCount = () => {
      groupCount = normalizeGroupCount(groupCount);
      countValue.textContent = String(groupCount);
      countSegment.setAttribute("aria-valuemin", "2");
      countSegment.setAttribute("aria-valuemax", "10");
      countSegment.setAttribute("aria-valuenow", String(groupCount));
    };
    countDecButton.addEventListener("click", () => { groupCount = stepGroupCount(groupCount, -1); refreshGroupCount(); });
    countIncButton.addEventListener("click", () => { groupCount = stepGroupCount(groupCount, 1); refreshGroupCount(); });
    styleCountButton(countDecButton);
    styleCountButton(countIncButton);
    countDecButton.style.borderRadius = "2px 0 0 2px";
    countIncButton.style.borderRadius = "0 2px 2px 0";
    countIncButton.style.borderLeft = "0";
    countSegment.appendChild(countDecButton);
    countSegment.appendChild(countValue);
    countSegment.appendChild(countIncButton);
    refreshGroupCount();
    groupTypeRow.appendChild(countSegment);
    groupControls.appendChild(groupTypeRow);

    const groupOptionRow = document.createElement("div");
    groupOptionRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:4px;align-items:end;";
    const makeSegmentedChoice = <T extends string>(label: string, ariaLabel: string, options: ReadonlyArray<{ value: T; label: string }>, defaultValue: T) => {
      let value = defaultValue;
      const listeners: Array<() => void> = [];
      const wrap = createSelectLabel(label);
      const segment = document.createElement("div");
      segment.setAttribute("role", "radiogroup");
      segment.setAttribute("aria-label", ariaLabel);
      segment.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:0;min-width:0;";
      const buttons = options.map((option, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = option.label;
        button.setAttribute("role", "radio");
        button.addEventListener("click", () => {
          value = option.value;
          refresh();
          for (const listener of listeners) listener();
        });
        segment.appendChild(button);
        if (index > 0) button.style.borderLeft = "0";
        button.style.borderRadius = index === 0 ? "2px 0 0 2px" : index === options.length - 1 ? "0 2px 2px 0" : "0";
        return { button, value: option.value };
      });
      const refresh = () => {
        buttons.forEach((option, index) => {
          const active = value === option.value;
          option.button.setAttribute("aria-checked", String(active));
          option.button.setAttribute("aria-pressed", String(active));
          styleSegmentButton(option.button, active);
          if (index > 0) option.button.style.borderLeft = "0";
          option.button.style.borderRadius = index === 0 ? "2px 0 0 2px" : index === buttons.length - 1 ? "0 2px 2px 0" : "0";
        });
      };
      refresh();
      wrap.appendChild(segment);
      return { wrap, get value() { return value; }, addEventListener(listener: () => void) { listeners.push(listener); } };
    };
    const formationChoice = makeSegmentedChoice<FormationId>("Form", "Group formation", ENEMY_GROUP_FORMATION_IDS.map((id) => ({ value: id, label: id === "line.horizontal" ? "Line" : "Wedge" })), "line.horizontal");
    const cohesionChoice = makeSegmentedChoice<CohesionId>("Coh", "Group cohesion", ENEMY_GROUP_COHESION_IDS.map((id) => ({ value: id, label: id === "rigid" ? "Rigid" : "Elastic" })), "rigid");
    const formationWrap = formationChoice.wrap;
    const cohesionWrap = cohesionChoice.wrap;
    groupOptionRow.appendChild(formationWrap);
    groupOptionRow.appendChild(cohesionWrap);
    groupControls.appendChild(groupOptionRow);

    const makeParamStepper = (label: string, key: GroupParamKey, defaultValue: number) => {
      let value = defaultValue;
      const wrap = createSelectLabel(label);
      const segment = document.createElement("div");
      segment.setAttribute("role", "spinbutton");
      segment.setAttribute("aria-label", `Group ${label}`);
      segment.style.cssText = "display:grid;grid-template-columns:28px minmax(34px,1fr) 28px;gap:0;align-items:stretch;";
      const decButton = document.createElement("button");
      const valueLabel = document.createElement("span");
      const incButton = document.createElement("button");
      decButton.type = "button";
      incButton.type = "button";
      decButton.textContent = "−";
      incButton.textContent = "+";
      decButton.setAttribute("aria-label", `Decrease ${label}`);
      incButton.setAttribute("aria-label", `Increase ${label}`);
      valueLabel.style.cssText = "display:flex;align-items:center;justify-content:center;border-top:1px solid #555;border-bottom:1px solid #555;background:#111;color:#eee;min-height:24px;box-sizing:border-box;";
      styleCountButton(decButton);
      styleCountButton(incButton);
      decButton.style.borderRadius = "2px 0 0 2px";
      incButton.style.borderRadius = "0 2px 2px 0";
      incButton.style.borderLeft = "0";
      const refresh = () => {
        value = normalizeGroupStepperValue(key, value, cohesionChoice.value);
        const limits = key === "spacing" ? ENEMY_GROUP_PARAM_LIMITS.formation.spacing
          : key === "depth" ? ENEMY_GROUP_PARAM_LIMITS.formation.depth
            : key === "response" ? ENEMY_GROUP_PARAM_LIMITS.cohesion.response
              : ENEMY_GROUP_PARAM_LIMITS.cohesion.maxCatchupSpeed;
        valueLabel.textContent = String(value);
        segment.setAttribute("aria-valuemin", String(limits.min));
        segment.setAttribute("aria-valuemax", String(limits.max));
        segment.setAttribute("aria-valuenow", String(value));
      };
      decButton.addEventListener("click", () => { value = stepGroupParamValue(key, value, -1, cohesionChoice.value); refresh(); });
      incButton.addEventListener("click", () => { value = stepGroupParamValue(key, value, 1, cohesionChoice.value); refresh(); });
      segment.appendChild(decButton);
      segment.appendChild(valueLabel);
      segment.appendChild(incButton);
      wrap.appendChild(segment);
      refresh();
      return { wrap, refresh, get value() { return value; } };
    };

    const spacingStepper = makeParamStepper("Space", "spacing", ENEMY_GROUP_PARAM_LIMITS.formation.spacing.default);
    const depthStepper = makeParamStepper("Depth", "depth", ENEMY_GROUP_PARAM_LIMITS.formation.depth.default);
    const responseStepper = makeParamStepper("Tight", "response", ENEMY_GROUP_PARAM_LIMITS.cohesion.response.default);
    const catchStepper = makeParamStepper("Catch", "maxCatchupSpeed", ENEMY_GROUP_PARAM_LIMITS.cohesion.maxCatchupSpeed.rigidDefault);
    const paramRow1 = document.createElement("div");
    paramRow1.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:4px;align-items:end;";
    paramRow1.appendChild(spacingStepper.wrap);
    paramRow1.appendChild(depthStepper.wrap);
    groupControls.appendChild(paramRow1);
    const paramRow2 = document.createElement("div");
    paramRow2.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:4px;align-items:end;";
    paramRow2.appendChild(responseStepper.wrap);
    paramRow2.appendChild(catchStepper.wrap);
    groupControls.appendChild(paramRow2);
    const refreshGroupParamVisibility = () => {
      depthStepper.wrap.style.display = formationChoice.value === "wedge" ? "flex" : "none";
      spacingStepper.refresh();
      depthStepper.refresh();
      responseStepper.refresh();
      catchStepper.refresh();
    };
    formationChoice.addEventListener(refreshGroupParamVisibility);
    cohesionChoice.addEventListener(refreshGroupParamVisibility);
    refreshGroupParamVisibility();

    const movementGroups = buildMovementGroups();
    const makeMovementControls = (prefix: string, labelText: string, primitiveLabel = "Primitive") => {
      const primitiveSelect = createCompactSelect(`${prefix}-movement-primitive`);
      const presetSelect = createCompactSelect(`${prefix}-movement-preset`);
      this.cleanupHandlers.push(() => primitiveSelect.destroy(), () => presetSelect.destroy());
      const movementClassRow = document.createElement("div");
      movementClassRow.style.cssText = "display:grid;grid-template-columns:auto 1fr;gap:6px;align-items:center;";
      const movementClassLabel = document.createElement("span");
      movementClassLabel.textContent = labelText;
      movementClassLabel.style.cssText = "opacity:0.85;white-space:nowrap;";
      const movementClassSegment = document.createElement("div");
      movementClassSegment.id = `${prefix}-movement-class`;
      movementClassSegment.setAttribute("role", "radiogroup");
      movementClassSegment.setAttribute("aria-label", labelText);
      movementClassSegment.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:0;min-width:0;";
      const dumbButton = document.createElement("button");
      const smartButton = document.createElement("button");
      let movementClass: MovementClassId = "dumb";
      const primitiveWrap = createSelectLabel(primitiveLabel);
      const presetWrap = createSelectLabel("Preset");
      primitiveWrap.appendChild(primitiveSelect.root);
      presetWrap.appendChild(presetSelect.root);
      const movementPresetRow = document.createElement("div");
      movementPresetRow.style.cssText = "display:grid;grid-template-columns:minmax(0,0.9fr) minmax(0,1.1fr);gap:4px;align-items:end;";
      movementPresetRow.appendChild(primitiveWrap);
      movementPresetRow.appendChild(presetWrap);
      movementClassRow.appendChild(movementClassLabel);
      movementClassRow.appendChild(movementClassSegment);
      const hasDumbPresets = Object.keys(movementGroups.dumb).length > 0;
      const hasSmartPresets = Object.keys(movementGroups.smart).length > 0;
      const refreshMovementClassButtons = () => {
        for (const [button, value, enabled] of [[dumbButton, "dumb", hasDumbPresets], [smartButton, "smart", hasSmartPresets]] as const) {
          const active = movementClass === value;
          button.type = "button";
          button.textContent = value === "dumb" ? "Dumb" : "Smart";
          button.disabled = !enabled;
          button.setAttribute("role", "radio");
          button.setAttribute("aria-checked", String(active));
          styleSegmentButton(button, active, !enabled);
        }
        dumbButton.style.borderRadius = "2px 0 0 2px";
        smartButton.style.borderLeft = "0";
        smartButton.style.borderRadius = "0 2px 2px 0";
      };
      movementClassSegment.appendChild(dumbButton);
      movementClassSegment.appendChild(smartButton);
      const repopulatePresetSelect = () => {
        const primitive = primitiveSelect.value;
        const presets = movementGroups[movementClass]?.[primitive] ?? [];
        if (presets.length === 0) {
          presetSelect.setOptions([{ value: "", label: "(none)", disabled: true }]);
          return;
        }
        const preferredPreset = prefix === "ds-group" && presets.includes("straight.basic") ? "straight.basic" : presetSelect.value;
        presetSelect.setOptions(presets.map((presetId) => ({ value: presetId, label: presetId })), preferredPreset);
      };
      const repopulatePrimitiveSelect = () => {
        const primitives = sortPrimitiveIds(Object.keys(movementGroups[movementClass] ?? {}));
        if (primitives.length === 0) {
          primitiveSelect.setOptions([{ value: "", label: "(none)", disabled: true }]);
          repopulatePresetSelect();
          return;
        }
        const preferredPrimitive = prefix === "ds-group" && primitives.includes("straight") ? "straight" : primitiveSelect.value;
        primitiveSelect.setOptions(primitives.map((primitive) => ({ value: primitive, label: formatPrimitiveLabel(primitive) })), preferredPrimitive);
        repopulatePresetSelect();
      };
      const setMovementClass = (next: MovementClassId) => {
        if (next === "dumb" && !hasDumbPresets) return;
        if (next === "smart" && !hasSmartPresets) return;
        movementClass = next;
        refreshMovementClassButtons();
        repopulatePrimitiveSelect();
      };
      dumbButton.addEventListener("click", () => setMovementClass("dumb"));
      smartButton.addEventListener("click", () => setMovementClass("smart"));
      primitiveSelect.addEventListener("change", repopulatePresetSelect);
      refreshMovementClassButtons();
      repopulatePrimitiveSelect();
      return { movementClassRow, movementPresetRow, presetSelect, setMovementClass };
    };

    const enemyMovement = makeMovementControls("ds", "Movement");
    enemyControls.appendChild(enemyMovement.movementClassRow);
    enemyControls.appendChild(enemyMovement.movementPresetRow);
    const groupMovement = makeMovementControls("ds-group", "Move", "Prim");
    groupControls.appendChild(groupMovement.movementClassRow);
    groupControls.appendChild(groupMovement.movementPresetRow);

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
    enemyControls.appendChild(screenYWrap);

    const groupYWrap = createSelectLabel("Y");
    const groupYInput = document.createElement("input");
    groupYInput.id = "ds-group-screen-y";
    groupYInput.type = "number";
    groupYInput.min = "0";
    groupYInput.max = String(Math.max(0, this.logicH));
    groupYInput.step = "1";
    groupYInput.value = "260";
    groupYInput.style.cssText = "width:100%;box-sizing:border-box;";
    const setGroupY = (value: unknown) => {
      const maxY = Math.max(0, this.logicH);
      const raw = Number(value);
      const y = Number.isFinite(raw) ? Math.min(maxY, Math.max(0, raw)) : 260;
      groupYInput.value = String(y);
    };
    groupYInput.addEventListener("change", () => setGroupY(groupYInput.value));
    groupYWrap.appendChild(groupYInput);
    groupControls.appendChild(groupYWrap);

    const btn = document.createElement("button");
    btn.textContent = "RELEASE";
    btn.style.cssText = "cursor:pointer;margin-top:2px;";
    const refreshModeButtons = () => {
      enemyModeButton.type = "button";
      groupModeButton.type = "button";
      enemyModeButton.textContent = "Enemy";
      groupModeButton.textContent = "Group";
      enemyModeButton.setAttribute("aria-pressed", String(spawnMode === "enemy"));
      groupModeButton.setAttribute("aria-pressed", String(spawnMode === "group"));
      styleSegmentButton(enemyModeButton, spawnMode === "enemy");
      styleSegmentButton(groupModeButton, spawnMode === "group");
      enemyModeButton.style.borderRadius = "2px 0 0 2px";
      groupModeButton.style.borderLeft = "0";
      groupModeButton.style.borderRadius = "0 2px 2px 0";
      enemyControls.style.display = spawnMode === "enemy" ? "flex" : "none";
      groupControls.style.display = spawnMode === "group" ? "flex" : "none";
      btn.textContent = spawnMode === "enemy" ? "RELEASE" : "Spawn Group";
    };
    enemyModeButton.addEventListener("click", () => { spawnMode = "enemy"; refreshModeButtons(); });
    groupModeButton.addEventListener("click", () => { spawnMode = "group"; refreshModeButtons(); });
    refreshModeButtons();
    btn.addEventListener("click", () => {
      this.latestManualSpawnId += 1;
      if (spawnMode === "group") {
        const anchorY = Number(groupYInput.value);
        const payload = createDevSummonerGroupSpawnPayload({
          enemyTypeId: groupEnemySelect.value,
          count: groupCount,
          anchorX: this.logicW - 40,
          anchorY,
          formationId: formationChoice.value,
          movementPresetId: groupMovement.presetSelect.value,
          cohesionId: cohesionChoice.value,
          params: {
            formation: {
              spacing: spacingStepper.value,
              depth: depthStepper.value,
            },
            cohesion: {
              response: responseStepper.value,
              maxCatchupSpeed: catchStepper.value,
            },
          },
        });
        if (!payload) {
          console.warn("[DevSummoner] invalid group spawn payload");
          return;
        }
        groupCount = payload.count;
        refreshGroupCount();
        groupYInput.value = String(payload.anchor.y);
        this.bus.emitNext(EventType.SPAWN_ENEMY_GROUP, payload);
        return;
      }
      this.bus.emitNext(EventType.SPAWN_ENEMY, createDevSummonerSpawnPayload({
        typeId: enemySelect.value,
        spawnX: this.logicW - 40,
        spawnY: Number(screenY.value),
        behaviorPresetId: enemyMovement.presetSelect.value,
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
