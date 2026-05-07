# Editor Change Log

Agent-maintained notes for changes that touch `apps/editor`.

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

- Changed atmosphere/cloud authoring in `src/types.ts`, `src/panels/ShadersPanel.tsx`, `src/preview/EditorScene.ts`, `src/App.tsx`, and `src/tools/tracks/trackCarving.test.ts`.
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

- Changed editor layout and ownership areas in `src/App.tsx`, `src/panels/PlanetPanel.tsx`, `src/panels/ShadersPanel.tsx`, `src/panels/TracksPanel.tsx`, `src/tools/tracks/TrackTypes.ts`, `src/tools/tracks/trackCarving.ts`, `src/preview/EditorScene.ts`, and `src/export.ts`.
- User-visible behavior: the left sidebar now shows a planet/layer tree with global Solar System controls, per-planet Terrain/Props/Tracks/Atmosphere controls, and a `+ Planet` action; tracks are edited and exported under their owning planet.
- Validation: `vp fmt`; `vp check`; `vp test`.

## 2026-05-05

- Changed `src/App.tsx` layer navigation.
- User-visible behavior: planet rows and their Atmosphere groups in the left sidebar can now be expanded and collapsed with chevrons matching the right-side panel pattern.
- Validation: `vp fmt`; `vp check`; `vp test`.
