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

export function groupFormationSelectOptions(): Array<{ value: FormationId; label: string }> {
  const formationLabel = (id: FormationId) => id === "line.horizontal" ? "Line"
    : id === "wedge" ? "Wedge"
      : id === "column.vertical" ? "Column"
        : id === "arc.forward" ? "Arc"
          : "Ring";
  return ENEMY_GROUP_FORMATION_IDS.map((id) => ({ value: id, label: formationLabel(id) }));
}

const CONTROL_HEIGHT_PX = 26;
const CONTROL_RADIUS_PX = 2;
const CONTROL_FONT = "12px monospace";
const CONTROL_BG = "#111";
const CONTROL_BORDER = "1px solid rgba(255,255,255,0.24)";
const LABEL_WEIGHT = "800";

function applyControlBaseStyle(el: HTMLElement): void {
  el.style.boxSizing = "border-box";
  el.style.minHeight = `${CONTROL_HEIGHT_PX}px`;
  el.style.font = CONTROL_FONT;
  el.style.color = "#eee";
  el.style.background = CONTROL_BG;
  el.style.border = CONTROL_BORDER;
  el.style.borderRadius = `${CONTROL_RADIUS_PX}px`;
}

function applyNativeSelectStyle(select: HTMLSelectElement): void {
  applyControlBaseStyle(select);
  select.style.width = "100%";
  select.style.minWidth = "0";
  select.style.padding = "2px 18px 2px 5px";
  select.style.cursor = "pointer";
  select.style.appearance = "none";
  select.style.setProperty("-webkit-appearance", "none");
  select.style.textOverflow = "ellipsis";
  select.style.overflow = "hidden";
  select.style.whiteSpace = "nowrap";
}

function applyValueInputStyle(input: HTMLInputElement): void {
  applyControlBaseStyle(input);
  input.style.width = "52px";
  input.style.padding = "2px 4px";
  input.style.textAlign = "center";
  input.style.appearance = "textfield";
  input.style.setProperty("-webkit-appearance", "none");
}

function applyLabelTextStyle(el: HTMLElement, prominence: "primary" | "secondary" = "primary"): void {
  el.style.fontFamily = "monospace";
  el.style.fontSize = "12px";
  el.style.fontWeight = LABEL_WEIGHT;
  el.style.color = prominence === "primary" ? "#f2f2f2" : "#d7d7d7";
  el.style.opacity = prominence === "primary" ? "0.98" : "0.88";
  el.style.lineHeight = "1.05";
  el.style.whiteSpace = "nowrap";
}

function applyInlineStepperButtonStyle(button: HTMLButtonElement): void {
  button.style.cssText = [
    "font:12px monospace",
    "min-width:24px",
    "min-height:26px",
    "padding:0 5px",
    "border:0",
    "border-radius:2px",
    "background:transparent",
    "color:#ddd",
    "cursor:pointer",
    "box-sizing:border-box",
  ].join(";");
}

function createSectionGap(): HTMLDivElement {
  const gap = document.createElement("div");
  gap.style.cssText = "height:4px;min-height:4px;";
  gap.setAttribute("aria-hidden", "true");
  return gap;
}

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

function createSelectLabel(text: string, prominence: "primary" | "secondary" = "primary"): HTMLLabelElement {
  const label = document.createElement("label");
  label.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0;";
  const span = document.createElement("span");
  span.textContent = text;
  applyLabelTextStyle(span, prominence);
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
    "min-height:26px",
    "padding:2px 18px 2px 5px",
    "background:#111",
    "color:#eee",
    "border:1px solid rgba(255,255,255,0.24)",
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
        "min-height:26px",
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

type GroupParamKey = "spacing" | "depth" | "radius" | "angle" | "response" | "maxCatchupSpeed";

export function normalizeGroupStepperValue(key: GroupParamKey, value: unknown, cohesionId: CohesionId = "rigid"): number {
  const params = normalizeEnemyGroupParams({
    formation: {
      spacing: key === "spacing" ? Number(value) : undefined,
      depth: key === "depth" ? Number(value) : undefined,
      radius: key === "radius" ? Number(value) : undefined,
      angle: key === "angle" ? Number(value) : undefined,
    },
    cohesion: {
      response: key === "response" ? Number(value) : undefined,
      maxCatchupSpeed: key === "maxCatchupSpeed" ? Number(value) : undefined,
    },
  }, cohesionId);
  if (key === "spacing") return params.formation.spacing;
  if (key === "depth") return params.formation.depth;
  if (key === "radius") return params.formation.radius;
  if (key === "angle") return params.formation.angle;
  if (key === "response") return params.cohesion.response;
  return params.cohesion.maxCatchupSpeed;
}

export function stepGroupParamValue(key: GroupParamKey, value: unknown, delta: -1 | 1, cohesionId: CohesionId = "rigid"): number {
  const limits = key === "spacing" ? ENEMY_GROUP_PARAM_LIMITS.formation.spacing
    : key === "depth" ? ENEMY_GROUP_PARAM_LIMITS.formation.depth
      : key === "radius" ? ENEMY_GROUP_PARAM_LIMITS.formation.radius
        : key === "angle" ? ENEMY_GROUP_PARAM_LIMITS.formation.angle
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
      "border-radius:2px","display:flex","flex-direction:column","gap:5px",
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
    spawnSection.style.cssText = "display:flex;flex-direction:column;gap:6px;";
    panel.appendChild(spawnSection);

    const spawnTitle = document.createElement("div");
    spawnTitle.textContent = "Spawn";
    spawnTitle.style.cssText = "font-weight:800;opacity:0.95;";
    spawnSection.appendChild(spawnTitle);

    const modeRow = document.createElement("div");
    modeRow.style.cssText = "display:grid;grid-template-columns:auto 1fr;gap:6px;align-items:center;";
    const modeLabel = document.createElement("span");
    modeLabel.textContent = "Spawn Mode";
    applyLabelTextStyle(modeLabel);
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
        "min-height:26px",
        "padding:2px 6px",
        "border:1px solid rgba(255,255,255,0.24)",
        "background:" + (active ? "#26384f" : "#111"),
        "color:" + (disabled ? "#777" : active ? "#fff" : "#bbb"),
        "cursor:" + (disabled ? "not-allowed" : "pointer"),
        "box-sizing:border-box",
        "min-width:0",
      ].join(";");
    };

    const enemyControls = document.createElement("div");
    enemyControls.style.cssText = "display:flex;flex-direction:column;gap:6px;";
    const groupControls = document.createElement("div");
    groupControls.style.cssText = "display:none;flex-direction:column;gap:6px;";
    spawnSection.appendChild(enemyControls);
    spawnSection.appendChild(groupControls);

    const enemySelect = document.createElement("select");
    enemySelect.id = "ds-enemy";
    for (const id of Object.keys(ENEMY_DEFS)) {
      const opt = document.createElement("option");
      opt.value = id; opt.textContent = id;
      enemySelect.appendChild(opt);
    }
    applyNativeSelectStyle(enemySelect);
    const enemyTypeRow = document.createElement("label");
    enemyTypeRow.style.cssText = "display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px;align-items:center;min-width:0;";
    const enemyTypeLabel = document.createElement("span");
    enemyTypeLabel.textContent = "Type";
    applyLabelTextStyle(enemyTypeLabel);
    enemyTypeRow.appendChild(enemyTypeLabel);
    enemyTypeRow.appendChild(enemySelect);
    enemyControls.appendChild(enemyTypeRow);
    enemyControls.appendChild(createSectionGap());

    const groupTypeRow = document.createElement("div");
    groupTypeRow.style.cssText = "display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:5px;align-items:center;min-width:0;";
    const groupTypeLabel = document.createElement("span");
    groupTypeLabel.textContent = "Type";
    applyLabelTextStyle(groupTypeLabel);
    const groupEnemySelect = document.createElement("select");
    groupEnemySelect.id = "ds-group-enemy";
    applyNativeSelectStyle(groupEnemySelect);
    for (const id of Object.keys(ENEMY_DEFS)) appendOption(groupEnemySelect, id);
    groupTypeRow.appendChild(groupTypeLabel);
    groupTypeRow.appendChild(groupEnemySelect);

    let groupCount = 5;
    const countSegment = document.createElement("div");
    countSegment.id = "ds-group-count";
    countSegment.setAttribute("role", "spinbutton");
    countSegment.setAttribute("aria-label", "Group count");
    countSegment.style.cssText = "display:grid;grid-template-columns:24px 22px 24px;gap:1px;align-items:center;align-self:end;min-width:72px;";
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
    countValue.style.cssText = "display:flex;align-items:center;justify-content:center;color:#eee;min-height:26px;box-sizing:border-box;font-weight:800;";
    const styleCountButton = (button: HTMLButtonElement) => {
      applyInlineStepperButtonStyle(button);
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
    countSegment.appendChild(countDecButton);
    countSegment.appendChild(countValue);
    countSegment.appendChild(countIncButton);
    refreshGroupCount();
    groupTypeRow.appendChild(countSegment);
    groupControls.appendChild(groupTypeRow);
    groupControls.appendChild(createSectionGap());

    const groupOptionRow = document.createElement("div");
    groupOptionRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:4px;align-items:end;";
    const makeCompactChoice = <T extends string>(label: string, options: ReadonlyArray<{ value: T; label: string }>, defaultValue: T) => {
      const wrap = createSelectLabel(label);
      const select = createCompactSelect(`ds-group-${label.toLowerCase()}`);
      select.setOptions([...options], defaultValue);
      this.cleanupHandlers.push(() => select.destroy());
      wrap.appendChild(select.root);
      return { wrap, get value() { return select.value as T; }, addEventListener(listener: () => void) { select.addEventListener("change", listener); } };
    };
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
    const formationChoice = makeCompactChoice<FormationId>("Form", groupFormationSelectOptions(), "line.horizontal");
    const cohesionChoice = makeSegmentedChoice<CohesionId>("Coh", "Group cohesion", ENEMY_GROUP_COHESION_IDS.map((id) => ({ value: id, label: id === "rigid" ? "Rigid" : "Elastic" })), "rigid");
    const formationWrap = formationChoice.wrap;
    const cohesionWrap = cohesionChoice.wrap;
    groupOptionRow.appendChild(formationWrap);
    groupOptionRow.appendChild(cohesionWrap);
    groupControls.appendChild(groupOptionRow);

    const makeParamStepper = (label: string, key: GroupParamKey, defaultValue: number) => {
      let value = defaultValue;
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:grid;grid-template-columns:max-content minmax(0,1fr);gap:1px;align-items:center;min-width:0;";
      const labelNode = document.createElement("span");
      labelNode.textContent = label;
      applyLabelTextStyle(labelNode, "secondary");
      const segment = document.createElement("div");
      segment.setAttribute("role", "spinbutton");
      segment.setAttribute("aria-label", `Group ${label}`);
      segment.style.cssText = "display:grid;grid-template-columns:22px minmax(20px,1fr) 22px;gap:0;align-items:center;min-width:0;";
      const decButton = document.createElement("button");
      const valueLabel = document.createElement("span");
      const incButton = document.createElement("button");
      decButton.type = "button";
      incButton.type = "button";
      decButton.textContent = "−";
      incButton.textContent = "+";
      decButton.setAttribute("aria-label", `Decrease ${label}`);
      incButton.setAttribute("aria-label", `Increase ${label}`);
      valueLabel.style.cssText = "display:flex;align-items:center;justify-content:center;color:#eee;min-height:26px;box-sizing:border-box;font-weight:800;";
      styleCountButton(decButton);
      styleCountButton(incButton);
      decButton.style.minWidth = "22px";
      incButton.style.minWidth = "22px";
      const refresh = () => {
        value = normalizeGroupStepperValue(key, value, cohesionChoice.value);
        const limits = key === "spacing" ? ENEMY_GROUP_PARAM_LIMITS.formation.spacing
          : key === "depth" ? ENEMY_GROUP_PARAM_LIMITS.formation.depth
            : key === "radius" ? ENEMY_GROUP_PARAM_LIMITS.formation.radius
              : key === "angle" ? ENEMY_GROUP_PARAM_LIMITS.formation.angle
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
      wrap.appendChild(labelNode);
      wrap.appendChild(segment);
      refresh();
      return { wrap, refresh, get value() { return value; } };
    };

    const spacingStepper = makeParamStepper("Space", "spacing", ENEMY_GROUP_PARAM_LIMITS.formation.spacing.default);
    const depthStepper = makeParamStepper("Depth", "depth", ENEMY_GROUP_PARAM_LIMITS.formation.depth.default);
    const radiusStepper = makeParamStepper("Radius", "radius", ENEMY_GROUP_PARAM_LIMITS.formation.radius.default);
    const angleStepper = makeParamStepper("Angle", "angle", ENEMY_GROUP_PARAM_LIMITS.formation.angle.default);
    const responseStepper = makeParamStepper("Tight", "response", ENEMY_GROUP_PARAM_LIMITS.cohesion.response.default);
    const catchStepper = makeParamStepper("Catch", "maxCatchupSpeed", ENEMY_GROUP_PARAM_LIMITS.cohesion.maxCatchupSpeed.rigidDefault);
    const paramRow1 = document.createElement("div");
    paramRow1.style.cssText = "display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:2px;align-items:center;min-width:0;";
    paramRow1.appendChild(spacingStepper.wrap);
    paramRow1.appendChild(depthStepper.wrap);
    paramRow1.appendChild(radiusStepper.wrap);
    paramRow1.appendChild(angleStepper.wrap);
    groupControls.appendChild(paramRow1);
    const paramRow2 = document.createElement("div");
    paramRow2.style.cssText = "display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:2px;align-items:center;min-width:0;";
    paramRow2.appendChild(responseStepper.wrap);
    paramRow2.appendChild(catchStepper.wrap);
    groupControls.appendChild(paramRow2);
    groupControls.appendChild(createSectionGap());
    const setStepperVisible = (wrap: HTMLElement, visible: boolean) => {
      wrap.style.display = visible ? "grid" : "none";
      wrap.setAttribute("aria-hidden", String(!visible));
    };
    const refreshGroupParamVisibility = () => {
      const formation = formationChoice.value;
      setStepperVisible(spacingStepper.wrap, formation === "line.horizontal" || formation === "wedge" || formation === "column.vertical");
      setStepperVisible(depthStepper.wrap, formation === "wedge");
      setStepperVisible(radiusStepper.wrap, formation === "arc.forward" || formation === "ring");
      setStepperVisible(angleStepper.wrap, formation === "arc.forward");
      spacingStepper.refresh();
      depthStepper.refresh();
      radiusStepper.refresh();
      angleStepper.refresh();
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
      applyLabelTextStyle(movementClassLabel);
      const movementClassSegment = document.createElement("div");
      movementClassSegment.id = `${prefix}-movement-class`;
      movementClassSegment.setAttribute("role", "radiogroup");
      movementClassSegment.setAttribute("aria-label", labelText);
      movementClassSegment.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:0;min-width:0;";
      const dumbButton = document.createElement("button");
      const smartButton = document.createElement("button");
      let movementClass: MovementClassId = "dumb";
      const primitiveWrap = createSelectLabel(primitiveLabel, "secondary");
      const presetWrap = createSelectLabel("Preset", "secondary");
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
    enemyControls.appendChild(createSectionGap());
    const groupMovement = makeMovementControls("ds-group", "Move", "Prim");
    groupControls.appendChild(groupMovement.movementClassRow);
    groupControls.appendChild(groupMovement.movementPresetRow);
    groupControls.appendChild(createSectionGap());

    const createSpawnYControl = (idPrefix: string) => {
      const wrap = document.createElement("label");
      wrap.style.cssText = "display:grid;grid-template-columns:auto minmax(0,1fr) 52px;gap:6px;align-items:center;min-width:0;";
      const label = document.createElement("span");
      label.textContent = "Y Spawn";
      applyLabelTextStyle(label);
      const slider = document.createElement("input");
      slider.id = `${idPrefix}-screen-y`;
      slider.type = "range";
      slider.min = "0";
      slider.max = String(Math.max(0, this.logicH));
      slider.step = "1";
      slider.value = "260";
      slider.style.cssText = "width:100%;min-width:0;box-sizing:border-box;accent-color:#6f8fc0;";
      const valueInput = document.createElement("input");
      valueInput.id = `${idPrefix}-screen-y-input`;
      valueInput.type = "number";
      valueInput.min = slider.min;
      valueInput.max = slider.max;
      valueInput.step = slider.step;
      valueInput.value = slider.value;
      applyValueInputStyle(valueInput);
      const setValue = (value: unknown) => {
        const maxY = Math.max(0, this.logicH);
        const raw = Number(value);
        const y = Number.isFinite(raw) ? Math.min(maxY, Math.max(0, raw)) : 260;
        slider.value = String(y);
        valueInput.value = String(y);
      };
      slider.addEventListener("input", () => setValue(slider.value));
      valueInput.addEventListener("input", () => setValue(valueInput.value));
      wrap.appendChild(label);
      wrap.appendChild(slider);
      wrap.appendChild(valueInput);
      setValue(260);
      return { wrap, slider, valueInput, setValue, get value() { return Number(slider.value); } };
    };

    const screenYControl = createSpawnYControl("ds");
    enemyControls.appendChild(screenYControl.wrap);

    const groupYControl = createSpawnYControl("ds-group");
    groupControls.appendChild(groupYControl.wrap);

    const btn = document.createElement("button");
    btn.textContent = "RELEASE";
    btn.style.cssText = "cursor:pointer;margin-top:2px;font:12px monospace;font-weight:800;min-height:28px;background:#26384f;color:#fff;border:1px solid rgba(255,255,255,0.28);border-radius:2px;";
    const refreshModeButtons = () => {
      enemyModeButton.type = "button";
      groupModeButton.type = "button";
      enemyModeButton.textContent = "Single";
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
        const anchorY = groupYControl.value;
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
              radius: radiusStepper.value,
              angle: angleStepper.value,
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
        groupYControl.setValue(payload.anchor.y);
        this.bus.emitNext(EventType.SPAWN_ENEMY_GROUP, payload);
        return;
      }
      this.bus.emitNext(EventType.SPAWN_ENEMY, createDevSummonerSpawnPayload({
        typeId: enemySelect.value,
        spawnX: this.logicW - 40,
        spawnY: screenYControl.value,
        behaviorPresetId: enemyMovement.presetSelect.value,
        devManualSpawnId: this.latestManualSpawnId,
      }) as any);
    });
    spawnSection.appendChild(btn);
    panel.appendChild(createSectionGap());

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
