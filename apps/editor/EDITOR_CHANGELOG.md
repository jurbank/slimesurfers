# Editor Change Log

Agent-maintained notes for changes that touch `apps/editor`.

## 2026-05-26

- Added blast pad authoring across `src/types.ts`, `src/editorPersistence.ts`, `src/export.ts`, `src/LayerNavigator.tsx`, `src/App.tsx`, `src/preview/PlanetPreview.tsx`, `src/preview/EditorScene.ts`, new `src/panels/BlastPadsPanel.tsx`, and new `src/tools/blastPads/{BlastPadTypes,BlastPadTool,BlastPadPreviewVisuals}.ts`.
- User-visible behavior: each planet in the layer navigator now has a Blast Pads sub-panel; users can click the source planet to place a pad, drag it to move it, click it in delete mode to remove it, pick a destination planet by dropdown or by clicking another planet on the canvas, slide the heading to rotate the launch tangent, aim the tangent at the target with a button, and tune pad radius, launch speed, and upward bias; placed pads render in 3D with a flat platform, an orange direction arrow, and a dashed Bezier arc to the destination landing point, and they round-trip through Publish/Download to `RuntimeMapData.blastPads` (`cameraProfile` fixed to `planetHop`).
- Validation: `vp fmt apps/editor/src/types.ts apps/editor/src/editorPersistence.ts apps/editor/src/export.ts apps/editor/src/export.test.ts apps/editor/src/LayerNavigator.tsx apps/editor/src/App.tsx apps/editor/src/preview/PlanetPreview.tsx apps/editor/src/preview/EditorScene.ts apps/editor/src/panels/BlastPadsPanel.tsx apps/editor/src/tools/blastPads/BlastPadTypes.ts apps/editor/src/tools/blastPads/BlastPadTool.ts apps/editor/src/tools/blastPads/BlastPadPreviewVisuals.ts apps/editor/src/tools/rails/railCarving.test.ts apps/editor/EDITOR_CHANGELOG.md`; `vp check --no-fmt`; `vp test`; editor dev server smoke test on `http://127.0.0.1:2587/` returned HTTP 200.

## 2026-05-21

- Changed `src/preview/PlayerPreviewController.ts` to pass the new blast-pad argument through shared movement simulation.
- User-visible behavior: no editor behavior change; preview movement stays on the shared runtime path after blast pad support was added.
- Validation: `vp check`; `vp test`.

## 2026-05-20

- Added active planet reset in `src/App.tsx` and `src/panels/PlanetPanel.tsx`.
- User-visible behavior: the Planet panel can reset the selected planet to default terrain, colors, atmosphere, lighting, and props while preserving its id and center; rails attached to that planet are cleared and replaced with a fresh default rail.
- Validation: `vp fmt apps/editor/src/App.tsx apps/editor/src/panels/PlanetPanel.tsx apps/editor/EDITOR_CHANGELOG.md`; `vp check --no-fmt`; `vp test apps/editor/src/export.test.ts`.

- Changed editor save/publish workflow in `src/App.tsx` and `vite.config.ts`.
- User-visible behavior: Cmd/Ctrl+S saves the editor state to browser local storage; Publish Map validates the current runtime map and writes it through the editor dev server to `apps/game/server/my-map.json`, while runtime map download remains available separately.
- Validation: `vp fmt apps/editor/src/App.tsx apps/editor/vite.config.ts apps/editor/EDITOR_CHANGELOG.md package.json`; `vp test apps/editor/src/export.test.ts`; `vp test packages/content/map/runtimeMapData.test.ts`; `vp check --no-fmt`; editor dev server smoke test on `http://127.0.0.1:2571` with `curl -X POST /__editor/publish-runtime-map`.

- Changed editor planet rebuild scheduling in `src/App.tsx`.
- User-visible behavior: high-frequency terrain feature edits and terrain sliders no longer force a full high-detail planet mesh rebuild on every input event; the editor updates state immediately and debounces expensive geometry rebuilds to keep high-poly editing more responsive.
- Validation: `vp fmt apps/editor/src/App.tsx`; `vp check --no-fmt`; `vp test apps/editor/src/export.test.ts`; `vp test`.

- Changed runtime map export in `src/export.ts`.
- User-visible behavior: exported maps omit empty terrain feature arrays; maps with authored terrain features still include them.
- Validation: `vp fmt packages/content/map/runtimeMapData.ts packages/content/map/runtimeMapData.test.ts packages/simulation/terrain/planetTerrain.ts apps/game/server/src/rooms/matchRoom.ts apps/game/client/src/scenes/planetRenderer.ts apps/editor/src/export.ts apps/editor/src/export.test.ts apps/editor/EDITOR_CHANGELOG.md apps/game/server/my-map.json`; `vp test packages/content/map/runtimeMapData.test.ts apps/editor/src/export.test.ts packages/simulation/terrain/terrainFeatures.test.ts apps/game/server/src/rooms/matchRoom.test.ts`; `vp check --no-fmt`; `vp exec tsx -e "import { readFileSync } from 'node:fs'; import { validateRuntimeMapData } from './packages/content/map/runtimeMapData.ts'; const map = JSON.parse(readFileSync('apps/game/server/my-map.json', 'utf8')); const result = validateRuntimeMapData(map); console.log(JSON.stringify(result, null, 2)); if (!result.valid) process.exit(1);"`

- Improved jump preview handles in `src/tools/terrain/JumpFeatureTool.ts`.
- User-visible behavior: jump center and direction handles are larger and easier to grab, with expanded invisible pick volumes and pointer capture during drag so jumps can be moved and aimed reliably.
- Validation: `vp fmt apps/editor/src/tools/terrain/JumpFeatureTool.ts`; `vp check --no-fmt`; `vp test apps/editor/src/export.test.ts packages/simulation/terrain/terrainFeatures.test.ts packages/content/map/runtimeMapData.test.ts`.

- Added direct preview editing for jump terrain features in `src/tools/terrain/JumpFeatureTool.ts`, wired through `src/preview/EditorScene.ts`, `src/panels/TerrainPanel.tsx`, and terrain feature tool state typing.
- User-visible behavior: selecting a jump now shows its footprint and direction arrow in the 3D preview; drag the center handle to place it on the terrain and drag the arrow handle to set ramp direction.
- Validation: `vp fmt apps/editor/src/tools/terrain/JumpFeatureTool.ts apps/editor/src/tools/terrain/SlopeFeatureTool.ts apps/editor/src/preview/EditorScene.ts apps/editor/src/panels/TerrainPanel.tsx apps/editor/src/types.ts`; `vp check --no-fmt`; `vp test apps/editor/src/export.test.ts`; `vp test packages/simulation/terrain/terrainFeatures.test.ts`; `vp test packages/content/map/runtimeMapData.test.ts`; `vp test`.

## 2026-05-19

- Added jump/kicker terrain features across editor state, Terrain panel authoring, export, runtime map schema, protocol shape, and terrain evaluation.
- User-visible behavior: Terrain Features now supports Add Jump; jumps can be seeded from the selected slope point and expose width, edge, length, lip height, and smoothing controls for ramp-like park features.
- Validation: `vp fmt packages/content/map/runtimeMapData.ts packages/content/map/runtimeMapData.test.ts packages/protocol/network/serverMessages.ts apps/editor/src/types.ts apps/editor/src/terrainFeatures.ts apps/editor/src/editorPersistence.ts apps/editor/src/panels/TerrainPanel.tsx apps/editor/src/tools/terrain/SlopeFeatureTool.ts apps/editor/src/export.test.ts packages/simulation/terrain/planetTerrain.ts packages/simulation/terrain/terrainFeatures.test.ts`; `vp test packages/simulation/terrain/terrainFeatures.test.ts`; `vp test apps/editor/src/export.test.ts`; `vp test packages/content/map/runtimeMapData.test.ts`; `vp check --no-fmt`; `vp test`; `vp exec tsx -e "import { readFileSync } from 'node:fs'; import { validateRuntimeMapData } from './packages/content/map/runtimeMapData.ts'; const map = JSON.parse(readFileSync('apps/game/server/my-map.json', 'utf8')); const result = validateRuntimeMapData(map); console.log(JSON.stringify(result, null, 2)); if (!result.valid) process.exit(1);"`

- Added slope transition length across editor terrain feature state, export, save normalization, runtime map schema, and terrain evaluation.
- User-visible behavior: slope features now have a Transition slider that fades the feature in at the start and out at the end, reducing abrupt embedded-slope seams on spherical terrain.
- Validation: `vp fmt apps/editor/src/export.test.ts packages/content/map/runtimeMapData.test.ts packages/simulation/terrain/terrainFeatures.test.ts apps/editor/src/panels/TerrainPanel.tsx apps/editor/src/terrainFeatures.ts apps/editor/src/editorPersistence.ts packages/content/map/runtimeMapData.ts packages/protocol/network/serverMessages.ts packages/simulation/terrain/planetTerrain.ts`; `vp test packages/simulation/terrain/terrainFeatures.test.ts`; `vp test apps/editor/src/export.test.ts`; `vp test packages/content/map/runtimeMapData.test.ts`; `vp check --no-fmt`; `vp exec tsx -e "import { readFileSync } from 'node:fs'; import { validateRuntimeMapData } from './packages/content/map/runtimeMapData.ts'; const map = JSON.parse(readFileSync('apps/game/server/my-map.json', 'utf8')); const result = validateRuntimeMapData(map); console.log(JSON.stringify(result, null, 2)); if (!result.valid) process.exit(1);"`

## 2026-05-18

- Changed point override UX in `src/panels/TerrainPanel.tsx` and clamped interpolated slope shape values in `packages/simulation/terrain/planetTerrain.ts`.
- User-visible behavior: slope point rows now show height plus width/edge/bank/smooth override indicators, selected point overrides can be reset to inherit slope defaults, and runtime slope interpolation clamps width, edge, and smoothing after curve interpolation.
- Validation: `vp fmt packages/simulation/terrain/planetTerrain.ts apps/editor/src/panels/TerrainPanel.tsx`; `vp check --no-fmt`; `vp test packages/simulation/terrain/terrainFeatures.test.ts`; `vp test apps/editor/src/export.test.ts`; `vp test packages/content/map/runtimeMapData.test.ts`.

- Added per-point slope shape overrides across runtime map data, editor export, save normalization, terrain evaluation, and Terrain panel controls.
- User-visible behavior: selected slope points can now override width, edge blend, bank, and smoothing independently from slope defaults, enabling narrowing/widening runs and changing bank/smoothing through a slope.
- Validation: `vp fmt packages/content/map/runtimeMapData.ts packages/content/map/runtimeMapData.test.ts packages/protocol/network/serverMessages.ts apps/editor/src/types.ts apps/editor/src/terrainFeatures.ts apps/editor/src/editorPersistence.ts apps/editor/src/panels/TerrainPanel.tsx apps/editor/src/export.test.ts packages/simulation/terrain/planetTerrain.ts packages/simulation/terrain/terrainFeatures.test.ts`; `vp check --no-fmt`; `vp test apps/editor/src/export.test.ts`; `vp test packages/content/map/runtimeMapData.test.ts`; `vp test packages/simulation/terrain/terrainFeatures.test.ts`.

- Changed slope terrain evaluation in `packages/simulation/terrain/planetTerrain.ts`.
- User-visible behavior: multi-point slopes now evaluate against a smoothed curved centerline, reducing hard angular transitions where authored slope segments meet.
- Validation: `vp fmt packages/simulation/terrain/planetTerrain.ts`; `vp check --no-fmt`; `vp test packages/simulation/terrain/terrainFeatures.test.ts`; `vp test packages/content/map/runtimeMapData.test.ts`; `vp test apps/editor/src/export.test.ts`.

- Added slope banking in `packages/content/map/runtimeMapData.ts`, `packages/simulation/terrain/planetTerrain.ts`, and editor Terrain Feature controls.
- User-visible behavior: slope features now have a Bank slider that tilts the generated terrain corridor across its width, useful for snowboard/skate-style turns and berm-like runs.
- Validation: `vp fmt packages/content/map/runtimeMapData.ts packages/content/map/runtimeMapData.test.ts packages/protocol/network/serverMessages.ts apps/editor/src/types.ts apps/editor/src/terrainFeatures.ts apps/editor/src/editorPersistence.ts apps/editor/src/panels/TerrainPanel.tsx apps/editor/src/export.test.ts packages/simulation/terrain/planetTerrain.ts packages/simulation/terrain/terrainFeatures.test.ts`; `vp check --no-fmt`; `vp test packages/simulation/terrain/terrainFeatures.test.ts`; `vp test packages/content/map/runtimeMapData.test.ts`; `vp test apps/editor/src/export.test.ts`.

- Changed slope point controls in `src/panels/TerrainPanel.tsx`.
- User-visible behavior: selected slope points now show their height, can insert a new interpolated point after the selection, and can delete the selected point while preserving the two-point minimum.
- Validation: `vp fmt apps/editor/src/panels/TerrainPanel.tsx`; `vp check --no-fmt`; `vp test apps/editor/src/export.test.ts`.

- Changed `src/tools/terrain/SlopeFeatureTool.ts` slope gizmo behavior.
- User-visible behavior: dragging the selected slope point's local vertical/radial gizmo axis now edits that point's height offset directly; other movement axes continue repositioning the point along the spherical terrain.
- Validation: `vp fmt apps/editor/src/tools/terrain/SlopeFeatureTool.ts`; `vp check --no-fmt`; `vp test apps/editor/src/export.test.ts`; `vp test packages/simulation/terrain/terrainFeatures.test.ts`.

- Added slope path authoring in `src/tools/terrain/SlopeFeatureTool.ts`, with Terrain panel edit modes and point selection wiring through `src/App.tsx`, `src/preview/PlanetPreview.tsx`, and `src/preview/EditorScene.ts`.
- User-visible behavior: slope features can now be edited with Add, Move, and Delete modes on the planet surface, with visible center/edge guides and selectable point handles.
- Validation: `vp fmt apps/editor/src/types.ts apps/editor/src/tools/terrain/SlopeFeatureTool.ts apps/editor/src/preview/EditorScene.ts apps/editor/src/preview/PlanetPreview.tsx apps/editor/src/App.tsx apps/editor/src/panels/TerrainPanel.tsx`; `vp check --no-fmt`; `vp test apps/editor/src/export.test.ts`; `vp test packages/simulation/terrain/terrainFeatures.test.ts`; `vp test packages/content/map/runtimeMapData.test.ts`.

- Added runtime-backed slope terrain features across editor state, terrain controls, map export, and editor preview terrain.
- User-visible behavior: Terrain panel now has a Terrain Features section where authors can add an embedded slope, tune its width, edge blend, smoothing, and start/end heights, then preview and export it as terrain data.
- Validation: `vp fmt packages/content/map/runtimeMapData.ts packages/content/map/runtimeMapData.test.ts packages/simulation/terrain/planetTerrain.ts packages/simulation/terrain/terrainFeatures.test.ts packages/simulation/movement/simulatedMovement.ts packages/simulation/match/matchStateFactory.ts packages/simulation/match/matchSimulation.ts packages/simulation/combat/projectiles.ts packages/simulation/combat/healthPickups.ts packages/simulation/combat/weaponPickups.ts packages/simulation/ai/botController.ts packages/simulation/match/spawnSelection.ts packages/protocol/network/serverMessages.ts apps/game/server/src/rooms/matchRoom.ts apps/game/client/src/scenes/planetRenderer.ts apps/game/client/src/network/runtimeState.ts apps/game/client/src/systems/weaponAimSystem.ts apps/game/client/src/systems/railSystem.ts apps/game/client/src/systems/propSystem.ts apps/editor/src/types.ts apps/editor/src/editorPersistence.ts apps/editor/src/export.ts apps/editor/src/export.test.ts apps/editor/src/App.tsx apps/editor/src/panels/TerrainPanel.tsx apps/editor/src/preview/EditorScene.ts apps/editor/src/preview/PlayerPreviewController.ts apps/editor/src/rendering/planetGeometry.ts apps/editor/src/tools/rails/railCarving.test.ts apps/editor/EDITOR_CHANGELOG.md apps/game/server/my-map.json`; `vp test packages/content/map/runtimeMapData.test.ts`; `vp test packages/simulation/terrain/terrainFeatures.test.ts`; `vp test apps/editor/src/export.test.ts`; `vp test apps/editor/src/tools/rails/railCarving.test.ts`; `vp check --no-fmt`; `vp exec tsx -e "import { readFileSync } from 'node:fs'; import { validateRuntimeMapData } from './packages/content/map/runtimeMapData.ts'; const map = JSON.parse(readFileSync('apps/game/server/my-map.json', 'utf8')); const result = validateRuntimeMapData(map); console.log(JSON.stringify(result, null, 2)); if (!result.valid) process.exit(1);"`

- Added `EDITOR_ROADMAP.md` with a phased implementation plan for terrain-integrated ski slope and ski park authoring.
- User-visible behavior: no app behavior change; this is planning documentation for future editor terrain feature work.
- Validation: not run; documentation-only change.

## 2026-05-11

- Removed the remaining pre-rail save compatibility fields from `src/App.tsx`, removed the legacy export type from `src/tools/rails/RailTypes.ts`, and updated the stale rail floor comment in `src/preview/EditorScene.ts`.
- User-visible behavior: editor local saves are now rail-only; pre-rail local saves no longer migrate into the current editor state.
- Validation: `vp fmt apps/editor/src/App.tsx apps/editor/src/tools/rails/RailTypes.ts apps/editor/src/preview/EditorScene.ts apps/editor/EDITOR_CHANGELOG.md RailCreationRoadmap.md`; `vp test apps/editor/src/tools/rails/railCarving.test.ts`; `vp test apps/editor/src/export.test.ts`; `vp check --no-fmt`.

- Removed broad pre-rail compatibility aliases from `src/tools/rails/RailTypes.ts` and renamed remaining active rail tooling internals in `src/export.ts`, `src/tools/rails/RailTool.ts`, `src/tools/rails/RailPreviewVisuals.ts`, and `src/tools/rails/railCarving.ts`.
- User-visible behavior: newly created rail IDs now use a `rail-*` prefix.
- Validation: `vp fmt apps/editor/src/App.tsx apps/editor/src/export.ts apps/editor/src/tools/rails/RailTypes.ts apps/editor/src/tools/rails/RailTool.ts apps/editor/src/tools/rails/RailPreviewVisuals.ts apps/editor/src/tools/rails/railCarving.ts apps/editor/src/tools/rails/railCarving.test.ts apps/editor/src/export.test.ts apps/editor/EDITOR_CHANGELOG.md RailCreationRoadmap.md`; `vp test apps/editor/src/tools/rails/railCarving.test.ts`; `vp test apps/editor/src/export.test.ts`; `vp test packages/content/map/runtimeMapData.test.ts`; `vp test apps/game/server/src/rooms/matchRoom.test.ts`; `vp exec tsx -e "import { readFileSync } from 'node:fs'; import { validateRuntimeMapData } from './packages/content/map/runtimeMapData.ts'; const map = JSON.parse(readFileSync('apps/game/server/my-map.json', 'utf8')); const result = validateRuntimeMapData(map); console.log(JSON.stringify(result, null, 2)); if (!result.valid) process.exit(1);"`; `vp check --no-fmt`.

- Renamed active rail state and callback locals in `src/App.tsx`, `src/panels/RailsPanel.tsx`, `src/tools/rails/RailPreviewVisuals.ts`, and `src/tools/rails/railCarving.ts`.
- User-visible behavior: no intended behavior change; remaining non-compatibility editor internals now use rail terminology consistently.
- Validation: `vp fmt apps/editor/src/App.tsx apps/editor/src/panels/RailsPanel.tsx apps/editor/src/preview/EditorScene.ts apps/editor/src/preview/PlanetPreview.tsx apps/editor/src/tools/rails/RailPreviewVisuals.ts apps/editor/src/tools/rails/RailTool.ts apps/editor/src/tools/rails/RailTypes.ts apps/editor/src/tools/rails/railCarving.ts apps/editor/src/tools/rails/railCarving.test.ts apps/editor/src/tools/rails/railConstants.ts apps/editor/EDITOR_CHANGELOG.md RailCreationRoadmap.md`; `vp test apps/editor/src/tools/rails/railCarving.test.ts`; `vp test apps/editor/src/export.test.ts`; `vp check --no-fmt`.

- Renamed the rail spline/tooling files from `src/tools/tracks/*` to `src/tools/rails/*`, including `RailTool.ts`, `RailPreviewVisuals.ts`, `RailTypes.ts`, `railCarving.ts`, `railCarving.test.ts`, and `railConstants.ts`.
- User-visible behavior: no intended behavior change; this is an internal naming cleanup after the rail editor/runtime path stabilized.
- Validation: `vp fmt apps/editor/src/App.tsx apps/editor/src/export.ts apps/editor/src/export.test.ts apps/editor/src/panels/RailsPanel.tsx apps/editor/src/preview/PlanetPreview.tsx apps/editor/src/preview/EditorScene.ts apps/editor/src/tools/rails/RailTool.ts apps/editor/src/tools/rails/RailPreviewVisuals.ts apps/editor/src/tools/rails/RailTypes.ts apps/editor/src/tools/rails/railCarving.ts apps/editor/src/tools/rails/railCarving.test.ts apps/editor/src/tools/rails/railConstants.ts apps/editor/EDITOR_CHANGELOG.md RailCreationRoadmap.md`; `vp test apps/editor/src/tools/rails/railCarving.test.ts`; `vp test apps/editor/src/export.test.ts`; `vp check --no-fmt`.

- Renamed the rail authoring panel from `src/panels/TracksPanel.tsx` to `src/panels/RailsPanel.tsx` and updated `src/App.tsx`.
- User-visible behavior: no visual change; this is an internal naming cleanup aligned with the Rails UI.
- Validation: `vp fmt apps/editor/src/App.tsx apps/editor/src/panels/RailsPanel.tsx apps/editor/EDITOR_CHANGELOG.md RailCreationRoadmap.md`; `vp test apps/editor/src/tools/rails/railCarving.test.ts`; `vp test apps/editor/src/export.test.ts`; `vp check --no-fmt`.

- Changed active rail authoring visuals in `src/tools/rails/RailTool.ts`.
- User-visible behavior: rails now look like slim metallic rail tubes with rail-sized support columns while actively editing, not only in the passive editor preview; editable control handles and the selected-point transform gizmo remain available.
- Validation: `vp fmt apps/editor/src/tools/rails/RailTool.ts apps/editor/EDITOR_CHANGELOG.md RailCreationRoadmap.md`; `vp test apps/editor/src/tools/rails/railCarving.test.ts`; `vp test apps/editor/src/export.test.ts`; `vp check --no-fmt`.

- Changed rail preview rendering in `src/tools/rails/RailPreviewVisuals.ts`.
- User-visible behavior: authored rails now render as slim metallic rail tubes with support columns in the editor preview instead of broad track ribbons with cyan edges; tunnel shell preview remains available for carved sections.
- Validation: `vp fmt apps/editor/src/tools/rails/RailPreviewVisuals.ts apps/editor/EDITOR_CHANGELOG.md RailCreationRoadmap.md`; `vp test apps/editor/src/tools/rails/railCarving.test.ts`; `vp test apps/editor/src/export.test.ts`; `vp check --no-fmt`.

- Added rail export coverage in `src/export.test.ts`.
- User-visible behavior: no direct editor UI change; authored rails now have explicit tests for runtime rail export, skipped incomplete rails, skipped unknown-planet rails, corridor radius, control point normals, and height offsets.
- Validation: `vp fmt apps/editor/src/export.test.ts apps/editor/EDITOR_CHANGELOG.md RailCreationRoadmap.md`; `vp test apps/editor/src/export.test.ts`; `vp test packages/content/map/runtimeMapData.test.ts`; `vp check --no-fmt`.

- Changed rail-native editor model aliases and save/export boundaries in `src/tools/rails/RailTypes.ts`, `src/App.tsx`, `src/panels/TracksPanel.tsx`, `src/preview/PlanetPreview.tsx`, and `src/export.ts`.
- User-visible behavior: no direct visual change beyond the Rails labels; new local/editor config saves now use a primary `rails` block while older `tracks` saves still load.
- Validation: `vp fmt apps/editor/src/App.tsx apps/editor/src/panels/TracksPanel.tsx apps/editor/src/tools/rails/RailTypes.ts apps/editor/src/preview/PlanetPreview.tsx apps/editor/src/export.ts apps/editor/EDITOR_CHANGELOG.md RailCreationRoadmap.md`; `vp test apps/editor/src/tools/rails/railCarving.test.ts`; `vp check --no-fmt`. Full `vp check` is still blocked by pre-existing formatting issues in hidden agent skill files and `apps/game/server/my-map.json`.

- Changed rail authoring labels in `src/App.tsx`, `src/panels/TracksPanel.tsx`, and `src/tools/rails/RailTypes.ts`.
- User-visible behavior: the planet layer tree and authoring panel now present the existing spline tool as Rails, and newly created authored paths default to `Rail N` names while old saves remain compatible.
- Validation: `vp fmt apps/editor/src/App.tsx apps/editor/src/panels/TracksPanel.tsx apps/editor/src/tools/rails/RailTypes.ts apps/editor/EDITOR_CHANGELOG.md RailCreationRoadmap.md`; `vp test apps/editor/src/tools/rails/railCarving.test.ts`; `vp check --no-fmt`. Full `vp check` is still blocked by pre-existing formatting issues in hidden agent skill files and `apps/game/server/my-map.json`.

## 2026-05-07

- Changed spawn preview wiring in `src/types.ts`, `src/App.tsx`, `src/panels/SpawnsPanel.tsx`, `src/preview/EditorScene.ts`, `src/preview/PlayerPreviewController.ts`, and `src/export.ts`.
- User-visible behavior: placed preview spawns now remember their planet, export that planet as the dev spawn anchor, and the Spawns panel includes a direct `Preview From Spawn` control.
- Validation: `vp install`; `vp fmt`; `vp check`; `vp test`.

- Changed terrain authoring in `src/types.ts`, `src/App.tsx`, `src/preview/PlanetPreview.tsx`, `src/panels/TerrainPanel.tsx`, `src/preview/EditorScene.ts`, `src/tools/brush/BrushTool.ts`, and new `src/tools/terrain/*` stamp modules.
- User-visible behavior: Terrain now includes a Stamps section with Crater, Ridge, Crevasse, and Mesa tools that commit editable sculpt displacement into the terrain mesh; sculpt/stamp edits persist in local saves and exported editor config; Scene Cost debug notes update with sculpted vertex count and max displacement.
- Validation: `vp fmt`; `vp check`; `vp test`; `vp build`.

## 2026-05-06

- Changed wispy cloud height defaults and controls in `src/types.ts` and `src/panels/ShadersPanel.tsx`.
- User-visible behavior: wispy clouds now default higher above the planet and expose a higher `16` to `90` height range in the Atmosphere panel.
- Validation: `vp fmt`; `vp check`; `vp test`; `vp build`.

- Changed puffy cloud thickness behavior in the shared cloud shader.
- User-visible behavior: puffy cloud Thickness now widens/volumizes cloud sprites without moving cloudlets radially toward the planet surface; Height remains the control for how far clouds sit above terrain and water.
- Validation: `vp fmt`; `vp check`; `vp test`; `vp build`.

- Changed cel shader controls in `src/types.ts`, `src/panels/ShadersPanel.tsx`, `src/preview/EditorScene.ts`, and `src/App.tsx`, with supporting shared runtime cel shader/material wiring.
- User-visible behavior: the Cel Shading section now has the same header toggle style as atmosphere shader sections; disabling it bypasses cel banding and hatching in the editor preview.
- Validation: `vp fmt`; `vp check`; `vp test`; `vp build`.

- Changed puffy cloud sizing controls in `src/panels/ShadersPanel.tsx` with supporting puffy cloud geometry tuning in `packages/client-runtime`.
- User-visible behavior: puffy clouds have a larger minimum size and tighter cloudlet spacing so low-size settings read as connected cloud banks instead of separated dots.
- Validation: `vp fmt`; `vp check`; `vp test`; `vp build`.

- Changed puffy cloud shadow preview wiring in `src/preview/EditorScene.ts`, `src/preview/planetAtmosphereShells.ts`, and `src/panels/ShadersPanel.tsx`, with supporting shared runtime shader/material updates in `packages/client-runtime`.
- User-visible behavior: puffy clouds now visibly drift around the planet and their ground shadows move at the same speed across terrain and water; wispy clouds no longer expose or receive cloud shadow strength.
- Validation: `vp fmt`; `vp check`; `vp test`; `vp build`.

- Changed editor preview scene structure in `src/preview/EditorScene.ts` and `src/preview/planetAtmosphereShells.ts`.
- User-visible behavior: no intended visual change; atmosphere, wispy cloud, and puffy cloud shell creation, sync, disposal, and uniform updates now live outside `EditorScene`.
- Validation: root `vp fmt`; root `vp check`; root `vp test`.

- Changed cloud preview ownership in `src/preview/EditorScene.ts` with supporting shared runtime files in `packages/client-runtime`.
- User-visible behavior: no intended visual change; editor wispy and puffy clouds now use shared client-runtime cloud shader, material, and puffy geometry primitives so the game can reuse the same rendering path.
- Validation: root `vp fmt`; root `vp check`; root `vp test`.

- Changed editor architecture guidance in `EDITOR_ARCHITECTURE.md`.
- User-visible behavior: no app behavior change; the architecture doc now states shared editor/game rendering primitives such as shaders, materials, geometry builders, and visual systems should live in `packages/client-runtime`.
- Validation: `vp check`.

- Changed puffy cloud defaults and controls in `src/types.ts`, `src/panels/ShadersPanel.tsx`, `src/preview/EditorScene.ts`, and `src/App.tsx`.
- User-visible behavior: puffy clouds now start higher above the planet, use a larger default size, and use a wider density scale starting at `10` while preserving older saved default maps through normalization.
- Validation: `vp fmt`; `vp check`; `vp test`.

- Changed puffy cloud preview rendering in `src/preview/EditorScene.ts`.
- User-visible behavior: puffy clouds now render as compound cloud banks made from overlapping lobes, with depth layering, per-cloudlet sizing, lighting, and soft billowed edges instead of a single procedural sphere shell.
- Validation: `vp fmt`; `vp check`; `vp test`.

- Changed atmosphere/cloud authoring in `src/types.ts`, `src/panels/ShadersPanel.tsx`, `src/preview/EditorScene.ts`, `src/App.tsx`, and `src/tools/rails/railCarving.test.ts`.
- User-visible behavior: the Atmosphere panel now includes header checkboxes and blend-mode selectors for the atmosphere shader, wispy clouds, and puffy clouds, plus configurable procedural cloud controls rendered in the live preview; puffy clouds render as a visible billowy shader layer rather than visible ellipsoid meshes.
- Validation: `vp fmt`; `vp check`; `vp test`.

## 2026-05-05

- Added this changelog and repo agent instructions requiring future `apps/editor` edits to update it.
- Validation: not run; documentation-only change.

## 2026-05-05

- Changed editor preview material setup in `apps/editor/src/preview/EditorScene.ts` to pass map-owned colors, lighting, atmosphere, water color, and cel values into shared material factories.
- User-visible behavior: editor preview continues using the same controls, but material initialization now matches runtime map data ownership instead of falling back to global game config defaults.
- Validation: `vp check --no-fmt`; `vp test`.

## 2026-05-05

- Changed editor layout and ownership areas in `src/App.tsx`, `src/panels/PlanetPanel.tsx`, `src/panels/ShadersPanel.tsx`, `src/panels/TracksPanel.tsx`, `src/tools/rails/RailTypes.ts`, `src/tools/rails/railCarving.ts`, `src/preview/EditorScene.ts`, and `src/export.ts`.
- User-visible behavior: the left sidebar now shows a planet/layer tree with global Solar System controls, per-planet Terrain/Props/Tracks/Atmosphere controls, and a `+ Planet` action; tracks are edited and exported under their owning planet.
- Validation: `vp fmt`; `vp check`; `vp test`.

## 2026-05-05

- Changed `src/App.tsx` layer navigation.
- User-visible behavior: planet rows and their Atmosphere groups in the left sidebar can now be expanded and collapsed with chevrons matching the right-side panel pattern.
- Validation: `vp fmt`; `vp check`; `vp test`.
