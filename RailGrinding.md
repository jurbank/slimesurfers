# Rail Grinding Architecture

A 1080 Snowboarding-style grind system. Entry is automatic (earned by speed and proximity), balance is the skill expression, and rails paint a corridor of territory underneath them on entry.

---

## File Map

| File                                                    | Role                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `packages/content/config/railDefs.ts`                   | Authoritative data — control points, paint corridor radius          |
| `packages/content/config/gameConfig.ts`                 | Tuning constants under the `rail` key                               |
| `packages/simulation/movement/railSpline.ts`            | Catmull-Rom spline math, arc-length table                           |
| `packages/simulation/movement/simulatedRailGrinding.ts` | Grind entry, balance, bail, exit physics                            |
| `packages/simulation/movement/simulatedMovement.ts`     | Three hook lines that dispatch to the above                         |
| `packages/simulation/match/matchSimulation.ts`          | Builds `ComputedRail[]` at startup; stamps territory on grind entry |
| `apps/game/client/src/systems/railSystem.ts`            | Visual: tube mesh + support columns                                 |
| `apps/game/client/src/network/runtimeState.ts`          | Client prediction: carries grind state through snapshots            |

---

## Layer 1 — Data (`railDefs.ts`)

Rails are pure serializable data from day one so they can be authored in a future editor.

```ts
interface RailControlPoint {
  nx: number;
  ny: number;
  nz: number; // unit-sphere normal
  heightOffset: number; // wu above terrain surface
}

interface RailDef {
  id: number;
  planetId: string;
  controlPoints: RailControlPoint[];
  paintCorridorRadius: number; // surface radius in wu
}
```

Control points are expressed as **unit normals on the planet sphere** plus a height offset. This representation is planet-relative and survives any planet translation. The world position of a control point is:

```
worldPos = planetCenter + normalize(nx, ny, nz) × (terrainRadius(nx,ny,nz) + heightOffset)
```

The test rail (`RAIL_DEFS[0]`) sweeps from longitude 0° to 180° at ~30° from the north pole, 12 wu above the terrain — enough to clear snowcaps everywhere.

---

## Layer 2 — Spline Math (`railSpline.ts`)

`buildComputedRail(def, planetCenter, cfg) → ComputedRail`

Converts a `RailDef` into a precomputed, arc-length-parameterized spline:

1. **World positions** — each control point is evaluated against the terrain height function (`getTerrainRadius`) to get actual radius, then scaled out.
2. **Ghost points** — two ghost points are synthesized (one before the first CP, one after the last) using reflection so the spline clamps cleanly at both ends without changing curvature.
3. **Catmull-Rom sampling** — 30 samples per segment are evaluated. Each sample stores `pos`, `tangent`, and cumulative `arcLength` from the rail's start.

```ts
interface ComputedRail {
  id: number;
  planetId: string;
  planetCenter: Vec3Data; // stored so grind physics can compute "up"
  samples: RailSample[]; // pos + tangent + arcLength per sample
  totalLength: number; // arc length of entire rail in wu
}
```

**`sampleRailAt(rail, arcLen)`** — binary search into the sample table, then linear interpolation between the two bracketing samples. O(log n).

**`findClosestRailPoint(rail, pos)`** — linear scan over all samples. Returns the arc-length of the closest point and its distance. O(n), adequate for the current rail count.

`ComputedRail` is derived data — it is never serialized. It is rebuilt at process startup from `RAIL_DEFS` and the terrain config.

---

## Layer 3 — Grind Physics (`simulatedRailGrinding.ts`)

### Entry — `tryEnterGrind(state, rails, cfg)`

Called every tick when the player is **Airborne**:

1. Reject if `|vel| < cfg.rail.minEntrySpeed` (currently 12 wu/s).
2. Find the closest point on any rail within `cfg.rail.snapDistance` (3 wu).
3. Project the player's velocity onto the rail tangent at that point. That becomes `grindSpeed` (signed — negative means grinding in reverse).
4. Call `applyGrindSnap`: teleport player to the rail point, set `movementState = Grinding`, clear `planetId`.

### Per-tick — `stepGrinding(state, input, rails, dt, cfg)`

Called every tick when `movementState === Grinding`. In order:

**1. Balance update**

```
naturalDrift = sin(grindT × 0.1) × balanceDriftRate
grindBalance += (leanInput × balanceInputScale + naturalDrift − grindBalance × balanceRestoreRate) × dt
grindBalance = clamp(grindBalance, −1, 1)
```

- `leanInput` is +1 (Right key), −1 (Left key), or 0.
- `naturalDrift` is a slow sinusoid of arc-length — the "wobble" the player must track.
- The restore term pulls balance back toward 0, creating a self-correcting spring that the natural drift fights against.

**2. Bail check**

If `|grindBalance| ≥ bailThreshold` (0.95), the player bails:

- Exit velocity = 60% forward along tangent + 70% sideways in the direction they fell + 40% of jump impulse upward.
- `movementState` returns to Airborne.

**3. Speed boost (centered reward)**

If `|grindBalance| < 0.2`, `grindSpeed` increases by `centerBoostPerSecond × dt` toward `maxGrindSpeed`. This rewards good balance with acceleration.

**4. Rail advance**

```
grindT += grindSpeed × dt
```

No gravity component, no friction. The rail is frictionless — uphill is the same as flat.

**5. End-of-rail exit**

If `grindT` passes 0 or `totalLength`, the player exits into Airborne carrying the full tangent velocity.

**6. Position snap**

Player is snapped to the spline at the new `grindT`. Velocity is set to `tangent × grindSpeed`. Rotation is rebuilt each tick from the travel direction and the outward-from-planet normal.

### New state fields on `SimPlayerState`

| Field          | Type     | Meaning                                         |
| -------------- | -------- | ----------------------------------------------- |
| `grindRailId`  | `number` | Index into `RAILS[]`, or −1 when not grinding   |
| `grindT`       | `number` | Current arc-length position along the rail (wu) |
| `grindBalance` | `number` | −1 to 1; 0 = centered                           |
| `grindSpeed`   | `number` | Signed wu/s along the rail tangent              |

---

## Layer 4 — Simulation Wiring (`simulatedMovement.ts` + `matchSimulation.ts`)

### `simulatedMovement.ts` — three hook lines

`stepPlayer` gains an optional `rails: ComputedRail[] = []` parameter and adds:

```ts
if (state.movementState === PlayerMovementState.Grinding) {
  stepGrinding(state, input, rails, dt, cfg);
  return;
}
// ...after Airborne resolution:
if (state.movementState === PlayerMovementState.Airborne && rails.length > 0) {
  tryEnterGrind(state, rails, cfg);
}
```

### `matchSimulation.ts` — startup constants

```ts
const RAILS: ComputedRail[] = RAIL_DEFS.map((def) => {
  const planet = PLANET_POSITIONS.find((p) => p.id === def.planetId) ?? PLANET_POSITIONS[0]!;
  return buildComputedRail(def, { x: planet.x, y: planet.y, z: planet.z }, GAME_CONFIG);
});

const RAIL_PAINT_MULTIPLIER =
  getPlanetSurfaceChordRadius(GAME_CONFIG.rail.paintCorridorRadius) / getPaintStampChordRadius();
```

`RAILS` and `RAIL_PAINT_MULTIPLIER` are module-level constants — built once at process startup, shared across all ticks and all rooms.

### Territory corridor on entry — `maybeStampRailCorridor`

Every tick, after calling `stepPlayer`, the simulation checks whether the player just entered a new rail:

```ts
const prevGrindId = player.grindRailId;
stepPlayer(player, input, dt, PLANETS, GAME_CONFIG, this.simState.planets, RAILS);
this.maybeStampRailCorridor(player, prevGrindId);
```

If `player.grindRailId !== -1 && player.grindRailId !== prevGrindId`, `maybeStampRailCorridor` batch-stamps the **entire rail** at once using `applyPaintImpact` with `RAIL_PAINT_MULTIPLIER`. This converts the rail's `paintCorridorRadius` (a surface distance in wu) to the chord-radius units that the paint system expects. The result is an instant paint corridor along the full rail length — territory claimed in one shot on entry.

---

## Layer 5 — Client Visual (`railSystem.ts`)

`RailSystem` is instantiated once in `MatchScene.buildPlanets()`. It reads the same `RAIL_DEFS` and `buildComputedRail` that the server uses.

**Tube** — samples the `ComputedRail` at ~0.8 points per wu of length, feeds those into `THREE.CatmullRomCurve3`, then builds a `THREE.TubeGeometry` (radius 0.4 wu, 8 radial segments). Material is `MeshStandardMaterial` with high metalness and a faint blue emissive glow.

**Support columns** — every 18 wu along the rail, a `CylinderGeometry` drops from the rail point down to the terrain surface. The terrain surface point is found by evaluating `getTerrainRadius` along the outward normal from the planet center. Each column is oriented with `setFromUnitVectors` so it points radially outward.

The rail meshes are static world geometry and are never updated after construction.

---

## Layer 6 — Client Prediction (`runtimeState.ts`)

The four grind fields are carried through the client prediction pipeline:

- **`cloneRuntimeState`** — shallow-copies all four grind fields.
- **`snapshotToRuntimeState`** — initializes from server snapshot; grind fields default to `grindRailId: -1, grindT: 0, grindBalance: 0, grindSpeed: 0` when absent (i.e., not yet grinding).
- **`interpolateState`** — `grindT`, `grindBalance`, and `grindSpeed` are lerped between snapshots. `grindRailId` takes the newer value (no meaningful interpolation for a discrete index).

Client-side prediction calls `stepPlayer` with `rails = []` (empty). This means the client will not predict grind entry — it waits for the server snapshot to confirm the snap, then interpolates from there. Balance and position on the rail do predict forward normally once grinding is confirmed.

---

## Tuning Reference (`gameConfig.ts` — `rail` section)

| Key                    | Default   | Effect                                              |
| ---------------------- | --------- | --------------------------------------------------- |
| `snapDistance`         | 3.0 wu    | Max distance from rail to trigger entry snap        |
| `minEntrySpeed`        | 12.0 wu/s | Minimum speed to be eligible for a snap             |
| `balanceDriftRate`     | 0.35      | Amplitude of the sinusoidal natural drift           |
| `balanceInputScale`    | 1.2       | How strongly Left/Right corrects balance per second |
| `balanceRestoreRate`   | 0.4       | Spring constant pulling balance toward 0            |
| `bailThreshold`        | 0.95      | Balance magnitude that triggers a bail              |
| `paintCorridorRadius`  | 3.5 wu    | Surface radius of the territory stamp corridor      |
| `paintStampSpacing`    | 4.0 wu    | Arc-length between corridor paint stamps            |
| `maxGrindSpeed`        | 35.0 wu/s | Speed cap while grinding                            |
| `centerBoostPerSecond` | 2.0 wu/s² | Acceleration reward for staying centered            |

---

## Adding a New Rail

1. Add a `RailDef` entry to `RAIL_DEFS` in `railDefs.ts`.
   - Control points are unit normals on the planet sphere; `heightOffset` is wu above terrain.
   - Keep control points roughly evenly spaced for even spline curvature.
2. That's it. `ComputedRail` is built automatically at startup. The visual tube and columns are generated from the same data. The simulation picks it up in `RAILS[]`.

The `id` field on `RailDef` must match the index in `RAIL_DEFS` — it is used as the `grindRailId` in player state.
