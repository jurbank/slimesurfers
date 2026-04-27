# Rail Grinding Architecture

A 1080 Snowboarding-style grind system. Entry is automatic (earned by speed and proximity), and rails paint a trail of territory underneath them as the player moves.

---

## File Map

| File                                                    | Role                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `packages/content/config/railDefs.ts`                   | Authoritative data — control points, paint corridor radius         |
| `packages/content/config/gameConfig.ts`                 | Tuning constants under the `rail` key                              |
| `packages/simulation/movement/railSpline.ts`            | Catmull-Rom spline math, arc-length table                          |
| `packages/simulation/movement/simulatedRailGrinding.ts` | Grind entry, exit physics                                          |
| `packages/simulation/movement/simulatedMovement.ts`     | Three hook lines that dispatch to the above                        |
| `packages/simulation/match/matchSimulation.ts`          | Builds `ComputedRail[]` at startup; stamps territory incrementally |
| `apps/game/client/src/systems/railSystem.ts`            | Visual: tube mesh (with paint shader) + support columns            |
| `apps/game/client/src/shaders/railShader.ts`            | Fragment shader for dynamic rail painting                          |
| `apps/game/client/src/network/runtimeState.ts`          | Client prediction: carries grind state through snapshots           |

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
  paintCorridorRadius: number;
}
```

**`sampleRailAt(rail, arcLen)`** — binary search into the sample table, then linear interpolation between the two bracketing samples. O(log n).

**`findClosestRailPoint(rail, pos)`** — linear scan over all samples. Returns the arc-length of the closest point and its distance. O(n), adequate for the current rail count.

---

## Layer 3 — Grind Physics (`simulatedRailGrinding.ts`)

### Entry — `tryEnterGrind(state, rails, cfg)`

Called every tick when the player is **Airborne**:

1. Reject if `|vel| < cfg.rail.minEntrySpeed` (currently 12 wu/s).
2. Find the closest point on any rail within `cfg.rail.snapDistance` (5 wu).
3. Project the player's velocity onto the rail tangent at that point. That becomes `grindSpeed` (signed — negative means grinding in reverse).
4. Call `applyGrindSnap`: teleport player to the rail point, set `movementState = Grinding`, clear `planetId`.

### Per-tick — `stepGrinding(state, input, rails, dt, cfg)`

Called every tick when `movementState === Grinding`. In order:

**1. Rail advance**

```
grindT += grindSpeed × dt
```

No gravity component, no friction. The rail is frictionless — uphill is the same as flat.

**2. End-of-rail exit**

If `grindT` passes 0 or `totalLength`, the player exits into Airborne carrying the full tangent velocity.

**3. Position snap**

Player is snapped to the spline at the new `grindT`. Velocity is set to `tangent × grindSpeed`. Rotation is rebuilt each tick from the travel direction and the outward-from-planet normal.

### New state fields on `SimPlayerState`

| Field         | Type     | Meaning                                         |
| ------------- | -------- | ----------------------------------------------- |
| `grindRailId` | `number` | Index into `RAILS[]`, or −1 when not grinding   |
| `grindT`      | `number` | Current arc-length position along the rail (wu) |
| `lastGrindT`  | `number` | Arc-length position from the previous tick (wu) |
| `grindSpeed`  | `number` | Signed wu/s along the rail tangent              |

---

## Layer 4 — Simulation Wiring (`simulatedMovement.ts` + `matchSimulation.ts`)

### `matchSimulation.ts` — startup constants

```ts
const RAILS: ComputedRail[] = RAIL_DEFS.map((def) => {
  const planet = PLANET_POSITIONS.find((p) => p.id === def.planetId) ?? PLANET_POSITIONS[0]!;
  return buildComputedRail(def, { x: planet.x, y: planet.y, z: planet.z }, GAME_CONFIG);
});
```

`RAILS` is a module-level constant — built once at process startup, shared across all ticks and all rooms.

### Incremental Paint Trail — `maybeStampRailCorridor`

Every tick, after calling `stepPlayer`, the simulation checks if the player is grinding:

```ts
const prevGrindId = player.grindRailId;
stepPlayer(player, input, dt, PLANETS, GAME_CONFIG, this.simState.planets, RAILS);
this.maybeStampRailCorridor(player, prevGrindId);
```

If the player is grinding, `maybeStampRailCorridor` stamps a line of paint on the ground between `lastGrindT` and `grindT`. It also updates the authoritative `RailPaintState` nodes (64 per rail) which sync to the client for the visual rail color.

---

## Layer 5 — Client Visual (`railSystem.ts` + `railShader.ts`)

`RailSystem` updates every frame using the `GameState.railStates` map.

**Tube** — uses a custom `ShaderMaterial` (`railShader.ts`) that linear-interpolates between 64 paint nodes. This creates a smooth trail of player-colored slime on the physical rail model as they move.

**Support columns** — every 18 wu along the rail, a `CylinderGeometry` drops from the rail point down to the terrain surface.

---

## Layer 6 — Client Prediction (`runtimeState.ts`)

Grind fields are carried through the client prediction pipeline:

- **`cloneRuntimeState`** — copies all grind fields.
- **`snapshotToRuntimeState`** — initializes from server snapshot.
- **`interpolateState`** — `grindT`, `lastGrindT`, and `grindSpeed` are lerped between snapshots.

Client-side prediction calls `stepPlayer` with `rails = []` (empty). This means the client will not predict grind entry — it waits for the server snapshot to confirm the snap, then interpolates from there. Position on the rail does predict forward normally once grinding is confirmed.

---

## Tuning Reference (`gameConfig.ts` — `rail` section)

| Key                   | Default   | Effect                                         |
| --------------------- | --------- | ---------------------------------------------- |
| `snapDistance`        | 5.0 wu    | Max distance from rail to trigger entry snap   |
| `minEntrySpeed`       | 12.0 wu/s | Minimum speed to be eligible for a snap        |
| `paintCorridorRadius` | 8.0 wu    | Surface radius of the territory stamp corridor |
| `paintStampSpacing`   | 4.0 wu    | Arc-length between corridor paint stamps       |
| `maxGrindSpeed`       | 35.0 wu/s | Speed cap while grinding                       |

---

## Adding a New Rail

1. Add a `RailDef` entry to `RAIL_DEFS` in `railDefs.ts`.
   - Control points are unit normals on the planet sphere; `heightOffset` is wu above terrain.
   - Set `paintCorridorRadius` (8.0 recommended for consistent scoring).
2. That's it. `ComputedRail` is built automatically at startup. The visual tube and columns are generated from the same data. The simulation picks it up in `RAILS[]`.

The `id` field on `RailDef` must match the index in `RAIL_DEFS` — it is used as the `grindRailId` in player state.
