# Editor Architecture

This document describes the target architecture for the Slime Surfers editor preview. The goal is to let map authors click Preview and test the edited map with the same gameplay feel as the live game, while keeping gameplay truth in shared simulation packages.

Use this with:

- [../../ARCHITECTURE.md](../../ARCHITECTURE.md) for repo-wide ownership boundaries
- [../../packages/simulation/movement/MOVEMENT.md](../../packages/simulation/movement/MOVEMENT.md) for movement invariants
- [../../apps/game/client/src/systems/CAMERA.md](../../apps/game/client/src/systems/CAMERA.md) for live camera behavior

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
- future single-player/local simulation
- editor play preview

The editor should not implement alternate movement or gameplay rules. It should provide authored map data, preview lifecycle controls, editor UI, and adapters that let the shared runtime consume the current editor map.

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

The existing `CameraSystem` is close, but it lives under `apps/game/client`. Once the editor needs it, move it into a shared browser-runtime package or a shared client-runtime module with no match-scene dependencies.

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

### Phase 1: Basic Shared Movement Preview

Status: mostly done.

The editor can toggle preview, spawn a placeholder player, capture basic input, and call `stepPlayer`.

Remaining Phase 1 cleanup:

- make the preview clearly labeled as procedural-terrain-only
- add a reset/respawn control
- avoid further expanding editor-local movement/camera logic

### Phase 2: Terrain Truth

Make preview collision match edited terrain.

Status: started. `stepPlayer` accepts an optional simulation-safe terrain provider, and editor
preview supplies a provider backed by procedural terrain plus brush sculpt displacement.

Tasks:

- define `RuntimeMapData` for current editor map state
- expose sculpt displacement as map data, not as `BrushTool` internals
- add a terrain provider abstraction to simulation terrain/movement
- make editor preview use an editor-backed terrain provider
- ensure renderer and simulation sample the same authored terrain source
- add focused tests for procedural provider parity and sculpt overlay sampling

This is the highest-priority phase because edited terrain is the core purpose of map preview.

### Phase 3: Input And Camera Parity

Make preview feel like live play.

Status: started. Camera follow math has moved into shared `@splat/client-runtime`, and the editor
preview now uses that shared camera system.

Tasks:

- extract shared input intent/aim-basis code from `apps/game/client/src/systems/inputSystem.ts`
- reuse the same `pressedKeys`, pitch, and parallel-transport behavior in editor preview
- extract or share `CameraSystem`
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

1. `RuntimeMapData`
2. `TerrainSurfaceProvider`
3. shared input intent/aim basis
4. shared camera follow

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
