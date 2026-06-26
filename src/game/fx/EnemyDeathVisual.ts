export type EnemyDeathVisualDef = {
  flashSec: number;
  burnSec: number;
  overlapSec: number;
  explosionId: string;
  explosionScale: number;
};

export const DEFAULT_ENEMY_DEATH_VISUAL: EnemyDeathVisualDef = {
  flashSec: 0.06,
  burnSec: 0.08,
  overlapSec: 0.14,
  explosionId: "fx.explosion.1",
  explosionScale: 1,
};

const PROFILE_EPSILON = 1e-9;

function profileTimingMatches(def: Pick<EnemyDeathVisualDef, "flashSec" | "burnSec" | "overlapSec">): boolean {
  return Math.abs(def.flashSec + def.burnSec - def.overlapSec) <= PROFILE_EPSILON;
}

export const DEFAULT_ENEMY_DEATH_VISUAL_TIMING_VALID = profileTimingMatches(DEFAULT_ENEMY_DEATH_VISUAL);

export type EnemyDeathGhostSnapshot = {
  typeId: string;
  pos: { x: number; y: number };
  posPrev: { x: number; y: number };
  render?: {
    color?: string;
    sprite?: {
      id: string;
      scale: number;
      animation?: {
        id: string;
        speed: number;
      };
    };
  };
  radius: number;
};

export type EnemyDeathVisualState = {
  phase: "flash" | "burn" | "hidden";
  tint: [number, number, number];
  opacity: number;
};

export type EnemyDeathGhostData = {
  kind: "fx";
  pos: { x: number; y: number };
  posPrev: { x: number; y: number };
  vel: { x: number; y: number };
  ttl: number;
  radius: number;
  deathVisual: {
    age: number;
    flashSec: number;
    burnSec: number;
    overlapSec: number;
    snapshot: EnemyDeathGhostSnapshot;
  };
};

type Vec2 = { x: number; y: number };

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cloneFiniteVec2(value: unknown): Vec2 | null {
  const vec = value as Partial<Vec2> | null | undefined;
  if (!vec || !finiteNumber(vec.x) || !finiteNumber(vec.y)) return null;
  return { x: vec.x, y: vec.y };
}

function positiveFinite(value: unknown): value is number {
  return finiteNumber(value) && value > 0;
}

function resolveProfile(def?: EnemyDeathVisualDef): EnemyDeathVisualDef {
  if (
    !def ||
    !positiveFinite(def.flashSec) ||
    !positiveFinite(def.burnSec) ||
    !positiveFinite(def.overlapSec) ||
    !profileTimingMatches(def) ||
    typeof def.explosionId !== "string" ||
    !def.explosionId ||
    !positiveFinite(def.explosionScale)
  ) {
    return DEFAULT_ENEMY_DEATH_VISUAL;
  }
  return def;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function cloneRender(render: unknown): EnemyDeathGhostSnapshot["render"] | undefined {
  const source = render as {
    color?: unknown;
    sprite?: {
      id?: unknown;
      scale?: unknown;
      animation?: { id?: unknown; speed?: unknown };
    };
  } | null | undefined;
  if (!source) return undefined;

  const out: NonNullable<EnemyDeathGhostSnapshot["render"]> = {};
  if (typeof source.color === "string") out.color = source.color;

  const sprite = source.sprite;
  if (sprite && typeof sprite.id === "string" && sprite.id.length) {
    const scale = positiveFinite(sprite.scale) ? sprite.scale : 1;
    const clonedSprite: NonNullable<NonNullable<EnemyDeathGhostSnapshot["render"]>["sprite"]> = {
      id: sprite.id,
      scale,
    };

    const animation = sprite.animation;
    if (
      animation &&
      typeof animation.id === "string" &&
      animation.id.length &&
      positiveFinite(animation.speed)
    ) {
      clonedSprite.animation = {
        id: animation.id,
        speed: animation.speed,
      };
    }

    out.sprite = clonedSprite;
  }

  return out.color || out.sprite ? out : undefined;
}

export function snapshotEnemyDeathVisual(enemy: unknown): EnemyDeathGhostSnapshot | null {
  const source = enemy as {
    typeId?: unknown;
    pos?: unknown;
    posPrev?: unknown;
    render?: unknown;
    radius?: unknown;
  } | null | undefined;
  if (!source || typeof source.typeId !== "string" || !source.typeId) return null;

  const pos = cloneFiniteVec2(source.pos);
  if (!pos) return null;
  const posPrev = cloneFiniteVec2(source.posPrev) ?? { x: pos.x, y: pos.y };
  const radius = positiveFinite(source.radius) ? source.radius : 1;

  const snapshot: EnemyDeathGhostSnapshot = {
    typeId: source.typeId,
    pos,
    posPrev,
    radius,
  };

  const render = cloneRender(source.render);
  if (render) snapshot.render = render;

  return snapshot;
}

export function computeEnemyDeathVisualState(
  ageSec: unknown,
  def?: EnemyDeathVisualDef,
): EnemyDeathVisualState {
  const profile = resolveProfile(def);
  const rawAge = Number(ageSec);
  const age = Number.isFinite(rawAge) && rawAge > 0 ? rawAge : 0;

  if (age < profile.flashSec) {
    const warmT = smoothstep01((age / profile.flashSec - 0.7) / 0.3);
    return {
      phase: "flash",
      tint: [1, lerp(1, 0.9, warmT), lerp(1, 0.72, warmT)],
      opacity: 1,
    };
  }

  if (age < profile.overlapSec) {
    const burnT = smoothstep01((age - profile.flashSec) / profile.burnSec);
    return {
      phase: "burn",
      tint: [lerp(1, 0.1, burnT), lerp(0.55, 0.05, burnT), lerp(0.12, 0.02, burnT)],
      opacity: 1 - burnT,
    };
  }

  return {
    phase: "hidden",
    tint: [0.1, 0.05, 0.02],
    opacity: 0,
  };
}

export function createEnemyDeathGhostData(
  enemy: unknown,
  def?: EnemyDeathVisualDef,
): EnemyDeathGhostData | null {
  const profile = resolveProfile(def);
  const snapshot = snapshotEnemyDeathVisual(enemy);
  if (!snapshot) return null;

  return {
    kind: "fx",
    pos: { x: snapshot.pos.x, y: snapshot.pos.y },
    posPrev: { x: snapshot.posPrev.x, y: snapshot.posPrev.y },
    vel: { x: 0, y: 0 },
    ttl: profile.overlapSec,
    radius: snapshot.radius,
    deathVisual: {
      age: 0,
      flashSec: profile.flashSec,
      burnSec: profile.burnSec,
      overlapSec: profile.overlapSec,
      snapshot,
    },
  };
}
