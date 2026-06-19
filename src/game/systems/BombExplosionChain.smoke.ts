// src/game/systems/BombExplosionChain.smoke.ts
//
// End-to-end guard for the FULL production bomb / explosion chain — the same wiring
// createGame.ts builds:
//
//   player has a bomb, presses bomb (WeaponSystem)                 [tick 0]
//     -> gated on inventory -> onConsumeBomb (bombs 1 -> 0) + emitNext SPAWN_BOMB
//   SpawnSystem materializes the bomb entity flying toward bombTarget  [tick 1]
//   ProjectileSystem moves it; on PROXIMITY to target -> emit EXPLOSION  [tick ~26]
//   DamageSystem (Impact) applies AoE damage to every enemy in radius
//     -> weak enemy dies (ENTITY_KILLED -> ScoreSystem), strong survives wounded
//
// Asserts CONCRETE numbers (not "something happened"):
//   - player.bombs decremented exactly 1 -> 0
//   - the detonation was triggered by PROXIMITY ("bomb"), NOT the TTL fallback
//     ("bomb.ttl"), and happened well before the TTL tick budget
//   - one AoE blast hits TWO enemies: weak (hp 5) dies, strong (hp 11) -> hp 3
//   - score increases by the kill points

import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import type { TickContext } from "../../engine/core/Loop";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

import { WeaponSystem } from "./WeaponSystem";
import { SpawnSystem } from "./SpawnSystem";
import { ProjectileSystem } from "./ProjectileSystem";
import { DamageSystem } from "./DamageSystem";

import { FlowDispatcher } from "../systems/FlowDispatcher";
import { FlowSystem } from "../systems/FlowSystem";
import { ScoreSystem } from "../systems/ScoreSystem";
import { makeSessionState } from "../data/SessionState";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

const DT = 1 / 60;

function main() {
  const bus = new EventBus(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  const store = new EntityStore<any>(64);
  const ship: EntityRef = { slot: 1, gen: 1 };
  const world = { scrollX: 0, scrollY: 0 };

  // --- player bomb inventory (owner side of onConsumeBomb) ---
  let playerBombs = 1;

  // --- two enemies inside one blast: weak dies, strong survives wounded ---
  // target = (100,100); EXPLOSION_RADIUS = 48 covers both.
  const weak = store.spawn((e: any) => {        // bug1-like: hp 5
    e.kind = "enemy"; e.pos = { x: 100, y: 110 }; e.radius = 4; e.hp = 5; e.pendingKill = false;
  });
  const strong = store.spawn((e: any) => {      // mandala-like: hp 11
    e.kind = "enemy"; e.pos = { x: 120, y: 100 }; e.radius = 7; e.hp = 11; e.pendingKill = false;
  });

  // --- systems (production bomb cfg mirrors createGame spawnCfg.bomb) ---
  const weaponsCfg: any = { primary: "p", secondary: "s", bomb: "b", bombCooldownSec: 0.8 };
  const weaponSystem = new WeaponSystem(bus as any, weaponsCfg, {} as any, world as any, {
    onConsumeBomb: () => { playerBombs = Math.max(0, playerBombs - 1); },
  });

  const spawnCfg: any = {
    rng01: () => 0,
    logicSize: { w: 960, h: 540 },
    weaponDb: {},
    bomb: { travelSec: 0.45, ttlSec: 0.9, damage: 8, radius: 6, explosionRadius: 48 },
  };
  const spawn = new SpawnSystem(store as any, spawnCfg, world as any);
  const projectiles = new ProjectileSystem(bus as any, store as any, 960, 540, world as any);
  const damage = new DamageSystem(bus as any, store as any, {
    projectileHitEnemyDamage: 3,
    playerHitEnemyDamage: 999,
  });

  const session = makeSessionState();
  const score = new ScoreSystem(session, { pointsPerCell: 1, pointsPerEntityKill: 10 });
  const flow = new FlowSystem(new FlowDispatcher([score]));

  // ===================== TICK 0: fire bomb =====================
  bus.beginTick(0);
  bus.enterPhase(Phase.Simulation);
  weaponSystem.update(DT, {
    firePrimary: false, fireSecondary: false,
    bombPressed: true, bombTarget: { x: 100, y: 100 },
  } as any, {
    shipRef: ship, shipPos: { x: 100, y: 60 }, bombs: playerBombs,
  } as any);
  bus.endTickAndSwap();

  assert(playerBombs === 0, "tick0: firing a bomb must decrement player.bombs 1 -> 0 (got " + playerBombs + ")");

  // ============ TICKS 1..N: materialize -> fly -> detonate -> AoE ============
  const TTL_TICKS = Math.ceil(0.9 / DT); // 54 — the fallback budget we must beat
  let bombTicks = 0;           // ProjectileSystem updates the bomb has seen
  let detonationSource = "";
  let detonationTick = -1;

  for (let t = 1; t <= 120 && detonationTick < 0; t++) {
    const ctx: TickContext = { tick: t, dt: DT };
    bus.beginTick(t);

    // Simulation: spawn (tick 1 materializes the bomb) + projectile movement/detonation
    bus.enterPhase(Phase.Simulation);
    spawn.update(ctx, bus.drainPhase(Phase.Simulation) as any);
    projectiles.update(DT);
    bombTicks++;

    // Impact: capture EXPLOSION (proves WHICH trigger fired), then apply AoE damage
    bus.enterPhase(Phase.Impact);
    const impactEvents = bus.drainPhase(Phase.Impact) as any[];
    const boom = impactEvents.find((ev) => ev.type === "EXPLOSION");
    if (boom) { detonationSource = String(boom.payload.source); detonationTick = bombTicks; }
    damage.update(impactEvents);

    // Flow: ENTITY_KILLED -> ScoreSystem
    bus.enterPhase(Phase.Flow);
    flow.update(ctx, bus.drainPhase(Phase.Flow) as any);

    bus.enterPhase(Phase.Cleanup);
    store.cleanup();
    bus.endTickAndSwap();
  }

  // ===================== detonation-mechanism assertions =====================
  assert(detonationTick > 0, "bomb never detonated within budget");
  assert(detonationSource === "bomb",
    'detonation must be PROXIMITY-triggered ("bomb"), not TTL fallback — got "' + detonationSource + '"');
  assert(detonationTick < TTL_TICKS,
    "proximity must fire BEFORE the TTL budget (" + detonationTick + " < " + TTL_TICKS + ")");
  console.log("[SMOKE]   detonation via '" + detonationSource + "' at bombTick=" + detonationTick + " (ttl budget=" + TTL_TICKS + ")");

  // ===================== AoE outcome assertions =====================
  const w = store.get(weak) as any;
  const s = store.get(strong) as any;
  assert(w === null, "weak enemy (hp 5) must be destroyed by the blast (damage 8)");
  assert(s && s.pendingKill !== true && s.hp === 3,
    "strong enemy (hp 11) must SURVIVE wounded: 11 - 8 = 3 (got " + (s ? s.hp : "removed") + ")");
  assert(session.score === 10, "weak-enemy kill must award score (got " + session.score + ")");

  console.log("[SMOKE] BombExplosionChain OK ✅");
}

main();
