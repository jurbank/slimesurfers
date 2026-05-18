# Editor Architecture

Use this with:

- [../../ARCHITECTURE.md](../../ARCHITECTURE.md) for repo-wide ownership boundaries
- [../../packages/simulation/SIMULATION_GUIDE.md](../../packages/simulation/SIMULATION_GUIDE.md) for headless simulation boundaries
- [../../packages/simulation/movement/MOVEMENT.md](../../packages/simulation/movement/MOVEMENT.md) for movement invariants

## What the Editor Does

The editor is a map authoring tool. It lets you shape planets, place rails, set spawns, and tune shaders, then export a validated `RuntimeMapData` that production gameplay loads unchanged.

The preview mode lets you test the current map with real movement before exporting. It is not a full game session — combat, scoring, audio, and HUD are absent.

## Data Models

Two models coexist and must stay separate:

**Editor state** (`src/types.ts`) — rich, tool-friendly. Includes sculpt samples, brush settings, draft rail handles, and anything else the editor needs internally. Never consumed by production gameplay.

**Runtime map data** (`packages/content/map/runtimeMapData.ts`) — plain, serializable, versioned. The only format production gameplay and the preview runtime accept. `editorStateToRuntimeMap` in `src/export.ts` is the single adapter between them. `validateRuntimeMapData` runs validation before preview starts and before a match starts in production.

## Package Ownership

**`packages/simulation`** — deterministic gameplay rules: movement, rail grinding, combat, paint/territory, scoring, respawn, tricks. Must stay independent of Three.js, DOM, React, Colyseus, and editor UI.

**`packages/content`** — shared authored data: `RuntimeMapData` types and defaults, gameplay constants, weapon/mode/rail definitions.

**`packages/client-runtime`** — browser presentation code shared between editor preview and live game: shader/material factories, render geometry builders, `CameraSystem`.

**`packages/protocol`** — transport contracts: input messages, snapshots, match events. Does not decide gameplay behavior.

**`apps/game/client`** — live game presentation: full `InputSystem`, `LocalPlayer` rig, UI, audio, prediction/reconciliation. Things move out of here into `@splat/client-runtime` only when the editor has a concrete second use for them.

**`apps/editor`** — map authoring tools, panels, saved editor state, preview lifecycle, and the `editorStateToRuntimeMap` adapter. May host a local runtime but must not fork gameplay rules.

## Preview Runtime

`src/preview/PlayerPreviewController.ts` is the current preview host. It shares:

- movement via `stepPlayer` from `@splat/simulation/movement/simulatedMovement.ts`
- terrain collision via `TerrainSurfaceProvider` from `@splat/simulation/terrain/planetTerrain.ts`, backed by procedural terrain plus editor sculpt displacement
- camera via `CameraSystem` from `@splat/client-runtime`
- input key bits and movement constants from `@splat/protocol` and `GAME_CONFIG`
- spawn position from the authored `PreviewSpawnState`

It does not yet share:

- **input capture** — editor has its own `keysDown` set, pointer lock, and key-to-bit mapping instead of reusing the shared `InputSystem`; this is the main source of feel divergence
- **rails** — authored `RailState` objects are visual editor constructs, not yet converted into the simulation rail format and passed into `stepPlayer`
- **player presentation** — uses a placeholder capsule/board, not the live `LocalPlayer` rig
- **paint, combat, scoring, audio** — absent

## Architectural Rules

- The editor must not implement alternate movement or physics rules. All gameplay behavior goes through shared simulation packages.
- `TerrainSurfaceProvider` implementations passed to simulation must be plain data/functions — no Three.js geometry or editor tool instances.
- Preview physics and preview visuals must read from the same map source (`RuntimeMapData`).
- Multiplayer authority stays server-owned. Editor preview can simulate locally for map testing but is not a trusted authority.
