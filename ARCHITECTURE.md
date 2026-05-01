# Architecture

This document describes the stable architectural boundaries for the project. It is not a task list. If this file changes, it should be because the architecture intentionally changed.

Use this together with:

- [IDEA.MD](./IDEA.MD) for product intent
- [ROADMAP.md](./ROADMAP.md) for active priorities
- [PERIODIC-REVIEW.md](./PERIODIC-REVIEW.md) for review guidance

## Core Principles

- server authority over match state
- territory control as a core scoring loop
- clean separation between `content`, `protocol`, `simulation`, `client`, and `server`
- authored maps and runtime maps share one production path
- reusable infrastructure where it is natural, without premature engine-building

## Package Responsibilities

### `packages/content`

Owns:

- tunable gameplay values
- network-related tuning values
- mode definitions and authored content
- versioned runtime map definitions that are safe for production gameplay

Should not own:

- runtime simulation state
- room lifecycle logic
- rendering logic

Editor-authored maps should graduate into `packages/content` or a content pipeline that produces
the same runtime map format. Avoid one-off editor export shapes that production gameplay cannot
load directly.

### `packages/protocol`

Owns:

- client/server message types
- snapshot and leaderboard payloads
- Colyseus schema types used for replication

Should not own:

- gameplay rules
- simulation update logic
- rendering concerns

### `packages/simulation`

Owns:

- authoritative match domain state
- deterministic tick/update logic
- movement, combat, paint, scoring, respawn, and similar systems
- simulation helpers that can run without room hosting
- simulation-safe map and terrain provider contracts used by server, client prediction, local preview, and tests

Should not own:

- Colyseus room lifecycle
- browser rendering or UI logic
- transport-specific orchestration beyond protocol-shaped inputs and outputs

Simulation may consume plain runtime map data such as planets, terrain parameters, spawn points,
rails, gameplay props, pickups, and initial paint regions. It must not consume editor tool objects,
Three.js geometry, browser events, or Colyseus schema classes as gameplay inputs.

### `packages/client-runtime`

Owns:

- browser runtime systems shared by the live game client and editor preview
- camera follow math, input intent/aim-basis helpers, and similar presentation-adjacent runtime code
- local runtime facades that wire shared input, camera, rendering adapters, and simulation together when those pieces have at least two concrete consumers

Should not own:

- authoritative gameplay rules
- editor authoring state or panels
- server room lifecycle logic

This package is the right place to move code out of `apps/game/client` once the editor needs the
same behavior. Do not move code here only because it might be reusable someday.

### `apps/game/server`

Owns:

- Colyseus room hosting
- client join/leave handling
- passing inputs into simulation
- publishing authoritative outputs to connected clients
- loading production runtime map data for hosted matches

Should not own:

- the bulk of gameplay rule logic
- client presentation logic

### `apps/game/client`

Owns:

- rendering
- input capture
- local prediction, interpolation, and reconciliation
- UI and presentation

Should not own:

- authoritative match decisions
- server-only simulation truth
- editor-only authoring state

### `apps/editor`

Owns:

- map authoring tools and editor workflow
- editor save state and import/export UX
- conversion from editable state into versioned runtime map data
- local preview lifecycle and editor-only overlays

Should not own:

- alternate gameplay rules
- production-only content definitions that bypass validation
- separate movement, combat, paint, scoring, or rail behavior

The editor may host a local game runtime for fast preview. That runtime should use the same
simulation and shared client-runtime systems as the live game wherever practical.

## Authority Model

The server is authoritative for:

- player state that affects gameplay
- match phase and timing
- scoring
- territory ownership
- validation of player input

The client is responsible for:

- capturing local input
- prediction for responsiveness
- reconciliation against server snapshots
- interpolation of remote players
- visual presentation of state and transient effects

The client may predict. The server decides.

Editor local preview is a sandboxed authority for authoring feedback only. It may run local
simulation without a server so iteration is fast, but it does not redefine multiplayer authority.
When editor maps are used in hosted multiplayer, the server loads the runtime map and remains
authoritative.

Single-player is another local host for the same simulation, not a reason to fork gameplay rules.
It may run without network transport, but it should still use validated runtime maps, content mode
definitions, and the same simulation systems as multiplayer. The difference is who hosts the
authority, not which gameplay code decides outcomes.

## Editor-To-Production Content Path

Creating a planet, spawn, rail, prop, pickup, or scenario in the editor should produce data that can
move into gameplay without translation by hand.

Use this path:

1. Editor tools store rich editable state for authoring convenience.
2. A deterministic adapter exports that state to versioned `RuntimeMapData`.
3. Preview, single-player, tests, and production loading consume `RuntimeMapData`.
4. Production-ready maps are checked into content or loaded through the same validated content path.

Rules:

- preview physics, single-player physics, and preview visuals must read from the same runtime map source
- runtime map data is plain, serializable, and versioned
- adapters may derive simulation structures such as computed rails, terrain providers, spawn lists, and initial paint grids
- validation should reject missing spawns, unknown planet ids, invalid rail references, unsupported prop collision, and incompatible content versions before a match starts
- editor-only state such as selected tools, active panels, brush settings, and local camera position must not be required to run gameplay

This keeps the editor useful for internal production now and leaves a path for future user-generated
maps without giving untrusted clients authority over gameplay.

## Replication Model

Use schema replication for:

- persistent shared room state that clients need to observe over time
- compact state that benefits from Colyseus change tracking

Use custom messages for:

- player input
- authoritative snapshots for prediction/reconciliation
- transient events such as leaderboard pushes or similar broadcast events

Rules:

- do not duplicate the same gameplay truth in multiple authoritative forms without a clear reason
- do not let client rendering depend on reading schema state every frame as the final netcode model
- keep protocol contracts explicit

## Gameplay State Rules

- `MatchRoom` should be orchestration, not the game engine
- simulation systems should own gameplay rules
- territory ownership should be the source of truth for scoring
- visual paint stamps should remain secondary to authoritative territory state
- mode-specific rules should live in content/domain modules, not leak across the whole stack
- single-player, editor preview, and multiplayer may use different hosts, but should not duplicate gameplay systems

## Reuse Boundary

It is good if some infrastructure can be reused in future games, but reuse is not the primary goal.

Good reusable areas:

- simulation primitives
- protocol utilities
- content-loading/config patterns
- netcode support code with clean boundaries
- local runtime adapters that already serve live play, single-player, and editor preview

Avoid:

- abstracting game-specific mechanics into generic frameworks too early
- building engine-style extension systems before current needs justify them

## Anti-Patterns

- putting new game rules directly into `MatchRoom`
- mixing protocol/schema definitions with simulation rule code
- coupling rendering code to server-only concepts
- adding gameplay behavior directly to editor preview controllers
- implementing single-player as a separate copy of match rules
- exporting editor-only JSON that production gameplay cannot validate or consume
- scattering tunable values across the repo instead of centralizing them in content/config
- treating visual history as authoritative score state
- adding broad abstractions with only one real use case

## Change Standard

A proposed change is architecturally healthy when it does at least one of these:

- clarifies ownership
- reduces coupling
- preserves or strengthens server authority
- improves testability of simulation and protocol behavior
- makes future modes or scaling easier without adding premature complexity

A proposed change is suspicious when it mainly:

- adds indirection without solving a current boundary problem
- duplicates sources of truth
- moves domain rules into transport or UI layers
- optimizes reuse before the current game loop is stable
