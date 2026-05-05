# Editor Change Log

Agent-maintained notes for changes that touch `apps/editor`.

## 2026-05-05

- Added this changelog and repo agent instructions requiring future `apps/editor` edits to update it.
- Validation: not run; documentation-only change.

## 2026-05-05

- Changed editor preview material setup in `apps/editor/src/preview/EditorScene.ts` to pass map-owned colors, lighting, atmosphere, water color, and cel values into shared material factories.
- User-visible behavior: editor preview continues using the same controls, but material initialization now matches runtime map data ownership instead of falling back to global game config defaults.
- Validation: `vp check --no-fmt`; `vp test`.
