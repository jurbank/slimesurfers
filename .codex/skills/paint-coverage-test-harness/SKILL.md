---
name: paint-coverage-test-harness
description: "Build and extend paint coverage tests in slimesurfers. Use for territory ownership, paint scoring, stamp throttling, paintSeq ordering, bounded stamp history, and optional Colyseus paint replication checks."
argument-hint: "Describe the paint behavior, bug, or file set you want the harness to cover"
---

# Paint Coverage Test Harness

Use this skill when you need to add, audit, or repair tests around authoritative paint coverage in slimesurfers.

This skill is for changes involving:

- `packages/simulation/paint/stampPaint.ts`
- `packages/simulation/paint/territoryGrid.ts`
- `packages/simulation/match/matchSimulation.ts`
- `packages/protocol/schemas/paintedState.ts`
- `apps/game/server/src/rooms/matchRoom.ts` when paint replication behavior also needs coverage

## What This Skill Produces

- A deterministic paint-test plan for the affected behavior
- Minimal reusable fixtures for players, planets, cells, and sim state when needed
- Focused tests for territory ownership, score updates, and stamp lifecycle
- Optional replication checks for schema paint state only when the change crosses the room boundary
- Small, safe fixes to tests or paint logic when the defect is clear

## Harness Procedure

1. Classify the target behavior before writing tests.
   Decide whether the change affects:
   - territory ownership and cell coverage
   - score accounting and clamping
   - stamp creation and throttling
   - paint sequence ordering
   - bounded visual stamp history
   - schema replication in `MatchRoom`

2. Start at the lowest authoritative layer that can expose the bug.
   Prefer testing pure or near-pure paint logic first:
   - `applyPlayerPaintToTerritory()` for coverage and score behavior
   - `stampPaint()` for stamp throttling, stamp contents, sequence increments, and bounded stamp retention
   - `MatchSimulation.tick()` only when the bug depends on tick ordering or player lifecycle
   - `MatchRoom` sync only when the issue is replication drift rather than simulation logic

3. Build deterministic fixtures instead of reusing broad match setup by default.
   Create the smallest possible state that still exercises the rule:
   - one planet with known `planetId`
   - a `SimPlanetPaintState` with explicit `territoryRows`, `territoryCols`, `cells`, and `stamps`
   - one or two players with stable `paintGroupId`, `slimeColor`, and surface positions
   - a `SimMatchState` containing only the maps and counters needed by the function under test
     Keep fixture values obvious and stable so failures are easy to read.

4. Assert authoritative outcomes, not implementation noise.
   For paint logic, prefer assertions on:
   - changed `ownerPaintGroupId` values
   - changed `paintScore` values
   - `simState.scores` map contents
   - `paintSeq` increments
   - returned timestamp behavior from `stampPaint()`
   - stamp map size and retained keys after bounded eviction

5. Cover the core paint invariants.
   At minimum, check the relevant subset of these rules:
   - neutral cells become owned by the painting group
   - repainting the same owned cells does not double-count score
   - repainting enemy-owned cells subtracts from the old group and adds to the new group
   - scores never go negative
   - airborne players or invalid planets do not create paint stamps
   - `stampIntervalMs` suppresses early duplicate stamps
   - `paintSeq` is monotonic and stamp keys match `seq.toString()`
   - stamp history stays bounded by `GAME_CONFIG.paint.maxVisualStampsPerPlanet`

6. Add integration coverage only when local paint unit tests are insufficient.
   Use `MatchSimulation` tests when paint behavior depends on tick cadence, player input processing, or interaction with other systems. Use `MatchRoom` coverage only when you need to prove that sim paint state reaches Colyseus schema state correctly. Do not make schema-sync checks the default for every paint test.

7. Keep visual paint secondary to authoritative territory state.
   Tests should treat territory cells and score maps as the source of truth. Stamp history is visual and bounded; do not write tests that imply long-term score correctness is derived from all historical stamps.

8. Apply narrow fixes when the root cause is clear.
   Safe fixes include missing clamps, incorrect ownership transfers, stamp throttling bugs, off-by-one issues in bounded eviction, missing replication sync, and targeted test additions or updates. Avoid broad paint-system redesign unless the prompt explicitly asks for it.

9. Validate with the repo toolchain.
   Prefer `vp test` and `vp check`. If the new tests live under `packages/simulation/paint/`, keep them small and deterministic so they are cheap to run and diagnose.

## Decision Rules

### If the bug is about territory ownership or scoring

- Test `applyPlayerPaintToTerritory()` first.
- Use fixtures with pre-owned cells so score transfer behavior is explicit.
- Assert both per-player `paintScore` and aggregate `simState.scores` when ownership changes.

### If the bug is about stamp timing or sequence behavior

- Test `stampPaint()` directly.
- Control `lastPaintMs` and `nowMs` precisely.
- Assert returned timestamps, `paintSeq`, inserted stamp data, and bounded stamp-map eviction.

### If the bug only appears during simulation ticks

- Write or extend a `MatchSimulation` test.
- Drive the simulation through input and time, then assert the authoritative paint results rather than internal helper details.

### If the bug is about server replication

- Cover `MatchRoom` schema synchronization for paint cells, stamps, and `paintSeq`.
- Verify that removed stamps disappear from schema state and live stamps stay synchronized.

### If the test would depend on rendering details

- Stop and re-scope first.
- Rendering can observe paint state, but coverage correctness belongs to simulation and schema layers.

## Completion Criteria

Do not consider the harness complete until you can state all of the following:

- The test starts at the lowest layer that can prove the behavior.
- Fixtures are deterministic and minimal.
- The relevant paint invariants are asserted directly.
- The test distinguishes authoritative territory state from transient visual stamps.
- Any cross-layer replication requirement was covered when applicable.
- Validation commands were run when possible.
- Failures and fixes point to concrete user-visible behavior such as incorrect score, missing paint, duplicate stamps, or replication drift.

## Suggested Prompts

- `/paint-coverage-test-harness add tests for repainting enemy-owned cells and score transfer`
- `/paint-coverage-test-harness build a harness for stamp throttling and paintSeq ordering`
- `/paint-coverage-test-harness cover maxVisualStampsPerPlanet eviction behavior`
- `/paint-coverage-test-harness verify MatchRoom keeps paint cells and stamps in sync`
