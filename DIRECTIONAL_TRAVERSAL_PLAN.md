# Directional Traversal Plan

A successor design to `PLANET_TRAVERSAL.md`. The first-playable blast pad shipped as a guided hop on a fixed Bezier arc. This document plans the redesign that turns blast pads into **loaded launchers** the player aims and fires themselves out of.

> **2026-06-03 revision.** The original plan made the pad a directional launcher and asked the world's gravity (multi-body sums, slingshots, atmospheric grazing) to do the navigation. That design was clunky: pad-launches-you-backwards was a real failure mode, and the gravity-bending mechanics added a lot of code that the player didn't really need once aim controlled the trajectory. The pad now becomes a brief "loaded" state during which the player aims like normal and fires themselves; gravity drops back to single-planet pull. This kills Phase D and Phase G outright and trims most of Phase C's complexity.

## Vision

A charged blast pad is a **launcher you load yourself into**. Walk onto a fully painted pad → snap into a loaded state with a brief wind-up → aim freely with the normal camera → hold Space to charge launch speed → release to fire yourself in your aimed direction. The pad consumes its charge on launch and must be re-painted to fire again. Mid-flight you can steer with aim and thrust with Forward/Backward. Land on the planet you chose, or aim into the void and die at the kill boundary.

Conceptually: a Smash Bros side-launch cannon, not Mario Galaxy's "world bends your path."

## What this means architecturally

| State             | Today                                            | After                                                                                                                                |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Surface**       | `Idle/Moving/Surfing/Jumping`                    | unchanged                                                                                                                            |
| **Loaded pad**    | doesn't exist                                    | new state: locked at pad center, normal aim/camera, hold-to-charge launch speed                                                      |
| **Free flight**   | a fixed Bezier arc with the destination baked in | new state: single-planet gravity (Phase B hysteresis picker), continuous aim-steering, Forward/Backward thrust/brake, lands anywhere |
| **Out of bounds** | `arenaReturnAcceleration` quietly tugs you back  | hard kill boundary, camera pulls out, respawn                                                                                        |

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

### Phase C — `FreeFlight` movement state ✅ partial / needs trim

**Already shipped:**

- `PlayerMovementState.FreeFlight = 8` + `isFreeFlightMovementState` helper.
- `stepFreeFlight` dispatched ahead of the splat-freeze/blast-pad chain in `stepPlayer`.
- Continuous steering toward aim (transverse acceleration, _not_ a SLERP-to-aim — so gravity perturbations are preserved, see commit context).
- Forward/Backward thrust/brake, speed clamp `[freeFlightMinSpeed, freeFlightMaxSpeed]`.
- Multi-planet landing detection at `freeFlightLandingCaptureDistance`.
- Camera pull-back: `freeFlight` 0..1 intensity on `cameraSystem.update`, smoothed via `_freeFlightBlend`.
- 4 tests covering gravity, steering, thrust/brake, landing.

**Needs trim before Phase E lands:**

- Replace the multi-body gravity sum in `stepFreeFlight` with the single-planet picker (same `getDominantGravityPlanet` Phase B uses). The world should _not_ bend the path through multiple wells — once aim defines the launch direction, slingshot is noise, not signal.
- Remove the `wellRamp` linear falloff and the strongest-pull anchor update — just use the hysteresis picker like `stepAirborne` does.
- Update the multi-body gravity test to single-planet expectations.
- This trim is small (~30 lines) and is a load-bearing prerequisite for Phase E's UX.

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
- **PadLoaded → PadLoaded** (each tick): aim/camera work normally. Movement keys (W/A/S/D) → step off (see below). Anchor held → `padChargeProgress` ramps 0 → 1 over `freeFlightChargeDurationSeconds`. Anchor released with `padChargeProgress > 0` → fire.
- **PadLoaded → Idle (cancel)**: any movement key pressed during `PadLoaded` walks the player off the pad footprint; charge preserved on the pad, `padChargeProgress` resets. The pad stays ready for the next attempt.
- **PadLoaded → FreeFlight (launch)**: Anchor released after charging. Consume the pad's coverage (clear `ownerSlimeGroupId`, `ownerColor`, `coverageProgress`). Set `vel = aim * lerp(launchSpeedMin, pad.launchSpeed, padChargeProgress)`. Snap pos to pad center + small offset along aim. Transition to `FreeFlight`. Clear `loadedPadId`, `padChargeProgress`, `padLoadProgress`.

**Aim:**

- Fully unrestricted. The camera/aim system already supports this — no cone clamp needed. Player can launch into terrain if they choose; that's a feature, not a bug.

**Wind-up:**

- `padLoadProgress` interpolates 0 → 1 over `freeFlightLoadDurationSeconds` (default `0.3s`). During the ramp, aim is still responsive but launch input is ignored; this gives the pad a visible "arming" beat.

**Charge:**

- `padChargeProgress` interpolates 0 → 1 over `freeFlightChargeDurationSeconds` (default `0.6s`). Player can release at any point for a partial-speed launch. Speed range tuned so a partial release still feels punchy.

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

### Phase F — Death & respawn boundary (~half day)

- Hard sphere at `arenaReturnDistance * K`. `K ~ 2.5–3` so the boundary sits well outside the gravity envelopes of all planets.
- Crossing it: set `movementState = Dead`, start respawn timer (re-use existing respawn flow).
- Camera: existing `freeFlight` pull-back already ramps as the player gets far from any planet, so no new camera work needed. Optionally fade screen to red on approach.
- Kill is purely distance-based for v1 (vs. "time outside any gravity well") — simpler, easier to reason about.

### Phase G — Slingshot / glide tuning ❌ dropped

Gravity-assist tuning was the polish pass on Phase D's atmospheric glide. With both gone, there's nothing to tune.

## Resolved design questions

1. ~~**Aim during free flight: continuous steering, or thrust-vector?**~~ → Continuous steering (transverse-force model, not SLERP-to-aim). Shipped in Phase C.
2. ~~**Escape velocity?**~~ → Not relevant. With aim-controlled launches there's no on-going gravity well to escape; you commit your trajectory at fire time.
3. ~~**Old `targetPlanetId` pads: migrate or coexist?**~~ → Migrate, drop the fields entirely. The editor warns once on legacy fields and strips them.
4. **What kills you at the boundary?** → Distance from a fixed arena centre (centroid of planet centres). Time-outside-well is a Phase F polish item if needed.
5. ~~**Multiplayer fairness from directional pads?**~~ → Skill is in the aim. Same skill ceiling for every pad. Map design controls which destinations are reachable from a given pad.

## Recommendation on order

- Phase C trim (cut multi-body gravity) — ~30 min, prerequisite for everything else.
- Phase E (loaded pads + remove planet-hop scaffolding) — the big one.
- Phase F (kill boundary) — quick polish, ship anytime after E.

## Prerequisite work already landed

The per-planet `StepConfig` plumbing (`getStepConfig(player.planetId)` in `matchSimulation.ts`, `cfgForPlanet` callback through `stepPlayer`/`stepAirborne`/`tickProjectiles`/`tryFireHitscan`/`tryFireProjectile`) was added before this plan. Terrain checks, landing math, and projectile collision already use the correct per-planet radius — Phase E can assume per-planet cfg lookup is a solved problem.

Phase A (gravity rings + arena boundary), Phase B (picker hysteresis), and a partial Phase C (FreeFlight with multi-body gravity to be trimmed) are all already on branch `planetary-traversal-take-3`.
