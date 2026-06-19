# 00 – Repository Structure & Architecture Overview

## What this project is

**Captain Meow (CM)** is a browser-based, **deterministic 2D arcade
shoot-'em-up** written in TypeScript, rendered with **WebGL2**, built/served by
**Vite**, and developed on **Replit**. It targets a fixed logical resolution of
**896×504** with integer-scaled letterboxing, and aims for a retro NeoGeo / C64
aesthetic. It is a **prototype/engine** — the deterministic core is mature; the
"game" on top is an MVP side-scroller.

## Top-level layout

```
/
├── index.html              Entry HTML; injects eruda mobile console; loads src/index.ts
├── src/                    All TypeScript source
├── public/assets/sprites/  Runtime sprite PNGs + .atlas.json (served as-is by Vite)
├── assets/sprites/         Source sprite map (core.map.txt) for the atlas generator
├── tools/gen_atlas.mjs     Build-time sprite atlas JSON generator
├── scripts/                One-off inspection/patch scripts (glyphs, archetypes)
├── docs/                   Architecture notes, ADRs, and THIS audit
├── package.json            Vite + tsx; scripts: dev, build, smoke, gen:atlas
├── tsconfig.json           Strict TS; includes src/{game,engine,graphics}, main.ts
├── vite.config.ts          Dev server config (Replit hosts allowlist)
└── .replit                 Replit runtime (Node 20 + Python 3.11)
```

Plus repository-debt artifacts at the root (`package_old.json`, `_dump_*.ts`,
`_patch/`, empty `tsx` and `smoke:damage` files) — see `07_technical_debt.md`.

## `src/` architecture

The code is layered. Lower layers know nothing about higher ones.

```
src/
├── index.ts / main.ts        Boot: DOM/canvas setup, RAF frame loop, HUD, hotkeys
│
├── engine/                   GENERIC, GAME-AGNOSTIC DETERMINISTIC CORE  (cleanest code)
│   ├── core/                 Loop (8-phase fixed 60Hz), EventBus (phase ownership),
│   │                         Time, events, EventOwnershipMap, aim, dev
│   ├── ecs/                  EntityStore (slab + generations), EntityRef, ComponentTypes
│   ├── input/                InputManager (kbd+pointer→PlayerActions), ActionSchema,
│   │                         InputTape (replay iface, unused), InputBindings, DisplayContract
│   └── math/                 Vec2
│
├── game/                     GAMEPLAY built on the engine
│   ├── boot/createGame.ts    Composition root: wires every system into the Loop
│   ├── systems/              Director, Spawn, Weapon, Projectile, Collision, Damage,
│   │                         Impact, Player, Enemy, Flow, Score, Loot, Pickup, Powerup,
│   │                         Respawn, WorldScroll, Cleanup, GameOver (+ many *.smoke.ts)
│   ├── enemies/              Enemy movement: behaviors/ (LIVE rail system),
│   │                         ai/ + controller/ (DEAD chase-AI skeleton)
│   ├── defs/                 Static defs: EnemyDefs, WeaponDB, Weapons, Director*Defs/Types
│   ├── content/              Data: enemyTypes.json, directorWaves.json, behaviorPresets.json
│   │                         (+ loaders CONTENT.ts / loadContent.ts) (+ many .bak)
│   ├── data/                 Mutable runtime state: SessionState, WorldState, InputRuntime
│   ├── entities/             spawnPlayer, PlayerTypes
│   ├── impact/               CAImpactSystem (cellular-automata stub)
│   ├── vfx/                  VFXSystem (cosmetic particles: muzzle/tracer/hit)
│   └── render/RenderSystem   Canvas2D debug renderer (DORMANT, superseded by WebGL)
│
├── render/                   WEBGL SCENE RENDERING (the visible game)
│   ├── webgl/                WebGLSceneRenderer (main, ~1000 lines) + bg/ procedural bgs
│   │                         (DemosceneBg shaders, FlowRibbonBg, FlowSegmentsBg, presets)
│   ├── sprites/              Sprite atlas pipeline (Program/System/Atlas/Texture/Types)
│   └── glyphs/               GlyphDB (hardcoded vector "bitmap" glyphs) + GlyphTypes
│
├── graphics/                 WEBGL CONTEXT + PRESENT pipeline
│   │                         Graphics (RTs, letterbox), gl, RenderTarget, PresentPass,
│   │                         BlitProgram, DisplayRenderer (unused)
│
├── ui/                       DevUI (disabled), DevHotkeys, BgLabUI (BG tuning), HUDArcade
├── debug/                    BootTrace (orphaned), GlobalDebug (window.__CM helper)
├── smoke/                    Node smoke-test harness (runSmokes, assert, nodeStub, probes)
└── types/ + env.d.ts         Ambient types
```

## How the layers relate (dependency direction)

```
                 index.ts → main.ts ──────────────────────────────┐
                    │                                              │ (per RAF frame)
                    ▼                                              ▼
        game/boot/createGame.ts                       graphics/Graphics ⇄ render/webgl/
        (composition root)                            WebGLSceneRenderer (reads EntityStore)
                    │                                              ▲
   wires systems ───┼──────────────► engine/core/Loop             │ reads
                    │                 (8-phase 60Hz tick)          │
                    ▼                       │                      │
        game/systems/* ── emit/drain ──► engine/core/EventBus      │
                    │                                              │
                    ▼                                              │
        engine/ecs/EntityStore  ◄───────────────────────────────── (entities)
                    ▲
        game/defs + game/content (static data + JSON)
```

Key relationships:
- **`createGame.ts` is the composition root.** It instantiates the EventBus,
  EntityStore, all systems, the player entity, and assembles the `Loop` with one
  callback per phase. Everything is wired here.
- **Simulation is decoupled from rendering.** Systems mutate the `EntityStore`
  and `WorldState`; the `WebGLSceneRenderer` only *reads* them each frame and
  interpolates positions with the loop's `alpha`. Sim runs at fixed 60 Hz;
  render runs per animation frame.
- **Systems never call each other directly across phases** — they communicate by
  emitting typed events on the EventBus, which are drained by the owning phase.
- **`graphics/` vs `render/`:** `graphics/` owns the WebGL context, render
  targets, and the final present/letterbox blit; `render/` owns *what* is drawn
  into the scene (entities, glyphs, sprites, procedural backgrounds).

## Architecture overview (one paragraph)

A fixed-timestep deterministic simulation (`engine`) drives a data-oriented
entity store; gameplay systems (`game/systems`) are pure phase handlers that talk
only through an ownership-checked event bus; content (`game/content`, JSON) feeds
a Director that schedules waves and emits spawn events; a WebGL renderer
(`render` + `graphics`) reads the simulation state once per animation frame and
draws procedural-vector and sprite entities over a procedural shader/flow
background. The design intent (see `docs/architecture/CM_Architecture_v3.1.md`
and `ADR_0001`) is **determinism and a mode-locked render pipeline**, with replay
hooks scaffolded but not yet wired.

See the per-system documents (01–08) for detail.
