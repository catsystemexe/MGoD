# 10 – Future Potential

Based **only** on evidence in the repository.

## Direction the project appears to be moving toward

- A **horizontal side-scrolling arcade shoot-'em-up** with an autoscrolling
  world and camera-follow (the most recent gameplay commits: "side scrolling
  basic", "scrolling world rules clean MVP").
- A **procedural-vector ("glyph") visual identity** layered over animated
  **procedural backgrounds** (latest commit adds enemy glyph types + background
  visual effects), moving away from the earlier sprite-atlas look.
- An emphasis on a **deterministic, data-driven content pipeline**: waves,
  enemies, behaviors, and weapons are all JSON/registry-defined, tuned live via
  the BG Lab and wave hotkeys.

## Visible strengths (assets to build on)

1. **A genuinely solid deterministic engine.** Fixed-timestep loop, phase-owned
   event bus, generational entity store, two-phase kills, render interpolation —
   all smoke-tested and clean. This is rare in a prototype and is the best reason
   to continue rather than restart.
2. **Excellent procedural background tech** (`DemosceneBg` + two flow systems),
   self-contained and reusable far beyond this game.
3. **A clean content/Director pipeline** — deterministic wave scheduling with
   soft-cap pacing and five placement patterns, fully data-driven.
4. **Deterministic analytic enemy movement** (sine/zigzag/orbit/straight) seeded
   by spawn ordinal.
5. **A standout live-tuning tool** (BgLabUI) and a sensible mobile/Replit
   workflow (eruda console, present-rect-aware input).
6. **Clear architectural intent** captured in `docs/architecture` + an ADR.

## Major blockers / risks

1. **Tip commit likely doesn't render** (`WebGLSceneRenderer.render()`
   regression — see `04`/`07`/`09`). Until confirmed/fixed, "does the game run?"
   is unanswered. **Highest-priority blocker.**
2. **Core gameplay loop is incomplete/unverified end-to-end.** Aiming appears
   visual-only; bombs and pickups are emitted but never spawned. The "game" is
   closer to a **systems demo** than a playable loop until these are wired.
3. **Determinism is not yet real end-to-end** — unseeded `Math.random` and an
   unwired replay tape undercut the project's stated determinism goal.
4. **Repository hygiene debt** (34 `.bak` files, stray/typo files, two competing
   enemy systems, console spam) raises the cost and risk of every future change
   and will confuse future agents.
5. **Test runner under-covers the load-bearing code** — engine and
   collision/projectile smoke tests exist but aren't run.
6. **Single-author, tribal knowledge.** Much intent (CA system, chase-AI, theme,
   replay) lives only in the author's head; comments are partly in Czech and some
   are mojibake. This audit is a first step at externalizing that knowledge.

## A reasonable, evidence-based "what next" (non-binding)

Stated as options for a human/agent, not as a decision:
1. **Stabilize HEAD:** confirm the render regression at runtime; if broken, fix
   the four identifiers (or revert that hunk to `HEAD~1`).
2. **Close the core loop:** decide on and wire real aiming, bombs, and pickups —
   or explicitly cut them — so the game is playable and the demo claims are true.
3. **Repo cleanup phase:** delete `.bak`/stray files, gate logs, resolve the dead
   AI system, fix `DEV_WAVE_KEYS`. (See `07`.)
4. **Make determinism real:** seed RNG; wire `InputTape` into the Loop.
5. **Preserve & isolate the reusable cores** (engine, procedural backgrounds,
   Director) so they survive any future rebuild (see `11`/summary "Reusable
   assets").

These are framed strictly from repository evidence; no product/gameplay decisions
are made here.
