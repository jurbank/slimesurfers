# Simulation Manifest: @splat/simulation

This document defines the stable architectural boundaries for the Simulation package. The simulation is the **authoritative brain** of the game and must remain decoupled from presentation and transport layers.

## The Golden Rule

**The Simulation must be "Headless" and "Pure".** It must be able to run in a console-only environment (Node/Vitest) without a browser, a GPU (Three.js), or a Network (Colyseus).

## Architectural Context (The "Above" View)

- **Consumes ONLY:** `@splat/content` (Config/Tunables) and `@splat/protocol` (Shared Types).
- **Consumed BY:** \* `apps/game/client`: Uses simulation for **Client-Side Prediction**.
  - `apps/game/server`: Uses simulation for **Authoritative Truth**.
- **The Boundary:** If a variable affects gameplay outcome (movement speed, scoring, death), it **must** live here.

## Responsibility Checklist

### 1. Authoritative Logic (Internal)

- **Deterministic Updates:** `update(dt)` must produce the same result given the same inputs across all environments.
- **Movement & Physics:** Authoritative collision resolution and position stepping.
- **State Management:** Tracking active players, respawn timers, and match phases.

### 2. Implementation Constraints (External)

- **NO Graphics:** Do not import `Three.js` or reference `Mesh`, `Material`, or `Scene`. Use vectors and math.
- **NO Side Effects:** Do not use `window`, `document`, `localStorage`, or `fetch`.
- **NO Networking:** Do not use Colyseus Room logic or `send/broadcast`. The simulation only processes inputs and outputs state.
- **NO Direct I/O:** Do not perform file system operations.

## Testing & Validation

Because this package is the source of truth, all logic must be verifiable via:

1.  **Unit Tests:** Testing individual math and utility functions (e.g., `worldPosToUV`).
2.  **Headless Simulation:** Ticking the engine in a loop via script to verify state transitions.

## Anti-Patterns to Prevent

- **Visual Dependency:** Letting simulation logic wait for a client-side animation to complete.
- **Input Leakage:** Handling raw `KeyboardEvents` or `PointerEvents` (handle only a clean `InputState` object).
- **Schema Mixing:** Importing Colyseus `Schema` classes into pure math functions (keep math functions "POJO" – Plain Old JavaScript Objects).
- **Visual Truth:** Treating the high-res visual "splats" on the GPU as the score. The `Uint8Array` in the simulation is the only truth.

## Change Standard

A change is healthy if it:

- Improves the determinism of the game loop.
- Decouples gameplay math from rendering.
- Centralizes a new game rule that needs to be shared by Client and Server.
