import type { EntityStore } from "../../engine/ecs/EntityStore";

export interface AttackProfileDef {
  id: string;
  pattern: "none" | "single" | "aimed" | "spread";
  fireRateMs: number;
  damage: number;
  projectileSpeed: number;
  projectileRadius?: number;
  windupMs: number;
  spreadCount?: number;
  spreadAngleDeg?: number;
  onlyWhenVisible: boolean;
}

export interface AttackState {
  cooldownMs: number;
  windupMs: number;
  firing: boolean;
}

interface Vec2 { x: number; y: number }

interface EnemyLike {
  pos: Vec2;
  vel?: Vec2;
  radius?: number;
  bState: { attack?: AttackState; [k: string]: any };
}

function normalize(dx: number, dy: number): Vec2 {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function spawnEnemyProjectile(
  store: EntityStore<any>,
  origin: Vec2,
  dir: Vec2,
  profile: AttackProfileDef,
): void {
  const vx = dir.x * profile.projectileSpeed;
  const vy = dir.y * profile.projectileSpeed;
  const r = profile.projectileRadius ?? 4;

  store.spawn((e: any) => {
    e.kind = "enemyProjectile";
    e.pos = { x: origin.x, y: origin.y };
    e.posPrev = { x: origin.x, y: origin.y };
    e.vel = { x: vx, y: vy };
    e.ttl = 4.0;
    e.damage = profile.damage;
    e.radius = r;
    e.consumed = false;
    e.pendingKill = false;
    e.render = { sdf: { shape: "orb", color: "#ff4444", size: 0.6 } };
  });
}

export function updateAttack(args: {
  ent: EnemyLike;
  profile: AttackProfileDef;
  playerPos: Vec2;
  store: EntityStore<any>;
  scrollX: number;
  logicW: number;
  dt: number;
}): void {
  const { ent, profile, playerPos, store, scrollX, logicW, dt } = args;

  if (profile.pattern === "none") return;

  if (!ent.bState.attack) {
    ent.bState.attack = { cooldownMs: 0, windupMs: 0, firing: false };
  }
  const st = ent.bState.attack;

  if (profile.onlyWhenVisible) {
    const screenX = ent.pos.x - scrollX;
    const r = ent.radius ?? 4;
    if (screenX < -r || screenX > logicW + r) return;
  }

  if (st.cooldownMs > 0) {
    st.cooldownMs -= dt * 1000;
    return;
  }

  if (!st.firing) {
    st.firing = true;
    st.windupMs = profile.windupMs;
  }
  if (st.windupMs > 0) {
    st.windupMs -= dt * 1000;
    return;
  }

  const origin = ent.pos;

  switch (profile.pattern) {
    case "aimed": {
      const dir = normalize(playerPos.x - origin.x, playerPos.y - origin.y);
      spawnEnemyProjectile(store, origin, dir, profile);
      break;
    }
    case "single": {
      spawnEnemyProjectile(store, origin, { x: -1, y: 0 }, profile);
      break;
    }
    case "spread": {
      const count = profile.spreadCount ?? 3;
      const totalDeg = profile.spreadAngleDeg ?? 30;
      const totalRad = (totalDeg * Math.PI) / 180;
      const baseAngle = Math.PI; // left (-x)
      for (let i = 0; i < count; i++) {
        const frac = count === 1 ? 0 : (i / (count - 1)) * 2 - 1; // -1..+1
        const a = baseAngle + frac * (totalRad / 2);
        spawnEnemyProjectile(store, origin, { x: Math.cos(a), y: Math.sin(a) }, profile);
      }
      break;
    }
  }

  st.firing = false;
  st.cooldownMs = profile.fireRateMs;
}
