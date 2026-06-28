AGENTS.md — Captain Meow Engineering Playbook

1. Purpose

This file defines the operating rules for AI coding agents working in the Captain Meow / MGoD repository.

Its goals are to:

* protect existing work,
* preserve gameplay behavior and determinism,
* prevent accidental architectural drift,
* keep changes small and reviewable,
* standardize validation, commits, and pull requests,
* distinguish current architecture from legacy exceptions.

This is an operational contract, not a complete architecture specification.

Detailed architecture documents may provide additional context, but current code, runtime contracts, tests, and explicit task instructions must always be verified before editing.

⸻

2. Instruction precedence

When instructions conflict, use this order:

1. Explicit instructions in the current task.
2. Protection of user work and repository integrity.
3. Architectural invariants defined in this file.
4. Current code contracts and active integration behavior.
5. Tests and validation behavior.
6. Current architecture documentation.
7. Local conventions in neighboring code.
8. Historical audits, backup files, and legacy notes.

Never silently resolve a material conflict by guessing.

State the conflict and choose the smallest safe interpretation.

⸻

3. Core workflow principle

One Codex session should produce one focused implementation unit.

A focused implementation unit should normally contain:

* one clearly defined goal,
* one bounded area of change,
* one coherent implementation,
* one validation pass,
* one commit,
* one pull request.

Do not combine unrelated:

* gameplay changes,
* renderer changes,
* UI changes,
* asset changes,
* cleanup,
* architectural refactors,
* balance tuning.

Separate audit, design, implementation, and cleanup tasks unless the task explicitly combines them.

⸻

4. Repository snapshot

Captain Meow is a TypeScript/Vite browser game and deterministic 2D arcade-engine project.

Important current properties:

* TypeScript ESM project.
* Strict TypeScript mode.
* Vite build.
* Fixed-step simulation at 60 Hz.
* Phase-owned EventBus.
* Fixed-size generational EntityStore.
* Data-driven enemy content.
* Browser rendering and audio.
* Node-compatible smoke tests.
* Developer UI exposed through runtime debug integration.

The local integration branch may be named work, but this must be verified at the start of every session.

Do not assume that main, master, or the remote default branch is the correct pull-request base.

⸻

5. Repository map

src/engine

Low-level engine infrastructure.

Responsibilities include:

* fixed-step loop,
* EventBus,
* phase ownership,
* ECS and EntityStore,
* input primitives,
* math helpers,
* low-level FX storage.

Do not place game-specific balance or enemy-content logic here.

src/game

Gameplay domain and composition.

Responsibilities include:

* game bootstrapping,
* world and session state,
* gameplay systems,
* enemy behavior,
* content loading,
* content normalization,
* attacks,
* collisions,
* damage,
* scoring,
* spawn orchestration,
* gameplay VFX triggers.

src/game/content

Canonical content data.

Known content sources include:

* enemyTypes.json,
* behaviorPresets.json,
* behaviorGraphs.json,
* attackProfiles.json,
* directorWaves.json.

Do not introduce parallel hard-coded registries for IDs already owned by content.

src/game/defs

Runtime definitions derived from content.

Examples:

* ENEMY_DEFS,
* appearance types,
* weapon definitions,
* director definitions.

Derived maps are runtime APIs, not primary sources of truth.

src/game/enemies

Enemy behavior and enemy-specific runtime logic.

Responsibilities include:

* primitive behaviors,
* behavior presets,
* behavior contracts,
* attack controller,
* FSM types and runtime.

Behavior V1 implementations must not directly write authoritative entity position or velocity unless the architecture is explicitly changed.

src/game/systems

Phase-connected gameplay systems.

Examples include:

* director,
* spawn,
* player,
* weapon,
* projectile,
* enemy,
* collision,
* damage,
* impact,
* flow,
* scoring,
* respawn,
* pickups.

src/render

Rendering interpretation.

Responsibilities include:

* WebGL rendering,
* sprite selection,
* animation-frame selection,
* glyph rendering,
* SDF rendering,
* procedural rendering.

Rendering may maintain presentation timing and GPU state.

Rendering must not become a gameplay authority.

src/graphics

Display and graphics infrastructure.

Responsibilities may include:

* WebGL presentation,
* framebuffer handling,
* post-processing,
* display scaling.

src/audio

Output-only audio.

Audio must never become a source of gameplay truth.

Browser-only audio imports must not break Node smoke execution.

src/ui and src/dev

Runtime and developer UI.

Examples include:

* HUD,
* developer hotkeys,
* Enemy Lab,
* DevSummoner,
* debug panels.

Developer UI may inspect or trigger supported development controls, but game correctness must not depend on the UI being present.

src/smoke

Smoke-test runner and integration-oriented test utilities.

Smoke tests are excluded from the main TypeScript typecheck unless transitively imported.

assets

Source assets and source metadata.

public/assets

Runtime-delivered assets and generated atlas metadata.

tools

Repository-local generators and build utilities.

docs

Architecture, audits, migration plans, and historical decisions.

Documentation must be checked against current code before being treated as authoritative.

*.bak*

Backup files are not authoritative.

Exclude them from normal searches unless the task explicitly involves historical or forensic comparison.

⸻

6. Sources of truth

Enemy type IDs

Primary source:

src/game/content/enemyTypes.json

Runtime derived access:

CONTENT.enemyTypes
ENEMY_DEFS

Do not manually add a second enemy-type registry.

Behavior preset IDs

Primary source:

src/game/content/behaviorPresets.json

Runtime consumers must resolve presets from the content-derived preset database.

Primitive behavior IDs

The allowed primitive behavior set is defined by the enemy behavior type/runtime contract.

Before adding a new primitive:

* inspect the behavior ID union or registry,
* inspect preset validation,
* inspect all behavior consumers,
* add targeted tests.

FSM graph IDs

Primary source:

src/game/content/behaviorGraphs.json

Enemy type references must be validated against graph keys.

Attack profile IDs

Primary source:

src/game/content/attackProfiles.json

Do not duplicate attack profiles inside enemy definitions or FSM runtime code.

Enemy render appearance

Primary source:

enemyTypes.json → render

Runtime appearance is normalized and materialized through the enemy definition layer.

Enemy sprite ID

Canonical location:

render.sprite.id

Enemy sprite animation

Canonical location:

render.sprite.animation

Expected fields:

id
speed

Do not add new enemy animation ownership to a root animId.

Existing root animId fields are legacy or non-enemy compatibility boundaries unless explicitly migrated.

Atlas metadata

Source metadata and runtime-generated atlas output must remain separate.

Do not hand-edit generated atlas data when the source map and generator own it.

⸻

7. Architectural invariants

7.1 Fixed-step simulation

Gameplay simulation uses a fixed timestep.

The expected simulation rate is 60 Hz.

Gameplay systems must use the provided simulation dt.

Do not base gameplay decisions on:

* render-frame delta,
* performance.now(),
* requestAnimationFrame timestamps,
* DOM refresh intervals,
* audio timing,
* renderer accumulated time.

Presentation layers may use presentation clocks, but those clocks must not affect authoritative gameplay.

⸻

7.2 Runtime phase order

The fixed-tick phase order is:

1. Input
2. Director
3. Simulation
4. Collision
5. Impact
6. Flow
7. Audio
8. Cleanup

Do not change this order during an ordinary feature, bugfix, or refactor task.

Changing phase order is an architectural task and requires:

* a dedicated audit,
* explicit reasoning,
* event-routing analysis,
* lifecycle analysis,
* regression validation.

⸻

7.3 Event ownership

Each event type has exactly one owning phase.

The EventBus ownership map is authoritative.

Rules:

* emit events only through the supported EventBus APIs,
* do not bypass phase ownership with ad hoc queues,
* do not consume events in a non-owning phase,
* do not create duplicate event-routing systems.

Same-tick forward routing is allowed only where EventBus supports it.

Routing back into a phase that already ran is forbidden.

Spawn events

SPAWN_* events must use the supported next-tick route.

Use:

emitNext(...)

Do not use:

emit(...)

for event types that EventBus explicitly requires to be scheduled for the next tick.

⸻

7.4 Spawn authority

The normal authority chain is:

intent producer
→ EventBus spawn event
→ SpawnSystem
→ EntityStore.spawn

Director, player, weapon, FSM, and behavior code should emit spawn intent rather than constructing gameplay entities directly.

Do not introduce new direct-spawn paths outside SpawnSystem unless:

* the task explicitly changes spawn architecture,
* the exception is documented,
* phase and lifecycle consequences are analyzed.

Existing legacy callback boundaries are not examples to copy automatically.

⸻

7.5 Entity lifecycle

EntityStore is a fixed-size generational slot store.

Safe access must respect:

* slot,
* alive state,
* generation.

Normal death/removal is two-stage:

1. mark entity for removal,
2. commit removal during Cleanup.

Use the supported lifecycle path:

markKill(ref)
pendingKill
cleanup()

Do not invalidate entity references during arbitrary iteration.

Do not manually recycle slots.

Do not bypass generation checks.

pendingKill entities may still count as pool pressure until Cleanup.

⸻

7.6 Stable references

The composition root intentionally keeps several references stable.

Examples include:

* session state,
* input runtime,
* input manager,
* EntityStore,
* player entity reference,
* loop reference,
* runtime objects exposed through window.__CM.

Soft reset currently preserves the player slot/reference and resets state in place.

Do not replace stable objects during ordinary cleanup or refactoring unless all consumers are identified and migrated.

⸻

7.7 Gameplay and presentation separation

Gameplay state is authoritative.

Rendering, VFX, and audio are outputs.

A presentation failure must not change:

* collision,
* HP,
* damage,
* score,
* spawn decisions,
* cleanup,
* wave progression.

Rendering may read:

* entity state,
* world state,
* appearance configuration,
* presentation timing.

Rendering must not write authoritative gameplay state.

⸻

7.8 Appearance fallback preservation

Enemy appearance currently supports several paths, including:

* sprite,
* SDF,
* glyph,
* glyph collection,
* procedural rendering,
* fallback appearance.

Do not remove fallback paths during a focused sprite or animation task unless removal is explicitly requested.

Migration work must state:

* canonical format,
* compatibility format,
* fallback behavior,
* removal conditions.

⸻

7.9 Content normalization

Raw JSON content must be validated and normalized at the content or definition boundary.

Runtime gameplay systems should consume normalized definitions rather than repeatedly interpreting raw JSON.

Tolerant parsing is acceptable for explicit compatibility boundaries.

Tolerant parsing must not silently conceal invalid newly required data.

Warnings must be:

* useful,
* bounded,
* outside hot loops where possible.

⸻

7.10 Mutable definition data

Do not assign shared mutable definition objects directly to spawned entities.

Clone or materialize mutable configuration at spawn time.

For enemy appearance, use the existing materialization path.

Avoid hidden cross-entity mutation through shared nested objects.

⸻

7.11 Enemy behavior contract

Behavior V1 should update behavior state and calculate movement targets.

Behavior V1 should not directly write:

entity.pos
entity.vel

Movement application belongs to the owning enemy/system layer.

Changing this contract requires a dedicated architecture task.

⸻

7.12 Browser and Node boundaries

Node smoke tests must not transitively require browser-only modules unnecessarily.

Browser-only concerns include:

* DOM APIs,
* WebGL context access,
* Tone.js output,
* browser event listeners.

Keep browser-only dependencies at output or composition boundaries.

Do not add new try/catch wrappers around imports as a default dependency-management technique.

Prefer:

* explicit environment boundaries,
* dynamic import only where genuinely required,
* dependency injection,
* separate browser adapters.

Existing import guards may be legacy and should not be copied without review.

⸻

7.13 Randomness and determinism

Do not introduce new un-injected gameplay calls to:

Math.random()

Gameplay randomness should be passed through an explicit RNG dependency.

Current use of Math.random in the composition root and some systems is a known legacy limitation, not a preferred pattern.

For new systems, prefer:

type Rng01 = () => number;

or the established repository equivalent.

Random debug logging must not alter simulation behavior.

⸻

8. Legacy exceptions

The following are known current-state exceptions.

They must not be treated as preferred architecture.

Monolithic createGame

createGame.ts currently combines:

* dependency construction,
* system wiring,
* browser integration,
* audio setup,
* developer UI,
* reset behavior,
* debug exposure.

Do not expand this file casually.

Do not perform broad composition-root cleanup as part of an unrelated task.

Extensive any

The codebase contains many any boundaries, especially in:

* composition,
* content adapters,
* ECS integration,
* developer UI,
* smoke tests.

Do not add new any when a practical type exists.

Do not convert an unrelated task into a repository-wide type cleanup.

Legacy animation fields

Root animId still exists in some entity or projectile boundaries.

For enemy appearance, the canonical path is nested under render.sprite.animation.

window.__CM

window.__CM is an active debug and development integration point.

Do not remove or rename it without tracing all developer UI and runtime consumers.

Backup files

Many *.bak* files exist in the source tree.

They are not active implementation sources.

Incomplete typecheck coverage

The main TypeScript configuration does not independently include all of:

* src/render,
* src/audio,
* src/ui,
* src/dev,
* src/smoke,
* smoke files.

A passing npm run typecheck does not prove the entire repository is type-correct.

Existing smoke failure

The full smoke runner currently has a known failure involving BombExplosionChain.smoke.ts and undefined DamageSystem.rules.

Until repaired:

* run the smoke suite,
* report the existing failure accurately,
* do not claim the suite passed,
* distinguish pre-existing failure from patch-introduced failure,
* run narrower relevant smoke tests where possible.

Do not automatically repair this failure during unrelated tasks.

⸻

9. Git and branch workflow

9.1 Branch hierarchy

The repository uses this branch hierarchy:

main
└── work
    └── X — thematic working branch
        └── Y — Codex task branch

main

main is the protected long-term vault branch.

Rules:

* Do not develop directly on main.
* Do not create ordinary Codex task branches from main.
* Do not target main with a Codex task pull request.
* Do not merge into main.
* Only the maintainer performs deliberate milestone merges from work into main.

Unless explicitly instructed otherwise, Codex must treat main as read-only.

work

work represents the current integrated state of the developing project.

Rules:

* Do not perform ordinary Codex implementation directly on work.
* Do not create task pull requests from Y directly into work.
* Completed thematic branches X are merged into work manually by the maintainer.
* Codex may inspect work when establishing the origin or freshness of a thematic branch, but must not modify it unless explicitly instructed.

Thematic branch X

X is the working branch for one larger thematic area.

Examples:

feature/enemy-fsm
feature/sprite-layer
feature/explosion-system

Rules:

* X should originate from the current work branch.
* Replit uses X for runtime testing, visual inspection, and maintainer adjustments.
* Codex uses X as the base branch for each focused session.
* Codex must not normally implement directly on X.
* Each Codex session creates a separate task branch Y from the current state of X.
* Pull requests from Codex task branches must target X.
* The maintainer manually merges the completed thematic branch X into work.

Codex task branch Y

Y is a short-lived branch for one focused Codex session.

Preferred naming:

codex/<short-task-description>

Rules:

* Create Y from the current thematic branch X.
* One Y branch represents one focused task.
* A session may contain inspection, implementation, validation, and corrections, provided they all serve the same task.
* At the end of the session, create or prepare a pull request from Y into X.
* Never target work or main from Y unless explicitly instructed.
* After merge into X, Y may be deleted.

Expected task flow:

current X
→ create Y from X
→ implement and validate on Y
→ PR Y into X
→ maintainer reviews and merges
→ Replit pulls updated X

⸻

9.2 Start every session with repository inspection

Run:

git status --short --branch
git log -5 --oneline --decorate
git branch -vv
git remote -v

For branch-sensitive work, also inspect:

git log -12 --oneline --decorate

Before editing, establish:

* current local branch,
* working-tree state,
* available remotes,
* upstream state,
* current thematic branch X,
* current task branch Y,
* whether Y was created from the latest state of X,
* intended pull-request base.

The intended pull-request base for a normal Codex session is X.

Do not infer the PR base from:

* the GitHub default branch,
* the local branch named work,
* main,
* previously used feature branches.

⸻

9.3 Required branch verification

Before implementation, Codex must verify that:

1. the current task is associated with a named thematic branch X,
2. X contains all previously merged task work required by the task,
3. the task branch Y originates from the current state of X,
4. the final PR will target X.

If X cannot be identified confidently:

* do not target main,
* do not target work,
* report the ambiguity before creating a PR.

When the user explicitly identifies X, that instruction is authoritative.

⸻

9.4 Working-tree safety

Never overwrite unknown or user-owned changes.

Without explicit instruction, do not use:

git reset --hard
git clean -fd
git checkout -- .
git restore .
git stash
git push --force
git push --force-with-lease

Do not delete or rewrite files merely to make the working tree clean.

If unrelated changes already exist:

* identify them,
* avoid modifying them,
* keep the task diff isolated,
* report unavoidable overlap.

⸻

9.5 Codex and Replit coordination

Codex and Replit must not write concurrently to the same branch.

Normal ownership:

Codex writes to Y.
Replit works with X.

During an active Codex session:

* Codex is the sole writer to Y.
* Replit may continue using X.
* Replit must not push changes into Y.
* Replit will not see unmerged Y changes unless the maintainer intentionally checks out Y for temporary testing.

After PR merge Y → X:

* Replit pulls the updated X,
* runtime and visual testing continue on X,
* maintainer corrections may be committed directly to X,
* the next Codex session must create a new Y from the updated X.

If Replit or another tool externally modifies Y during an active Codex session, the session must not automatically reset, rebase, or overwrite the branch.

Codex must first inspect divergence and preserve both sides.

The preferred recovery is a new Codex session from the updated branch state.

⸻

9.6 Synchronization rules

Before creating a task branch from X, verify that local X reflects the intended GitHub state.

Where a normal remote and upstream are available, prefer:

git fetch origin
git switch <X>
git pull --ff-only

Use --ff-only for routine synchronization.

Do not create an implicit merge commit through an ordinary pull.

If fast-forward is not possible:

* stop automatic synchronization,
* inspect divergence,
* do not reset or rebase without explicit instruction,
* report the exact state.

A Codex environment may use an isolated checkout without a normal Git remote.

In that case:

* do not claim that fetch or pull was performed,
* do not invent upstream information,
* work from the provided snapshot,
* clearly report any limitation affecting PR or synchronization.

⸻

9.7 Commit policy

Default:

one focused task
one focused Codex task branch Y
one focused pull request Y → X

A session should normally create one focused commit.

Additional corrective commits are acceptable when required by testing during the same task.

Preferred commit prefixes:

feat(scope): description
fix(scope): description
refactor(scope): description
test(scope): description
docs(scope): description
chore(scope): description

Do not create:

* empty commits,
* unrelated cleanup commits,
* formatting-only noise mixed with logic,
* speculative follow-up changes.

If the requested implementation already exists and no patch is needed, do not create a commit solely to satisfy the workflow.

⸻

9.8 Pull-request policy

For an ordinary Codex task:

head: Y
base: X

Never use these ordinary task routes:

Y → work
Y → main

The maintainer controls the higher-level integrations:

X → work
work → main

Codex must not create, merge, or retarget these higher-level pull requests unless explicitly requested.

A Codex task PR should contain:

## Motivation
## Scope
## Implementation
## Validation
## Risks
## Non-goals

Before presenting or creating a PR, verify and report:

* head branch Y,
* base branch X,
* whether the branch is pushed,
* whether validation was completed,
* any pre-existing failures.

Do not merge the PR unless explicitly requested.

⸻

10. Required implementation workflow

Every implementation task follows these phases.

Phase 1 — Inspect

Read:

* repository state,
* relevant definitions,
* producers,
* consumers,
* tests,
* nearby architecture.

Search broadly enough to find all affected contracts.

Exclude *.bak* unless explicitly relevant.

Phase 2 — Establish current behavior

Before editing, determine:

* what currently happens,
* which layer owns the behavior,
* which files form the data path,
* what must remain unchanged,
* whether the requested change already exists.

Do not patch based only on filenames or assumptions.

Phase 3 — Define scope

State internally or in the task report:

* allowed files or layers,
* protected behavior,
* non-goals,
* compatibility requirements,
* validation plan.

Phase 4 — Implement

Make the smallest coherent patch that solves the verified problem.

Do not expand scope because adjacent cleanup looks attractive.

Phase 5 — Validate

Run relevant automated checks.

Perform targeted manual inspection where automation is insufficient.

Phase 6 — Review diff

Run:

git diff --check
git diff --stat
git diff
git status --short

Check for:

* unrelated edits,
* generated noise,
* accidental backup edits,
* debug logs,
* stale comments,
* hidden API changes,
* duplicate ownership.

Phase 7 — Commit

Create one focused commit when the task is complete and validation is understood.

Phase 8 — Pull request

Create or prepare one PR against the verified integration branch when tooling and remote configuration allow it.

Phase 9 — Report

Report:

* implementation,
* files changed,
* validation,
* commit,
* PR/base branch,
* risks,
* known failures.

⸻

11. Implementation style

Prefer

* small explicit changes,
* simple control flow,
* existing repository patterns,
* typed inputs and outputs,
* dependency injection,
* deterministic behavior,
* pure helpers where useful,
* local ownership,
* explicit fallback order,
* comments explaining invariants and reasons.

Avoid

* speculative frameworks,
* unnecessary registries,
* global mutable state,
* broad rewrites,
* hidden compatibility behavior,
* duplicate sources of truth,
* architecture changes hidden in feature work,
* hot-path debug logging,
* direct browser dependencies in engine code,
* changing gameplay and presentation simultaneously without need.

⸻

12. Scope discipline

Every task should have explicit non-goals.

Examples:

* no gameplay tuning,
* no renderer rewrite,
* no asset migration,
* no naming cleanup,
* no unrelated type cleanup,
* no phase-order change,
* no public API change,
* no legacy removal outside the target contract.

If the smallest correct implementation exceeds the stated scope:

* do not silently expand it,
* explain the dependency,
* implement only the safe portion when possible,
* identify the next focused task.

⸻

13. Validation commands

Available scripts:

npm run dev
npm run build
npm run smoke
npm run gen:atlas
npm run typecheck
npm run test

Their meanings are not interchangeable.

npm run typecheck

Runs:

tsc --noEmit

It does not independently cover the whole repository.

Do not describe it as a full repository typecheck.

npm run test

Currently runs one targeted EnemySpriteSelection smoke test.

Do not describe it as the complete test suite.

npm run smoke

Runs the broader smoke runner.

It currently has at least one known pre-existing failure.

npm run build

Runs the Vite production build.

This is especially important for browser integration, renderer, UI, and module-boundary changes.

npm run gen:atlas

Regenerates atlas metadata.

Run it only when the atlas source map or generator contract changes.

Do not regenerate assets during unrelated work.

⸻

14. Validation matrix

14.1 Always

Run:

git diff --check
git status --short

14.2 Engine core, EventBus, Loop, EntityStore

Run:

npm run typecheck
npm run smoke

Also run the relevant individual smoke test when one exists.

Inspect:

* phase behavior,
* event ownership,
* generation/ref safety,
* cleanup behavior.

14.3 Gameplay systems

Run:

npm run typecheck
npm run smoke

If full smoke fails for a known unrelated reason, run the relevant smoke file directly with tsx when practical.

Verify:

* fixed-step usage,
* spawn routing,
* pending-kill lifecycle,
* event owner phase,
* score/damage separation.

14.4 Enemy content and appearance

Run:

npm run typecheck
npm run test
npm run build

Verify:

* content loader acceptance,
* ID cross-references,
* normalized output,
* fallback behavior,
* no shared mutable definition objects.

14.5 Renderer, WebGL, sprite animation

Run:

npm run test
npm run build

Run relevant render smoke tests directly where available.

Because the main typecheck may not cover all renderer roots, do not rely only on npm run typecheck.

For visible changes, perform a browser-level manual check when the environment allows it.

14.6 UI and developer tools

Run:

npm run build

Perform browser-level verification when possible.

Check:

* DOM creation,
* event listener cleanup,
* timer cleanup,
* window.__CM compatibility,
* behavior when developer state is absent.

14.7 Content-only changes

Run:

npm run typecheck
npm run build

Run targeted content or enemy-definition tests.

Verify every referenced ID.

14.8 Atlas and assets

Run:

npm run gen:atlas
npm run build

Review generated diff carefully.

Confirm that only intended generated files changed.

14.9 Documentation-only changes

Run:

git diff --check

Verify paths, symbols, and claims against current code.

⸻

15. Handling existing test failures

A pre-existing failure does not automatically block unrelated work.

However, the agent must:

1. run the requested/relevant validation,
2. capture the exact failure,
3. determine whether the patch touched the failing path,
4. distinguish existing failure from new regression,
5. run narrower checks when possible,
6. report the limitation honestly.

Never write:

All tests pass

when the full test or smoke command failed.

Never hide failing output by omitting the command from the final report.

⸻

16. Definition of Done

A task is complete only when all applicable conditions are satisfied.

Implementation

* The requested behavior is implemented.
* The change addresses the verified cause or requirement.
* Scope was not expanded without need.
* Non-goals remain untouched.
* No second source of truth was introduced.
* No unsupported direct-spawn path was added.
* No gameplay dependency on presentation timing was added.
* No unrelated backup file was changed.

Architecture

* Phase ownership is preserved.
* Event ownership is preserved.
* Entity lifecycle is preserved.
* Stable references are preserved where required.
* Gameplay and presentation ownership remain separated.
* Canonical content ownership is respected.
* Legacy boundaries are not expanded casually.

Quality

* No unintended debug logging.
* No stale comments contradict the new behavior.
* No unrelated formatting churn.
* New any usage is avoided or justified.
* Mutable definition data is not accidentally shared.
* New browser-only dependencies do not break Node paths.

Validation

* Relevant validation was run.
* Results are reported accurately.
* Known existing failures are identified.
* Targeted checks passed where available.
* The complete diff was reviewed.

Git

* Working tree contains only expected changes.
* One focused commit was created when appropriate.
* Commit message describes the actual change.
* PR base was verified.
* One focused PR was created or prepared when possible.

Reporting

The final response includes:

* what changed,
* files changed,
* validation commands and results,
* commit,
* PR/base branch,
* risks or remaining limitations.

⸻

17. Audit-only tasks

When the user requests audit-only work:

* do not modify files,
* do not generate files inside the repository,
* do not format or clean code,
* do not create commits,
* do not create PRs,
* do not apply fixes.

Audit output must separate:

* verified facts,
* inferred conclusions,
* risks,
* inconsistencies,
* unresolved questions,
* recommended next task.

Support important findings with:

* exact file paths,
* symbols,
* line ranges where practical,
* commands or tests used.

An audit may run read-only validation commands.

Do not run generators or commands expected to rewrite repository files.

⸻

18. Task template — new system

Use this process when adding a new runtime system.

Inspect

Identify:

* owning phase,
* inputs,
* outputs,
* owned state,
* events produced,
* events consumed,
* entity lifecycle effects,
* composition-root wiring,
* deterministic dependencies.

Design

Define the smallest contract.

Avoid designing unused extension points.

Implement

Preferred order:

1. types,
2. isolated system logic,
3. targeted test,
4. composition wiring,
5. integration validation.

Verify

Confirm:

* correct phase,
* correct EventBus route,
* no direct cross-layer ownership violation,
* injected RNG/time dependencies,
* no render/audio authority,
* no duplicate state ownership.

Non-goals

Explicitly state what the new system does not do.

⸻

19. Task template — refactor

A refactor must preserve observable behavior unless the task explicitly includes behavior change.

Before editing

Define the behavior-preservation contract.

Identify:

* all producers,
* all consumers,
* public and runtime types,
* content boundaries,
* legacy fallbacks,
* tests that prove current behavior.

During refactor

* migrate one ownership boundary at a time,
* keep compatibility explicit,
* avoid mixing cleanup with new features,
* remove the old path only after all consumers migrate.

After refactor

Verify:

* output behavior is unchanged,
* fallback order is unchanged unless requested,
* no duplicate path remains unintentionally,
* comments and tests reflect the new ownership.

⸻

20. Task template — bugfix

Reproduce

Show the failing path through:

* a test,
* a smoke test,
* a deterministic code path,
* or a precise runtime trace.

Diagnose

Separate:

* symptom,
* triggering condition,
* root cause,
* affected contract.

Fix

Implement the smallest causal correction.

Do not merely suppress the error unless suppression is the intended behavior.

Regression coverage

Add or update a focused test when practical.

Verify neighboring cases

Check:

* empty/undefined input,
* lifecycle boundaries,
* fallback paths,
* repeated execution,
* next-tick behavior,
* entity reuse.

⸻

21. Task template — audit

An audit should produce:

A. Scope

What was inspected and what was excluded.

B. Verified current state

Facts directly supported by code or commands.

C. Data and control flow

Producers, consumers, ownership, lifecycle.

D. Findings

Classify as:

* correctness issue,
* architectural risk,
* legacy debt,
* test gap,
* documentation mismatch,
* performance risk,
* maintainability concern.

E. Recommended action

Recommend the smallest safe next implementation task.

F. Unknowns

List what could not be verified.

Do not turn an audit into an implementation task.

⸻

22. Task template — code review

Review findings should be ordered by impact:

1. correctness regression,
2. deterministic-simulation violation,
3. phase/event ownership violation,
4. entity lifecycle or reference invalidation,
5. data loss or incompatible content change,
6. gameplay/presentation ownership leak,
7. missing regression coverage,
8. maintainability,
9. style.

Each finding should include:

* affected file or symbol,
* concrete failure mode,
* why it matters,
* suggested correction.

Do not report stylistic preferences as correctness defects.

If no material defect is found, say so clearly and mention remaining test limitations.

⸻

23. Required final response format

Use this structure for implementation tasks:

Implemented
- concise description
Files changed
- path
- path
Validation
- ✅ command — result
- ❌ command — exact failure
- ⚠️ limitation or pre-existing failure
Commit
- <sha> <message>
Pull request
- <PR or prepared base/head information>
Risks / follow-up
- only relevant remaining risks

When no patch is required:

No patch required
Verified
- what was already present
- why it satisfies the task
Validation
- commands and results
Repository state
- branch
- clean/dirty state
- no commit created

For audit-only work:

Audit completed
Scope
- ...
Verified findings
- ...
Risks
- ...
Recommended next task
- ...
Repository state
- no files changed
- no commit
- no PR

⸻

24. Playbook maintenance

Keep this file concise enough to be read during every session.

Update it only when a durable project contract changes, such as:

* runtime phase architecture,
* event ownership,
* entity lifecycle,
* source-of-truth ownership,
* branch workflow,
* validation scripts,
* Definition of Done.

Do not add:

* one-off feature details,
* temporary task instructions,
* current bug descriptions that belong in an issue,
* large architecture explanations better suited to docs,
* historical implementation narratives.

Known temporary failures may be included only when they materially affect every agent’s validation workflow.

When a temporary failure is fixed, remove the exception from this file.
