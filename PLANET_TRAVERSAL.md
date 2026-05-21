# Planet Traversal

## Direction

Slime Surfers can treat planets as rideable hubs connected by traversal setpieces. A player should be able to surf around a planet, hit a launcher, space rail, boost gate, or portal, travel through an orbital route, and land on another planet without the map feeling like separate disconnected levels.

The strongest reference is Sonic Frontiers-style traversal readability mixed with Mario Galaxy-like planet hopping and snowboard/surf flow. The goal is not to copy floating obstacle courses exactly, but to make large traversal lines visible, fun, and planet-native.

## Core Fantasy

- Ride terrain, rails, jumps, banks, bowls, and surfable paths on each planet.
- Use interplanetary structures to move between planets.
- Make space travel playable instead of a loading transition.
- Let authors build a small solar playground with routes, landings, challenges, and shortcuts.

## Traversal Building Blocks

### Surface Structures

These live on or near a planet surface.

- Boost pads
- Launch ramps
- Quarter pipes
- Half-pipe sections
- Rails and curved rails
- Wall-ride panels
- Bounce pads
- Hoop or ring gates
- Landing pads
- Bowls and banked turns
- Slime geysers or launch fountains

Each structure should have one of three roles:

- Flow: keeps the player moving or accelerates them into a route.
- Trick: creates airtime, grind time, wall rides, flips, or risky landings.
- Readability: tells the player where a fun path is.

### Space Routes

These connect planets.

- Space rails that arc from one planet to another
- Launcher-to-landing jump arcs
- Portal rings
- Boost tunnels
- Free-flight corridors
- Gravity slingshot paths
- Rail cannons

Space routes should feel authored and readable from far away. They can be decorated with rings, lights, signs, boost markers, floating platforms, and checkpoint buoys.

### Landing Zones

Interplanetary travel needs safe and satisfying landings.

- Snow banks
- Slime pools
- Curved catch ramps
- Rail catches
- Bowls
- Flat pads
- Portal exits

The editor should warn when a landing is too steep, blocked, underwater, or aimed into bad terrain.

## Editor Tools

### Planet Network View

A zoomed-out editor mode for multi-planet layout.

- Show planets as large nodes in 3D space.
- Show space routes as edges.
- Select a planet to edit local surface features.
- Select a route to edit its launch point, control points, travel type, target, and landing.
- Show route direction arrows and estimated travel time.

### Traversal Structures Tool

A placement tool for rideable modules.

Initial prefabs:

- Boost pad
- Hoop or gate
- Launch ramp
- Flat rail
- Curved rail
- Platform
- Landing pad

Controls:

- Surface snap
- Height offset
- Rotation around surface normal
- Scale
- Direction handle
- Optional terrain conforming

### Space Route Tool

A tool for authoring interplanetary travel.

Route kinds:

- Rail
- Launcher
- Portal
- Boost tunnel
- Free-flight corridor

Authoring flow:

1. Pick source planet and surface point.
2. Pick destination planet and landing point.
3. Choose route kind.
4. Adjust control points in space.
5. Preview travel direction and landing.
6. Validate reachability and landing quality.

### Park Presets

Fast ways to make a planet fun.

- Rail garden
- Big-air line
- Beginner slope
- Bowl cluster
- Sky rail spiral
- Planet ring road
- Jump hoop line
- Floating island chain
- Boost canyon

Presets should remain editable after placement.

### Playtest Overlay

During editor preview, record and visualize:

- Player path
- Speed
- Airtime
- Rail contact
- Landing impact
- Missed route attempts
- Frequently used areas

This helps authors tune flow without guessing.

## Runtime Map Shape

The current runtime map already supports multiple planets, rails, spawns, and terrain features. Interplanetary traversal can be added as a separate layer so local planet rails do not become overloaded.

Example direction:

```ts
interface RuntimeSpaceRoute {
  id: string;
  kind: "rail" | "launcher" | "portal" | "boostTunnel" | "freeFlight";
  from: {
    planetId: string;
    normal: { x: number; y: number; z: number };
  };
  to: {
    planetId: string;
    normal: { x: number; y: number; z: number };
  };
  controlPoints: { x: number; y: number; z: number }[];
  travelTime?: number;
}
```

Suggested split:

- Planet rails: local surface grind and trick features.
- Space routes: large-scale routes between planets.
- Structures: authored gameplay modules that may create boosts, launches, landings, or collision.
- Decorations: non-gameplay visual dressing.

## Gameplay Modes This Unlocks

- Planet-hop race across several planets
- Trick route through launchers, hoops, and rails
- Territory spread across multiple planets
- King of the orbit around high-value route hubs
- Delivery or relay routes between planets
- Time-trial lines with checkpoints
- Exploration challenges using rings and hidden shortcuts

## Performance Notes

A 4-planet map is not inherently too expensive. It becomes expensive if every planet is rendered, simulated, collided, and networked at full detail all the time.

The performance strategy should be:

- Simulate only what matters.
- Render nearby or visible planets at high detail.
- Render distant planets with cheaper meshes/materials.
- Keep traversal structures lightweight and instanced where possible.
- Keep authoritative gameplay checks server-side but spatially scoped.

### What Should Be Cheap

Multiple planets are fine if each planet is mostly static authored data:

- Planet transforms
- Runtime map data
- Surface colors
- Atmosphere settings
- Static rails and structures
- Distant low-detail planet meshes

Four planets with modest terrain detail should be practical on desktop if distant planets use lower-detail visuals and the scene avoids excessive transparent/cloud layers.

### What Gets Expensive

The main risks are:

- High-detail terrain meshes for every planet at once
- Per-frame collision queries against every planet, rail, and structure
- Many transparent atmosphere/cloud shells
- Large numbers of individual prop meshes instead of instancing
- Network snapshots containing unnecessary per-planet or per-route state
- Paint/slime systems replicated or evaluated globally instead of near active players
- Physics or AI running across all planets with no spatial culling

### Rendering Approach

Use a level-of-detail model:

- Active planet: full terrain, water, rails, structures, props, effects.
- Nearby destination planet: medium terrain, visible landing/route markers.
- Distant planets: simple mesh, reduced atmosphere, minimal props.
- Offscreen planets: skip most rendering work.

Routes should also LOD:

- Nearby route: full rails, boost markers, rings, particles.
- Distant route: simple curve or glowing strip.
- Offscreen route: no draw or very cheap marker.

### Simulation Approach

The server should not run all planet interactions globally every tick.

Recommended rules:

- Each player has an active planet or active route.
- Movement checks query the active planet, nearby landing candidates, and the route currently being used.
- Paint/slime updates apply only to the player’s current planet or rail/route surface.
- Pickups and hazards sleep when no players are nearby.
- Bots are assigned to active areas instead of roaming every planet continuously.

### Network Approach

The map can be sent once at join time, but dynamic state should be scoped.

Good dynamic replication:

- Players near the local player
- Players on the same planet or route
- Paint updates for relevant planet surfaces
- Active route events
- Nearby pickups and hazards

Avoid:

- Broadcasting every planet’s dynamic details to every player every tick
- Treating all planets as one flat always-relevant world

### Editor Performance

The editor needs similar constraints.

- Rebuild only the edited planet.
- Keep non-active planets in lower-detail preview mode.
- Debounce expensive terrain rebuilds.
- Use instancing for repeated props and route markers.
- Show route previews with simplified geometry until selected.

## Practical Scope For 4 Planets

Four planets should be feasible if the first version follows these constraints:

- One active high-detail planet at a time.
- Other planets rendered as simplified previews.
- Space routes represented as simple curves plus a few markers.
- No full per-planet paint simulation unless players are there.
- Props and repeated traversal objects use instancing.
- Existing rooms use the map at room creation; live hot-swapping can come later.

The first implementation should target a small route network:

- 2 to 4 planets
- 1 to 3 routes between them
- A handful of launch/landing structures
- Low dynamic object count

This gives the design room to grow without committing to a fully simulated open solar system immediately.

## Recommended Build Order

1. Add a planet network view.
2. Add simple space route runtime data.
3. Add visual-only route preview curves in the editor.
4. Add launcher and landing point authoring.
5. Add one playable route type, likely a space rail or portal.
6. Add runtime movement handoff between planet and route.
7. Add LOD rules for non-active planets.
8. Add playtest telemetry for route attempts, speed, airtime, and landings.

The best first playable milestone is a two-planet route: launch from planet A, travel through a readable space rail or boost tunnel, and land on planet B.
