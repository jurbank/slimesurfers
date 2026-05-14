# Rail Creation Tool Roadmap

## Context

The editor inherited an unfinished path authoring workflow with useful spline,
tunnel, bridge, and carving behavior. Runtime gameplay already has a separate
rail system and `rails` data in `RuntimeMapData`.

The goal is to convert the editor path tool into a rail creation tool, preserve
the useful spline and terrain-shaping behavior, and then migrate authored editor
rails into the runtime map data used by the game.

Current important paths:

- `apps/editor/src/tools/rails/*`: editor rail spline, preview, and carving tools
- `apps/editor/src/panels/RailsPanel.tsx`: current editor panel
- `apps/editor/src/export.ts`: current editor-to-runtime map export
- `packages/content/config/railDefs.ts`: current runtime rail definition type and fallback/dev rail data
- `packages/content/map/runtimeMapData.ts`: runtime map schema and validation
- `apps/game/client/src/systems/railSystem.ts`: runtime rail rendering
- `apps/game/server/my-map.json`: checked-in runtime map data loaded by the server

Important current behavior: `editorStateToRuntimeMap` already converts authored
editor rail state into runtime `rails`.

## Phase 1: Reframe The Editor Tool

Goal: the old path authoring UI becomes Rails while preserving the existing spline,
tunnel, bridge, and carving functionality.

Scope:

- Rename user-facing editor copy to Rails.
- Rename the sidebar panel label to `Rails`.
- Rename default authored item names to `Rail 1`.
- Keep internal implementation mostly intact where useful.
- Leave the old file layout as a temporary implementation detail if that keeps
  the first change small.
- Do not preserve the pre-rail editor save shape.

Deliverable:

- Users see and operate a Rail creation/editing tool.
- Current rail-authored editor saves load.
- No runtime schema changes are required in this phase.

Validation:

- `vp test apps/editor/src/tools/rails/railCarving.test.ts`
- `vp check`
- Add an `apps/editor/EDITOR_CHANGELOG.md` entry because this phase changes
  files under `apps/editor`.

## Phase 2: Introduce Canonical Editor Rail Types

Goal: Make the editor model rail-native without breaking old saves.

Scope:

- Add canonical editor rail types:
  - `RailEditMode`
  - `RailPoint`
  - `RailState`
  - `RailToolState`
  - `RailExport`
- Remove compatibility aliases and migration helpers for the pre-rail save shape.
- Decide the fate of each inherited path field:
  - `points`: rail control points
  - `width`: likely maps to runtime `paintCorridorRadius`
  - `bank`: editor-only unless runtime rail physics or visuals need banking
  - `closed`: product decision needed because runtime `RailDef` has no closed-loop field
  - `segmentsPerCurve`: likely editor/rendering/export detail, not runtime data
- Rename files only after the type migration is stable:
  - old tool folder -> `tools/rails`
  - old panel file -> `RailsPanel.tsx`

Deliverable:

- Editor source uses rail terminology for the feature.
- Rail saves load directly without old terminology aliases.
- Editor-only rail shaping fields are clearly separated from runtime rail fields.

Progress:

- Canonical `RailEditMode`, `RailPoint`, `RailState`, `RailToolState`, and
  `RailExport` types now exist.
- Broad legacy aliases have been removed from the rail type module.
- Old save compatibility for the pre-rail block has been removed.
- New editor saves write a primary `rails` block.
- The editor panel file/component has been renamed to `RailsPanel`.
- The editor spline/tooling folder and core files have been renamed from
  the old tool folder to `tools/rails/*`.

Validation:

- Focused editor tests.
- Save/load smoke check.
- Export smoke check.
- `vp check`.

## Phase 3: Tighten Export Semantics

Goal: Make editor-to-runtime rail export explicit and reliable.

Current export behavior:

- Authored rails with at least two points export as runtime `rails`.
- Rail `width` exports as `paintCorridorRadius`.
- Point normals export as runtime rail control point normals.
- Explicit point positions export as `heightOffset`.

Scope:

- Rename export parameters and local variables to `rails`.
- Keep the save/load path rail-only.
- Add tests around rail export behavior:
  - skips rails with fewer than two points
  - skips or rejects rails attached to unknown planets
  - converts explicit point positions to `heightOffset`
  - preserves corridor radius
- Decide whether tunnel/carving data affects runtime rail data or remains
  preview-only terrain shaping.

Deliverable:

- Editor rail authoring has a tested, intentional runtime export path.

Progress:

- Added focused export tests for authored editor rails becoming runtime `rails`.
- Covered corridor radius, control point normals, explicit `heightOffset`
  conversion, incomplete rail skipping, unknown-planet rail skipping, and runtime
  map validation.
- Updated editor preview rendering so authored rails look like slim runtime-style
  rail tubes with supports instead of broad path ribbons, while preserving tunnel
  shell preview behavior.
- Updated active editor authoring visuals so the rail being edited also uses the
  slim tube/support style; handles and transform gizmo remain as editing affordances.
- Export code now uses rail terminology for authored rail filtering and mapping.

Validation:

- Export-focused tests for `editorStateToRuntimeMap`.
- Runtime map validation tests where appropriate.
- `vp check`.

## Phase 4: Runtime Map Data Sync

Goal: Make exported editor rails the actual runtime rails used by gameplay.

Scope:

- Refresh `apps/game/server/my-map.json` from the editor export after the rail
  export path is stable.
- Confirm `validateRuntimeMapData` accepts the generated rails.
- Confirm server room map loading consumes the generated rails through `MAP_FILE`.
- Decide whether `RAIL_DEFS` remains fallback/dev content or is removed from the
  normal runtime path.

Deliverable:

- Authored editor rails appear in runtime gameplay from `MAP_FILE=my-map.json`.

Progress:

- `apps/game/server/my-map.json` now contains map-owned rail definitions instead
  of an empty `rails` array.
- Added server coverage proving map-provided rails are included in the `MapData`
  payload sent to joining clients.
- The in-repo sync source for this pass is the existing runtime rail definitions;
  replacing these with freshly editor-authored rails is the next content refresh
  step once an editor export artifact is available.
- Removed the client rail renderer's constructor-time `RAIL_DEFS` visual fallback;
  active rail visuals now come from server `MapData` only.
- Editor-to-runtime mapping has been traced: `RailState.points` become runtime
  rail control points, `width` becomes `paintCorridorRadius`, explicit point
  positions become `heightOffset`, and editor-only `bank`, `closed`, and
  `segmentsPerCurve` do not currently persist to runtime rail data.

Validation:

- `vp test packages/content/map/runtimeMapData.test.ts`
- Relevant server room/map tests.
- Local server/client smoke test.

## Phase 5: Remove Pre-Rail Legacy

Goal: Clean up old terminology after compatibility has done its job.

Scope:

- Remove pre-rail aliases where they are no longer needed.
- Rename lingering docs, comments, and tests to rail terminology.
- Remove old-save migration code.
- Update editor changelog and architecture docs where useful.

Deliverable:

- Pre-rail terminology no longer describes the rail feature.

Progress:

- Removed broad pre-rail type/function aliases from the rail type module.
- New authored rail IDs now use a `rail-*` prefix.
- Renamed remaining active rail tooling methods and locals to rail terminology.
- Removed the old save migration fields.

Validation:

- `vp check`
- `vp test`

## Recommended Implementation Order

1. Rename the visible editor UI to Rails with minimal internal churn.
2. Add a rail-native editor save/export model.
3. Test export conversion to runtime `rails`.
4. Refresh `apps/game/server/my-map.json` from the editor export.
5. Rename internal files and types once behavior is proven.
6. Remove legacy terminology.

## Open Decisions

- Should rail authoring keep surface/tunnel terrain carving as part of rail
  creation, or should those become separate optional terrain modifier outputs?
- Should runtime `RailDef` gain support for closed loops?
- Should runtime rail visuals or physics use banking, or should `bank` stay
  editor-only?
- Should `segmentsPerCurve` influence exported runtime sample density, or remain
  only an editor preview control?
- Should `RAIL_DEFS` remain as fallback/dev data after `my-map.json` owns rails?
