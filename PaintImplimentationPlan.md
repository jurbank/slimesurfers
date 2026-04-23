# Paint Implementation Plan

## Goal

Replace the current client-side "floating sphere stamp" paint presentation with a texture-driven paint surface on each planet, while keeping the existing authoritative paint/scoring model intact.

The key boundary is unchanged:

- `packages/simulation` remains authoritative for territory ownership and score.
- `packages/protocol` continues to carry transient `PaintStampMessage` events.
- `apps/game/client` owns paint rendering, brush projection, texture updates, and shader presentation.
- `apps/game/server` stays orchestration-only and should not gain paint-rendering rules.

## Architecture Position

This feature fits the current architecture if we treat it as a rendering upgrade, not a gameplay model rewrite.

What must stay true:

- Territory cells remain the source of truth for scoring.
- Visual paint textures remain derived client presentation.
- Paint history should not become a second authoritative state.
- `MatchRoom` should continue forwarding paint events rather than deciding paint behavior.

## Assessment Of The Current Idea

The direction is good, but the implementation should be split into two responsibilities:

1. Brush application pass
   Each paint hit projects a brush into a per-planet render target or mask texture.

2. Planet shading pass
   The planet material samples that texture and blends paint into the base surface.

That split matters. The planet shader should usually not "draw into the texture" directly on collision. A better model is:

- collision happens on the server
- server emits `PaintStampMessage`
- client paint system receives the stamp
- client performs an offscreen brush-write into a render target
- planet material samples the updated texture every frame

Your listed effects also make sense with a small adjustment:

- edge noise should be applied during brush projection or final shading
- normal variation should be generated in the shader from mask/noise, not treated as gameplay data
- final blending with the planet material should happen only in the client render material

## Proposed Rendering Model

Each planet gets a `PlanetPaintSurface` owned by the client paint system.

Each surface contains:

- a paint mask render target
- optional secondary data target if we later need wetness/age/coverage detail
- a material/shader hook for the planet mesh
- temporary brush uniforms for stamping

Paint flow:

1. Simulation detects a valid paint impact and updates territory ownership.
2. Simulation emits `PaintStampMessage` with `planetId`, normal, radius, color, and sequence.
3. Server broadcasts the transient stamp message.
4. Client `PaintSystem` routes the stamp to the correct `PlanetPaintSurface`.
5. A brush projection pass writes into that planet's paint mask.
6. The planet shader samples the mask and blends painted color over the base planet surface.
7. The planet shader adds edge breakup and generated normal variation for better ink feel.

## Recommended Technical Design

### 1. Keep one-way authority

Do not send paint textures, UV buffers, or render-state data over the network.

Keep network payloads limited to authoritative gameplay state plus transient paint stamps.

### 2. Use per-planet render targets

For each planet:

- allocate a paint mask render target at a fixed resolution
- clear it on match start/disconnect
- stamp into it when a new `PaintStampMessage` arrives

This is the natural replacement for the current per-stamp sphere meshes in [apps/game/client/src/systems/paintSystem.ts](C:/Projects/j/slimesurfers/apps/game/client/src/systems/paintSystem.ts).

### 3. Project brushes from surface-space data

Current paint stamps already provide:

- `planetId`
- surface normal (`nx`, `ny`, `nz`)
- `radius`
- `color`
- monotonic `seq`

That is enough for client rendering if we define a stable planet-space mapping.

Recommended approach:

- convert the stamp normal into spherical UV coordinates on the client
- stamp a circular or soft brush into the mask texture in UV space
- treat seam handling as a rendering concern

This is simpler than trying to raycast from the camera or reconstruct collision in the client.

Initial brush asset:

- [apps/game/client/src/assets/paint/brush_mask.png](/C:/Projects/j/slimesurfers/apps/game/client/src/assets/paint/brush_mask.png) is the current soft brush mask for projection into the paint render target
- this remains a client-only rendering asset and should not move into shared gameplay packages

### 4. Separate mask data from shading

Prefer:

- mask stores coverage/intensity
- shader decides final color, edge noise, roughness feel, and fake normal response

Avoid baking too much visual style into the mask itself. That keeps iteration cheaper.

### 5. Generate normal detail in shader

Use the paint mask plus tiling noise to derive a subtle normal perturbation near the paint boundary.

That gives you:

- noisy ink edges
- a thicker/slimy look
- less texture memory than storing a full authored normal map per hit

### 6. Keep config centralized

Any tunable paint presentation values should live in `packages/content/config/gameConfig.ts` or a nearby content config file, not inline in client materials.

Likely additions:

- paint mask resolution
- brush softness
- edge noise scale
- edge noise strength
- normal perturbation strength
- paint blend strength

## Implementation Phases

## MVP Note

The full version described here is intentionally richer than the first implementation needs to be.

Recommended MVP:

- one render target per planet
- one projected brush texture using [apps/game/client/src/assets/paint/brush_mask.png](/C:/Projects/j/slimesurfers/apps/game/client/src/assets/paint/brush_mask.png)
- one simple stamp write path on paint events only
- one simple planet material blend using the paint mask
- no generated normal map yet
- no secondary paint data textures
- no wetness, aging, or extra post-processing passes

Why this should perform acceptably:

- paint writes happen only when authoritative paint stamps arrive
- steady-state rendering cost is limited to sampling the paint mask in the planet material
- it avoids the more expensive parts of the richer design until the base path is proven

Anything beyond that should be treated as post-MVP polish and added only after measuring frame cost.

### Phase 1: Replace mesh stamps with render-target paint masks

Scope:

- create per-planet paint render targets in the client
- route `PaintStampMessage` into texture writes
- update planet materials to sample the paint mask
- preserve current message format and simulation flow

Success criteria:

- paint appears on the planet surface itself
- reconnect/bootstrap behavior still works with existing recent paint stamp replay
- no gameplay authority changes

### Phase 2: Improve ink edges

Scope:

- introduce edge breakup with procedural noise
- support soft brush falloff
- tune edge quality so paint reads as sprayed rather than hard decals

Success criteria:

- visible edge variation without changing the network or simulation model

### Phase 3: Add fake thickness / slime lighting

Scope:

- derive normal perturbation from mask + noise
- blend lighting response so fresh paint catches light differently than rock

Success criteria:

- paint has material presence, not just flat color

### Phase 4: Optimize and harden

Scope:

- measure GPU cost
- avoid unnecessary target swaps
- batch stamp processing if bursts become expensive
- define clear reset/bootstrap behavior

Success criteria:

- stable frame time under sustained projectile paint spam

## Ownership By Layer

### `packages/content`

Own:

- render-tuning constants for paint visuals

Should not own:

- runtime textures
- shader execution

### `packages/protocol`

Own:

- `PaintStampMessage` contract, only if additional client-render inputs become necessary

Should not own:

- shader logic
- paint simulation rules

### `packages/simulation`

Own:

- paint hit validity
- territory ownership updates
- paint score updates
- paint stamp generation as transient output

Should not own:

- texture resolution
- shader noise logic
- render target management

### `apps/game/server`

Own:

- broadcast/bootstrap delivery of paint stamps

Should not own:

- brush projection
- visual paint persistence rules beyond replaying transient recent stamps

### `apps/game/client`

Own:

- render targets
- brush stamping
- UV conversion
- paint material/shader logic
- GPU-side cleanup/reset

## Risks And Design Checks

### Risk: duplicated truth

If the client paint texture starts being treated as the "real" painted state, architecture drifts immediately.

Rule:

- gameplay queries must continue to read authoritative territory state from simulation/schema, not the client texture

### Risk: unbounded visual history

The current model intentionally bounds visual stamp history. A texture-based approach can accidentally become infinite accumulation with no reset policy.

Rule:

- define texture clear/reset behavior per match
- keep bootstrap/replay bounded by existing recent stamp policy unless a new bounded sync model is introduced deliberately

### Risk: putting feature pressure on `MatchRoom`

If material setup or paint replay rules begin creeping into room code, the boundary is wrong.

Rule:

- room code forwards messages and sync data only

### Risk: premature abstraction

Do not build a generic "planet material graph" or "universal decal engine" yet.

Rule:

- build a focused `PlanetPaintSurface` path for this game first

## Suggested First Slice

The safest first implementation is:

1. Keep `PaintStampMessage` unchanged.
2. Replace the mesh-based `PaintSystem` with per-planet mask render targets.
3. Convert stamp normals to spherical UVs.
4. Use [apps/game/client/src/assets/paint/brush_mask.png](/C:/Projects/j/slimesurfers/apps/game/client/src/assets/paint/brush_mask.png) as the first projected brush input.
5. Blend a paint color layer over the existing planet material.
6. Add edge noise only after the basic mask path works.

That gets the core visual upgrade without disturbing authority, protocol, or score logic.

## Recommendation

The idea is solid if we frame it as:

- authoritative paint hit -> transient stamp message -> client render-target write -> shader-based final surface shading

That is architecturally sound for this repo.

The main thing I would avoid is letting "shader paint" become a new gameplay state model. Keep it presentation-only, and this feature should fit the current architecture cleanly.
