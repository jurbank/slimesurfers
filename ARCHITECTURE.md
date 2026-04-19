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
- reusable infrastructure where it is natural, without premature engine-building

## Package Responsibilities

### `packages/content`

Owns:

- tunable gameplay values
- network-related tuning values
- mode definitions and authored content

Should not own:

- runtime simulation state
- room lifecycle logic
- rendering logic

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

Should not own:

- Colyseus room lifecycle
- browser rendering or UI logic
- transport-specific orchestration beyond protocol-shaped inputs and outputs

### `apps/game/server`

Owns:

- Colyseus room hosting
- client join/leave handling
- passing inputs into simulation
- publishing authoritative outputs to connected clients

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

## Reuse Boundary

It is good if some infrastructure can be reused in future games, but reuse is not the primary goal.

Good reusable areas:

- simulation primitives
- protocol utilities
- content-loading/config patterns
- netcode support code with clean boundaries

Avoid:

- abstracting game-specific mechanics into generic frameworks too early
- building engine-style extension systems before current needs justify them

## Anti-Patterns

- putting new game rules directly into `MatchRoom`
- mixing protocol/schema definitions with simulation rule code
- coupling rendering code to server-only concepts
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
