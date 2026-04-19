# Combat

This document is the fast-path reference for combat work. Use it before changing firing, projectile simulation, damage, respawn, or paint impact rules.

Related docs:

- [MOVEMENT.md](/C:/Projects/j/jam2/packages/simulation/movement/MOVEMENT.md) for `aimDir`, grounded vs airborne state, and player rotation rules that directly affect firing behavior.
- [CAMERA.md](/C:/Projects/j/jam2/apps/game/client/src/systems/CAMERA.md) for 3rd-person aiming, crosshair projection, and parallax correction.
- [ARCHITECTURE.md](/C:/Projects/j/jam2/ARCHITECTURE.md) for core game/system architecture

## Ownership

- Authoritative combat rules live in [projectiles.ts](/C:/Projects/j/jam2/packages/simulation/combat/projectiles.ts).
- The server invokes combat from [matchSimulation.ts](/C:/Projects/j/jam2/packages/simulation/match/matchSimulation.ts).
- Shared input shape comes from [clientMessages.ts](/C:/Projects/j/jam2/packages/protocol/network/clientMessages.ts).
- Authoritative projectile snapshots and paint stamp messages are defined in [serverMessages.ts](/C:/Projects/j/jam2/packages/protocol/network/serverMessages.ts).
- Territory ownership and paint scoring effects are applied by [stampPaint.ts](/C:/Projects/j/jam2/packages/simulation/paint/stampPaint.ts).
- Client-side projectile visuals live in [projectileSystem.ts](/C:/Projects/j/jam2/apps/game/client/src/systems/projectileSystem.ts).
- Client-side paint visuals live in [paintSystem.ts](/C:/Projects/j/jam2/apps/game/client/src/systems/paintSystem.ts).

## Source Of Truth

- The server is authoritative for:
  - whether a shot is accepted
  - projectile spawn position and velocity
  - damage, death, kill credit, and respawn timing
  - paint impact events and territory updates
- The client is responsible for rendering authoritative server state, but may perform local prediction for firing visuals and paint stamps to improve responsiveness (see Planned Extensions).
- Combat tuning belongs in `GAME_CONFIG` and `NETWORK_CONFIG`, not client-only code.
- Slime/ammo tuning lives in `GAME_CONFIG.slime`.

## Tick Flow

1. The client sends `InputMessage` with key bits and world-space `aimDir`.
2. The server processes queued inputs in `MatchSimulation.tick`.
3. For each input, the server steps movement first with `stepPlayer`.
4. The server applies slime regeneration based on the post-movement surface state, applying either passive or active recharge rates.
5. After movement, the server calls `tryFireProjectile`.
6. Accepted shots spawn authoritative projectiles into `simState.projectiles`.
7. Each server tick, `tickProjectiles` advances projectile positions, resolves hits, applies paint impacts, and removes expired projectiles.
8. The server includes active projectiles in `SnapshotMessage`.
9. The server sends transient paint stamp batch messages for visual paint splashes while territory ownership remains authoritative in simulation/schema state.
10. The client predicts local firing and paint stamps for immediate feedback, then reconciles with authoritative projectile snapshots and paint messages from the server. The client does not decide hit results.

## Combat Model

### Firing

- Firing is gated by `InputKey.Fire`.
- Dead players cannot fire.
- Fire rate is limited by `player.lastFireTimeMs` and `projectile.fireCooldownMs`.
- Room-wide projectile count is capped by `NETWORK_CONFIG.limits.maxProjectilesPerRoom`.
- Projectile velocity is derived directly from normalized `input.aimDir`.
- Projectile spawn position is offset forward from the player by collision radius plus projectile radius so shots begin just in front of the player.
- On accepted fire, the player's `rot` is updated to face the firing direction.

### Projectile Simulation

- Projectiles are authoritative simulation entities in `simState.projectiles`.
- Each tick, projectile `lifeMs` is reduced and position advances by velocity.
- Expired projectiles are removed.
- Projectile motion is not client-predicted in the authoritative model; the client only extrapolates visuals between snapshots.

### Damage And Elimination

- A projectile hit checks distance against `player.collisionRadius + projectile.collisionRadius`.
- The projectile owner cannot hit themselves.
- Dead players are ignored by hit detection.
- On hit, health is reduced by `player.projectileDamage`.
- If health reaches zero:
  - the victim enters `PlayerMovementState.Dead`
  - `respawnTimer` is set
  - `deathCount` increments
  - the owner receives kill credit if present

### Respawn

- Respawn countdown runs inside `tickProjectiles`.
- When the timer reaches zero, the player is restored on `spawnPlanetId`.
- Respawn resets:
  - `pos`
  - `vel`
  - `rot`
  - `planetId`
  - `health`
  - `respawnTimer`
  - `movementState`

### Paint Impact

- Projectile hits can paint both on player collision and planet collision.
- Paint impact uses the nearest impacted planet for attribution.
- `applyPaintImpact` updates authoritative territory state first, then emits a transient paint stamp entry that is batched for transport.
- Visual paint stamps are not authoritative scoring state.
- This matches the Splatoon-style loop: shots are both combat pressure and territory-control tools.

## Interaction With Movement

- `aimDir` comes from client movement/input orientation, not combat code.
- `MatchSimulation.tick` steps movement before firing, so a shot uses the post-movement player state for that input.
- Combat can update `player.rot` to face the shot direction on fire.
- `planetId` matters for spawned projectile context and respawn destination.
- Bugs that look like bad shooting can actually be aim-basis or reconciliation issues in [MOVEMENT.md](/C:/Projects/j/jam2/packages/simulation/movement/MOVEMENT.md).

## Invariants

- Combat authority stays on the server.
- Do not move hit resolution or accepted-fire decisions into client rendering code.
- Projectiles, damage, paint, and respawn should remain simulation concerns, not room-lifecycle glue.
- Territory ownership is authoritative; visual paint stamps are secondary.
- Projectile snapshots and paint messages should not become competing sources of truth for score or ownership.
- Dead players should not move through normal gameplay flow or continue firing.
- `slimeLevel` is an authoritative simulation variable, not a client UI concern. It must be updated synchronously during the simulation tick.
- Regeneration rates must use `dt` (delta time) to ensure consistent refill speeds across different server tick rates.

## Planned Extensions

### 1. Area of Effect (AoE) & Splash Damage

In Splatoon-style combat, precision is often secondary to area control. Most combat relies on splash damage from paint hitting surfaces near a player.

- **Status:** Damage currently only occurs on direct projectile-to-player overlap.
- **Requirement:** When a projectile hits a planet, `applyPaintImpact` should query for nearby players within a blast radius and apply distance-scaled splash damage.
- **Architecture:** Must remain server-authoritative. The server calculates the explosion radius and applies damage to all affected `SimPlayerState` entities in the same tick.

### 2. Alternate Weapon Archetypes

Weapons should be distinct state machines with different attack shapes and firing behaviors.

- **Rollers (Melee/Continuous):** Requires a continuous active hitbox attached to the player while the fire key is held, applying ground paint and heavy melee damage in a path.
- **Chargers (Snipers):** Requires an input hold state to build charge, followed by an instantaneous raycast (hitscan) rather than a physical projectile.
- **Blasters:** Projectiles that explode in mid-air at a specific range or on timer, triggering an AoE splash even without a surface hit.
- **Requirement:** `tryFireProjectile` and `tickProjectiles` must be refactored to support these different behaviors beyond simple linear projectiles.

### 3. Client-Side Prediction for Firing (UX)

To eliminate perceived input lag, the client should predict the results of its own shots.

- **Status:** The client currently waits for server snapshots to render projectiles and paint.
- **Requirement:** The client should spawn a "predicted" visual projectile and local paint stamp immediately upon firing.
- **Reconciliation:** When the authoritative `SnapshotMessage` or paint stamp batch arrives, the client must quietly reconcile the predicted visual with the server's truth. If the server rejects the shot (e.g., due to fire rate or slime levels), the predicted visual should be removed or corrected.

## First Files To Inspect

For most combat bugs, read these in order:

1. [projectiles.ts](/C:/Projects/j/jam2/packages/simulation/combat/projectiles.ts)
2. [matchSimulation.ts](/C:/Projects/j/jam2/packages/simulation/match/matchSimulation.ts)
3. [serverMessages.ts](/C:/Projects/j/jam2/packages/protocol/network/serverMessages.ts)
4. [stampPaint.ts](/C:/Projects/j/jam2/packages/simulation/paint/stampPaint.ts)

If the issue is visual-only after authoritative state looks correct, then inspect:

1. [projectileSystem.ts](/C:/Projects/j/jam2/apps/game/client/src/systems/projectileSystem.ts)
2. [paintSystem.ts](/C:/Projects/j/jam2/apps/game/client/src/systems/paintSystem.ts)

## Bug Triage

Classify the issue before editing:

- Fire acceptance bug: player input should or should not spawn a projectile.
- Projectile sim bug: speed, lifetime, travel path, or despawn timing is wrong.
- Hit detection bug: direct collisions miss or false-hit.
- Damage/respawn bug: health, death, kill credit, or respawn state is wrong.
- Paint impact bug: shot visuals appear but territory/scoring outcome is wrong.
- Presentation bug: projectile or paint rendering is wrong while authoritative state is correct.
- Movement/combat boundary bug: aim or facing is wrong because input orientation and movement state disagree.

## Common Failure Modes

- Debugging projectile visuals before checking server fire acceptance.
- Changing `aimDir` semantics in client input without updating combat assumptions.
- Spawning projectiles from stale pre-movement state instead of the post-step player transform.
- Treating paint stamps as the authoritative record of territory ownership.
- Forgetting that dead players are filtered out of firing and hit handling.
- Breaking respawn by resetting only health and not the rest of the movement/combat state.
- Adding client-side hit logic that conflicts with the server.
- Forgetting that the client extrapolates projectile visuals from snapshots, so visual drift is not automatically a server sim bug.

## Tests

There is not yet dedicated combat test coverage under `packages/simulation/combat`.

When changing combat, prefer adding focused tests for:

- fire cooldown acceptance
- projectile spawn offset and velocity
- hit detection against players
- planet impact behavior
- kill credit and respawn timing
- paint impact side effects

Useful commands:

```powershell
vp test
vp check
```

For this game, combat changes should be evaluated as both shooter feel and territory-control behavior. A combat fix that weakens readability, mobility interplay, or paint-pressure pacing is not automatically a good fix.

### Slime / Paint Resource (Ammo)

- Combat is gated by the player's `slimeLevel`. Every shot processed by `tryFireProjectile` consumes `GAME_CONFIG.slime.shotCost`.
- If `slimeLevel` is less than the weapon's cost, the shot is rejected.
- Slime regenerates continuously over time on the server. The regeneration rate is context-dependent:
  - **Passive Recharge:** When walking on neutral terrain, airborne, or caught in Enemy Slime, `slimeLevel` regenerates at `GAME_CONFIG.slime.passiveRechargePerSecond`.
  - **Friendly Paint Recharge:** When grounded on Friendly Slime, `slimeLevel` regenerates at `GAME_CONFIG.slime.friendlyPaintRechargePerSecond`.
  - **Submerged Recharge:** When submerged in Friendly Slime, `slimeLevel` regenerates at `GAME_CONFIG.slime.submergedRechargePerSecond`.
- Firing pauses all regeneration for `GAME_CONFIG.slime.rechargeDelayMs`.
- `slimeLevel` is capped at `GAME_CONFIG.slime.maxLevel`.
- The server is authoritative over `slimeLevel`, but the client predicts its local value to smoothly update the UI tank. Server corrections will snap the UI if prediction drifts.
