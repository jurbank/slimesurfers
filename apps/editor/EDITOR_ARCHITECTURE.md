# Editor Architecture

This document describes the target architecture for the Slime Surfers editor preview. The goal is to let map authors click Preview and test the edited map with the same gameplay feel as the live game, while keeping gameplay truth in shared simulation packages.

Use this with:

- [../../ARCHITECTURE.md](../../ARCHITECTURE.md) for repo-wide ownership boundaries
- [../../packages/simulation/SIMULATION_GUIDE.md](../../packages/simulation/SIMULATION_GUIDE.md) for headless simulation boundaries
- [../../packages/simulation/movement/MOVEMENT.md](../../packages/simulation/movement/MOVEMENT.md) for movement invariants
- [../../apps/game/client/src/systems/CAMERA.md](../../apps/game/client/src/systems/CAMERA.md) for live camera behavior

## Product Goal

The editor should become the shortest safe path from authored content to playable game content:

1. create or edit a planet/scenario in the editor
2. preview it with near-live gameplay feel
3. export or save a validated runtime map
4. load that same runtime map in production gameplay

The editor may keep rich authoring state, but production gameplay should never depend on editor UI
state. The stable bridge is versioned runtime map data plus shared simulation/client-runtime systems.

## Current State

The editor has a Phase 1 preview mode in `src/preview/PlayerPreviewController.ts`.

It already reuses:

- `@splat/simulation/movement/simulatedMovement.ts` via `stepPlayer`
- shared `InputMessage` key bits from `@splat/protocol`
- shared movement tuning from `GAME_CONFIG`

It does not yet match the live game because the editor preview still owns several live-game behaviors locally:

- input capture and aim-basis handling are duplicated instead of reusing the game client's `InputSystem`
- camera follow is simplified instead of using `CameraSystem`
- player rendering uses a simple editor capsule/board instead of the live `LocalPlayer` rig
- terrain collision reads procedural terrain only, not editor sculpt displacement
- paint state is empty, so slime/surf modifiers cannot match gameplay
- rails/tracks are visual editor objects, not converted into simulation rails for preview
- match systems such as combat, pickups, scoring, tricks, audio, and HUD are absent

This means movement logic was partially brought over, but the preview is not yet a true game-runtime preview.

## Target Principle

Movement, combat, paint, scoring, respawn, rail grinding, and other gameplay rules should be shared across:

- multiplayer server authority
- multiplayer client prediction
- single-player/local game sessions
- editor play preview

The editor should not implement alternate movement or gameplay rules. It should provide authored map data, preview lifecycle controls, editor UI, and adapters that let the shared runtime consume the current editor map.

Games with strong editors usually make preview seamless by running a real game runtime in an editor
host, not by rebuilding gameplay inside editor tools. The editor can add conveniences such as pause,
restart, spawn selection, debug overlays, and hot reload, but the player controller, camera feel,
physics, combat, scoring, and content validation should be the same code paths used by shipping
gameplay wherever practical.

## Ownership

### `packages/simulation`

Owns deterministic gameplay rules:

- player movement and rail grinding
- combat/projectiles
- paint and territory state transitions
- scoring, respawn, pickups, tricks, and match stepping
- plain runtime state types and pure helpers

Simulation must stay independent of Three.js, DOM, React, Colyseus room lifecycle, and editor UI.

### `packages/content`

Owns shared authored/tunable data:

- gameplay constants
- mode definitions
- weapon definitions
- default rail/map definitions
- production-ready `RuntimeMapData` assets and migrations/validation helpers when maps become content

Editor-authored map exports should be able to become content inputs without rewriting gameplay code.

### `packages/protocol`

Owns transport and snapshot contracts:

- input messages
- snapshots
- match events
- schema/message shapes

Protocol should not decide gameplay behavior.

### `apps/game/client`

Currently owns browser runtime presentation:

- input capture
- camera
- rendering
- local prediction/reconciliation wiring
- UI, audio, and effects

Shared client runtime pieces that the editor also needs should migrate out of `apps/game/client` only when there is a concrete second use in the editor.

### `apps/editor`

Owns editor workflow:

- map authoring tools
- panels and saved editor state
- converting current editor state into preview/runtime map data
- preview start/stop lifecycle
- editor-specific overlays and controls

The editor may host a local runtime, but should not fork gameplay rules.

## Editor State Versus Runtime Map Data

Keep two models explicit:

- **Editor state:** rich, tool-friendly, and allowed to include UI-only details such as selected
  points, active panels, brush settings, draft handles, undo metadata, and local save information.
- **Runtime map data:** plain, serializable, versioned data that gameplay can validate and consume
  without the editor.

Runtime map data should include only gameplay and presentation data needed to run or render a map:

- map id, name, version, and compatibility metadata
- planets with ids, centers, radii, terrain params, water levels, and authored displacement data
- spawn points and mode-specific spawn groups
- rails/tracks in a simulation-consumable format or enough data to deterministically build one
- gameplay-relevant props, collision volumes, pickups, objectives, and scenario entities
- initial paint/slime regions, if authored
- rendering hints that are safe for clients but do not affect authoritative gameplay

The editor should have one deterministic adapter from editor state to runtime map data. Production
loading, local preview, hosted preview, and tests should all use that adapter output. If the adapter
cannot express an authored feature, that feature is not ready for production gameplay.

## Validation And Versioning

Runtime maps need validation before preview and before hosted play.

Validate at least:

- every gameplay reference points at a known planet or entity id
- each playable mode has valid spawns
- rails have enough samples/control points to build stable simulation rails
- terrain/displacement data is bounded and deterministic
- props are classified as visual-only or gameplay/collision-relevant
- pickups, objectives, and initial paint regions are inside playable bounds
- map version is supported by the current runtime

Validation should run in the editor before preview starts and in production before a match starts.
For future user-created maps, server-side validation is mandatory; the client/editor export is only
a proposal, not trusted gameplay truth.

## Preview Runtime Direction

The long-term preview should look like a local game session hosted inside the editor.

Instead of a custom `PlayerPreviewController` directly stitching together movement, input, camera, and a placeholder mesh, the editor should instantiate a shared local runtime facade:

```ts
interface LocalGameRuntime {
  start(options: LocalGameRuntimeOptions): void;
  stop(): void;
  update(dt: number): void;
  setMap(map: RuntimeMapData): void;
}
```

That runtime should reuse the same lower-level systems as live play wherever practical:

- movement through `stepPlayer`
- input through shared input intent code
- camera through shared camera follow logic
- local player presentation through shared player rendering code
- map data through a runtime map adapter
- paint/rail/projectile systems through simulation/runtime adapters

The editor should choose whether preview runs in one of two modes:

- **Local Preview:** no network, direct local simulation, fastest feedback for testing maps.
- **Hosted Preview:** start a local server room using the current editor map, useful for multiplayer-specific bugs.

Local Preview should come first. Hosted Preview can be added later if multiplayer testing from the editor becomes necessary.

Single-player should use the same local runtime direction as Local Preview. The durable abstraction
is not "editor preview runtime"; it is a local game runtime that can be hosted by the editor for map
testing, by a future single-player flow for offline play, and by tests for headless validation.

Local Preview should still use production-shaped inputs and outputs:

- `RuntimeMapData` in
- shared input intent in
- local `MatchSimulation` or a simulation facade for authoritative state
- shared camera/player presentation where practical
- preview reset/hot reload around the runtime, not inside gameplay rules

Hosted Preview should use the same runtime map loader as production rooms. It exists to test
network authority, snapshots, prediction/reconciliation, multiplayer spawn pressure, and replication
cost. It should not be required for ordinary map iteration.

## Required Shared Abstractions

### Runtime Map Data

The editor needs a serializable map model that both renderer and simulation can consume.

It should include:

- planet config
- procedural terrain params
- sculpt displacement or authored height overlay
- water level
- spawn points
- rails/tracks
- props/collision objects
- initial paint/slime regions, if authored
- pickups and mode-specific entities

The important rule is that preview physics and preview visuals must read from the same map source.

Near-term owner recommendation:

- define the plain runtime map types in a shared package, preferably `packages/content` if the data
  is content-shaped, or `packages/protocol` only if the exact shape must cross the network as a
  protocol contract
- keep editor-only authoring types in `apps/editor`
- keep computed simulation structures in `packages/simulation`

### Terrain Surface Provider

The current simulation calls procedural terrain helpers directly. That is not enough for edited terrain.

Introduce a simulation-safe terrain provider concept, for example:

```ts
interface TerrainSurfaceProvider {
  getHeight(nx: number, ny: number, nz: number, cfg: TerrainConfig, planetId: string): number;
  getRadius(nx: number, ny: number, nz: number, cfg: TerrainConfig, planetId: string): number;
}
```

Default gameplay can use the procedural provider backed by `GAME_CONFIG`. The editor preview can use a provider backed by procedural terrain plus sculpt displacement. This keeps movement shared while allowing different map sources.

Do not pass Three.js geometry or editor tool instances into simulation.

### Input Intent

The live `InputSystem` has important behavior that the editor preview currently duplicates poorly:

- pointer lock handling
- key edge detection
- persistent local rotation
- parallel transport across curved surfaces
- pitch clamping
- `pressedKeys`
- mobile controls

Extract the reusable parts into a shared browser/client runtime module. The editor can then reuse the same input-to-`InputMessage` path as the live game.

### Camera Runtime

The editor preview camera should use the same camera follow math as the game:

- over-the-shoulder offset
- camera up aligned to planet up
- pitch behavior
- speed FOV
- landing dip
- banking
- spring-arm surface avoidance
- parallax-corrected aim

`CameraSystem` now lives in shared `@splat/client-runtime`. Keep it free of match-scene and
editor-tool dependencies so live play and preview can continue to use the same camera feel.

### Player Presentation

The editor preview should eventually render the same `LocalPlayer` rig as the live game.

This does not affect authoritative gameplay, but it strongly affects perceived feel:

- ski/surf visibility states
- board visibility
- carving squash/stretch
- trick animation
- charge effects
- slime recharge gauge

The editor can start with a placeholder mesh, but parity requires sharing presentation code or a preview-safe wrapper around it.

## Phased Plan

### Phase 0: Runtime Map Contract

Status: needed now.

Before adding more preview features, define the content contract that lets an edited planet become
production gameplay.

Tasks:

- define versioned `RuntimeMapData` and validation result types
- add an editor-state-to-runtime-map adapter
- make Export Config export runtime map data, not only editor config
- add a small fixture map that production gameplay and editor preview can both load
- add tests for required spawns, planet references, terrain bounds, rail references, and version compatibility

Exit criteria:

- a new planet/scenario authored in the editor can be represented as runtime map data
- production loading can reject invalid maps before match start
- preview can be initialized from runtime map data rather than editor internals

### Phase 1: Basic Shared Movement Preview

Status: mostly done.

The editor can toggle preview, spawn a placeholder player, capture basic input, and call `stepPlayer`.

Remaining Phase 1 cleanup:

- make the preview clearly labeled as procedural-terrain-only
- add a reset/respawn control
- avoid further expanding editor-local movement/camera logic
- route preview startup through runtime map validation as soon as Phase 0 exists

### Phase 2: Terrain Truth

Make preview collision match edited terrain.

Status: started. `stepPlayer` accepts an optional simulation-safe terrain provider, and editor
preview supplies a provider backed by procedural terrain plus brush sculpt displacement.

Tasks:

- expose sculpt displacement as map data, not as `BrushTool` internals
- add a terrain provider abstraction to simulation terrain/movement
- make editor preview use an editor-backed terrain provider
- ensure renderer and simulation sample the same authored terrain source
- add focused tests for procedural provider parity and sculpt overlay sampling

This remains a high-priority phase because edited terrain is the core purpose of map preview. It
should build on Phase 0 so terrain edits become runtime map data instead of editor internals.

### Phase 3: Input And Camera Parity

Make preview feel like live play.

Status: started. Camera follow math has moved into shared `@splat/client-runtime`, and the editor
preview now uses that shared camera system.

Tasks:

- extract shared input intent/aim-basis code from `apps/game/client/src/systems/inputSystem.ts`
- reuse the same `pressedKeys`, pitch, and parallel-transport behavior in editor preview
- feed camera-returned parallax-corrected `aimDir` into preview input
- remove editor-specific camera constants from `PlayerPreviewController`

This should fix much of the "does not feel the same" issue.

### Phase 4: Rails, Spawns, And Props

Make authored map features affect preview gameplay.

Tasks:

- add spawn authoring and preview spawn selection
- convert editor `TrackState` into simulation `ComputedRail[]` or a future rail runtime format
- pass runtime rails into `stepPlayer`
- define which props have collision/gameplay relevance
- include gameplay-relevant props in the runtime map adapter

### Phase 5: Paint And Core Match Loop

Preview surf/slime and objective behavior.

Tasks:

- create initial paint state from editor-authored paint/slime data or preview tools
- run local paint/territory simulation state in editor preview
- support projectile paint impacts locally
- add scoring and respawn behavior through shared simulation systems
- keep territory ownership as the scoring source of truth

### Phase 6: Full Local Game Preview

Turn editor preview into a local single-player game session.

Tasks:

- run a local `MatchSimulation` or equivalent local runtime facade
- initialize the local runtime only from validated `RuntimeMapData`
- add bots if useful for combat/objective testing
- use live player rendering, projectiles, pickups, rails, paint, audio, and HUD where practical
- support quick restart after map edits

### Phase 7: Multiplayer Preview

Optional, later.

Tasks:

- launch a local hosted room with the current editor map
- connect one or more clients to that room
- validate network-specific behavior such as snapshots, reconciliation, and authority

This should not be required for normal map iteration.

## Near-Term Recommendation

Do not keep adding features to `PlayerPreviewController` as a mini game client. It was a useful Phase 1 spike, but the next durable move is to create shared runtime seams:

1. versioned `RuntimeMapData` plus validation
2. an editor-state-to-runtime-map adapter
3. `TerrainSurfaceProvider`
4. shared input intent/aim basis
5. shared camera follow

Best course of action:

1. Make the runtime map contract real before adding more preview gameplay.
2. Make editor export/save use that contract.
3. Make preview consume the contract through a local runtime facade.
4. Move only proven shared browser runtime pieces from `apps/game/client` into
   `@splat/client-runtime`.
5. Add hosted preview later, after local preview uses the same map, input, camera, and simulation
   path as production.

After those are in place, editor preview can become a thin host for the same local runtime that future single-player can use.

## Architectural Risks

- **Duplicated movement feel:** caused by editor-specific input, camera, terrain, and presentation code around shared `stepPlayer`.
- **Competing terrain truth:** renderer using sculpted geometry while simulation uses only procedural terrain.
- **Premature engine abstraction:** avoid building a generic editor engine before the map preview path proves exactly what needs sharing.
- **Client authority confusion:** local/editor preview can simulate for testing, but multiplayer authority remains server-owned.
- **Three.js leakage into simulation:** runtime providers passed to simulation must be plain data/functions, not scene objects or geometries.

## Definition Of Done For Real Preview

Editor preview should be considered real only when:

- movement, camera, and input feel match live play
- collision matches the edited map
- authored spawns are used
- authored rails can be tested
- paint/slime state affects movement
- combat/projectiles can interact with terrain and paint
- preview state can reset quickly after map edits
- no gameplay rules are duplicated in editor-only code
