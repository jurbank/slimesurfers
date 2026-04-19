# Movement

This document is the fast-path reference for movement work. Use it before changing movement logic, prediction, or reconciliation.

Related docs:

- [COMBAT.md](/C:/Projects/j/jam2/packages/simulation/combat/COMBAT.md) for projectile fire, damage, respawn, and paint-impact rules that consume `aimDir` and affect `state.rot`.
- [ARCHITECTURE.md](/C:/Projects/j/jam2/ARCHITECTURE.md) for core game/system architecture
- [CAMERA.md](/C:/Projects/j/jam2/apps/game/client/src/systems/CAMERA.md) for camera related

## Ownership

- Authoritative player movement lives in [simulatedMovement.ts](/C:/Projects/j/jam2/packages/simulation/movement/simulatedMovement.ts).
- The server drives that movement from [matchSimulation.ts](/C:/Projects/j/jam2/packages/simulation/match/matchSimulation.ts).
- The client reuses the same `stepPlayer` function for local prediction in [runtimeState.ts](/C:/Projects/j/jam2/apps/game/client/src/network/runtimeState.ts).
- Client input intent and aim direction come from [inputSystem.ts](/C:/Projects/j/jam2/apps/game/client/src/systems/inputSystem.ts).
- Rendering code in [player.ts](/C:/Projects/j/jam2/apps/game/client/src/entities/player/player.ts) and [remotePlayer.ts](/C:/Projects/j/jam2/apps/game/client/src/entities/player/remotePlayer.ts) only displays movement state. It does not decide movement.

## Source Of Truth

- Server simulation is authoritative for `pos`, `vel`, `rot`, `planetId`, `movementState`, and accepted `inputSeq`.
- The client may predict movement locally, but must reconcile back to authoritative snapshots.
- Shared movement math must stay deterministic enough for server and client to both call `stepPlayer` with the same config and input stream.
- Movement tuning belongs in `GAME_CONFIG`, not in client-only code or room orchestration.

## Tick Flow

1. The client captures keys and pointer-lock aim in `InputSystem`.
2. The client sends `InputMessage` packets with `seq`, `keys`, `aimDir`, and `dt`.
3. The server queues those inputs in `MatchSimulation.recordInput`.
4. On each server tick, `MatchSimulation.tick` advances each player with `stepPlayer`.
5. The same input stream may trigger `tryFireProjectile` after movement stepping. See [COMBAT.md](/C:/Projects/j/jam2/packages/simulation/combat/COMBAT.md).
6. The server publishes authoritative snapshots containing movement state and `inputSeq`.
7. The client applies the snapshot in `ClientRuntimeState.reconcileLocalPlayer`.
8. The client discards acknowledged inputs and replays any remaining pending inputs through `stepPlayer`.
9. Remote players are interpolated from snapshot history, not simulated from local input.

## Movement Model

### Client Aim State

The client maintains a separate orientation quaternion, `InputSystem._localRotation`, that is parallel-transported every frame to track the current planet surface normal. `computeAimDir` builds `aimDir` from this quaternion (yaw) plus a clamped pitch offset. `getYawForward` returns the +Z direction of `_localRotation` without pitch.

This state is **not** part of the prediction/reconciliation loop. It is never reset when the server corrects `state.rot`. If the server corrects the player's position to a very different surface orientation, `_localRotation` and `state.rot` can diverge until the player moves the mouse.

### Grounded

- A player is grounded when `planetId !== ""`.
- Surface movement is tangent to the current planet surface.
- `aimDir` is projected onto the tangent plane to establish forward.
- Movement input sets horizontal velocity directly to `moveSpeed` in the tangent basis.
- With no movement input, grounded velocity decays through friction.
- After movement, the player is parallel-transported to the new surface normal and snapped back to `planet.radius + collisionRadius`.
- If aiming, the player rotation is rebuilt from tangent axes so the player faces along the tangent-projected aim direction.

### Surface State (Slime/Paint)

Movement parameters dynamically adjust based on the surface grid underneath the player. During the `stepPlayer` tick, the simulation queries the planet's surface map at the player's current position to apply modifiers before calculating velocity.

- **Grid Lookup:** The simulation maps the player's 3D position to the local surface grid of `planetId` to determine the current terrain state (Neutral, Friendly Slime, Enemy Slime).
- **Friendly Slime (Swim Action):** - Base `moveSpeed` and acceleration are multiplied.
  - The `collisionRadius` and hitbox height are reduced to simulate submerging into the surface.
- **Enemy Slime:** - Base `moveSpeed` is severely dampened.
  - Jumping is explicitly disabled.
- **Prediction:** The client predicts these movement modifiers using its locally replicated slime grid. If the server's authoritative slime grid differs from the client's (e.g., due to a recent un-replicated projectile splash), the client's predicted velocity will be wrong and will be corrected during the next snapshot reconciliation.

### Airborne

- A player is airborne when `planetId === ""`.
- Gravity pulls toward the nearest planet center.
- Extra acceleration is applied if the player drifts beyond `arenaReturnDistance`.
- Landing happens after integration when the player is within snap distance and moving toward the planet.
- Jumping clears `planetId`, applies impulse along the surface normal, and enters `Airborne`.

## Invariants

- `MatchRoom` should not contain gameplay movement rules. Keep those in simulation.
- `stepPlayer` mutates the provided state in place. Be careful with schema-backed objects.
- Grounded players should end the step snapped to planet radius plus collision radius.
- Grounded velocity should remain tangent to the surface after transport.
- `planetId` is the grounded/airborne switch:
  - non-empty means grounded on that planet
  - empty string means airborne
- `inputSeq` is the reconciliation boundary. The client must only replay inputs with `seq > authoritative.inputSeq`.
- Remote interpolation should not become a second authority path for local movement.
- **Rotation convention**: `state.rot` encodes a full player orientation where local +Y = outward surface normal, local +Z = forward facing direction. It is built by `quatFromAxes(right, surfaceNormal, forward)` and forward is recovered as `applyQuat({x:0, y:0, z:1}, state.rot)`.
- `InputSystem._localRotation` and `state.rot` share the same forward/up convention but are updated independently. They should be approximately aligned during normal play but can diverge after a server correction.
- **Surface lookups must be deterministic:** `stepPlayer` requires read-only access to the current planet's slime/paint grid. Do not pass asynchronous or rendering-dependent data into the movement step to determine surface state.

## First Files To Inspect

For most movement bugs, read these in order:

1. [simulatedMovement.ts](/C:/Projects/j/jam2/packages/simulation/movement/simulatedMovement.ts)
2. [matchSimulation.ts](/C:/Projects/j/jam2/packages/simulation/match/matchSimulation.ts)
3. [runtimeState.ts](/C:/Projects/j/jam2/apps/game/client/src/network/runtimeState.ts)
4. [inputSystem.ts](/C:/Projects/j/jam2/apps/game/client/src/systems/inputSystem.ts)

If the issue is visual-only after state looks correct, then inspect:

1. [player.ts](/C:/Projects/j/jam2/apps/game/client/src/entities/player/player.ts)
2. [remotePlayer.ts](/C:/Projects/j/jam2/apps/game/client/src/entities/player/remotePlayer.ts)

## Bug Triage

Classify the issue before editing:

- Simulation bug: authoritative server state is wrong.
- Prediction bug: local player feels wrong before reconciliation.
- Reconciliation bug: local player snaps, jitters, or diverges after snapshots.
- Aim state bug: camera or player facing drifts or snaps incorrectly after a server correction. Root cause is usually `InputSystem._localRotation` diverging from `state.rot` — not a simulation or reconciliation bug.
- Interpolation bug: remote players stutter or drift.
- Rendering bug: mesh orientation or position display is wrong while state is correct.

## Common Failure Modes

- Changing client movement behavior without making the same change in shared simulation.
- Breaking tangent projection so grounded movement leaks into the surface normal.
- Replacing in-place mutation with object replacement on schema-backed state.
- Using schema state as the frame-by-frame movement driver instead of snapshots plus runtime prediction/interpolation.
- Treating `aimDir` as world-forward without reprojecting onto the local surface.
- Replaying already acknowledged inputs and creating prediction drift.
- Letting room orchestration absorb simulation rules that belong in `stepPlayer`.
- `InputSystem._localRotation` not being reset after reconciliation: if the server corrects `state.rot` significantly (e.g. after respawn), the aim basis can be out of phase with the player's actual surface orientation until the player moves the mouse.
- Remote quaternion interpolation uses component-wise lerp, not slerp. For small angular deltas between snapshots this is fine, but large corrections (e.g. teleport or respawn) can produce a briefly un-normalized quaternion before the next snapshot arrives.

## Tests

- Movement unit tests live in [simulatedMovement.test.ts](/C:/Projects/j/jam2/packages/simulation/movement/simulatedMovement.test.ts).
- Match-level integration coverage lives in [matchSimulation.test.ts](/C:/Projects/j/jam2/packages/simulation/match/matchSimulation.test.ts).

Useful commands:

```powershell
vp test
vp check
```

When fixing movement, prefer adding or updating a focused simulation test before changing client presentation code.
