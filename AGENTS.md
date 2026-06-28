AGENTS.md — Captain Meow Engineering Playbook

1. Purpose

This file defines the operating rules for AI coding agents working in the Captain Meow / MGoD repository.

Its goals are to:

* protect existing work,
* preserve gameplay behavior and determinism,
* prevent accidental architectural drift,
* keep changes small and reviewable,
* standardize inspection, implementation, validation, commits, and pull requests,
* distinguish current architecture from legacy exceptions,
* support autonomous multi-step implementation sessions without sacrificing repository safety.

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

If the conflict affects:

* branch origin,
* architectural ownership,
* public/runtime contracts,
* user-owned changes,
* task scope,

stop implementation and report the ambiguity before modifying files.

⸻

3. Core workflow principle

One Codex session should produce one focused implementation unit.

A focused implementation unit should normally contain:

* one clearly defined goal,
* one bounded area of change,
* one coherent implementation,
* one validation pass,
* one focused diff review,
* one focused commit,
* one pull request or prepared pull-request handoff.

A focused implementation session may include:

* repository inspection,
* local design reasoning,
* implementation,
* targeted tests,
* validation,
* final diff review,
* corrective work discovered during validation,

provided all of those steps serve the same original task.

Do not combine unrelated:

* gameplay changes,
* renderer changes,
* UI changes,
* asset changes,
* cleanup,
* architectural refactors,
* balance tuning,
* documentation rewrites.

Separate standalone architecture audits, broad design exercises, unrelated cleanup, and speculative follow-up refactors into their own tasks unless the task explicitly combines them.

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

The repository uses four branch levels:

* main — protected long-term vault branch.
* work — current integrated state of the developing project.
* X — one thematic working branch created from work.
* Y — one short-lived Codex task branch created from X.

Expected flow:

Y → pull request → X
X → manual merge → work
work → manual milestone merge → main

The maintainer controls the higher-level integrations:

X → work
work → main

Ordinary Codex implementation work must remain on Y.

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
* inspect runtime movement ownership,
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

* emit events only through supported EventBus APIs,
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

Current use of Math.random() in the composition root and some systems is a known legacy limitation, not a preferred pattern.

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

For enemy appearance, the canonical path is nested under:

render.sprite.animation

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

The full smoke runner currently has a known failure involving:

BombExplosionChain.smoke.ts
DamageSystem.rules.onExplosion

Until repaired:

* run the smoke suite when required,
* report the existing failure accurately,
* do not claim the suite passed,
* distinguish the pre-existing failure from patch-introduced failures,
* run narrower relevant smoke tests where possible,
* do not automatically repair this failure during unrelated tasks.

When this failure is fixed, remove this exception from AGENTS.md.

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

* do not develop directly on main,
* do not create ordinary Codex task branches from main,
* do not target main with a Codex task pull request,
* do not merge into main,
* only the maintainer performs deliberate milestone merges from work into main.

Unless explicitly instructed otherwise, Codex must treat main as read-only.

work

work represents the current integrated state of the developing project.

Rules:

* do not perform ordinary Codex implementation directly on work,
* do not create task pull requests from Y directly into work,
* completed thematic branches X are merged into work manually by the maintainer,
* Codex may inspect work when establishing the origin or freshness of a thematic branch,
* Codex must not modify work unless explicitly instructed.

Thematic branch X

X is the working branch for one larger thematic area.

Examples:

feature/enemy-fsm
feature/sprite-layer
feature/explosion-system

Rules:

* X should originate from the current work branch,
* Replit uses X for runtime testing, visual inspection, and maintainer adjustments,
* Codex uses X as the base branch for each focused session,
* Codex must not normally implement directly on X,
* each Codex session creates a separate task branch Y from the current verified snapshot of X,
* pull requests from Codex task branches must target X,
* the maintainer manually merges completed thematic branch X into work.

Codex task branch Y

Y is a short-lived branch for one focused Codex session.

Preferred naming:

codex/<short-task-description>

Rules:

* create Y from the verified current snapshot of thematic branch X,
* one Y branch represents one focused task,
* a session may contain inspection, implementation, validation, diff review, and corrections when they serve the same task,
* at the end of the session, create or prepare a pull request from Y into X,
* never target work or main from Y unless explicitly instructed,
* after merge into X, Y may be deleted.

Expected task flow:

current X snapshot
→ create Y from X
→ implement and validate on Y
→ PR Y into X
→ maintainer reviews and merges
→ Replit pulls updated X

⸻

9.2 Codex branch selector

When a Codex session is launched with a thematic branch selected in the Codex UI, that selected branch is the intended thematic branch X for the task.

The selected branch determines the source snapshot from which Codex reads.

However, the isolated checkout may:

* expose the selected snapshot under a synthetic local branch name such as work,
* omit a local branch ref named X,
* omit a normal origin remote,
* omit upstream tracking information.

Therefore:

* do not infer that a local branch named work is the repository’s actual integrated work branch solely from its local name,
* do not reject a valid selected snapshot solely because git switch <X> fails,
* do not require a local ref named X when the session was explicitly launched from X,
* do not invent upstream, fetch, pull, or synchronization state,
* verify the selected snapshot by inspecting its contents, recent commits, required prerequisites, and working-tree state,
* when the task explicitly identifies the selected branch as X and prerequisites match, treat the current clean HEAD as the supplied snapshot of X,
* create task branch Y directly from that verified HEAD,
* report that the local branch name was synthetic when applicable,
* report that remote synchronization could not be independently verified when no remote is available.

The Codex branch selector supplies the snapshot.

The task instructions still must identify:

* thematic branch X,
* task branch Y,
* intended PR base X.

⸻

9.3 Start every session with repository inspection

Run:

git status --short --branch
git log -5 --oneline --decorate
git branch -vv
git remote -v

For branch-sensitive work, also inspect:

git log -12 --oneline --decorate

Before editing, establish:

* current local branch name,
* whether that name is normal or synthetic,
* working-tree state,
* available remotes,
* upstream state when available,
* intended thematic branch X,
* intended task branch Y,
* whether current HEAD is the verified current snapshot of X,
* intended pull-request base.

The intended pull-request base for a normal Codex session is X.

Do not infer the PR base from:

* the GitHub default branch,
* the local branch named work,
* main,
* previously used feature branches.

⸻

9.4 Required branch verification

Before implementation, Codex must verify that:

1. the current task is associated with a named thematic branch X,
2. the current checkout represents the intended current snapshot of X,
3. X or its supplied snapshot contains all previously merged task work required by the task,
4. task branch Y originates from that verified snapshot,
5. the final pull request will target X.

A verified snapshot of X may be:

* a normal local branch named X,
* a remote-tracking branch for X,
* an explicitly identified Codex branch-selector snapshot exposed under a synthetic local branch name.

If X cannot be identified confidently:

* do not target main,
* do not target work,
* do not create speculative branches,
* report the ambiguity before implementation or PR preparation.

When the user explicitly identifies X, that instruction is authoritative unless repository evidence clearly contradicts it.

⸻

9.5 Working-tree safety

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
* report unavoidable overlap,
* stop if safe isolation is not possible.

⸻

9.6 Codex and Replit coordination

Codex and Replit must not write concurrently to the same branch.

Normal ownership:

Codex writes to Y.
Replit works with X.

During an active Codex session:

* Codex is the sole writer to Y,
* Replit may continue using X,
* Replit must not push changes into Y,
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

9.7 Synchronization rules

Before creating task branch Y, verify that the available snapshot reflects the intended state of X.

Normal checkout with remote and local X

Prefer:

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

Isolated Codex checkout

An isolated Codex environment may not expose a normal remote or local branch named X.

In that case:

* do not claim that fetch or pull was performed,
* do not invent upstream information,
* do not reject the snapshot solely because its local branch name differs,
* verify expected prerequisite commits, files, IDs, and behavior,
* work from the explicitly supplied and verified snapshot,
* create Y directly from current clean HEAD,
* clearly report limitations affecting synchronization or PR creation.

⸻

9.8 Commit policy

Default:

one focused task
one focused Codex task branch Y
one focused pull request Y → X

A session should normally create one focused implementation commit.

Additional corrective commits are acceptable when required by:

* targeted tests,
* validation,
* final diff review,
* a concrete defect found during the same task.

Do not amend an already reviewed commit unless explicitly instructed.

Preferred commit prefixes:

feat(scope): description
fix(scope): description
refactor(scope): description
test(scope): description
docs(scope): description
chore(scope): description
tune(scope): description

Do not create:

* empty commits,
* unrelated cleanup commits,
* formatting-only noise mixed with logic,
* speculative follow-up changes,
* commits created only to satisfy process when no patch is needed.

If the requested implementation already exists and no patch is needed, do not create a commit solely to satisfy the workflow.

⸻

9.9 Pull-request policy

For an ordinary Codex task:

head: Y
base: X

Never use these ordinary task routes:

Y → work
Y → main

The maintainer controls the higher-level integrations:

X → work
work → main

Codex must not create, merge, or retarget those higher-level pull requests unless explicitly requested.

A Codex task pull request should contain:

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
* any pre-existing failures,
* any environment limitation affecting remote PR creation.

Do not merge the PR unless explicitly requested.

If the task explicitly says that the maintainer handles PR creation:

* do not push,
* do not create a hosted PR,
* prepare exact manual PR metadata,
* report head, base, title, commits, validation, and branch state.

⸻

10. Required implementation workflow

Every implementation task follows these phases.

Phase 1 — Inspect

Read and inspect:

* repository state,
* relevant definitions,
* producers,
* consumers,
* tests,
* nearby architecture,
* integration boundaries.

Search broadly enough to find all affected contracts.

Exclude *.bak* unless explicitly relevant.

Phase 2 — Establish current behavior

Before editing, determine:

* what currently happens,
* which layer owns the behavior,
* which files form the data path,
* what must remain unchanged,
* whether the requested change already exists,
* whether current behavior contradicts task assumptions.

Do not patch based only on filenames or assumptions.

Phase 3 — Define scope

State internally or in the task report:

* allowed files or layers,
* protected behavior,
* non-goals,
* compatibility requirements,
* validation plan,
* expected observable result.

Phase 4 — Implement

Make the smallest coherent patch that solves the verified problem.

Do not expand scope because adjacent cleanup looks attractive.

Do not introduce unused extension points.

Phase 5 — Validate

Run relevant automated checks.

Perform targeted manual inspection where automation is insufficient.

For visible UI/render changes, perform browser-level verification when the environment allows it.

Phase 6 — Review diff

Run:

git diff --check
git diff --stat
git diff
git status --short

Inspect the complete diff.

Check for:

* unrelated edits,
* generated noise,
* accidental backup edits,
* debug logs,
* stale comments,
* hidden API changes,
* duplicate ownership,
* formatting churn,
* reordered content,
* unexpectedly large JSON diffs,
* unintentional production-content changes.

Phase 7 — Correct within scope

If validation or final diff review finds a concrete defect within the defined task scope:

* identify the causal defect,
* apply the smallest correction,
* preserve task scope,
* rerun relevant validation,
* create an additional corrective commit when appropriate.

Do not stop merely to request permission for a correction that is:

* clearly required,
* within the defined scope,
* architecturally compatible,
* safe for existing work.

Stop and report instead when:

* the correction expands the stated scope,
* the correction changes an architectural contract,
* intended behavior is materially ambiguous,
* unrelated user work may be overwritten,
* the required base snapshot cannot be verified,
* a failing validation path may represent a broader regression,
* the safe correction requires a separate focused task.

Phase 8 — Commit

Commit the focused implementation on task branch Y.

Do not commit directly to:

* X,
* work,
* main

during an ordinary Codex session.

Phase 9 — Pull request or handoff

Create or prepare one pull request:

head: Y
base: X

Follow explicit task instructions regarding:

* push,
* hosted PR creation,
* manual maintainer handoff.

Phase 10 — Report

Report:

* implementation,
* files changed,
* validation,
* commit or commits,
* branch state,
* PR/base branch,
* risks,
* known failures,
* remaining limitations.

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
* comments explaining invariants and reasons,
* observable-invariant tests.

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
* changing gameplay and presentation simultaneously without need,
* tests that only duplicate implementation formulas.

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
* no legacy removal outside the target contract,
* no production-content migration,
* no unrelated formatting cleanup.

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

This is especially important for:

* browser integration,
* renderer changes,
* UI changes,
* module-boundary changes.

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

Also review the complete task diff before commit.

⸻

14.2 Engine core, EventBus, Loop, EntityStore

Run:

npm run typecheck
npm run smoke

Also run the relevant individual smoke test when one exists.

Inspect:

* phase behavior,
* event ownership,
* generation/reference safety,
* cleanup behavior.

⸻

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

⸻

14.4 Enemy behavior, enemy content, and appearance

Run:

npm run typecheck
npm run test
npm run build

Run relevant targeted enemy/content smoke tests directly.

Verify:

* behavior registration,
* preset/content loader acceptance,
* ID cross-references,
* normalized output,
* fallback behavior,
* deterministic re-entry,
* no shared mutable definition objects,
* no direct authoritative position/velocity writes from Behavior V1.

⸻

14.5 Renderer, WebGL, sprite animation

Run:

npm run test
npm run build

Run relevant render smoke tests directly where available.

Because the main typecheck may not cover all renderer roots, do not rely only on npm run typecheck.

For visible changes, perform a browser-level manual check when the environment allows it.

⸻

14.6 UI and developer tools

Run:

npm run build

Run targeted tests where available.

Perform browser-level verification when possible.

Check:

* DOM creation,
* event listener cleanup,
* timer cleanup,
* window.__CM compatibility,
* behavior when developer state is absent,
* mobile/native-control regressions where relevant,
* runtime payload shape.

⸻

14.7 Content-only changes

Run:

npm run typecheck
npm run build

Run targeted content or enemy-definition tests.

Verify:

* every referenced ID,
* no unintended production-content changes,
* no full-file formatting churn,
* ordering preservation where practical.

⸻

14.8 Atlas and assets

Run:

npm run gen:atlas
npm run build

Review generated diff carefully.

Confirm that only intended generated files changed.

⸻

14.9 Documentation-only changes

Run:

git diff --check

Verify paths, symbols, branch names, and claims against current code and repository state.

⸻

15. Handling existing test failures

A pre-existing failure does not automatically block unrelated work.

However, the agent must:

1. run the requested or relevant validation,
2. capture the exact failure,
3. determine whether the patch touched the failing path,
4. distinguish the existing failure from a new regression,
5. run narrower checks when possible,
6. report the limitation honestly.

Never write:

All tests pass

when the full test or smoke command failed.

Never hide failing output by omitting the command from the final report.

A known failure must not become a blanket excuse for ignoring new failures.

If the failure signature changes, treat it as potentially new until verified.

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
* The implementation remains deterministic where required.
* Targeted tests validate observable invariants.

Validation

* Relevant validation was run.
* Results are reported accurately.
* Known existing failures are identified.
* Targeted checks passed where available.
* The complete diff was reviewed.
* Corrective validation was rerun after fixes.

Git

* The task was performed on focused Codex task branch Y.
* Y originated from the intended verified snapshot of thematic branch X.
* The working tree contains only expected task changes.
* A focused commit was created when appropriate.
* Additional corrective commits are limited to the same task.
* Commit messages describe actual changes.
* Pull-request head is Y.
* Pull-request base is X.
* No ordinary Codex task pull request targets work or main.
* Higher-level merges X → work and work → main remain under maintainer control.

Reporting

The final response includes:

* what changed,
* files changed,
* validation commands and results,
* commit or commits,
* branch state,
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

* empty or undefined input,
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

A read-only review must not modify files or create commits.

⸻

23. Required final response format

Implementation task

Use:

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
- optional corrective commit
Branch state
- thematic branch X: <branch>
- Codex task branch Y: <branch>
- local checkout name: <branch or synthetic name>
- working tree: clean / dirty
Pull request
- head: <Y>
- base: <X>
- status: created / prepared / unavailable
- push status: pushed / not pushed / unavailable
Risks / follow-up
- only relevant remaining risks

If the task explicitly requires manual PR handling, include exact:

* source branch,
* target branch,
* recommended PR title,
* expected commits,
* validation limitation.

When no patch is required

Use:

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

Audit-only task

Use:

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

24. Autonomous session policy

For a focused implementation task, Codex should normally complete the full sequence without waiting for confirmation between steps:

inspect
→ establish current behavior
→ define scope
→ create Y
→ implement
→ test
→ review diff
→ correct in-scope defects
→ retest
→ commit
→ prepare PR handoff
→ report

Do not pause merely because:

* multiple repository files are involved,
* one targeted correction is needed,
* a second corrective commit is required,
* a known unrelated smoke failure occurs,
* browser verification is unavailable.

Pause and report only when:

* the base snapshot cannot be verified,
* the working tree contains unsafe unrelated changes,
* the requested behavior is materially ambiguous,
* an architectural contract must change outside the task,
* a required correction exceeds scope,
* validation indicates a possible unrelated regression,
* repository integrity cannot be preserved.

⸻

25. Task-prompt responsibilities

AGENTS.md defines durable repository-wide rules.

Each explicit task prompt should provide only the task-specific information that AGENTS.md cannot know.

A normal implementation task prompt should identify:

* thematic branch X,
* Codex task branch Y,
* whether X was selected in the Codex branch selector,
* concrete objective,
* required prerequisites,
* observable acceptance criteria,
* allowed files or layers,
* protected behavior,
* non-goals,
* task-specific tests,
* push/PR policy,
* recommended commit or PR title when useful.

Do not duplicate the entire playbook inside every task prompt.

Use this standard branch-selector wording when applicable:

This Codex session was launched from thematic branch X in the Codex branch selector.
Treat the selected snapshot as the intended thematic base X.
The isolated checkout may expose it under a synthetic local branch name. Follow the Codex branch-selector and isolated-checkout rules in AGENTS.md.
Create task branch Y from the verified current HEAD.
Do not reject the snapshot solely because the local branch name differs from X.

⸻

26. Playbook maintenance

Keep this file concise enough to be read during every session.

Update it only when a durable project contract changes, such as:

* runtime phase architecture,
* event ownership,
* entity lifecycle,
* source-of-truth ownership,
* branch workflow,
* Codex branch-selector behavior,
* validation scripts,
* Definition of Done,
* manual PR policy.

Do not add:

* one-off feature details,
* temporary task instructions,
* current feature tuning values,
* large architecture explanations better suited to docs,
* historical implementation narratives,
* temporary branch names.

Known temporary failures may be included only when they materially affect every agent’s validation workflow.

When a temporary failure is fixed, remove the exception from this file.
