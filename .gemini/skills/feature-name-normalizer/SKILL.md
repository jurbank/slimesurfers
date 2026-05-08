---
name: feature-name-normalizer
description: "Normalize duplicate or variant feature terminology in slimesurfers. Use for inconsistent names like skiing, swimming, and surfing; deduplicate labels; pick canonical names; and apply safe code, protocol, and content renames with compatibility checks."
argument-hint: "Describe the variant terms, target canonical names, and scope (code, UI, protocol, docs)"
---

# Feature Name Normalizer

Use this skill to standardize feature terminology when the same concept appears under multiple names.

For Slime Surfers, the canonical action term is surfing with no exceptions in this workflow.

## What This Skill Produces

- A canonical terminology map for the requested feature area
- A complete inventory of variant terms and where they appear
- A safe rename plan by risk level (internal only vs protocol/persisted/public)
- Applied updates for low-risk cases, plus compatibility guidance for risky cases
- Validation notes covering build, tests, and behavior checks

## Recommended Canonical Defaults

Use these defaults unless the prompt says otherwise:

- surfing: canonical verb/noun for movement style
- surfer: canonical player descriptor
- slime surfing: canonical feature phrase

Map common variants to canonical terms:

- ski, skiing, skier -> surf, surfing, surfer
- swim, swimming, swimmer -> surf, surfing, surfer
- board, boarding -> surf, surfing (when conceptually equivalent)

## Procedure

1. Define scope and blast radius.
   Confirm whether the request includes:
   - internal code symbols only
   - player-facing UI text
   - protocol message names and schema fields
   - persisted data, analytics keys, save files, or API contracts
   - docs and design notes

2. Build an inventory of term variants.
   Search for all known variants and plural forms, including hyphen/underscore/camelCase variants. Include:
   - identifiers and symbol names
   - string literals and UI copy
   - file names and folder names
   - network payload keys, schema fields, and enum values

3. Group occurrences by risk tier.
   - Tier 1 low risk: internal symbols, local constants, private helpers
   - Tier 2 medium risk: exported package APIs, shared type names, file paths
   - Tier 3 high risk: protocol contracts, schema fields, persisted data keys, analytics events

4. Choose a rename strategy per tier.
   - Tier 1: direct semantic rename
   - Tier 2: rename with coordinated import/path updates in same change
   - Tier 3: introduce compatibility aliases first, then schedule removal

5. Apply canonical replacements with context checks.
   Do not blindly replace substrings. Ensure the term refers to the movement concept, not unrelated words.

6. Handle compatibility for public or persisted contracts.
   For Tier 3 cases:
   - keep old field/message names as read aliases first
   - write canonical names as primary outputs
   - add migration or dual-read notes where storage formats are affected
   - avoid breaking clients that still send old names

7. Normalize docs and content names.
   Align docs, comments, design notes, and feature labels with the canonical terminology used in code.

8. Validate and report.
   Run project validation commands and summarize:
   - what was renamed
   - what was intentionally not renamed
   - what compatibility shims were added
   - what follow-up removals are needed

## Decision Points

### If a term is in protocol, schema, or saved data

Always use compatibility aliases before hard renames. Mark old names deprecated and document a cleanup phase.

### If a term is only internal code

Use semantic rename tools for precise updates and update tests in the same change.

### If a variant appears in player-facing text only

Apply direct copy updates, then verify consistency in menus, HUD, and tooltips.

### If the same word has multiple meanings

Rename only when the local context indicates movement terminology. Leave unrelated domain meanings unchanged.

## Completion Criteria

Do not mark complete until all are true:

- Canonical vocabulary is explicitly listed
- All known variants were searched and categorized by risk
- High-risk contracts were handled with compatibility strategy
- Tests and checks were run or an explicit reason was provided
- Remaining deprecations and cleanup steps are documented

## Suggested Prompts

- /feature-name-normalizer normalize skiing and swimming terminology to surfing across game and docs
- /feature-name-normalizer find duplicate movement feature names and propose a safe canonical map
- /feature-name-normalizer rename swim-related protocol fields with backward-compatible aliases first
