# Planet Traversal

This document is scoped to the first playable interplanetary traversal milestone. Broader route networks, editor tools, and additional traversal types can build from this blast pad implementation once the core launch, flight, camera, and landing feel are proven.

## First Playable: Blast Pad Planet Hop

### Goal

Add a flat launch pad near the player spawn that blasts the player off the current planet and toward the adjacent planet. The route should be playable, steerable, and cinematic instead of a teleport. The player should feel like they are diving from the Fortnite bus: committed to the route, moving very fast, but still able to influence the landing area.

Success criteria:

- A pad is visible and readable near the default spawn.
- Stepping onto the pad triggers a server-authoritative launch.
- The launch arc reaches the adjacent planet under normal steering.
- The player can steer in flight to pick a landing zone.
- Camera transitions blend smoothly from surface follow, to launch reveal, to high-speed flight, to landing follow.
- The route feels fast through FOV, camera offset, roll/bank, wind streaks, audio, and speed lines without hiding gameplay.

### Blast Pad Behavior

The first pad should be a flat authored structure snapped to the source planet surface.

Runtime properties:

```ts
interface RuntimeBlastPad {
  id: string;
  planetId: string;
  normal: { x: number; y: number; z: number };
  tangent: { x: number; y: number; z: number };
  targetPlanetId: string;
  targetNormal: { x: number; y: number; z: number };
  radius: number;
  cooldownMs: number;
  launchSpeed: number;
  upwardBias: number;
  cameraProfile: "planetHop";
}
```

The `normal` anchors the pad to the source planet. The `tangent` points toward the intended exit direction along the surface. The launch vector should blend:

- Surface normal for immediate separation from the planet.
- Tangent direction for readable forward momentum.
- Direction toward the target planet or route control point for reliable arrival.

Trigger rules:

- Trigger only when a live player overlaps the pad footprint while grounded on the same planet.
- Use a short per-player cooldown so a player cannot retrigger every tick.
- Require server-side overlap detection and launch impulse application.
- Let the client predict the trigger for responsiveness, then reconcile to the server result.

Initial placement:

- Put one pad flat near the default spawn on `planet-0`.
- Aim it at the closest adjacent planet.
- Add a matching landing helper on the target planet: a broad slime/snow catch zone or shallow bowl.
- Keep the first version explicit and authored instead of deriving every pad from nearest-neighbor planets.

### Flight State

Add a distinct interplanetary flight state rather than treating the launch as generic airborne movement. Generic airborne movement currently pulls toward the nearest planet, which is good for jumps, but interplanetary travel needs a longer guided phase.

Suggested movement states:

- `Surface`: existing planet-bound movement.
- `BlastLaunch`: brief impulse and camera reveal, about 0.25 to 0.5 seconds.
- `PlanetHopFlight`: high-speed guided airborne traversal.
- `LandingApproach`: target planet gravity takes over and landing assist increases.
- `Surface`: existing landed state on the destination planet.

During `PlanetHopFlight`:

- Preserve high forward speed.
- Let player input steer the velocity direction within a capped cone.
- Bias gravity or route assist toward the destination planet so the launch is reliable.
- Keep enough drift that different landing choices are possible.
- Disable immediate snapping back to the source planet.
- Use the nearest relevant target planet for orientation once the player crosses the route midpoint.

Air steering direction should come from camera-relative input:

- Forward input dives toward the aim point.
- Back input bleeds speed and raises the nose slightly.
- Left/right input yaws the velocity vector.
- Anchor or dive input can increase descent toward the destination planet.

### Launch And Landing Tuning

Start with generous assist, then reduce it once the feel is proven.

Recommended initial tuning:

- Launch speed high enough to reach the target in 2.5 to 4.0 seconds.
- Initial lift clears source planet terrain by a wide margin.
- Steering cone around 35 to 50 degrees.
- Mild auto-aim toward a broad destination hemisphere.
- Strong landing capture only in the final approach zone.
- Landing impact converts excess downward speed into forward surface velocity instead of stopping the player.

Landing quality rules:

- If the player lands in the authored catch zone, preserve speed and continue surfing.
- If the player lands outside the ideal zone but on valid terrain, allow it with a heavier impact camera dip.
- If the player misses the planet, add a soft recovery assist that bends them back toward the destination rather than hard resetting them.

### Smooth Planet Handoff Model

The blast pad should not behave like a raw physics cannon that throws the player into orbit. It should behave like an authored planet-hop route with a smooth source exit, a fast controlled flight segment, and a smooth target capture. The right feel is closer to Mario Galaxy launch stars or a Fortnite drop route than a free orbital simulation.

Recommended model:

- **Keep planet gravity spherical, but limit its influence.**
  - Planet gravity should remain radial toward the planet center while the player is on or near that planet.
  - Each planet should have a gravity/capture zone instead of affecting the entire map.
  - Outside all planet gravity zones, normal airborne movement should not choose a nearest planet by default.
  - This avoids invisible hard boundaries where two large gravity wells touch.

- **Do not use nearest-planet gravity during the main hop.**
  - Nearest-planet gravity causes abrupt authority changes when the player crosses the midpoint between planets.
  - It also makes the camera up vector flip suddenly from source-planet up to target-planet up.
  - During `PlanetHopFlight`, gravity should be route-controlled, not globally nearest-planet controlled.

- **Use a route guide curve as the primary source of truth.**
  - Generate a cubic Bezier or Hermite arc from source pad to target landing normal.
  - The curve should start tangent to the source pad direction and end tangent to the target landing approach.
  - The player's forward progress moves along this curve at high speed.
  - Steering adds a bounded offset around the curve, not a fully free orbital trajectory.

- **Blend influence across phases.**
  - `BlastLaunch`: source planet up and pad tangent dominate.
  - `SourceExit`: source gravity/up fades out over about 0.4 to 0.8 seconds.
  - `RouteCruise`: route tangent/up frame dominates; no source or target gravity flip.
  - `TargetCapture`: target up and landing normal fade in over about 0.8 to 1.2 seconds.
  - `LandingApproach`: target surface gravity/contact rules take over.

This means the player is not orbiting either planet for most of the hop. They are being carried through a route corridor. That is acceptable because the blast pad is an authored traversal device, not a general spaceflight system.

#### Gravity Recommendation

Use limited spherical planet gravity plus route-guided travel. The goal is to keep Mario Galaxy-style local planet walking without letting distant planets fight over the player.

Planet gravity zones:

- Each planet has an influence radius, likely derived from planet radius.
- Inside the zone, gravity pulls radially toward that planet center.
- Outside all zones, generic airborne movement has no planet gravity unless another gameplay system applies it.
- If zones overlap, the current active planet or active route should win; do not let raw nearest-planet selection decide camera or movement.
- A target planet capture zone can be larger than its normal gravity zone for authored travel routes.

Use three different gravity behaviors by planet-hop phase:

1. **Source exit**
   - Apply a short outward push from the source planet.
   - Fade source gravity to zero quickly.
   - Prevent snapping back to the source planet while the route is active.

2. **Cruise**
   - Apply no normal nearest-planet gravity.
   - Maintain speed along the guide curve.
   - Let input steer within a cone or corridor around the curve.
   - Add very mild pull back toward the curve if the player drifts too far.

3. **Target capture**
   - Fade in target gravity and target up.
   - Convert route velocity into target-surface-relative approach velocity.
   - Aim toward a broad landing zone, not a single point.
   - Preserve useful tangent velocity on contact so landing flows into surfing.

Avoid a hard midpoint switch from source gravity to target gravity. That switch is the main cause of the current abrupt camera/physics flip.

Implementation direction for gravity zones:

```ts
interface RuntimeMapPlanet {
  // existing fields...
  gravityRadius?: number;
  captureRadius?: number;
}
```

If the map omits these values, derive defaults:

- `gravityRadius = radius * 1.8` for normal local airborne gravity.
- `captureRadius = radius * 2.4` for route/landing capture.

The exact numbers should be tuned, but the key rule is architectural: normal airborne movement asks for a dominant gravity planet inside valid influence zones, not a global nearest planet.

#### Camera Handoff Recommendation

The camera needs its own route frame during planet-hop flight.

- During source exit, camera up should still mostly follow source surface up.
- During cruise, camera up should be a stable route up vector derived from the guide curve, not nearest planet up.
- During target capture, camera up should smoothly slerp toward target surface up.
- The look target should blend from player-forward, to route tangent/look-ahead, to landing zone.
- FOV and camera distance should peak during cruise, then ease down during target capture.
- No camera phase should instantly call `lookAt` with a newly flipped up vector.

A good implementation shape is:

```ts
interface PlanetHopRouteState {
  sourcePlanetId: string;
  targetPlanetId: string;
  progress: number; // 0..1 along route
  lateralOffset: number;
  verticalOffset: number;
  routePos: Vec3Data;
  routeTangent: Vec3Data;
  routeUp: Vec3Data;
  targetUpBlend: number;
}
```

The simulation owns progress and route-relative steering. The client camera can derive presentation from the same route state or from snapshot fields that are enough to reconstruct the route frame.

#### Steering Recommendation

Air steering should feel meaningful without letting the player miss by accident.

- Use camera-relative Fortnite-style flight controls, not surface-relative movement controls.
- The player should steer the body/velocity through the air while the route corridor quietly keeps the hop recoverable.
- Steering changes the intended landing area within a broad target hemisphere, not just the player pose.

Control feel:

- **Look direction / camera aim**
  - The camera aim defines the desired flight heading.
  - The player slowly yaws/pitches toward this heading rather than snapping.
  - Aim can bias the landing marker on the target planet.

- **Forward input**
  - Dives along the camera aim direction.
  - Increases speed and target-capture rate.
  - Narrows the glide arc, creating a committed fast descent.

- **Backward input**
  - Raises the nose and slows target capture.
  - Gives more hang time and a wider correction window.
  - Should not allow reversing back to the source planet.

- **Left/right input**
  - Adds lateral drift around the route.
  - Moves the predicted landing point sideways across the target hemisphere.
  - Should have enough authority to feel skillful, but the route assist should keep the player inside a recoverable corridor.

- **Anchor/dive input**
  - Optional fast-dive modifier.
  - Strongly accelerates target capture once the target planet is visible.
  - Useful for skilled players who want to land faster and more precisely.

The player should be able to choose where they land on the target side, but first implementation should strongly recover them back into a safe landing if they steer poorly.

Suggested first-pass numbers:

- Lateral steering cone: 35 to 50 degrees from route tangent.
- Landing hemisphere radius: 25 to 45 surface world units around the authored target normal.
- Dive speed gain: 15% to 30% above cruise speed.
- Back/glide speed loss: 10% to 20% below cruise speed.
- Route correction strength: weak near center, strong near corridor edge.
- Minimum target capture: always enough to land within 3 to 5 seconds.

Implementation shape:

```ts
interface PlanetHopSteering {
  desiredHeading: Vec3Data;
  lateralOffset: number;
  verticalOffset: number;
  diveAmount: number;
  glideAmount: number;
  targetLandingNormal: Vec3Data;
}
```

Each tick:

1. Read camera aim and input.
2. Convert aim into a route-relative desired heading.
3. Integrate lateral/vertical offsets with clamps.
4. Derive a target landing normal from those offsets.
5. Advance route progress based on cruise speed plus dive/glide modifiers.
6. Blend actual velocity toward route tangent plus steering heading.
7. In target capture, pull toward the steered landing normal rather than the planet center.

The key feel requirement is that steering changes where the player lands. If the player can only wiggle during a fixed cinematic arc, it will feel like a cutscene instead of Fortnite-style diving.

#### Implementation Update

Replace the current simple assist model with this route-guided model in stages:

1. Add route progress and target route frame fields to player state.
2. Add limited gravity/capture zones and stop using global nearest-planet gravity outside those zones.
3. Build a deterministic source-to-target curve from the blast pad definition.
4. Drive `PlanetHopFlight` position/velocity from curve progress plus steer offsets.
5. Remove nearest-planet gravity from the hop cruise phase.
6. Add camera support for route up and target-up blending.
7. Tune source exit and target capture durations before adding more effects.

### Camera Plan

All camera changes should be blended. Avoid hard cuts unless the player respawns.

Camera phases:

1. **Surface Follow**
   - Existing follow camera.
   - Pad should be visible in front of the player before activation.

2. **Pad Anticipation**
   - Starts when the player enters the pad footprint or just after trigger.
   - Camera pulls slightly up and out so the player can see the target planet.
   - FOV begins widening.
   - Blend duration: about 0.2 seconds.

3. **Launch Reveal**
   - Camera swings/pulls back behind and above the player as the pad fires.
   - Keep the player centered low enough that the target planet and route are readable.
   - Add a short impulse shake, but keep it directional and low amplitude.
   - Blend duration: about 0.3 to 0.5 seconds.

4. **High-Speed Flight**
   - Camera sits farther behind the player than normal.
   - FOV expands with speed.
   - Camera bank follows lateral steering.
   - Add subtle roll and speed-line alignment along velocity.
   - Look-ahead targets the current velocity direction blended with the destination planet.

5. **Landing Approach**
   - Camera lowers and moves back toward normal gameplay framing.
   - FOV eases down, but not before the landing point is readable.
   - Up vector blends from route-relative to destination planet surface normal.
   - Blend duration: about 0.5 seconds.

6. **Landing Follow**
   - Existing follow camera resumes after contact.
   - Use the existing landing dip behavior, scaled by landing speed.

Implementation direction:

- Add camera mode/profile support to `CameraSystem` instead of embedding all launch behavior into the default follow logic.
- Use blendable camera targets: position offset, look-at offset, FOV scale, up vector, bank, and shake amount.
- Drive camera mode from predicted local movement state, corrected by server state if reconciliation disagrees.

### Feeling Fast

Use multiple small effects instead of one overpowering effect.

Visual effects:

- Pad charge glow and expanding ring at activation.
- Quick launch shockwave on the planet surface.
- Velocity-aligned streaks during flight.
- Slight chromatic or vignette effect only at peak speed if the renderer already supports post effects.
- Target planet landing marker or catch-zone glow visible during approach.

Audio:

- Pad charge or spring sound before launch.
- Strong launch burst.
- Wind rush loop that rises with speed.
- Landing thump/squish that varies with impact speed.

Camera feel:

- FOV grows quickly on launch, then breathes with speed.
- Camera pulls farther back as speed rises.
- Lateral steering creates readable camera bank.
- Micro shake is speed-scaled and decays during landing approach.

### Data And Architecture Notes

Keep launch pads and interplanetary routes separate from local rails. A blast pad can reference a route, but the pad itself is a surface structure.

Suggested split:

- `RuntimeBlastPad`: surface trigger and launch tuning.
- `RuntimeSpaceRoute`: optional route assist/control points between planets.
- `RuntimeLandingZone`: broad destination assist and validation target.

Server authority:

- Server decides when the pad triggers.
- Server writes movement state, launch velocity, source route, target planet, and cooldown.
- Client predicts the launch for local feel but does not choose launch speed or target.

Networking:

- Blast pad definitions are static map data sent at join.
- Per-player flight state is dynamic player state.
- Pad activation can be a lightweight event for effects and audio.

### Editor Follow-Up

After the first hand-placed pad works, add editor support.

Editor requirements:

- Surface-snap blast pad placement.
- Direction handle showing tangent/launch direction.
- Target planet selector.
- Destination normal picker.
- Preview arc from source pad to destination catch zone.
- Validation for blocked launch paths, too-steep landing normals, missing target planet, and unreachable travel time.

The editor should export blast pads, routes, and landing zones as runtime map data. Any future editor implementation must update `apps/editor/EDITOR_CHANGELOG.md` in the same turn.

### Build Order

1. Add static runtime map data for one blast pad and one destination landing zone.
2. Render the blast pad on the client as a simple flat pad with a clear direction arrow.
3. Add server-side pad overlap detection and per-player cooldown.
4. Add `BlastLaunch` and `PlanetHopFlight` movement handling in simulation.
5. Add client prediction for pad activation and flight steering.
6. Add camera mode/profile blending for planet-hop launch and flight.
7. Add visual and audio effects for pad charge, launch, wind rush, and landing.
8. Add a broad catch-zone landing assist on the destination planet.
9. Add tests for trigger authority, cooldown, target planet handoff, steering limits, and landing capture.
10. Tune speed, FOV, camera distance, steering cone, and landing retention with a two-planet dev map.

### Open Tuning Questions

- Should blast pads be one-way at first, or should every pad pair automatically create a return pad?
- Should players be vulnerable and shootable during planet-hop flight?
- Should flight steering use normal movement controls only, or should anchor/dive have a special fast-descent role?
- Should missing the destination be possible in competitive modes, or should route assist always recover the player?
- Should the first implementation use an explicit route curve, or just a launch vector plus target planet assist?
