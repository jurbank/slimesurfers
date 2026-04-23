---
name: netcode-performance-auditor
description: "Audit netcode and multiplayer performance in slimesurfers. Use for snapshot and reconciliation issues, interpolation bugs, schema-vs-message cost, room pressure, input rate and buffering risks, tick cadence drift, replication size, and missing network observability."
argument-hint: "Describe the netcode change, lag symptom, room issue, or file set you want audited"
---

# Netcode Performance Auditor

Use this skill when you need to review or fix networking behavior and multiplayer performance risks in slimesurfers.

This skill is for changes involving:

- `apps/game/client/src/network/**`
- `apps/game/server/src/rooms/**`
- `packages/protocol/network/**`
- `packages/protocol/schemas/**`
- `packages/simulation/match/matchSimulation.ts`
- `packages/content/config/networkConfig.ts`

## What This Skill Produces

- A netcode-focused audit of the affected client, server, protocol, and simulation path
- Findings on responsiveness, server authority, cadence, replication cost, and room-pressure risks
- A classification of whether the issue is prediction/reconciliation, interpolation, replication shape, message/schema split, overload risk, or missing observability
- Small, safe fixes when the defect and correction are both clear
- A recommendation for the fastest useful validation path, including tests, targeted runtime checks, or instrumentation gaps

## Audit Procedure

1. Trace the end-to-end network path before judging the bug.
   Follow the full route for the affected behavior:
   - client input capture and send path
   - server input handling and validation
   - simulation tick and authoritative output generation
   - schema replication or custom message broadcast
   - client reconciliation, interpolation, or UI consumption
     Do not stop at the first file that looks suspicious.

2. Classify the issue by netcode layer.
   Decide whether the primary risk is:
   - local prediction or reconciliation correctness
   - remote interpolation smoothness
   - input ordering, buffering, or abuse handling
   - snapshot or leaderboard cadence
   - schema replication size or churn
   - room-capacity and per-tick cost pressure
   - missing metrics or logging that prevent safe decisions

3. Preserve the authority model while auditing performance.
   The client may predict for responsiveness, but the server decides. Flag changes that let the client become authoritative over gameplay truth, or changes that make the client experience smooth only by weakening server validation.

4. Check cadence relationships and config assumptions.
   Review `NETWORK_CONFIG` and confirm the surrounding code still matches it:
   - input send rate
   - simulation tick rate
   - snapshot rate
   - leaderboard rate
   - interpolation back-time
   - buffer and limit sizes
     Validate ratios and assumptions such as snapshot frequency relative to tick frequency and buffered-input sizes relative to reconciliation behavior.

5. Audit prediction, reconciliation, and interpolation paths together.
   For local player feel, inspect:
   - pending input buffering
   - sequence handling
   - authoritative snapshot application
   - re-simulation after reconciliation
     For remote players, inspect:
   - snapshot buffering
   - interpolation target time
   - buffer trimming behavior
   - fallback behavior when there is only one or stale snapshots

6. Review schema-vs-message cost and ownership.
   In slimesurfers, persistent shared room state belongs in Colyseus schema replication, while input, snapshots, and transient broadcasts travel as custom messages. Flag changes that:
   - duplicate gameplay truth across schema state and custom messages without a clear reason
   - push high-churn state into schema replication when message flow would be more appropriate
   - inflate custom payloads when compact schema state already exists for the use case

7. Treat room pressure and replication cost as first-class concerns.
   Review code paths that scale with player count, projectile count, paint state, or snapshot size. Check for:
   - O(players), O(projectiles), or O(planets × cells) work done every tick or broadcast
   - repeated full-payload work that may be acceptable now but risky at `NETWORK_CONFIG.rooms.maxPlayers`
   - schema synchronization churn that grows with transient state
   - limits such as `maxProjectilesPerRoom`, `maxBufferedInputs`, and paint-update bounds

8. Check overload and abuse protections.
   Confirm the path still rejects or bounds risky input and load patterns, including:
   - stale or duplicate input sequences
   - oversized client-supplied delta times
   - unchecked growth in client buffers or server-side maps
   - room-level pressure that is configured but not measured

9. Audit observability, but keep it behind concrete behavior and scaling risks.
   If the change affects tick cost, replication size, joins, leaves, room capacity, or message volume, check whether the repo can actually measure the impact. Missing metrics or logging for tick time, replication size, and room pressure are valid findings when they block confident decisions, but they should not outrank concrete correctness, desync, or scaling defects.

10. Validate with the smallest useful proof.
    Prefer existing tests when they already cover the path, especially simulation and protocol behavior. Use runtime checks when the issue depends on client feel, packet cadence, or room state observation. If the code cannot be validated confidently because instrumentation is missing, report that directly.

11. Apply narrow fixes when the answer is clear.
    Safe fixes include cadence or config wiring corrections, stale-buffer trimming fixes, obvious sequence guards, message/schema split corrections, and targeted test or logging updates. Avoid broad netcode rewrites unless the prompt explicitly asks for them.

## Decision Rules

### If the bug is local-player feel under latency

- Audit prediction and reconciliation first.
- Check `pendingInputs`, `inputSeq`, snapshot application, and re-simulation.
- Do not accept a fix that improves feel by making the client authoritative.

### If the bug is remote-player jitter or laggy movement

- Audit interpolation buffering and target time first.
- Check snapshot arrival handling, buffer trimming, and fallback behavior when snapshots are sparse.

### If the bug is bandwidth, replication, or room scale

- Audit the schema-vs-message split and per-tick synchronization loops.
- Check whether high-churn state is replicated more often or more broadly than needed.
- Treat room pressure and replication-size uncertainty as findings if the impact is currently guessed rather than measured.

### If the change touches server input handling

- Check ordering guards, dt clamping, and bounded buffering.
- Confirm protections still hold under high send rates or delayed packets.

### If the change touches snapshot or leaderboard payloads

- Check cadence assumptions, payload size growth, and client consumption paths.
- Confirm comments and protocol contracts still match the actual broadcast behavior.

## Completion Criteria

Do not consider the audit complete until you can state all of the following:

- The full network path was traced end to end.
- The affected netcode layer was identified precisely.
- Server authority and client prediction boundaries were checked explicitly.
- Cadence, buffering, and scaling assumptions were reviewed against config and code.
- Schema-vs-message cost and duplication risks were evaluated where relevant.
- Observability gaps were called out when they block confident performance judgment, without overshadowing concrete behavior or scaling defects.
- Findings or fixes point to concrete symptoms such as input lag, jitter, desync, oversized replication, room pressure, or missing safety rails.

## Suggested Prompts

- `/netcode-performance-auditor audit this snapshot and reconciliation change for lag or desync risks`
- `/netcode-performance-auditor review whether this schema replication path will scale to room targets`
- `/netcode-performance-auditor check interpolation buffering and remote-player smoothness`
- `/netcode-performance-auditor assess input buffering, dt clamping, and stale-input protections`
