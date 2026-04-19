# Camera System

Fast-path reference for camera follow logic, planet-relative orientation, and occlusion.

Related docs:

- [MOVEMENT.md](/C:/Projects/j/jam2/packages/simulation/movement/MOVEMENT.md) for `aimDir`, grounded vs airborne state, and player rotation rules that directly affect firing behavior.
- [COMBAT.md](/C:/Projects/j/jam2/packages/simulation/combat/COMBAT.md) for projectile fire, damage, respawn, and paint-impact rules that consume `aimDir` and affect `state.rot`.
- [ARCHITECTURE.md](/C:/Projects/j/jam2/ARCHITECTURE.md) for core game/system architecture

## Ownership

- **Logic:** [cameraSystem.ts](./cameraSystem.ts)
- **Invocation:** `matchScene.ts` (render loop)
- **Input:** `inputSystem.ts` (aimDir/look bits)

## Coordinate Space

- **Local Up:** Vector from planet center through player position.
- **Yaw Forward:** Surface-tangent vector representing horizontal player facing.
- **Camera Arm:** Vector offset from player position to camera.

## Follow Logic (Over-the-Shoulder)

1. **Orientation:** `camera.up` must match `Local Up` to align the horizon with the surface.
2. **Positioning:** Offset from player using:
   - `-Yaw Forward * CAMERA_BACK` (Distance behind)
   - `Local Up * CAMERA_UP` (Height above)
   - `Local Right * CAMERA_SIDE` (Lateral offset for shoulder view)
3. **Framing:** `lookAt` player center with a vertical offset (approx. 1.5 units). The lateral offset ensures the player model occupies the screen's side, keeping the crosshair clear.

## Aiming

Aiming in a 3rd-person planet-based shooter requires reconciling the camera's viewport with the character's world-space projectiles.

- **Projection:** The center of the screen (crosshair) represents the player's intended target. The `inputSystem` translates mouse/stick deltas into a 3D `aimDir`.
- **Parallel Transport:** To maintain a consistent "Forward" while moving across curved planet surfaces, the aiming basis is rotated each frame to stay tangent to the local `Surface Normal`.
- **3rd-Person Parallax:** The OTS offset means projectiles must be "zeroed" at a distance.
- **Correction Strategy:**
  1. **World Raycast:** Cast a ray from the camera through the crosshair to find the `Impact Point`.
  2. **Vector Resolution:** The authoritative `aimDir` is the normalized vector from the `Player Position` to the `Impact Point`.
  3. **Fallback:** If no geometry is hit, `aimDir` defaults to the camera's forward vector at infinite range.

## Vertical Pitch (Camera)

- **Rotation:** Tilt the camera arm around the "Right" axis (cross product of `Local Up` and `Yaw Forward`).
- **Clamping:** Limit pitch to "Near-Vertical" (e.g., ±89°). Avoid exactly 90° to prevent gimbal lock, but ensure players can aim high enough to paint ceilings and high walls.
- **Shoulder Shift:** As the player aims toward the vertical poles, the OTS offset (`CAMERA_SIDE`) ensures the player character doesn't block the crosshair, while the arm may shorten to prevent ground clipping.
- **Parallax:** Crosshair must align with the authoritative `aimDir`, accounting for the 3rd-person offset.

## Camera Occlusion (The "Spring Arm")

- **Raycast:** Cast from the `lookAt` target to the desired camera position.
- **Retraction:** If geometry is hit at distance `d`, move camera to `d - padding`.
- **Scope:** Must check against all static geometry (planets, buildings, props).
- **Smoothing:** Interpolate between occluded and desired distances to prevent visual "popping."

### Current Implementation (planets only)

A ray-sphere intersection is cast from `playerPos` along the arm direction against the nearest planet. `testRadius = playerDist - COLLISION_RADIUS + SURFACE_GAP`. If the ray hits before reaching full arm length the camera retracts to `t_hit`, so at steep upward pitch angles the camera orbits near the player's feet and `lookAt` pitches it upward to keep the player in frame.

Not yet implemented: multi-mesh scope, arm-length smoothing between frames.

## Invariants

- **Surface Clipping:** Never allow the camera to enter the planet geometry.
- **Horizon Alignment:** Camera "Up" must always synchronize with the nearest planet's gravitational "Up."
- **Update Timing:** Update camera after movement interpolation but before frame render.

## Planned Extensions

- **Orbital Camera:** Detached horizontal rotation (mouse look) independent of movement.
- **Planet Transitions:** Smooth interpolation of the `Up` vector during gravity-well swaps.
- **Adaptive FOV:** Scale field-of-view based on player velocity.
- **Camera Shake:** Procedural trauma effects for damage and explosions.

## Debugging

- **Jitter:** Verify the camera is using interpolated player positions, not raw server snapshots.
- **Flipping:** Ensure `Yaw Forward` is normalized and valid at the poles.
- **Flicker:** Confirm `nearestPlanetCenter` is stable and not jumping between planets.
