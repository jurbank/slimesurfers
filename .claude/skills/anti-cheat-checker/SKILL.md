---
name: anti-cheat-checker
description: "Audit slimesurfers changes for multiplayer cheat vectors. Use for input validation gaps, client-authority leaks, replay or rate abuse, impossible movement/combat states, sequence/timestamp trust, and server-side enforcement regressions."
argument-hint: "Describe the files, PR, or gameplay flow to audit for cheat risk"
---

# Anti Cheat Checker

Use this skill to run a focused anti-cheat audit on gameplay and netcode changes in slimesurfers.

This skill is for changes involving:

- client input handling, rate limits, and message trust boundaries
- simulation state transitions (movement, combat, scoring, respawn)
- replication and snapshot/reconciliation behavior
- paint and territory scoring authority
- server room orchestration that could bypass simulation checks

## What This Skill Produces

- A severity-ordered list of cheat risks tied to concrete files and code paths
- A map of trust boundaries (client-claimed vs server-verified)
- Validation gaps with exploit examples
- Patch-ready remediation suggestions with minimal architectural disruption
- A focused checklist of exploit-oriented tests to add or update

## Audit Procedure

1. Define the attack surface before reading implementation details.
   Enumerate all client-controllable inputs touching the change: movement vectors, fire actions, trick triggers, paint stamps, emotes, and timing or sequencing fields.

2. Confirm authority boundaries.
   Treat server simulation as the only gameplay authority. Flag any path where client data is accepted as truth for outcomes like hits, damage, territory ownership, score, cooldown completion, or respawn state.

3. Verify input validation and clamping.
   For each input path, check type guards, range clamps, enum checks, null handling, and fallback behavior. If malformed values can propagate into simulation, flag high risk.

4. Check temporal abuse defenses.
   Review sequence IDs, timestamps, and cadence logic for replay, reordering, burst, and speed-hack resistance. Confirm stale or duplicate inputs are rejected and high-frequency spam is bounded.

5. Test impossible-state prevention in simulation.
   Validate that movement, combat, paint, and scoring rules enforce hard invariants server-side even if clients send contradictory data. Watch for teleport, fire-rate, or cooldown bypass paths.

6. Inspect replication and reconciliation trust assumptions.
   Ensure replication transmits authoritative outputs rather than accepting client-side derived truth. Confirm client prediction can diverge visually but cannot commit match outcomes.

7. Review room-layer escape hatches.
   Ensure room code forwards validated intent to simulation and does not introduce direct gameplay mutations that bypass simulation guards.

8. Assess blast radius and exploitability.
   For each issue, classify by impact and required attacker capability:
   - Critical: remote exploit changes match outcomes at scale
   - High: reliable per-match advantage without elevated access
   - Medium: partial advantage, race-dependent, or mode-limited
   - Low: hard-to-exploit edge case with limited gameplay impact

9. Propose minimal fixes first.
   Prefer narrow fixes such as stricter server validation, input throttling, monotonic sequence checks, or moving outcome decisions into simulation.

10. Define verification.
    Add or update tests that attempt malicious inputs and impossible transitions. Confirm logs/metrics make suspicious patterns visible in production.

## Decision Rules

### If a client can directly influence authoritative outcomes

- Flag immediately as at least High.
- Move outcome calculation to simulation and treat client fields as intent only.

### If rate controls exist only on the client

- Flag as bypassable.
- Add server-enforced cooldown, token bucket, or per-tick caps.

### If sequence or timestamp checks are optional or absent

- Flag replay/reorder risk.
- Require monotonic validation and duplicate rejection.

### If room code mutates gameplay state directly

- Flag boundary violation.
- Route mutation through simulation APIs with invariant checks.

### If validation relies on UI constraints

- Flag as untrusted-path bug.
- Duplicate critical constraints in server parsing and simulation guards.

## Completion Criteria

Do not consider the audit complete until all are true:

- All new or changed client-controlled inputs were enumerated.
- Authority for each gameplay outcome is explicitly identified.
- Validation, rate limiting, and sequencing defenses were checked.
- Findings are severity-ordered and mapped to concrete files.
- Each High/Critical finding includes a practical fix path.
- Test gaps for exploit scenarios are documented.
- Residual risk is stated for any unresolved finding.

## Suggested Prompts

- `/anti-cheat-checker audit this PR for client-authority leaks and replay vulnerabilities`
- `/anti-cheat-checker check movement and fire input paths for speed-hack and spam exploits`
- `/anti-cheat-checker review MatchRoom and simulation boundaries for cheat bypasses`
- `/anti-cheat-checker evaluate paint scoring paths for forged ownership outcomes`
