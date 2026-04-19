# Periodic Review

Review the project as it exists today. Use [README.md](./README.md), [ROADMAP.md](./ROADMAP.md), and code in the repo as the source of truth. Use [IDEA.MD](./IDEA.MD) only as optional background, not as the main authority.

The goal is to catch architectural drift early without creating churn.

## Output Rules

- Prioritize concrete findings over general advice.
- Only flag an issue when you can point to specific files or code paths.
- Do not suggest broad rewrites unless the current structure clearly blocks the roadmap.
- Prefer "keep", "tighten", or "extract" over "re-architect".
- If something looks fine, say so.
- If you are unsure, mark it as a question, not a conclusion.

## Review Focus

Check whether the project is still aligned with the current direction:

- server-authoritative multiplayer architecture
- territory control as a core game loop
- clear package boundaries between `content`, `protocol`, `simulation`, `client`, and `server`
- scalable movement, combat, networking, and UI organization

## Questions To Answer

1. Are package and file boundaries still clean?
   - Is logic living in the right package?
   - Are there files becoming catch-all bottlenecks or mixed-responsibility blobs?
   - Are there imports that suggest boundary drift?

2. Is configurability staying under control?
   - Are tunable gameplay or network values kept in config/content where appropriate?
   - Are constants duplicated across client, server, and simulation?

3. Is the multiplayer architecture holding up?
   - Is server authority preserved?
   - Is `MatchRoom` or equivalent room/network code accumulating game-rule logic?
   - Are protocol/schema concerns staying separate from simulation logic?

4. Are movement, combat, paint, and scoring systems organized to scale?
   - Are responsibilities separated enough to extend safely?
   - Are there signs of coupling that will make future modes or netcode harder?

5. Is the UI/client structure staying coherent?
   - Are UI concerns grouped sensibly?
   - Is netcode/client state handling staying distinct from rendering and presentation?

6. Are tests covering the architecture that matters?
   - What critical systems are protected by tests?
   - What important architectural risks are still untested?

7. Is reusable infrastructure staying appropriately generic?
   - Are simulation primitives, protocol utilities, and content-loading patterns reusable without dragging in game-specific rules?
   - Are game-specific mechanics staying in domain modules instead of leaking into shared infrastructure?
   - Are abstractions earned by current needs, or are they becoming premature engine work?

## Response Format

Use this structure:

### Findings

- List only concrete issues or risks.
- Include file references when possible.
- Order by severity.

### Open Questions

- List uncertainties that need human judgment.

### Still On Track

- Call out parts of the architecture that are holding up well.

### Recommended Next Step

- Suggest the single highest-leverage follow-up, if any.
