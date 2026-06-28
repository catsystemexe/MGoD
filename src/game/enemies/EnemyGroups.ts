import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import { EnemyBehaviorDB } from "./EnemyBehaviorDB";
import { EnemyBehaviorPresets } from "./EnemyBehaviorPresets";

type Vec2 = { x: number; y: number };
export type GroupId = number;
export type FormationId = "line.horizontal" | "wedge";
export type CohesionId = "rigid" | "elastic";

export type EnemyGroupMembership = { groupId: GroupId; slotIndex: number };

export type EnemyGroupSpawnRequest = {
  enemyTypeId: string;
  count: number;
  anchor: Vec2;
  formationId: string;
  movementPresetId: string;
  cohesionId: string;
  spacing?: number;
};

type Member = { ref: EntityRef; slotIndex: number; offset: Vec2 };
type Group = {
  id: GroupId;
  anchor: Vec2;
  movementPresetId: string;
  behaviorId: string;
  behavior: Record<string, unknown>;
  bState: Record<string, unknown> & { t: number };
  vel: Vec2;
  formationId: FormationId;
  cohesionId: CohesionId;
  spacing: number;
  slotCount: number;
  members: Member[];
};

const FORMATIONS = new Set<string>(["line.horizontal", "wedge"]);
const COHESION = new Set<string>(["rigid", "elastic"]);
const finite = (n: unknown, fallback = 0) => typeof n === "number" && Number.isFinite(n) ? n : fallback;
const RIGID_MAX_SPEED = 480;

export function normalizeFormationId(id: string): FormationId {
  return FORMATIONS.has(id) ? id as FormationId : "line.horizontal";
}

export function normalizeCohesionId(id: string): CohesionId {
  return COHESION.has(id) ? id as CohesionId : "rigid";
}

export function formationOffset(id: FormationId, slotIndex: number, slotCount: number, spacing = 18): Vec2 {
  const count = Math.max(1, Math.floor(slotCount));
  const slot = Math.max(0, Math.floor(slotIndex));
  const s = Math.max(0, finite(spacing, 18));
  if (id === "wedge") {
    if (slot === 0) return { x: 0, y: 0 };
    const pair = Math.ceil(slot / 2);
    const side = slot % 2 === 1 ? -1 : 1;
    return { x: pair * s, y: side * pair * s };
  }
  return { x: 0, y: (slot - (count - 1) / 2) * s };
}

export class EnemyGroupRegistry {
  private nextId = 1;
  private groups = new Map<GroupId, Group>();

  create(req: EnemyGroupSpawnRequest): GroupId {
    const preset = EnemyBehaviorPresets[req.movementPresetId] ?? EnemyBehaviorPresets["none.hold"];
    const behaviorId = preset?.behaviorId ?? "none";
    const group: Group = {
      id: this.nextId++,
      anchor: { x: finite(req.anchor?.x), y: finite(req.anchor?.y) },
      movementPresetId: preset?.id ?? "none.hold",
      behaviorId,
      behavior: { ...(preset?.params ?? {}) },
      bState: { t: 0 },
      vel: { x: 0, y: 0 },
      formationId: normalizeFormationId(req.formationId),
      cohesionId: normalizeCohesionId(req.cohesionId),
      spacing: Math.max(1, finite(req.spacing, 18)),
      slotCount: Math.max(0, Math.floor(finite(req.count, 0))),
      members: [],
    };
    EnemyBehaviorDB[behaviorId as keyof typeof EnemyBehaviorDB]?.init?.({ pos: group.anchor, vel: group.vel, behavior: group.behavior, bState: group.bState, spawnOrdinal: group.id } as any);
    this.groups.set(group.id, group);
    return group.id;
  }

  addMember(groupId: GroupId, ref: EntityRef, slotIndex: number): EnemyGroupMembership | null {
    const group = this.groups.get(groupId);
    if (!group) return null;
    const slot = Math.max(0, Math.floor(slotIndex));
    const offset = formationOffset(group.formationId, slot, group.slotCount, group.spacing);
    group.members.push({ ref: { slot: ref.slot, gen: ref.gen }, slotIndex: slot, offset });
    return { groupId, slotIndex: slot };
  }

  updateAnchors(dt: number, ctx: { playerPos: Vec2 | null; logicW: number; logicH: number }): void {
    if (!(dt > 0)) return;
    for (const group of this.groups.values()) {
      const behavior = EnemyBehaviorDB[group.behaviorId as keyof typeof EnemyBehaviorDB] ?? EnemyBehaviorDB.none;
      const ent = { pos: group.anchor, vel: group.vel, behavior: group.behavior, bState: group.bState, spawnOrdinal: group.id };
      const behaviorCtx = { dt, playerPos: ctx.playerPos, logicW: ctx.logicW, logicH: ctx.logicH };
      behavior.update?.(ent, behaviorCtx as any);
      const target = behavior.getTarget?.(ent, behaviorCtx as any);
      if (target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
        group.vel.x = (target.x - group.anchor.x) / dt;
        group.vel.y = (target.y - group.anchor.y) / dt;
      } else {
        group.vel.x = finite(ent.vel?.x);
        group.vel.y = finite(ent.vel?.y);
      }
      group.anchor.x += group.vel.x * dt;
      group.anchor.y += group.vel.y * dt;
    }
  }

  applyMemberCohesion(ent: any, membership: EnemyGroupMembership, dt: number): boolean {
    const group = this.groups.get(membership.groupId);
    if (!group || !(dt > 0)) return false;
    const member = group.members.find((m) => m.slotIndex === membership.slotIndex);
    const offset = member?.offset ?? formationOffset(group.formationId, membership.slotIndex, group.slotCount, group.spacing);
    const target = { x: group.anchor.x + offset.x, y: group.anchor.y + offset.y };
    ent.vel = ent.vel ?? { x: 0, y: 0 };
    if (group.cohesionId === "rigid") {
      let vx = (target.x - finite(ent.pos?.x)) / dt;
      let vy = (target.y - finite(ent.pos?.y)) / dt;
      const speed = Math.hypot(vx, vy);
      if (speed > RIGID_MAX_SPEED) {
        vx = vx / speed * RIGID_MAX_SPEED;
        vy = vy / speed * RIGID_MAX_SPEED;
      }
      ent.vel.x = vx;
      ent.vel.y = vy;
      return true;
    }
    const maxSpeed = 260;
    const response = 7;
    const dx = target.x - finite(ent.pos?.x);
    const dy = target.y - finite(ent.pos?.y);
    let vx = dx * response;
    let vy = dy * response;
    const speed = Math.hypot(vx, vy);
    if (speed > maxSpeed) { vx = vx / speed * maxSpeed; vy = vy / speed * maxSpeed; }
    ent.vel.x = vx;
    ent.vel.y = vy;
    return true;
  }

  reconcile(store: EntityStore<any>): void {
    for (const [id, group] of this.groups) {
      group.members = group.members.filter((m) => {
        const ent = store.get(m.ref);
        return !!ent && ent.kind === "enemy" && !ent.pendingKill && ent.group?.groupId === id && ent.group.slotIndex === m.slotIndex;
      });
      if (group.members.length === 0) this.groups.delete(id);
    }
  }

  remove(id: GroupId): void { this.groups.delete(id); }
  reset(): void { this.groups.clear(); this.nextId = 1; }
  get(id: GroupId): Readonly<Group> | undefined { return this.groups.get(id); }
  size(): number { return this.groups.size; }
  snapshot(): Array<{ id: GroupId; anchor: Vec2; members: Array<{ slotIndex: number; ref: EntityRef }> }> {
    return [...this.groups.values()].map((g) => ({ id: g.id, anchor: { ...g.anchor }, members: g.members.map((m) => ({ slotIndex: m.slotIndex, ref: { ...m.ref } })) }));
  }
}
