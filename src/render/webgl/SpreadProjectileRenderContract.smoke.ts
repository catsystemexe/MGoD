import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { AnyEvent, TickContext } from "../../engine/core/Loop";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import { createWorldState } from "../../game/data/WorldState";
import { WEAPON_DB } from "../../game/defs/WeaponDB";
import {
  W1_BASIC_RENDER_LENGTH,
  W1_SPREAD_COLLISION_OFFSET,
  W1_SPREAD_RENDER_LENGTH,
  W1_SPREAD_RENDER_WIDTH,
  W1_SPREAD_RENDER_WIDTH_L5,
} from "../../game/weapons/W1Geometry";
import { projectileCollisionCircles } from "../../game/systems/CollisionSystem";
import { SpawnSystem, type SpawnableEntity } from "../../game/systems/SpawnSystem";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}

function spawnProjectile(weaponTypeId: string, weaponLevel?: number): any {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 64,
    failFast: true,
    dropLeftoversInProd: true,
  });
  const store = new EntityStore<SpawnableEntity>(16);
  const spawn = new SpawnSystem(store, {
    rng01: () => 0.5,
    logicSize: { w: 896, h: 504 },
    weaponDb: WEAPON_DB,
    bomb: { travelSec: 0.25, ttlSec: 0.25, damage: 20, radius: 10, explosionRadius: 48 },
  }, createWorldState());

  const owner: EntityRef = { slot: 1, gen: 1 };
  bus.beginTick(0);
  bus.enterPhase(Phase.Simulation);
  bus.emitNext(EventType.SPAWN_PROJECTILE, {
    owner,
    origin: { x: 100, y: 200 },
    dir: { x: 1, y: 0 },
    weaponTypeId,
    weaponLevel,
  });
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  bus.beginTick(1);
  bus.enterPhase(Phase.Simulation);
  const events = bus.drainPhase(Phase.Simulation) as AnyEvent<CMEventMap>[];
  const ctx: TickContext = { tick: 1, dt: 1 / 60 };
  spawn.update(ctx, events);

  let projectile: any = null;
  store.debugForEachAlive((_ref, e: any) => {
    if (e.kind === "projectile") projectile = e;
  });
  assert(projectile, `${weaponTypeId} should materialize a projectile`);
  return projectile;
}

function rendererSdfContract(entity: any) {
  const sdf = entity.render?.sdf;
  assert(sdf && typeof sdf.shape === "string", "entity should carry an SDF render descriptor");
  const sizeMult = Number.isFinite(Number(sdf.size)) ? Number(sdf.size) : 1;
  return {
    ix: Number(entity.pos?.x),
    iy: Number(entity.pos?.y),
    radius: Number(entity.radius) * sizeMult,
    shape: sdf.shape,
    color: typeof sdf.color === "string" ? sdf.color : "#ffffff",
    tipColor: typeof sdf.tipColor === "string" ? sdf.tipColor : undefined,
    sizeX: typeof sdf.lengthPx === "number" ? sdf.lengthPx : undefined,
    sizeY: typeof sdf.widthPx === "number" ? sdf.widthPx : undefined,
  };
}

for (const level of [1, 4, 5]) {
  const projectile = spawnProjectile("w1.spread", level);
  const draw = rendererSdfContract(projectile);
  assert(draw.shape === "bolt", `Spread L${level} should render through the bolt SDF branch`);
  assert(draw.sizeX === W1_SPREAD_RENDER_LENGTH, `Spread L${level} should use the named render length`);
  assert(draw.sizeY === (level >= 5 ? W1_SPREAD_RENDER_WIDTH_L5 : W1_SPREAD_RENDER_WIDTH), `Spread L${level} should use the expected render width`);
  assert(Number.isFinite(draw.ix) && Number.isFinite(draw.iy), `Spread L${level} draw position should be finite`);
  assert(draw.color === "#ffd21f", `Spread L${level} body color should stay yellow`);
  assert(draw.tipColor === "#ff8a00", `Spread L${level} tip color should stay orange`);
  assert(projectile.damage === 2, `Spread L${level} damage should be unchanged`);
  assert(approx(Math.hypot(projectile.vel.x, projectile.vel.y), 980), `Spread L${level} speed should be unchanged`);
  assert(approx(projectile.ttl, 1.15), `Spread L${level} TTL should be unchanged`);
  const circles = projectileCollisionCircles(projectile);
  assert(circles.length === 1, `Spread L${level} should keep one collision circle`);
  assert(approx(circles[0].x - projectile.pos.x, W1_SPREAD_COLLISION_OFFSET), `Spread L${level} collision offset should use the shared gameplay/overlay helper`);
  assert(circles[0].x > projectile.pos.x, `Spread L${level} collision circle should remain on the active front body`);
  assert(circles[0].x < projectile.pos.x + W1_SPREAD_RENDER_LENGTH / 2, `Spread L${level} collision circle should not move past the visual tip`);
}

assert(W1_SPREAD_RENDER_LENGTH > 34, "Spread render length should increase from the invisible 34px contract");
assert(W1_SPREAD_RENDER_LENGTH < W1_BASIC_RENDER_LENGTH / 2, "Spread should remain less than half the Basic render length");
assert(W1_SPREAD_RENDER_WIDTH_L5 > W1_SPREAD_RENDER_WIDTH, "Spread L5 should be visibly thicker than L1-L4");

const basic = spawnProjectile("w1.basic", 1);
const basicDraw = rendererSdfContract(basic);
assert(basicDraw.shape === "bolt", "Basic should keep the bolt SDF branch");
assert(basicDraw.sizeX === undefined && basicDraw.sizeY === undefined, "Basic must not inherit explicit Spread dimensions");
assert(basic.render?.sdf?.color === "#aef6ff", "Basic body color should remain unchanged");
assert(basic.render?.sdf?.tipColor === undefined, "Basic should not inherit the Spread tip color");
assert(WEAPON_DB["w1.basic"].projectile?.speed === 1100, "Basic speed should remain unchanged");
assert(WEAPON_DB["w1.basic"].projectile?.ttlSec === 3, "Basic TTL should remain unchanged");
assert(WEAPON_DB["w2.laser"].fireKind === "beam", "W2 should remain the laser beam definition");
assert(WEAPON_DB["w2.laser"].beam?.durationSec === 1.0, "W2 level-one duration should remain unchanged");

console.log("[SMOKE] SpreadProjectileRenderContract OK ✅");
