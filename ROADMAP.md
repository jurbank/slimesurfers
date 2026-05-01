# Battle Arena Architecture Roadmap

## Direction

The project is currently aiming for:

- server-authoritative online play
- single-player/local play on the same simulation and content path where practical
- territory control as the primary score and win condition
- room-based online matches with future scale across many rooms/processes
- clean package boundaries between `content`, `protocol`, `simulation`, `client`, and `server`
- an editor-to-production content path where authored maps preview and ship through the same runtime map data

This file should track what still needs work, not repeat setup that is already done.

## Current Shape

The repo already has the main package split in place:

- `packages/content` for tunable values and mode definitions
- `packages/protocol` for messages and Colyseus schema types
- `packages/simulation` for simulation state and deterministic systems
- `apps/game/server` for Colyseus room hosting
- `apps/game/client` for rendering, input, and netcode
- `packages/client-runtime` for browser runtime pieces shared by live play and editor preview
- `apps/editor` for map authoring, runtime-map export, and local preview hosting

The current architecture direction is still:

- keep `MatchRoom` focused on room lifecycle and message wiring
- keep game-rule logic in simulation modules
- keep territory ownership authoritative and bounded
- keep protocol concerns separate from simulation concerns

## Status

### Done

- starter scaffolding has been removed
- root project docs now reflect the game project
- package boundaries exist for `content`, `protocol`, and `simulation`
- `MatchSimulation` exists and is already used by the server
- an initial authoritative territory grid exists
- snapshot and reconciliation groundwork exists on the client
- simulation tests exist for core movement and match setup

### In Progress

- reducing how much match-specific logic still lives in `MatchRoom`
- deciding the final split between schema replication and custom snapshot/event messages
- tightening territory/paint ownership so visual stamp history stays secondary to authoritative scoring
- making FFA clean now without blocking future team-based modes
- expanding tests from basic simulation coverage to real architectural safety nets
- shifting from foundation-only work into gameplay feature implementation on top of the current server-authoritative base
- defining the editor runtime map contract so edited planets/scenarios can move into gameplay cleanly

### Not Done Yet

- a fully clean separation where room code is mostly orchestration
- clear rules for which state is schema-driven versus message-driven
- operational visibility for tick cost, replication size, and room pressure
- robust protection against stale input, rate abuse, and overloaded rooms
- enough tests around scoring, respawn, match flow, and protocol compatibility

## Active Priorities

### 1. Finish pulling game rules out of `MatchRoom`

Goal:

- make room code mostly lifecycle, connection, and replication orchestration

Focus:

- move remaining gameplay decisions into simulation systems
- make room-to-simulation inputs and outputs more explicit
- avoid duplicating match truth between schema state and simulation state

Exit criteria:

- room code is mostly wiring
- gameplay rule changes can be made in simulation without editing room lifecycle code
- current status: room lifecycle and replication projection are now separated, but room orchestration can still be tightened further as gameplay features land

### 2. Tighten the authoritative paint and scoring model

Goal:

- keep territory ownership as the source of truth for scoring

Focus:

- make sure paint stamps remain visual/transient where possible
- keep territory state bounded and replication-friendly
- avoid score rules that depend on historical visual data

Exit criteria:

- score is derived from territory ownership
- paint state remains predictable in size and update cost

### 3. Finish the netcode path

Goal:

- make the client feel responsive without compromising server authority

Focus:

- finalize snapshot usage
- keep local prediction and reconciliation reliable
- smooth remote player movement with interpolation
- validate and clamp client input on the server

Exit criteria:

- the local player remains responsive under latency
- remote players move smoothly
- authority remains on the server
- current status: the schema-vs-message boundary is now more explicit in protocol contracts, but the final long-term split still needs to be confirmed through feature work

### 4. Clean up mode and content boundaries

Goal:

- support FFA cleanly and leave room for future team modes

Focus:

- keep mode definitions in content/domain modules
- avoid overloading `teamId` for unrelated purposes
- keep scoring, spawn, and win rules configurable by mode

Exit criteria:

- FFA works as a first-class mode
- adding team modes does not require rewriting core player identity or scoring structures

### 5. Add the missing safety rails

Goal:

- make architecture changes safer and future scale easier to measure

Focus:

- add tests for scoring, respawn, match flow, and protocol compatibility
- add metrics/logging for joins, leaves, tick time, and replication size
- add overload and stale-input protections

Exit criteria:

- `vp test` covers the simulation and match lifecycle that matter
- room capacity and replication behavior are measured instead of guessed
- current status: paint/scoring invariants, respawn timing, broadcast cadence, replication sync, and room join/leave lifecycle now have direct test coverage

### 6. Start building gameplay features again

Goal:

- shift back toward player-facing gameplay now that the current architecture is stable enough to build on

Focus:

- prioritize concrete gameplay additions over broad infrastructure cleanup
- use the current server-authoritative simulation and replication structure as the default path for new features
- only do more plumbing when a feature clearly needs it

Exit criteria:

- new gameplay work is landing regularly
- architecture cleanup happens in support of shipped features instead of replacing them

### 7. Make editor-authored maps production-shaped

Goal:

- make it easy to create a planet/scenario in the editor, preview it, validate it, and load it in gameplay without hand translation

Focus:

- define versioned `RuntimeMapData`
- add validation for planets, terrain, spawns, rails, gameplay props, pickups, objectives, and content version
- export editor state through a deterministic runtime-map adapter
- make local preview initialize from runtime map data instead of editor internals
- keep the local runtime suitable for future single-player rather than editor-only
- keep hosted multiplayer preview as a later step for network-specific testing

Exit criteria:

- a map authored in the editor can be represented as validated runtime map data
- production match loading and editor preview consume the same map contract
- single-player can consume the same map contract without a parallel content path
- preview does not grow editor-only gameplay rules
- future user-created maps have a clear server-validation boundary

## What Not To Do

- do not move new gameplay features directly into `MatchRoom`
- do not treat visual paint stamps as long-term authoritative scoring state
- do not introduce engine-style abstractions without a concrete current need
- do not blur the boundaries between protocol, simulation, and client presentation
- do not let editor preview become a second implementation of movement, combat, paint, scoring, rails, or spawning
- do not build single-player as a separate implementation of match simulation
- do not export editor-only save JSON as if it were production content
- do not assume room scale is safe without measurement

## Near-Term Task Order

1. Define `RuntimeMapData`, validation, and the editor-state-to-runtime-map adapter.
2. Make editor preview initialize from validated runtime map data and shared simulation/client-runtime seams.
3. Start implementing the next concrete gameplay feature on the current server-authoritative foundation.
4. Tighten FFA mode ownership and content boundaries as feature work makes requirements clearer.
5. Continue shrinking remaining mixed responsibility in `MatchRoom` only where gameplay changes expose friction.
6. Confirm the final schema-vs-message split through real feature needs and client/server usage.
7. Add operational visibility and protection around the systems most likely to drift under real match load.
