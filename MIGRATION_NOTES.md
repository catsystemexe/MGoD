# Migration notes

## Entry point
- src/main.ts

## High-level modules
- src/core: Loop, Config, RNG
- src/input: Input abstraction
- src/render: Camera, Skins, Renderer
- src/ca: CAWorld (cellular automaton)
- src/game/systems: gameplay systems (Particle/Projectile/Director/Enemy/Loot/Snake/Weapons)
- src/ui: HUD
- src/debug: Overlay, Perf
- src/Game.ts: main game orchestrator (new)
- src/old_Game.ts: legacy / reference

## Notes
- Ensure build tool reads src/main.ts as entry.
