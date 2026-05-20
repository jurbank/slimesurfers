# Editor Roadmap

## Ski Park Terrain Authoring

This roadmap describes how to turn planets into terrain-integrated surf, snowboard, and skate park spaces: long embedded slopes, traverses, jumps, rollers, bowls, berms, and half-pipes. The goal is not a snow-only theme. Ski park features should inherit the planet's terrain material and biome colors unless the map author chooses otherwise, closer to 1080-style mountain runs built into the landscape than separate placed ramps.

## Product Direction

- Let authors create readable downhill routes on a spherical planet without leaving the current terrain model.
- Treat slopes and park features as authored terrain features first, not as props or disconnected meshes.
- Keep color and material selection independent from feature type: a slope can be grass, rock, sand, snow, slime-painted terrain, or any later biome.
- Support quick blocking tools for broad mountain runs and precise shaping tools for lips, landings, pipes, banks, bumps, and transfer lines.
- Make preview movement the acceptance test: if a line looks good but does not ride well, the editor should expose why.

## Existing Foundation

The editor already has the pieces needed for a first version:

- `src/types.ts` owns editor-only state, including planet terrain and sculpt samples.
- `src/tools/terrain/*` supports brush sculpting and stamp-based terrain edits.
- `src/tools/rails/*` already samples spline-like paths, raises playable surfaces, and carves tunnels into terrain.
- `src/preview/EditorScene.ts` combines procedural terrain, sculpt displacement, rail carving, and preview movement through a `TerrainSurfaceProvider`.
- `src/export.ts` is the adapter from rich editor state to `RuntimeMapData`.
- `packages/content/map/runtimeMapData.ts` is the runtime map contract consumed by production gameplay.

The main gap is that sculpt samples are editor-local and runtime map data does not yet have a compact, deterministic representation for large authored terrain features.

## Design Principles

- Author features as semantic terrain data: slope corridors, lips, landings, rollers, berms, bowls, and half-pipes should remain inspectable and editable.
- Generate terrain from the same deterministic feature evaluator in editor preview, runtime client, and server simulation.
- Avoid baking large vertex displacement arrays into runtime maps until there is a clear reason.
- Prefer path-based controls for rideable lines: a slope should start as a guided corridor with width, grade, bank, and smoothing controls.
- Preserve the planet feel: features conform to spherical normals and local tangent frames instead of assuming a flat world.
- Keep park visuals terrain-native. Props can decorate, but core ride surfaces come from terrain radius changes.

## Proposed Feature Model

Add a new editor concept tentatively called `TerrainFeature`.

```ts
type TerrainFeatureKind = "slope" | "jump" | "roller" | "berm" | "halfPipe" | "bowl" | "moguls";
```

Each feature should have:

- `id`, `planetId`, `name`, `kind`, `enabled`
- one or more path/control points stored as unit sphere normals plus optional height offsets
- shape controls such as width, length influence, depth/height, bank angle, lip angle, landing length, pipe radius, wall height, and smoothing
- blend controls such as edge falloff, terrain merge strength, and roughness
- optional material hints later, but no hard dependency on snow coloring

Runtime should receive a smaller serializable subset, likely as `terrainFeatures` under each planet or top-level entries referencing `planetId`. The evaluator should return a terrain radius delta or target radius for a normal, similar in spirit to rail carving but generalized and shared.

## Implementation Path

### Phase 1: Shared Terrain Feature Evaluator

- Add runtime-safe feature types in `packages/content/map/runtimeMapData.ts`.
- Add validation for feature ids, planet references, normalized control normals, numeric shape controls, and sane bounds.
- Add pure math terrain feature evaluation in `packages/simulation/terrain`, with no Three.js dependency.
- Support one narrow vertical slice first: a `slope` corridor that can flatten and smooth a path into existing terrain while preserving edge blending.
- Add unit tests for deterministic radius output, edge falloff, malformed data validation, and spherical tangent-frame behavior.

Acceptance target: a runtime map can include one slope feature, and `getTerrainRadius` plus the feature evaluator produce the same playable surface in editor preview and simulation.

### Phase 2: Editor Authoring Tool

- Add `TerrainFeatureState` to `apps/editor/src/types.ts` for editable control handles and panel settings.
- Add a Terrain Features section or panel near Sculpt/Stamps.
- Build a path placement tool that reuses rail editing patterns where practical: point placement on terrain, selected point gizmo movement, width/bank controls, and per-point scalar interpolation.
- Draw feature previews as transparent terrain overlays, not opaque ramp meshes.
- Route editor preview terrain through procedural terrain plus sculpt plus terrain features plus existing rail surface/carve effects.
- Persist feature state in local editor saves.

Acceptance target: an author can draw a broad downhill slope path, adjust width and smoothing, preview ride it, save, reload, and continue editing the same semantic feature.

### Phase 3: Export And Runtime Integration

- Extend `editorStateToRuntimeMap` to export valid terrain features.
- Update runtime map fixtures and `apps/game/server/my-map.json` only after the schema and evaluator are stable.
- Ensure server simulation, editor preview, and live client render all use the same feature-aware terrain provider.
- Add export tests covering skipped invalid features, planet ownership, normals, and shape parameters.
- Add migration/default handling so existing maps with no terrain features continue to load unchanged.

Acceptance target: exported maps ride the same in editor preview and game runtime without requiring editor-only sculpt data.

### Phase 4: Park Feature Library

Add feature kinds once the path/evaluator/export loop is stable:

- `jump`: takeoff lip, landing transition, optional gap marker, and overshoot-safe smoothing.
- `roller`: repeated rounded bumps along a path, good for rhythm sections.
- `berm`: banked turn corridor with controllable inside/outside wall height.
- `halfPipe`: path-based trough with two raised walls and a smoothed deck transition.
- `bowl`: closed or open depression with lip height, wall steepness, and optional carve direction.
- `moguls`: noise-seeded bumps constrained to a feature area, with density and amplitude controls.

Acceptance target: each feature ships with a focused unit test, one editor preview test map, and clear panel controls before adding the next feature.

### Phase 5: Rideability Analysis

- Add optional editor diagnostics for steepness, landing harshness, wall overhangs, water intersections, and path discontinuities.
- Show warnings in the feature panel when a feature exceeds movement-friendly ranges.
- Add preview overlays for grade, launch direction, and likely landing zones.
- Consider a ghost-line sampler that runs the shared movement simulation down a slope from authored start points.

Acceptance target: authors can see why a slope is too slow, too steep, too sharp, or unlikely to land cleanly before exporting.

## UI Notes

- Terrain Features should live with planet-specific terrain tools, not global settings.
- Use icons and compact controls where the existing panel patterns support them.
- Avoid explanatory in-app text; keep labels short and rely on previews.
- Provide feature presets such as Flow Slope, Steep Chute, Tabletop, Roller Set, Berm Turn, Half-Pipe, and Bowl.
- Make feature selection visible in the layer tree so complex parks can be organized and toggled.

## Technical Risks

- Runtime map size can grow if feature data becomes too detailed. Keep features semantic and sampled procedurally.
- Editor sculpt and feature evaluation can drift if both modify terrain in different orders. Define the terrain stack explicitly.
- Simulation must not rely on editor-only Three.js geometry. Terrain feature math belongs in shared pure packages.
- Half-pipes and bowls may create steep normals that stress movement collision and camera behavior.
- Existing rail carving already changes terrain radius. Feature evaluation must compose predictably with rail raise/carve effects.

## Suggested Terrain Stack

Evaluate terrain in this order:

1. procedural planet height
2. runtime terrain features
3. exported or editor-only sculpt displacement, if still needed for preview-only edits
4. rail surface raising and tunnel carving
5. water/decorative rendering decisions

The exact order should be tested before implementation. Terrain features probably need to happen before rails so rails can remain precise on top of authored slopes.

## First Milestone

Build the smallest complete loop:

1. Add `slope` terrain feature data to runtime map types and validation.
2. Implement a pure slope corridor evaluator.
3. Wire editor preview terrain to the evaluator.
4. Add an editor tool for placing and editing a slope path.
5. Export the slope feature and validate it.
6. Add tests for evaluator, export, and runtime map validation.

This milestone should intentionally skip jumps, half-pipes, and fancy material controls until a single embedded rideable slope works end to end.
