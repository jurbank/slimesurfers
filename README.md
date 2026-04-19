# jam2

Server-authoritative online battle arena prototype inspired by Splatoon, built around spherical planets and territory control.

## Workspace

- `apps/game/client`: browser client, rendering, input, and netcode
- `apps/game/server`: Colyseus transport and match hosting
- `packages/content`: game tuning values and authored content definitions
- `packages/protocol`: network payloads and Colyseus schema contracts
- `packages/simulation`: deterministic gameplay simulation primitives

## Principles

- online-first architecture
- server authority over match state
- territory control as the primary win condition
- clean package boundaries before feature expansion

## Commands

```bash
vp install
vp check
vp test
vp run @splat/game-client#dev
vp run @splat/game-server#dev
```

## Current Direction

The current cleanup roadmap is documented in [ROADMAP.md](./ROADMAP.md).
