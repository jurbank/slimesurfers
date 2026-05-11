# Rail Creation Tool Roadmap

## Context

The editor currently has an unfinished track authoring workflow with useful spline,
tunnel, bridge, and carving behavior. Runtime gameplay already has a separate rail
system and `rails` data in `RuntimeMapData`.

The goal is to convert the editor track tool into a rail creation tool, preserve
the useful spline and terrain-shaping behavior, and then migrate authored editor
rails into the runtime map data used by the game.

Current important paths:

- `apps/editor/src/tools/tracks/*`: existing editor track spline, preview, and carving tools
- `apps/editor/src/panels/TracksPanel.tsx`: current editor panel
- `apps/editor/src/export.ts`: current editor-to-runtime map export
- `packages/content/config/railDefs.ts`: current runtime rail definition type and fallback/dev rail data
- `packages/content/map/runtimeMapData.ts`: runtime map schema and validation
- `apps/game/client/src/systems/railSystem.ts`: runtime rail rendering
- `apps/game/server/my-map.json`: checked-in runtime map data loaded by the server

Important current behavior: `editorStateToRuntimeMap` already converts authored
editor rail state into runtime `rails`. The migration is not starting from zero,
but the naming, editor model, save format, and runtime refresh path are not yet
cleanly aligned.

## Phase 1: Reframe The Editor Tool

Goal: Tracks become Rails in the editor UI while preserving the existing spline,
tunnel, bridge, and carving functionality.

Scope:

- Rename user-facing editor copy from Tracks to Rails.
- Rename the sidebar panel label from `Tracks` to `Rails`.
- Rename default authored item names from `Track 1` to `Rail 1`.
- Keep internal implementation mostly intact where useful.
- Leave `apps/editor/src/tools/tracks/*` as a temporary implementation detail if
  that keeps the first change small.
- Preserve loading of existing editor saves with `tracks.version === 1`.

Deliverable:

- Users see and operate a Rail creation/editing tool.
- Existing track-authored editor saves still load.
- No runtime schema changes are required in this phase.

Validation:

- `vp test apps/editor/src/tools/tracks/trackCarving.test.ts`
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
- Keep compatibility aliases or migration helpers for old `TrackState` saves.
- Decide the fate of each current track field:
  - `points`: rail control points
  - `width`: likely maps to runtime `paintCorridorRadius`
  - `bank`: editor-only unless runtime rail physics or visuals need banking
  - `closed`: product decision needed because runtime `RailDef` has no closed-loop field
  - `segmentsPerCurve`: likely editor/rendering/export detail, not runtime data
- Rename files only after the type migration is stable:
  - `tools/tracks` -> `tools/rails`
  - `TracksPanel.tsx` -> `RailsPanel.tsx`

Deliverable:

- Editor source uses rail terminology for the feature.
- Old track saves migrate forward.
- Editor-only rail shaping fields are clearly separated from runtime rail fields.

Progress:

- Canonical `RailEditMode`, `RailPoint`, `RailState`, `RailToolState`, and
  `RailExport` types now exist.
- Legacy `Track*` aliases remain for lower-level spline/tooling compatibility.
- New editor saves write a primary `rails` block.
- Old `tracks` save blocks still load through migration.

Validation:

- Focused editor tests.
- Save/load smoke check.
- Export smoke check.
- `vp check`.

## Phase 3: Tighten Export Semantics

Goal: Make editor-to-runtime rail export explicit and reliable.

Current export behavior:

- Authored tracks with at least two points export as runtime `rails`.
- Track `width` exports as `paintCorridorRadius`.
- Point normals export as runtime rail control point normals.
- Explicit point positions export as `heightOffset`.

Scope:

- Rename export parameters and local variables from `tracks` to `rails`.
- Preserve a compatibility read path for old saved `tracks`.
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
  rail tubes with supports instead of broad track ribbons, while preserving tunnel
  shell preview behavior.
- Updated active editor authoring visuals so the rail being edited also uses the
  slim tube/support style; handles and transform gizmo remain as editing affordances.

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

Validation:

- `vp test packages/content/map/runtimeMapData.test.ts`
- Relevant server room/map tests.
- Local server/client smoke test.

## Phase 5: Remove Track Legacy

Goal: Clean up old terminology after compatibility has done its job.

Scope:

- Remove `Track*` aliases where they are no longer needed.
- Rename lingering docs, comments, and tests from track to rail.
- Keep only old-save migration code if old imported saves still need support.
- Update editor changelog and architecture docs where useful.

Deliverable:

- Track terminology no longer describes the rail feature, except in old-save
  migration notes.

Validation:

- `vp check`
- `vp test`

## Recommended Implementation Order

1. Rename the visible editor UI from Tracks to Rails with minimal internal churn.
2. Add a rail-native editor save/export model with old track migration.
3. Test export conversion to runtime `rails`.
4. Refresh `apps/game/server/my-map.json` from the editor export.
5. Rename internal files and types once behavior is proven.
6. Remove or quarantine legacy track terminology.

## Open Decisions

- Should rail authoring keep surface/tunnel terrain carving as part of rail
  creation, or should those become separate optional terrain modifier outputs?
- Should runtime `RailDef` gain support for closed loops?
- Should runtime rail visuals or physics use banking, or should `bank` stay
  editor-only?
- Should `segmentsPerCurve` influence exported runtime sample density, or remain
  only an editor preview control?
- Should `RAIL_DEFS` remain as fallback/dev data after `my-map.json` owns rails?
