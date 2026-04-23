---
name: architecture-gatekeeper
description: "Review slimesurfers changes against architecture boundaries. Use for package ownership, server authority, simulation vs protocol vs room logic, schema-vs-message decisions, source-of-truth drift, and premature abstraction checks."
argument-hint: "Describe the change, PR, or file set you want checked against the architecture"
---

# Architecture Gatekeeper

Use this skill when you need to check whether a change still fits slimesurfers's intended architecture before or after implementation.

This skill is for changes involving:

- ownership across `packages/content`, `packages/protocol`, `packages/simulation`, `apps/game/server`, and `apps/game/client`
- server-authoritative gameplay decisions
- `MatchRoom` responsibilities
- schema replication versus custom message choices
- source-of-truth duplication
- game-specific abstractions that may be turning into premature engine work

## What This Skill Produces

- An architecture review tied to the current repo boundaries
- A classification of each affected file or concept by correct owner
- Findings ordered by architectural risk
- Open questions where the boundary is unclear and human judgment is required
- Small, safe fixes when the correct architectural move is obvious

## Gate Procedure

1. Start from the repo's stated architecture, not personal preference.
   Use `ARCHITECTURE.md` as the stable boundary document, `ROADMAP.md` for current priorities, and `PERIODIC-REVIEW.md` for how drift should be judged. Treat those as the standard for this review.

2. Classify the change by affected responsibility.
   Decide whether the change primarily belongs to:
   - `packages/content` for tunable values, network tuning, and mode definitions
   - `packages/protocol` for message contracts and schema types
   - `packages/simulation` for authoritative match state and gameplay rules
   - `apps/game/server` for room hosting, lifecycle, and replication orchestration
   - `apps/game/client` for rendering, prediction, reconciliation, and UI

3. Identify the authoritative owner of the behavior.
   Confirm who decides the affected gameplay truth. In slimesurfers, the server is authoritative for player-affecting gameplay state, scoring, territory ownership, match timing, and input validation. If a client or schema layer starts acting like the authority, flag it.

4. Check whether the change preserves clean package boundaries.
   Review imports and logic placement for drift. Ask:
   - Is logic living in the right package?
   - Is a file becoming a mixed-responsibility bottleneck?
   - Does an import reveal a boundary leak, such as simulation depending on schema-heavy constructs or UI depending on server-only concepts?

5. Apply the authority and replication rules.
   Use schema replication for persistent shared room state that benefits from Colyseus change tracking. Use custom messages for input, authoritative snapshots, and transient broadcasts. Flag changes that duplicate the same gameplay truth in both schema state and another authoritative form without a clear reason.

6. Guard `MatchRoom` from becoming the game engine.
   Room code should stay focused on lifecycle, connection handling, input forwarding, and replication orchestration. If a change adds new gameplay rule decisions directly into `MatchRoom`, prefer moving that logic into simulation and making room-to-simulation inputs and outputs more explicit.

7. Keep gameplay truth in simulation and domain modules.
   Simulation systems should own movement, combat, paint, scoring, respawn, and similar game rules. Mode-specific rules should live in content/domain modules. Protocol packages should describe contracts, not own gameplay behavior.

8. Distinguish healthy reuse from premature abstraction.
   Reuse is good when it naturally improves simulation primitives, protocol utilities, config/content patterns, or netcode support code with clean boundaries. Be skeptical of new abstractions that mainly add indirection, generic extension systems, or engine-style layers without a clear near-term payoff. Multiple concrete uses today is strong evidence, but a carefully scoped abstraction can still be acceptable when it clearly simplifies the next planned step in the roadmap.

9. Evaluate the change against the repo's change standard.
   A change is architecturally healthy when it clearly does one or more of these:
   - clarifies ownership
   - reduces coupling
   - preserves or strengthens server authority
   - improves testability of simulation or protocol behavior
   - helps future modes or scaling without adding premature complexity
     A change is suspicious when it mainly adds indirection, duplicates truth, moves rules into transport or UI layers, or optimizes reuse before the current game loop is stable.

10. Report concrete findings, then apply narrow fixes when safe.
    Prefer concrete findings tied to file paths and code paths. If the architectural correction is obvious, safe fixes can include moving a constant to config, extracting protocol-safe types out of schema files, relocating game rules out of `MatchRoom`, or tightening boundaries without broad rewrites.

## Decision Rules

### If a change adds gameplay rules to room code

- Flag it unless the code is strictly orchestration.
- Prefer moving the rule into `packages/simulation/**` and keeping `apps/game/server/**` focused on hosting and replication.

### If a change blurs protocol and simulation concerns

- Keep schema definitions and transport contracts in `packages/protocol/**`.
- Keep update logic and authoritative state transitions in `packages/simulation/**`.
- If simulation needs a shared enum or plain type, prefer a protocol-safe extraction rather than importing schema-heavy runtime constructs.

### If a change adds client-side authority over gameplay truth

- Flag it.
- Client prediction is acceptable; client decision-making over authoritative match outcomes is not.

### If a change adds another source of truth

- Decide whether the duplicate is derived, replicated, cached for presentation, or actually competing.
- Reject competing authoritative forms unless there is a clear documented reason.

### If a change introduces a new abstraction

- Ask whether there are multiple concrete uses today or an obvious next planned use.
- If neither is true, prefer a direct implementation inside the current domain module.

### If a change touches paint or scoring

- Confirm territory ownership remains the source of truth for scoring.
- Confirm visual paint stamps remain secondary and bounded.

## Completion Criteria

Do not consider the gate complete until you can state all of the following:

- The affected responsibility and package owner were identified.
- The authoritative owner of the behavior is still clear.
- Replication versus message choices were reviewed where relevant.
- Boundary leaks, duplicated truth, and premature abstractions were checked explicitly.
- Findings are concrete, severity-ordered, and tied to actual files or code paths.
- Uncertain cases are labeled as questions rather than overconfident conclusions.
- Any fixes remain narrow and avoid broad re-architecture unless the current structure clearly blocks the roadmap.

## Suggested Prompts

- `/architecture-gatekeeper review whether this change pushes too much game logic into MatchRoom`
- `/architecture-gatekeeper check the schema-vs-message split for this netcode change`
- `/architecture-gatekeeper audit these files for boundary drift across protocol, simulation, and client`
- `/architecture-gatekeeper assess whether this abstraction is earned or premature`
