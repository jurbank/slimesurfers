# Directional Traversal Plan

A successor design to `PLANET_TRAVERSAL.md`. The first-playable blast pad shipped as a guided hop on a fixed Bezier arc. This document plans the redesign that turns blast pads into **loaded launchers** the player aims and fires themselves out of.

> **2026-06-03 revision.** The original plan made the pad a directional launcher and asked the world's gravity (multi-body sums, slingshots, atmospheric grazing) to do the navigation. That design was clunky: pad-launches-you-backwards was a real failure mode, and the gravity-bending mechanics added a lot of code that the player didn't really need once aim controlled the trajectory. The pad now becomes a brief "loaded" state during which the player aims like normal and fires themselves; gravity drops back to single-planet pull. This kills Phase D and Phase G outright and trims most of Phase C's complexity.

> **2026-06-09 revision (current).** The pad → load → charge → launch flow works. The mess is everything _after_ the launch — the gravity that bends the dart in flight, the soft "scrape onto the surface" landing, and the picker hysteresis that free flight inherited. We're cutting all of it down to the simplest thing that's fun:
>
> 1. **Free flight is a pure ballistic dart.** No gravity in `FreeFlight` at all — not even single-planet. You go exactly where you aim and steer. The planet does not bend your path. This makes "smash straight into the planet I'm pointing at" literally true, and removes free flight's dependency on the Phase B gravity picker (which stays only for `stepAirborne` jumps/rail-launches).
> 2. **Landing is a smash, not a scrape.** Touching a planet's surface envelope while moving toward it ends the flight in an impact: a big slime splat (radius scaled by impact speed) is painted at the contact point, and a chunk of the player's slime tank "squishes out" (drains). You arrive depleted — traversal is funded by the same economy as combat.
> 3. **Miss = die in the void.** With no gravity to recapture you, a missed dart sails straight out. A hard kill boundary (Phase F) at a fixed distance from the arena centre kills + respawns you. This is the whole point of removing gravity: a clean miss has a clean consequence.
> 4. **Camera blends back to standard on impact.** The existing `freeFlight` camera pull-back already decays on landing and `triggerLandingSquash` already fires; we keep that and tune the impact beat so the handoff from "pulled-back space cam" to "standard surface cam" reads as a satisfying slam rather than a snap.
>
> Net deletions vs. shipped Phase C: the gravity block in `stepFreeFlight`, the `freeFlightMinSpeed` floor (no gravity to stall against), and the soft-landing velocity-zeroing. Net additions: smash-impact stamping (Phase H) and the kill boundary (Phase F, finally built).

## Vision

A charged blast pad is a **launcher you load yourself into**. Walk onto a fully painted pad → snap into a loaded state with a brief wind-up → aim freely with the normal camera → hold Space to charge launch speed → release to fire yourself in your aimed direction. The pad consumes its charge on launch and must be re-painted to fire again. Mid-flight you can steer with aim and thrust with Forward/Backward. Land on the planet you chose, or aim into the void and die at the kill boundary.

Conceptually: a Smash Bros side-launch cannon, not Mario Galaxy's "world bends your path."

## What this means architecturally

| State             | Today                                            | After                                                                                                               |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Surface**       | `Idle/Moving/Surfing/Jumping`                    | unchanged                                                                                                           |
| **Loaded pad**    | doesn't exist                                    | new state: locked at pad center, normal aim/camera, hold-to-charge launch speed                                     |
| **Free flight**   | a fixed Bezier arc with the destination baked in | **pure ballistic dart: no gravity, continuous aim-steering only.** Smashes into the first planet surface it crosses |
| **Landing**       | soft scrape: zero inward velocity → Idle         | **smash: big speed-scaled slime splat + tank drain at the contact point**, then Idle                                |
| **Out of bounds** | `arenaReturnAcceleration` quietly tugs you back  | hard kill boundary at fixed distance from arena centre → Dead + respawn                                             |

Schema changes:

- `RuntimeBlastPad.targetPlanetId` and `targetNormal` → **removed** (the original plan was to replace them with `direction`; now we don't need either — aim provides direction at launch time).
- `RuntimeBlastPad.launchSpeed` becomes the **max** of the charge range; the min is in `GAME_CONFIG`.
- `RuntimeBlastPad` keeps `id, planetId, normal, tangent, radius, upwardBias?` for footprint placement.

## Phases

### Phase A — Visual foundation ✅ (shipped)

- Glowy "atmosphere" ring around each planet at `gravityRadius`.
- Faint sphere around the play area at the arena boundary.
- Editor preview gets the gravity ring too.
- Pure observability — no physics changes.

Files: `packages/client-runtime/{shaders,materials}/gravityRing*`, `packages/client-runtime/{shaders,materials}/arenaBoundary*`, `apps/game/client/src/scenes/arenaBoundaryRenderer.ts`, wiring in `apps/game/client/src/scenes/planetRenderer.ts` and `apps/editor/src/preview/planetAtmosphereShells.ts`.

### Phase B — Picker hysteresis ✅ (shipped)

- `getDominantGravityPlanet` is now stateful — prefers `state.gravityAnchorPlanetId` until the player crosses out of its `captureRadius`.
- New field `gravityAnchorPlanetId` on `PlayerPhysics`/`SimPlayerState`/`PlayerSnapshot`; initialized at spawn/respawn, persisted on landing, refreshed each airborne tick.
- Fixes the "yanked by the neighbour" problem on overlapping gravity zones. Required by Phase E too.

### Phase C — `FreeFlight` movement state ✅ (shipped, now being simplified by Phase C2)

**Shipped:**

- `PlayerMovementState.FreeFlight = 8` + `isFreeFlightMovementState` helper.
- `stepFreeFlight` dispatched ahead of the blast-pad chain in `stepPlayer`.
- Single-planet gravity via Phase B's hysteresis picker — no multi-body sums.
- Continuous steering toward aim (transverse acceleration, _not_ a SLERP-to-aim — so gravity perturbations are preserved).
- Speed cap `freeFlightMaxSpeed` and (optional) floor `freeFlightMinSpeed`.
- Landing detection at `freeFlightLandingCaptureDistance`.
- Camera pull-back: `freeFlight` 0..1 intensity on `cameraSystem.update`, smoothed via `_freeFlightBlend`.

**Intentionally NOT included:**

- **No thrust/brake mid-flight.** Launch energy is committed once on the pad; the player can't add speed in flight. Steering shapes the path but doesn't accelerate. The full "fuel" of the trip is the slime-spent-at-charge; FreeFlight is the consequence, not another driving phase. This keeps the loop tight: spend slime → choose your aim → see what happens.
- **No multi-body gravity / slingshot.** Each tick only the dominant planet pulls. World-bending fights player intent once aim is committed.

### Phase C2 — Ballistic-dart trim (2026-06-09) ✅ shipped

`stepFreeFlight` in `packages/simulation/movement/simulatedMovement.ts` is rewritten to remove _all_ gravity. The launched player is a dart: launch velocity + aim-steering only.

**Edits to `stepFreeFlight`:**

1. **Delete the gravity block** (the `getDominantGravityPlanet`/`getNearestPlanet` pick + `gravityAcceleration` apply, ~lines 805–817). No pull, period.
2. **Remove mid-flight steering — the dart is pure ballistic (2026-06-09).** The launch velocity is the entire trajectory: no gravity, no steering. You commit your line at release and fly dead straight to wherever the reticle pointed, then smash (or miss into the void).

   **Why steering was cut.** The plan originally wanted aim-steering, but every attempt to derive a stable steer direction fought the chase camera, in three escalating bugs: (a) the camera up-reference flipping to the nearest planet → fake orbit (fixed by freezing the anchor); (b) a persistent downward arc, because the combat `aimDir` is `normalize(aimPoint − playerPos)` with `aimPoint` **terrain-snapped** and biased by the chase camera's down-tilt, so steering chased a point below the flight line; (c) trying to use `computeAimDir`'s return as the steer aim launched the player **into the ground**, because that vector (a separate yaw/pitch ray, historically "unused") had diverged from the visible reticle. The throughline: coupling flight control to a planet-relative chase camera is the wrong substrate. Committing the trajectory at launch removes the entire class of bugs and matches the "Smash Bros cannon" metaphor — you aim the cannon, you don't fly the cannonball.

   The launch direction is the combat `aimDir` (`fireOutput.aimDir`) at release — exactly where the player's reticle points — so "aim at the planet, charge, release, fly in" is literally true. The old transverse-force `freeFlightSteerAcceleration` is removed.

   **Glide steering re-added — Fortnite-style (2026-06-09).** Once the velocity-chase camera (Phase I) was stable, steering could come back safely, because the earlier bugs were all from coupling control to an _unstable_ camera, not from steering itself. The new control is fully decoupled from the chase camera and reticle:
   - **Sim** (`stepFreeFlight`): turn the heading toward `input.aimDir` at a **capped rate** (`freeFlightTurnRate`, default 1.5 rad/s), speed preserved. Capped = a weighty guide (no hairpins) and a server-side bound on a cheating client. Drift-free: aim ∥ velocity ⇒ zero turn.
   - **Control aim** (`matchScene.computeGlideAim`): the steer target is the **current heading rotated by this frame's mouse look** — yaw around a velocity-perpendicular up, pitch around the right axis, using the surface aim's sign conventions. Raw look deltas come from a new `inputSystem.consumeLookDelta()` (not the terrain-snapped combat aim, and not `computeAimDir`'s divergent ray — the two sources that caused the down-arc and the ground-splat). Because the aim is offset from the heading by only the current frame's input, **releasing the mouse stops the turn** — that's the drift-free property.
   - **Camera**: unchanged. It already follows velocity, so the heading curves and the camera banks with it; you watch yourself steer toward the landing you want.

   `freeFlightTurnRate` is the feel dial — lower it for a heavier commit, raise it for looser guidance.

3. **Drop the `freeFlightMinSpeed` floor.** Without gravity there's nothing to stall against; steering is transverse so |v| stays ≈ launch speed on its own. Keep the `freeFlightMaxSpeed` clamp purely as a runaway guard. Remove `getFreeFlightMinSpeed` and the `freeFlightMinSpeed` config knob.
4. **Visual up only.** Still orient the body toward the nearest planet for rotation, and still set `gravityAnchorPlanetId = nearestPlanet.id` so the camera's up-reference (`cameraUpReferenceCenter` in `matchScene.ts`, which falls back to `gravityAnchorPlanetId`) has something to track. This is cosmetic — no force is derived from it.
5. **Landing → hand off to Phase H.** The surface-envelope crossing test stays, but instead of silently zeroing inward velocity and dropping to `Idle`, it becomes the trigger for the smash (Phase H). See below — the impact stamping itself happens in `matchSimulation`, not in the pure-physics step.

**Why no gravity at all (vs. a light assist):** the player asked for "smash right into whatever planet they point themselves to." Any gravity makes that a lie — it bends the dart, and re-introduces the picker/hysteresis machinery this revision is trying to retire from free flight. Gravity also fights the kill boundary: with a pull, a "missed" dart curves back and is never cleanly lost. Zero gravity makes both the hit and the miss honest.

**What this leaves the Phase B picker doing:** nothing in free flight. It's still used by `stepAirborne` (jumps, ski-jumps, rail launches), which is unchanged. Don't delete it.

### Phase D — `Atmospheric` movement state ❌ dropped

Was a slingshot enabler. With aim-then-launch removing slingshots, an atmosphere-glide state has no purpose; commit to landing when the surface envelope is crossed.

### Phase E — Loaded launcher pads (~1–1.5 days)

**State machine:**

- New `PlayerMovementState.PadLoaded = 9`.
- New persistent field on `PlayerPhysics`/`SimPlayerState`: `loadedPadId: string` (empty when not loaded).
- New persistent field: `padChargeProgress: number` (0..1, charges while Anchor is held during `PadLoaded`).
- New persistent field: `padLoadProgress: number` (0..1, ramps in during the wind-up).

**Transitions:**

- **Idle/Moving → PadLoaded**: enter when the player's footprint overlaps a charged pad. Snap pos to pad center; preserve `surfState`. Start the load-in wind-up (`padLoadProgress` ramps 0 → 1 over `~0.3s`).
- **PadLoaded → PadLoaded** (each tick): aim/camera work normally. Movement keys (W/A/S/D) → step off (see below). Anchor held → drain slime; `padChargeProgress` accrues from slime spent (see Charge below). Anchor released with `padChargeProgress > 0` → fire.
- **PadLoaded → Idle (cancel)**: any movement key pressed during `PadLoaded` walks the player off the pad footprint; charge preserved on the pad, `padChargeProgress` resets. The pad stays ready for the next attempt.
- **PadLoaded → FreeFlight (launch)**: Anchor released after charging. Consume the pad's coverage (clear `ownerSlimeGroupId`, `ownerColor`, `coverageProgress`). Set `vel = aim * lerp(launchSpeedMin, pad.launchSpeed, padChargeProgress)`. Snap pos to pad center + small offset along aim. Transition to `FreeFlight`. Clear `loadedPadId`, `padChargeProgress`, `padLoadProgress`.

**Aim:**

- Fully unrestricted. The camera/aim system already supports this — no cone clamp needed. Player can launch into terrain if they choose; that's a feature, not a bug.

**Wind-up:**

- `padLoadProgress` interpolates 0 → 1 over `freeFlightLoadDurationSeconds` (default `0.3s`). During the ramp, aim is still responsive but launch input is ignored; this gives the pad a visible "arming" beat.

**Charge (slime-funded):**

- Holding Anchor on a loaded pad **drains the player's slime tank** at a fixed rate `freeFlightChargeSlimeCostPerSecond`. The slime spent during the hold _is_ the charge — `padChargeProgress` increments by `drainAmount / freeFlightChargeSlimeCostMax` each tick. Holding past `freeFlightChargeSlimeCostMax` slime spent caps charge at 1.
- If the player runs out of slime mid-charge, the ramp halts at whatever charge they bought; releasing Anchor still fires at that partial level.
- If the player presses Anchor with zero slime, nothing happens (no charge accrues, no launch). They can step off or wait for passive recharge.
- Time component: the existing `freeFlightChargeDurationSeconds` (default `0.6s`) becomes the soft pacing target — `freeFlightChargeSlimeCostMax / freeFlightChargeSlimeCostPerSecond` should equal this so a full tank's worth of charge takes ~0.6s.
- Default tuning: `freeFlightChargeSlimeCostMax = 50` (half tank for a full-power launch), `freeFlightChargeSlimeCostPerSecond = 50 / 0.6 ≈ 83`. Numbers TBD in playtest.

**Why slime-funded:** ties traversal into the same economy as combat. A player with low slime can still escape via a weak partial-charge launch; a player flush with slime can blast across the system at full power. Creates the "do I burn this for travel or save for a fight?" decision the rest of the loop already has.

**Player-facing feedback:**

- The existing slime-recharge gauge on the player HUD already visualises the tank — it'll naturally drop as charge accrues.
- Optionally pulse the gauge during charge and tint the pad's torus ring to track `padChargeProgress` so the player sees the tradeoff at the pad itself.

**Pad schema (`RuntimeBlastPad`):**

```ts
{
  id: string;
  planetId: string;
  normal: Vec3;
  tangent: Vec3;
  radius: number;            // footprint size
  launchSpeed: number;       // max charged speed
  upwardBias?: number;       // optional offset applied to launch direction at fire time
}
```

Removed: `targetPlanetId`, `targetNormal`. The original plan's intermediate `direction: Vec3` is never introduced.

**Migration:**

- Old maps (`DEV_MAP`, editor saves) carry `targetPlanetId` / `targetNormal`. On load, drop them silently and warn once in the editor console.
- `EditorBlastPad` updated in lockstep; the editor's "pick target planet" panel is replaced with a `launchSpeed` slider.

**Removals enabled by Phase E:**

- `PlayerMovementState.BlastLaunch` (5), `PlanetHopFlight` (6), `LandingApproach` (7) — all the planet-hop states.
- `isPlanetHopMovementState` helper.
- `stepPlanetHop`, `tryTriggerBlastPad`'s direction-blending math, `getPlanetHopLandingSteerRate`, `getPlanetHopCruiseAssist`, the assorted `planetHop*` config knobs, the `planetHop*` fields on `PlayerPhysics`/`SimPlayerState`/`PlayerSnapshot`, the `lastWasPlanetHop` tracking in `matchScene.ts`.
- The Bezier landing-approach camera blend in `cameraSystem.ts` (`_planetHopBlend`, the FOV/back-pull contributions tied to it).

This is the actual cleanup the user asked for — Phase E doesn't just add the new mechanic, it deletes the entire old mechanic.

### Phase H — Smash landing & slime squish ✅ shipped

When a ballistic dart crosses a planet's surface envelope while moving toward it, the flight ends in an **impact**, not a scrape. The slime literally squishes out: a big splat is painted at the contact point (radius scales with impact speed) and a chunk of the player's tank drains.

**Where the physics ends (movement package):** `stepFreeFlight`'s landing branch keeps doing the geometry — snap `pos` to `surfaceRadius + standingHeight`, set `planetId`, set `gravityAnchorPlanetId`, set `movementState = Idle`. It does **not** stamp slime (the movement step is pure and has no access to `applySlimeImpact` / planet slime state). It just transitions the player out of `FreeFlight`.

**Where the splat happens (sim package):** in `matchSimulation.stepPlayerForInput`, mirror the existing `maybeStampRailCorridor` pattern:

1. Before `stepPlayer`, capture `const prevMovementState = player.movementState;` and `const impactSpeed = Math.hypot(player.vel.x, player.vel.y, player.vel.z);` (the landing branch zeroes inward velocity, so capture speed _before_ the step).
2. After `stepPlayer`, detect the transition: `prevMovementState === FreeFlight && player.movementState !== FreeFlight && player.planetId !== ""`. That's a smash landing (as opposed to a kill — see Phase F).
3. Call a new `applySmashLanding(player, impactSpeed)`:
   - **Splat:** `radiusMultiplier = clamp(impactSpeed / smashSpeedForFullSplat, smashMinSplatMultiplier, smashMaxSplatMultiplier)`. Call `applySlimeImpact(simState, planetState, { planetId: player.planetId, pos: player.pos, slimeGroupId, slimeColor, patternId, radiusMultiplier })` and `recordSlimeStamp` the result. `applySlimeImpact` already derives the sphere normal from `pos − center`, so the splat lands flush on the surface.
   - **Tank drain:** `player.slimeLevel = max(0, player.slimeLevel − smashSlimeCost)` (optionally scale by `impactSpeed`). This is the "squish a ton of slime out" cost — you arrive depleted and recharge into the next move.
   - **(optional) Smash event:** push a lightweight event for the client (one-shot impact SFX / particle burst). The visual squash already fires client-side via `lastWasFreeFlight && !isFreeFlight && planetId !== ""` in `matchScene.ts` → `triggerLandingSquash()`, so this is gravy, not required for v1.

**Tunneling guard (robustness):** at `freeFlightMaxSpeed` and a 30 Hz tick the dart moves several wu per tick, which can overshoot a small planet's thin capture band in one step. The landing test in `stepFreeFlight` iterates planets with a per-tick distance check; harden it to a **swept test** — if the segment from `prevPos` to `newPos` passes within `landingRadius + standingHeight` of a planet centre, clamp the landing to the entry point on that segment. Keeps fast darts from punching through small worlds. (Capture `prevPos` at the top of `stepFreeFlight` before integration.)

**Config (new `movement.*` knobs in `gameConfig.ts`):**

- `smashSpeedForFullSplat` — impact speed at which the splat hits `smashMaxSplatMultiplier`. Default ≈ `freeFlightMaxSpeed * 0.6`.
- `smashMinSplatMultiplier` / `smashMaxSplatMultiplier` — splat radius range vs. a normal stamp. Default ≈ `2` … `6` (a smash is a big mark).
- `smashSlimeCost` — tank slime drained on impact. Default ≈ `freeFlightChargeSlimeCostMax` (you spend roughly what a full-power launch cost, so a cross-system trip is a real economic commitment). Numbers TBD in playtest.

### Phase F — Death & respawn boundary ✅ shipped

The kill boundary is what gives a missed dart a clean consequence now that gravity won't recapture it.

- **Arena centre:** centroid of all planet centres, computed once in `matchSimulation` (planets don't move).
- **Kill radius (system-encompassing, not a fixed distance):** computed once at match start as `(farthest planet-surface point from the centroid) + arenaKillMargin`. A fixed distance from the centroid is **wrong** for a spread-out or off-centre map — e.g. a system strung along an axis puts the outer planets' surfaces hundreds of units from the centroid, so a small fixed sphere wouldn't even contain them and a launch would trip the boundary the instant it left the pad (observed bug: a short-charge dart that lingered in flight died on release while a fast one smashed in before the check mattered). Sizing the sphere from the map guarantees no launch ever starts outside it; only a dart sailing clear of the whole system reaches it. New config knob `arenaKillMargin` (default 250) — how far past the outermost surface the void begins.
- **Check + kill (in `matchSimulation.stepPlayerForInput`, same place as the smash detection):** after `stepPlayer`, if `player.movementState === FreeFlight` and `distance(player.pos, arenaCenter) > arenaKillDistance`, kill the player. Do it here (not inside `stepFreeFlight`) because death needs `respawnTimer`, which lives in the combat/respawn config — `stepFreeFlight` is pure physics and shouldn't reach for it. Set `player.movementState = Dead` and `player.respawnTimer = cfg.respawn.durationSeconds`, matching the projectile-kill path in `projectiles.ts` (extract a small shared `killPlayer(player, cfg)` if both sites want it). The existing `tickRespawns` loop then decrements the timer and respawns via `respawnPlayer` — no new respawn flow needed.
- **Camera:** existing `freeFlight` pull-back already ramps as the player gets far from any planet, so no new camera work needed. Optionally fade the screen to red on approach to the boundary.
- Kill is purely distance-based for v1 (vs. "time outside any gravity well") — simpler, easier to reason about.

### Phase I — Camera blend back to standard ✅ (incl. anchor/orbit fix)

- `triggerLandingSquash()` fires on the `FreeFlight → surface` transition (`lastWasFreeFlight && !isFreeFlight && planetId !== ""`); a void-death leaves `planetId === ""`, so it correctly does **not** fire on a miss. `_freeFlightBlend` (lerp-rate 2 down) unwinds the FOV/back-pull over ~0.5 s once free flight ends.

**Anchor / fake-orbit fix (2026-06-09).** First pass set `gravityAnchorPlanetId` to the **nearest** planet each free-flight tick. Because the camera's up-reference follows the anchor and the player's `aimDir` is read off the camera, approaching another world switched the reference → the camera up flipped ~180° (a world's radial up is roughly opposite the flight direction) → the aim swung → aim-steering curved the dart into a **fake orbit**. It looked like the dart "respected the other planet's gravity," but there is no gravity; it was a camera→aim→steering feedback loop. Fixed in two places:

- `stepFreeFlight` now **freezes** `gravityAnchorPlanetId` at the launch planet for the whole flight (only seeds it if unset). The camera's up-reference no longer switches worlds mid-flight, and the body orientation no longer spins past other planets.
  **Velocity-chase camera (2026-06-09).** The first camera trailed the player's _look_ direction (`yawForward` + look-pitch), but a ballistic dart flies along its _velocity_, which is decoupled from where you look — so the dart drifted off-centre and the frozen look-pitch tilted the view oddly. Replaced with a proper chase cam keyed off velocity:

- **Insight that makes it trivial:** the dart is pure ballistic, so velocity is _constant_ during flight. A camera sitting behind the dart along that velocity therefore has a **fixed orientation for the whole flight** — only its position translates. Rock-stable, no rotation, no flips, no nausea.
- `CameraSystem.update` now computes two poses each frame and lerps them by a smoothed `_freeFlightBlend`: the **surface pose** (unchanged — behind the look direction, planet-collided) and a **flight pose** (behind the dart along `velocity`, looking ahead along travel, lifted so the dart sits lower-centre and the destination is framed). At `blend == 0` it is byte-for-byte the old surface cam.
- **Flight up** is seeded once at launch from the planet radial projected perpendicular to velocity (world-axis fallback if you launched straight along the radial), then carried — perpendicular to a constant velocity, so it never sweeps or flips. Replaces the earlier "re-orthogonalize against view" hack.
- Look-pitch and banking **scale out** with the blend (flight cam ignores both). The free-flight signal from `matchScene` is now a clean **`isFreeFlight ? 1 : 0`** flag (was distance/200), so the chase cam engages identically regardless of planet size or range.
- `triggerLandingSquash()` still fires on the `FreeFlight → surface` transition; the blend unwinds the flight pose back to the surface cam (relevelled on the landed planet) over ~0.5 s.
- Constants (`FLIGHT_BACK/HEIGHT/LOOKAHEAD/LOOK_LIFT`, `FREE_FLIGHT_FOV_GAIN`) are the tunable feel dials.

### Phase G — Slingshot / glide tuning ❌ dropped

Gravity-assist tuning was the polish pass on Phase D's atmospheric glide. With both gone, there's nothing to tune.

## Resolved design questions

1. ~~**Aim during free flight: continuous steering, or thrust-vector?**~~ → Continuous steering (transverse-force model, not SLERP-to-aim). Shipped in Phase C.
2. ~~**Escape velocity?**~~ → Not relevant. With aim-controlled launches there's no on-going gravity well to escape; you commit your trajectory at fire time.
3. ~~**Old `targetPlanetId` pads: migrate or coexist?**~~ → Migrate, drop the fields entirely. The editor warns once on legacy fields and strips them.
4. **What kills you at the boundary?** → Distance from a fixed arena centre (centroid of planet centres). Time-outside-well is a Phase F polish item if needed.
5. ~~**Multiplayer fairness from directional pads?**~~ → Skill is in the aim. Same skill ceiling for every pad. Map design controls which destinations are reachable from a given pad.
6. ~~**Gravity during free flight: none, or a light assist?**~~ → **None.** Pure ballistic dart (Phase C2). Any gravity bends "smash where I point" into a lie and re-introduces the picker machinery we're retiring from free flight. (2026-06-09)
7. ~~**What does "squish out slime on impact" mean?**~~ → **Big speed-scaled territory splat _and_ a tank drain** (Phase H). Ties traversal to the same slime economy as combat. (2026-06-09)

## Recommendation on order (2026-06-09)

Phases A, B, C, D, E, G are settled (shipped or dropped). The remaining work, in order:

1. **Phase C2 — ballistic-dart trim** (~30 min). Delete the gravity block + min-speed floor from `stepFreeFlight`. Prerequisite for everything else — landing and kill behaviour only make sense once gravity is gone. Verify a launched dart now flies straight and a clean miss sails out instead of curving back.
2. **Phase H — smash landing** (~1 day). The visceral payoff: speed-scaled splat + tank drain at impact, hooked in `matchSimulation.stepPlayerForInput`. Add the swept-collision tunneling guard while you're in `stepFreeFlight`.
3. **Phase F — kill boundary** (~half day). Now that misses sail out, give them the consequence. Same hook site as the smash detection.
4. **Phase I — camera polish** (~half day). Mostly tuning what's already there; do it last, with the real mechanic in hand to tune against.

## Prerequisite work already landed

The per-planet `StepConfig` plumbing (`getStepConfig(player.planetId)` in `matchSimulation.ts`, `cfgForPlanet` callback through `stepPlayer`/`stepAirborne`/`tickProjectiles`/`tryFireHitscan`/`tryFireProjectile`) was added before this plan. Terrain checks, landing math, and projectile collision already use the correct per-planet radius — Phase E can assume per-planet cfg lookup is a solved problem.

Phase A (gravity rings + arena boundary), Phase B (picker hysteresis), and a partial Phase C (FreeFlight with multi-body gravity to be trimmed) are all already on branch `planetary-traversal-take-3`.
