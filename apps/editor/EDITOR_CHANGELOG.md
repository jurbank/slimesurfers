# Editor Change Log

Agent-maintained notes for changes that touch `apps/editor`.

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
