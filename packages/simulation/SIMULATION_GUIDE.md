# Simulation Manifest: @splat/simulation

This document defines the stable architectural boundaries for the Simulation package. The simulation is the **authoritative brain** of the game and must remain decoupled from presentation and transport layers.

## The Golden Rule

**The Simulation must be "Headless" and "Pure".** It must be able to run in a console-only environment (Node/Vitest) without a browser, a GPU (Three.js), or a Network (Colyseus).

## Architectural Context (The "Above" View)

- **Consumes ONLY:** `@splat/content` (Config/Tunables) and `@splat/protocol` (Shared Types).
- **Consumed BY:**
  - `apps/game/client`: Uses simulation for **Client-Side Prediction**.
  - `apps/game/server`: Uses simulation for **Authoritative Truth**.
  - `apps/editor`: Uses simulation through local preview/runtime adapters for authoring feedback.
- **The Boundary:** If a variable affects gameplay outcome (movement speed, scoring, death), it **must** live here.

## Responsibility Checklist

### 1. Authoritative Logic (Internal)

- **Deterministic Updates:** `update(dt)` must produce the same result given the same inputs across all environments.
- **Movement & Physics:** Authoritative collision resolution and position stepping.
- **State Management:** Tracking active players, respawn timers, and match phases.
- **Runtime Map Consumption:** Planets, terrain providers, spawns, rails, pickups, props with gameplay collision, objectives, and initial paint/slime regions may be consumed as plain validated data.

### 2. Implementation Constraints (External)

- **NO Graphics:** Do not import `Three.js` or reference `Mesh`, `Material`, or `Scene`. Use vectors and math.
- **NO Side Effects:** Do not use `window`, `document`, `localStorage`, or `fetch`.
- **NO Networking:** Do not use Colyseus Room logic or `send/broadcast`. The simulation only processes inputs and outputs state.
- **NO Direct I/O:** Do not perform file system operations.
- **NO Editor Internals:** Do not import editor tools, brush state, React state, selected handles, or Three.js meshes. Editor-authored content must arrive as validated runtime map data or simulation-safe providers.

## Runtime Map Boundary

Simulation should be able to run the same map in:

- server-authoritative multiplayer
- client prediction/reconciliation
- single-player/local game sessions
- editor local preview
- headless tests

That requires one production-shaped input contract. The simulation may accept `RuntimeMapData` or
derived plain structures from it, but it should not know whether the data came from checked-in
content, an editor export, a local preview session, single-player setup, or a future user-generated
map.

Healthy map inputs:

- plain planet ids, centers, radii, and terrain parameters
- deterministic terrain surface providers
- spawn definitions
- precomputed or deterministically buildable rail data
- bounded collision/gameplay prop definitions
- pickup/objective definitions
- initial paint or territory state

Unhealthy map inputs:

- Three.js geometry or scene objects
- editor brush/tool instances
- browser events or local storage state
- network/schema objects as the mutable simulation source of truth
- unvalidated user-authored data

Map validation should happen before a match or preview starts. Simulation code can assume validated
structural invariants, but systems should still fail closed on unknown ids or missing optional data.

## Testing & Validation

Because this package is the source of truth, all logic must be verifiable via:

1.  **Unit Tests:** Testing individual math and utility functions (e.g., `worldPosToUV`).
2.  **Headless Simulation:** Ticking the engine in a loop via script to verify state transitions.
3.  **Runtime Map Fixtures:** Loading the same fixture map through production and editor-preview
    adapters to prove authored content reaches gameplay without editor-only assumptions.

## Anti-Patterns to Prevent

- **Visual Dependency:** Letting simulation logic wait for a client-side animation to complete.
- **Input Leakage:** Handling raw `KeyboardEvents` or `PointerEvents` (handle only a clean `InputState` object).
- **Schema Mixing:** Importing Colyseus `Schema` classes into pure math functions (keep math functions "POJO" – Plain Old JavaScript Objects).
- **Visual Truth:** Treating the high-res visual "splats" on the GPU as the score. The `Uint8Array` in the simulation is the only truth.
- **Editor Truth:** Letting editor preview rules become the only place a gameplay feature works.

## Change Standard

A change is healthy if it:

- Improves the determinism of the game loop.
- Decouples gameplay math from rendering.
- Centralizes a new game rule that needs to be shared by Client and Server.
- Lets server, client prediction, editor preview, and tests consume the same runtime map data.
