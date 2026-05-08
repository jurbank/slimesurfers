---
name: editor-runtime-map-sync
description: "Keep editor map/export changes synced into game runtime map data. Use for apps/editor export adapter updates, RuntimeMapData schema changes, and refreshing apps/game/server/my-map.json so MAP_FILE gameplay reflects editor-authored data."
argument-hint: "Describe the editor/map change and whether my-map.json should be refreshed"
---

# Editor Runtime Map Sync

Use this skill when changes in editor map authoring or export behavior must propagate into runtime gameplay map data consumed by the server.

This skill is for changes involving:

- `apps/editor/src/export.ts`
- `apps/editor/src/types.ts`
- `apps/editor/src/App.tsx` export flow
- `packages/content/map/runtimeMapData.ts`
- `apps/game/server/my-map.json`
- `apps/game/server/src/rooms/matchRoom.ts`

## What This Skill Produces

- A trace from editor state fields to runtime map fields used by gameplay
- An updated `apps/game/server/my-map.json` when export-affecting changes occur
- Runtime validation confirmation through `validateRuntimeMapData`
- A drift check so editor export shape and server map file stay aligned
- A short report of what changed, why it affects gameplay, and how it was validated

## Sync Procedure

1. Classify the change scope before touching map files.
   Decide whether the change affects:
   - editor-only UX state (no runtime sync needed)
   - editor-to-runtime adapter output (`editorStateToRuntimeMap`)
   - runtime schema or validation (`RuntimeMapData`, migration, validation)
   - server map loading behavior (`MAP_FILE`, room map resolution)

2. Trace editor-to-runtime mapping first.
   Read:
   - `apps/editor/src/export.ts`
   - `apps/editor/src/types.ts`
   - `packages/content/map/runtimeMapData.ts`
   Confirm each changed editor field either maps into runtime data intentionally or is editor-only by design.

3. Update schema and validation before regenerating map artifacts.
   If runtime shape changed, update:
   - `RuntimeMapData` types
   - `validateRuntimeMapData`
   - migration/backfill logic used by room map resolution
   Do not refresh `my-map.json` until schema/validation are settled.

4. Regenerate or refresh runtime map output.
   If export output changed, produce updated runtime JSON from the editor export path and sync it into:
   - `apps/game/server/my-map.json`
   Keep `mapId`, `name`, `planets`, `cel`, `rails`, and `spawns` consistent with the exported runtime map.

5. Verify server consumption path.
   Confirm `apps/game/server/src/rooms/matchRoom.ts` still validates and accepts the map through `MAP_FILE` loading and migration.

6. Run targeted validation.
   Prefer:
   - `vp test packages/content/map/runtimeMapData.test.ts`
   - `vp test apps/game/server/src/rooms/matchRoomReplication.test.ts`
   - `vp check` when change scope is broader

7. Report runtime impact clearly.
   State:
   - what editor-side change required sync
   - whether `my-map.json` was refreshed
   - what validation passed
   - any residual risk (for example, export generated externally but not committed)

## Decision Rules

### If only editor UI/workflow changed

- Do not update `my-map.json` by default.
- Confirm no change to `editorStateToRuntimeMap` output contract.

### If `editorStateToRuntimeMap` changed

- Treat `my-map.json` as potentially stale.
- Refresh `my-map.json` from current runtime export output.
- Re-run runtime validation tests.

### If `RuntimeMapData` schema or validator changed

- Update schema, validator, and migration/backfill logic first.
- Then refresh `my-map.json` to the new valid shape.
- Verify room map resolution still accepts file-driven maps.

### If server map loading changed

- Confirm `MAP_FILE` behavior is unchanged or intentionally changed.
- Ensure parse, migrate, and validate steps still guard invalid maps.

## Completion Criteria

Do not consider sync complete until all are true:

- Changed editor/export fields were traced to runtime outputs or explicitly marked editor-only.
- `apps/game/server/my-map.json` was refreshed when export/runtime shape changed.
- Runtime map validates with current `validateRuntimeMapData` rules.
- Server map resolution path still accepts and uses the updated map.
- Relevant tests or checks were run, or the skip reason was documented.

## Suggested Prompts

- `/editor-runtime-map-sync editor export changed rails and spawn anchor, sync runtime map`
- `/editor-runtime-map-sync runtimeMapData validator changed, make sure my-map.json still loads`
- `/editor-runtime-map-sync check whether this apps/editor change requires refreshing server my-map.json`
- `/editor-runtime-map-sync trace map drift between editor export and game server map file`
