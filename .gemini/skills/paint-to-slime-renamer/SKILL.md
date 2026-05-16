---
name: paint-to-slime-renamer
description: "Rename terminology from paint to slime across the codebase. Use for word-level refactors, API/message naming updates, docs synchronization, and safe validation when converting paint terms to slime terms."
argument-hint: "Scope or constraints, for example: exact word only, include comments/docs, skip protocol compatibility aliases"
---

# Paint To Slime Renamer

## What This Skill Produces

This skill performs a safe, repeatable terminology migration from `paint` to `slime`.

Expected output:

- All targeted `paint` occurrences are renamed to `slime`.
- Relevant file and folder names containing `paint` are renamed to `slime` when doing so improves consistency and does not break project structure.
- Non-target substrings (for example, `repaint`, `painting`) are preserved unless explicitly requested.
- Build/test checks pass, or failures are reported with likely follow-ups.

## When To Use

Use this skill when:

- A feature, system, or package is moving from paint terminology to slime terminology.
- You need consistent naming in code, schemas, protocol messages, tests, and docs.
- You want a guarded migration that avoids accidental substring replacements.

## Procedure

1. Define rename scope and compatibility constraints.
2. Inventory occurrences before changing anything.
3. Apply targeted rename rules (exact-token first, then optional variants).
4. Rename relevant files and folders that include `paint`, then update imports/paths/references.
5. Resolve compile/type/test breakages introduced by renamed identifiers and paths.
6. Re-scan for leftovers and confirm expected exclusions.
7. Run project validation and summarize deltas.

## Decision Points

1. Exact token or broad replacement:

- Default: replace exact standalone word `paint` with `slime`.
- Optional: include `Paint` -> `Slime`, `PAINT` -> `SLIME`, and identifier fragments like `paintScore` -> `slimeScore`.

2. Compatibility policy:

- If external contracts depend on old names, add compatibility aliases or translation shims.
- If no compatibility is required, fully migrate to slime naming.

3. File categories:

- Code-only migration.
- Code plus tests/docs/config and changelog text.

4. Path rename relevance:

- Rename files/folders when they represent domain terminology (for example, `paint` systems, modules, docs).
- Skip generated, third-party, or externally contract-bound paths unless explicitly approved.

## Quality Checks

Completion criteria:

- No unintended replacements in unrelated words.
- No unresolved references to renamed symbols.
- No broken imports or references after file/folder renames.
- Search confirms no remaining targeted `paint` terms in selected scope.
- Validation commands succeed, or failures are explicitly documented.

## Recommended Execution Notes

- Start with read-only discovery using fast search.
- Prefer semantic symbol rename when available for exported APIs.
- Use small, reviewable patches.
- For path renames, update import specifiers and any config globs in the same change set.
- Keep comments minimal and update only when wording is now misleading.

## Example Prompts

- Rename all exact `paint` tokens to `slime` in simulation and protocol packages only.
- Migrate `paint` naming to `slime`, include docs and tests, preserve backward compatibility for network message fields.
- Convert `paint` to `slime` and report every skipped occurrence with reason.
- Rename `paint` terms to `slime` across code plus relevant file/folder names, then fix and verify all updated import paths.
