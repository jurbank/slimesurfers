---
name: state-mutation-auditor
description: "Audit authoritative state mutations in jam2. Use for simulation changes, Colyseus schema updates, match state bugs, projectile or paint scoring issues, input sequencing, respawn logic, and server-client state divergence."
argument-hint: "Describe the change, file set, or bug you want audited"
---

# State Mutation Auditor

Use this skill when you need a focused audit of how state changes flow through the authoritative game simulation and into replicated server state.

This skill is for changes involving:

- `packages/simulation/**`
- `apps/game/server/src/rooms/matchRoom.ts`
- `packages/protocol/schemas/**`
- input buffering, projectile damage, paint scoring, respawn, or match phase logic

## What This Skill Produces

- A mutation-path walkthrough from input to authoritative state to replication
- A list of mutation sites and whether each one is safe, risky, or incorrect
- An invariant check covering clamping, counters, transitions, and replication
- Small, safe fixes when the defect and the correct change are both clear
- Validation guidance using the existing simulation tests

## Audit Procedure

1. Identify the authoritative owner of the state.
   In this repo, simulation state is server authoritative. Start with `packages/simulation/match/matchSimulation.ts` and confirm whether the change affects `tick()`, player input handling, projectile stepping, paint stamping, or replication into Colyseus schema state.

2. Trace every write, not just the obvious one.
   Follow the full path for each affected field. Common mutation points are:
   - `packages/simulation/match/matchSimulation.ts`
   - `packages/simulation/movement/simulatedMovement.ts`
   - `packages/simulation/combat/projectiles.ts`
   - `packages/simulation/paint/stampPaint.ts`
   - `packages/simulation/paint/territoryGrid.ts`
   - `apps/game/server/src/rooms/matchRoom.ts`

3. Classify the mutation type.
   For each write, decide whether it is:
   - authoritative simulation state mutation
   - derived snapshot or leaderboard serialization
   - schema replication mutation
   - local helper math that should stay non-mutating

4. Check mutation style against the object type.
   If the target object can be backed by a Colyseus schema object, preserve in-place field mutation. In this codebase, `stepPlayer()` intentionally mutates `pos`, `vel`, and `rot` in place so field-level tracking keeps working.

5. Verify invariants and guards.
   At minimum, check:
   - sequence values stay monotonic: `inputSeq`, `paintSeq`
   - clamps remain intact: `health`, `paintScore`, `respawnTimer`, timers
   - state transitions are legal: `Idle`, `Moving`, `Airborne`, `Dead`
   - stale or duplicate inputs are rejected
   - capped buffers stay capped
   - writes cannot target missing players, planets, or queues without a safe early return

6. Look for split-brain state.
   If a field exists in both simulation state and replicated schema state, verify there is one clear source of truth and a deterministic copy step. New fields must be checked in both the simulation layer and the replication layer.

7. Review side effects per tick.
   For tick-driven code, confirm whether the change alters ordering. The current flow is:
   - consume queued input
   - step player movement
   - attempt projectile fire
   - stamp paint
   - tick projectiles
     Reordering these can create subtle regressions even when each individual write looks correct.

8. Validate with existing tests before inventing new theory.
   Read and run:
   - `packages/simulation/match/matchSimulation.test.ts`
   - `packages/simulation/movement/simulatedMovement.test.ts`
     Prefer `vp test` for test execution and `vp check` for broader validation.

9. Report findings by severity.
   Call out:
   - behavioural regressions
   - replication gaps
   - non-deterministic writes
   - missing guards or invariant checks
   - tests that should be added or updated

10. Apply narrow fixes when the root cause is clear.
    Safe fixes include guard corrections, missing clamps, omitted replication wiring, deterministic ordering mistakes, and targeted test updates. Avoid broad refactors unless the prompt explicitly asks for them.

## Decision Points

### If the change touches player movement

- Confirm new math only mutates the `state` object at the final assignment points.
- Confirm landing, jumping, and airborne transitions still preserve legal `planetId` and `movementState` combinations.
- Confirm client prediction assumptions still match the server config contract used by `stepPlayer()`.

### If the change touches projectile or damage flow

- Confirm damage application is clamped.
- Confirm defeated players transition to `Dead` once and respawn through the intended timer path.
- Confirm projectile ownership and paint-group attribution still match scoring rules.

### If the change touches paint or territory scoring

- Confirm score adjustments cannot go negative unless that is explicitly intended and handled.
- Confirm `ownerPaintGroupId` and aggregate score updates stay synchronized.
- Confirm any sequence or timestamp logic still prevents duplicate stamping.

### If the change adds or renames state fields

- Check the simulation type definitions.
- Check protocol schema definitions.
- Check room replication code.
- Check snapshot or leaderboard serialization if clients consume the field.
- Check tests for missing coverage on the new field lifecycle.

## Completion Criteria

Do not consider the audit complete until you can state all of the following:

- The authoritative owner of the changed state is identified.
- Every write path for the affected fields has been traced.
- In-place versus replace-by-new-object behavior is intentional.
- Required invariants and clamps were checked.
- Replication and serialization paths were reviewed for drift.
- Relevant tests were read, and validation commands were run when possible.
- Findings are reported with concrete file references and the likely user-visible impact.

## Suggested Prompts

- `/state-mutation-auditor audit the projectile damage and respawn flow`
- `/state-mutation-auditor review whether this change breaks Colyseus field tracking`
- `/state-mutation-auditor trace paintScore and ownerPaintGroupId mutations end to end`
- `/state-mutation-auditor check whether this new match state field has a replication gap`
