# 08 – Development History (from the codebase)

Reconstructed strictly from git metadata and code artifacts. Where intent is
inferred, it is marked as such.

## Timeline facts

- **Commits:** 47 on the audited branch.
- **Date range:** 2025-12-30 → 2026-01-23 (~3.5 weeks of active work).
- **Authors:** effectively a single developer (`catsystemexe`, two email
  identities — a GitHub no-reply and a Replit no-reply address).
- **Platform:** developed on **Replit** (`.replit` present: Node 20 + Python
  3.11 modules, `npm run dev`, ports 5173/5174). Mobile/iPad testing is evident
  (eruda console injected in `index.html`, touch handling, "iPad has no console"
  comments).

## Commit arc (oldest → newest)

The messages trace a clear prototype → engine → content progression:

1. **Prototyping (Dec 30):** `Initial commit`, `Faze 2`, `proto`,
   `gem prototype`, `gg` — throwaway experiments.
2. **Look & target resolution:** `graphic sys -neogeo vibe`,
   `neogeo resolution` — established the NeoGeo aesthetic and the fixed logical
   resolution (now 896×504).
3. **Engine core:** `CM Engine core`, `core build`, `mines solving`,
   `Engine v3.1 – all smoke tests green`, `deterministic tick engine`,
   `Combat loop ok` — the deterministic phase loop, EventBus, EntityStore, and
   the smoke-test harness were built here. This is the architectural heart and
   it is the most polished part of the codebase.
4. **Bring-up:** `boot ok`, `basic player`, `running webGL`,
   `enemy endless wave`.
5. **Enemy behavior engine:** a long sequence — `enemy behavior engine`,
   `behavior 2`, `behavior system done`, `behavior patterns`,
   `behavior engine stable`, `sine fixed … behavior engine V1 in progress`,
   `ai behav`. This is where the rail-based behavior system matured (and where
   the parallel, ultimately-unused `ai/` skeleton was sketched).
6. **Game feel & loop:** `enemy kill`, `energy and lives`, `title and game
   over`, `enemy spawn soft cap maxAlive`, `movement glitch fix`.
7. **VFX:** `VFX render pipeline locked`, `vfx muzzle, trackers`,
   `render clean`, `Engine base done`.
8. **Waves/dev tooling:** `test waves`, `preset waves dev`, `resize`.
9. **Side-scroller pivot:** `ship aim rotation`, `projectile … sprite`,
   `sprite enemy and explosion`, `side scrolling basic`,
   `scrolling world rules clean MVP` — the game shifted to a horizontal
   side-scroller with an autoscrolling world and camera-follow.
10. **Vector glyphs:** `glyphs basic`, `vector: add glyph module (baseline)`,
    `stable spawn`.
11. **Latest:** `Add new enemy types and background visual effects` — the
    procedural background systems and the expanded enemy roster (obelisk, sigil,
    crown, orb, mandala, etc.).

## What the history tells us

- **Engine-first discipline.** The deterministic core (Loop, EventBus,
  EntityStore) was built and smoke-tested *before* heavy gameplay. That
  investment shows: the core is the cleanest code in the repo.
- **Heavy iteration on enemies & waves.** Roughly a third of commits and the
  bulk of the `.bak` files concern the Director/Spawn/behavior pipeline. This
  was the hardest part to get stable (soft-caps, spawn edges, comma fixes,
  archetypes).
- **A genre pivot mid-project.** Early work reads like a top-down / "endless
  wave" shooter; later commits ("side scrolling basic", "scrolling world rules")
  convert it into a **horizontal side-scrolling shoot-'em-up**. Some coordinate
  comments (`world_movement_rules_MVP.md`) and the screen-X / world-Y split were
  introduced to support this pivot.
- **A rendering-style pivot too.** It moved from sprite atlases
  (`sprite enemy and explosion`, PNG atlases in `public/assets/sprites/`) toward
  a **procedural vector "glyph"** look (`glyphs basic`, expanded enemy glyph
  definitions). Both pipelines still coexist in the renderer.
- **Solo, fast, save-point-driven workflow.** The timestamped `.bak` files are
  manual checkpoints taken around risky edits — a personal safety net rather
  than a team process. This explains the repo-hygiene debt in `07`.

## Dating the backups

The `.bak` suffixes are Unix epoch seconds, all in the `1768xxxxxx` range =
mid-January 2026, consistent with the latter half of the project (waves, VFX,
procedural background, glyph work). They are checkpoints, not an older codebase.
