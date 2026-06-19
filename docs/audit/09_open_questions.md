# 09 – Open Questions, Assumptions & Uncertainties

Per the audit mandate, this section states **what could not be determined from
the repository alone** and where claims rest on static reading rather than
runtime observation. Nothing here was guessed into the other docs as fact.

## Must-verify-at-runtime

1. **Does HEAD actually run?** Static analysis says
   `WebGLSceneRenderer.render()` throws a `ReferenceError` (`bgKind`,
   `presetIndex`, `this.bgSegments`, `this.bgFlow` are undeclared — see `04`/`07`).
   This was **not** confirmed by launching the game. *Open:* does the latest
   commit boot to a playable frame, or does it show "FRAME CRASH"? If it crashes,
   `HEAD~1` is the last good render commit. **This is the single most important
   open question.**

2. **Is the player's aim wired into actual shooting?** `WeaponSystem` fires with a
   hardcoded direction `{x:1, y:0}` (the `dirFromAimTarget` line is commented
   out), while `main.ts` computes `playerEnt.aimDir`/`rot` every frame and the
   renderer rotates the ship sprite to match. *Open:* do projectiles travel where
   the player aims, or always straight right while only the ship *visual*
   rotates? Reading suggests **visual-only aim**; needs runtime confirmation.

3. **Are bombs and pickups actually reachable in play?** Upstream systems emit
   `SPAWN_BOMB` (WeaponSystem) and `SPAWN_PICKUP` (LootDropSystem), but both
   handlers in `SpawnSystem` are commented out. Static reading says **bombs and
   pickups never spawn**. Confirm in-game (and confirm the bomb input even fires).

## Determinism / replay

4. **Intended RNG strategy.** The architecture stresses determinism, yet
   `SpawnSystem` and `LootDropSystem` use unseeded `Math.random`, and `InputTape`
   (replay) is defined but never called by the Loop. *Open:* was seeded RNG +
   replay a planned next step, abandoned, or considered out of scope? The docs
   (`CM_Architecture_v3.1.md`) mention "replay scope" but the code doesn't wire it.

## Design intent we can't confirm from code

5. **What is the cellular-automata (CA) system for?** `CAImpactSystem`,
   `PROJECTILE_HIT_CA`, `CA_CELLS_KILLED`, and `applyExplosion` exist as a stub
   returning 0. *Open:* destructible terrain? A Minesweeper-like mechanic (early
   commits say "mines solving")? The repo doesn't say.

6. **Is the chase-AI system a planned feature or abandoned?** `enemies/ai/` +
   `controller/` are complete but dead (no imports, no content uses `ai`). *Open:*
   keep for "enemies chase when shot" or delete? Author intent unknown.

7. **Genre/target.** Commits show a pivot from top-down/endless-wave to a
   **horizontal side-scroller**, and a visual pivot from sprites to vector glyphs.
   *Open:* is the side-scroller the final direction, and is the glyph look final
   (sprites kept as fallback) or transitional?

8. **"Captain Meow" theme.** The name implies a cat protagonist, but the player
   entity is an abstract white "ship" (proc parts) and enemies are geometric
   glyphs (obelisk/sigil/crown/mandala — an occult/sci-fi motif). *Open:* is the
   cat theme aspirational, dropped, or just not yet authored into art?

## Repository / process

9. **Authoritative branch.** Two branches exist with identical content
   (`audit/claude-cm-prototype`, `claude/cool-gates-0rzloq`). This audit was
   written on `audit/claude-cm-prototype` per the task. *Open:* which is the
   long-lived line of development?

10. **Backup-file intent.** The 34 `.bak*` files are clearly manual save-points,
    but a few suffixes (`procfix`, `spawnfix`, `totalcap`, `fixcomma`) suggest
    each captured a specific in-progress fix. *Open:* does any `.bak` contain a
    fix that was never ported forward? A diff pass is advisable before deletion
    (we did **not** diff all 34).

11. **`enemies` LINEAR render target** is allocated in `Graphics` but unused.
    *Open:* leftover, or reserved for a planned glow/blur layer?

## Things this audit did NOT do (scope boundaries)

- Did **not** run the game, the dev server, or the smoke tests.
- Did **not** run `tsc` to enumerate type errors (build uses esbuild, no
  type-check; a `tsc --noEmit` pass would likely surface more issues).
- Did **not** diff every `.bak` against its live file.
- Did **not** profile performance; the rendering performance figures elsewhere
  are estimates, not measurements.
- Did **not** modify, refactor, or fix anything — audit only.
