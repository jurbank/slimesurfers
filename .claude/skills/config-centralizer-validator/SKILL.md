---
name: config-centralizer-validator
description: "Validate centralized config usage in slimesurfers. Use for hardcoded gameplay or network constants, duplicated literals, config drift across client/server/simulation, derived config like planet positions, and deciding whether a value belongs in GAME_CONFIG, NETWORK_CONFIG, or mode definitions."
argument-hint: "Describe the change, file set, or constant you want validated"
---

# Config Centralizer Validator

Use this skill when you need to check whether a value is stored in the right authoritative config surface, whether a new constant is duplicated or drifting, and whether a change stays consistent across the client, server, and simulation.

In slimesurfers, the main centralized config owners are:

- `packages/content/config/gameConfig.ts` for shared gameplay-feel constants
- `packages/content/config/networkConfig.ts` for room, networking, simulation cadence, reconciliation, and limits
- `packages/content/modes/gameModes.ts` as a first-class config owner for mode-specific rules and slot assignment

## What This Skill Produces

- A recommendation for the authoritative owner of each constant or setting
- A drift check across simulation, server, client, and protocol comments when relevant
- A list of duplicated literals or local values that should remain local
- Small, safe fixes when the correct config home is clear
- Validation guidance using the existing checks and tests

## Validation Procedure

1. Identify the constant and its effect surface.
   Decide whether the value affects gameplay simulation, networking cadence, room policy, reconciliation, rendering-only behavior, or mode rules.

2. Pick the likely authoritative owner before editing code.
   Use these defaults:
   - `GAME_CONFIG` for shared gameplay constants used by both client and server, especially physics, combat, paint, respawn, and match rules
   - `NETWORK_CONFIG` for networking rates, room limits, reconciliation tuning, and rate limits
   - `GameModeDefinition` values in `packages/content/modes/gameModes.ts` for mode-specific choices such as spawn logic, team structure, palette, or slot assignment

3. Trace all current consumers.
   Search for imports and duplicated literals across:
   - `apps/game/client/**`
   - `apps/game/server/**`
   - `packages/simulation/**`
   - `packages/protocol/**`
     Pay special attention to values that affect both client prediction and server authority.

4. Distinguish a true config leak from an acceptable local constant.
   Do not centralize constants just because they are reused once or twice. Usually centralize a value only if it is shared gameplay truth, network policy, or reused across multiple runtime layers. Usually keep it local if it is:
   - test-only fixture data
   - one-off presentation math with no gameplay meaning
   - a buffer size or helper constant that is intentionally local to one runtime class and not a cross-system contract

5. Check for derived config that should not be re-declared.
   If a value is derived from centralized config, keep it derived. In this repo, `PLANET_POSITIONS` is derived from `GAME_CONFIG.planet.*`. Do not reintroduce separate hand-maintained planet arrays or duplicated geometry spacing constants elsewhere.

6. Verify unit and naming consistency.
   Confirm time units remain clear and compatible, especially `Seconds` versus `Ms`. Preserve current conventions noted in `gameConfig.ts` for distances, speeds, times, and angles.

7. Validate cross-layer consistency.
   For shared gameplay constants, confirm the same source is used by:
   - server simulation
   - client prediction or interpolation when applicable
   - rendering systems that depend on the same world scale
     For network settings, confirm comments and protocol expectations still match the configured rates.

8. Check the architecture rule, not just the imports.
   The repo rule is to avoid duplicating the same gameplay truth in multiple authoritative forms. If a constant exists in more than one place, decide whether one is derived, test-local, or an actual competing source of truth.

9. Apply narrow fixes when the answer is clear.
   Safe fixes include:
   - replacing hardcoded shared literals with a config reference
   - moving a shared constant into the correct config module
   - switching a consumer from a duplicated local constant to a derived or imported one
   - updating nearby tests or docs that encode the old value
     Avoid broad config rewrites unless the prompt explicitly asks for them.

10. Validate the result.
    Prefer `vp check` and `vp test`. For targeted validation, inspect the affected simulation or runtime tests first.

## Decision Rules

### If the value changes simulation behavior

- Put it in `GAME_CONFIG` unless it is mode-specific.
- Confirm both `packages/simulation/**` and `apps/game/client/src/network/runtimeState.ts` still consume the same source when prediction depends on it.

### If the value changes networking or room behavior

- Put it in `NETWORK_CONFIG`.
- Check cadence relationships such as snapshot rate versus tick rate and any protocol comments describing those rates.

### If the value is mode-specific rather than universal

- Keep it in `packages/content/modes/gameModes.ts` or another content/domain module.
- Do not leak mode rules into unrelated runtime layers as separate constants.

### If the value only exists in tests

- It can remain local when the test is intentionally using a minimal structural config.
- If test values are meant to mirror production invariants exactly, consider importing centralized config instead of copying literals.

### If the value is rendering-only

- Keep it local unless it encodes gameplay truth such as world scale, collision size, stamp radius, or another quantity the simulation also depends on.

## Completion Criteria

Do not consider the validation complete until you can state all of the following:

- The correct config owner was identified.
- All important consumers were traced across runtime layers.
- Any duplicated value was classified as acceptable local data, derived data, or real drift.
- Unit conventions and naming remained coherent.
- Shared gameplay and network contracts still use one clear source of truth.
- Relevant checks or tests were reviewed and run when possible.
- Findings or fixes include concrete file references and user-visible impact.

## Suggested Prompts

- `/config-centralizer-validator check whether this new projectile constant belongs in GAME_CONFIG`
- `/config-centralizer-validator review duplicated room and tick-rate values across the repo`
- `/config-centralizer-validator audit whether this rendering constant is actually gameplay truth`
- `/config-centralizer-validator validate that planet layout stays derived from centralized config`
