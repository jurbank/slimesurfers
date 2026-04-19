# Implementation Plan: Lush, Diverse Geometric Planet Terrain

## Background & Motivation

The current planet is a perfect sphere, providing a basic play area but lacking the visual interest and gameplay variety shown in the reference screenshots. The goal is to implement procedural, low-poly, diverse terrain featuring mountains, valleys, oceans, distinct biomes (grass, sand, snow), and scattered props (trees, buildings) while maintaining strict server-client physics synchronization.

## Scope & Impact

- **Shared Simulation (Server & Client):** Introduces a deterministic 3D noise-based terrain module. Modifies player movement and projectile collision to adhere to the true terrain height and normal rather than a perfect sphere.
- **Client Visuals:** Replaces `SphereGeometry` with a procedurally displaced `IcosahedronGeometry` colored by biome. Introduces flat-shading for the low-poly aesthetic, a water sphere for oceans, and a prop scattering system for trees and buildings.
- **Paint System:** Adjusts paint stamp projection to account for the procedural surface height and normals.

## Proposed Solution: Procedural Noise Terrain

### 1. Shared Deterministic Terrain Logic

- Create `packages/simulation/terrain/planetTerrain.ts`.
- Implement a seeded, deterministic 3D Simplex or Perlin noise function.
- Define `getTerrainHeight(planetId, normalizedPos)`: Returns the surface height at a given point on the sphere (base radius + noise displacement).
- Define `getTerrainNormal(planetId, pos)`: Calculates the true normal at a point using the central difference of the height function.
- Define `getBiome(height, moistureNoise)`: Returns the biome type (Ocean, Sand, Grass, Rock, Snow) and a corresponding base color.

### 2. Server & Client Simulation Adjustments

- **`simulatedMovement.ts`:** Update gravity calculation and surface snapping (`stepOnSurface`) to use `getTerrainNormal` and `getTerrainHeight`. The player must run on the uneven geometry rather than an invisible perfect sphere.
  - **Slope Blocking:** Implement a maximum climbable angle. If the dot product of `getTerrainNormal` and the vector to the planet center indicates a slope that is too steep, the player's movement up the slope is blocked (acting as a wall).
  - **Biome Movement Modifiers:** Query `getBiomeEffects` to apply speed multipliers (e.g., moving slower through mud or deep sand) based on the player's current position.
- **`projectiles.ts`:** Update collision detection to check distance to the planet center against the procedural `getTerrainHeight` at the projectile's position.
- **`stampPaint.ts`:** Update the paint stamping logic to record the true procedural normal and position, ensuring the paint wraps over mountains and valleys correctly.

### 3. Client Mesh Generation & Rendering

- **`matchScene.ts`:** Replace the `SphereGeometry` with a highly tessellated `IcosahedronGeometry` (e.g., detail: 15-20).
- Iterate through the vertices during initialization:
  - Displace each vertex outward by `getTerrainHeight()`.
  - Calculate vertex colors based on the biome.
- To achieve the low-poly look (flat shading), ensure the geometry is non-indexed (or call `toNonIndexed()`) and compute face normals so each triangle renders flat.
- Add a separate, slightly translucent `IcosahedronGeometry` or `SphereGeometry` for the water level, sitting at the base radius or just above it.

### 4. Prop & Decoration Scattering

- Create a deterministic scattering function in `matchScene.ts` (or a dedicated `propSystem.ts`).
- Iterate over the generated mesh faces; if a face is in a "Grass" or "Sand" biome and the slope (normal) is relatively flat, randomly (using a seeded PRNG) spawn a low-poly tree, building, or brazier.
- Add atmospheric floating islands and clouds using a similar deterministic placement strategy in the sky.

### 5. Shader Updates

- **`planetShader.ts`:** Update the shader to multiply the procedural vertex color (passed as an attribute) by the lighting and paint mask.
- Implement basic flat shading techniques in the fragment shader if not already handled by Three.js materials natively (though standard vertex coloring on non-indexed geometry handles this perfectly).
- **Water Shader:** Create a custom shader for the water sphere featuring noise-based displacement and color variation to simulate refractions, waves, and surface shimmer.
- **Fresnel/Rim Lighting:** Implement a Fresnel effect (rim lighting) across the custom shaders (planet, water, and eventually props/characters) to give objects a soft, illuminated edge, significantly enhancing the stylized low-poly aesthetic.

## Verification

- Run `vp typecheck` and `vp test` to ensure simulation logic remains valid.
- Visually verify the terrain matches the low-poly, colorful, diverse look from the screenshots.
- Test movement: Run around the planet, ensuring the player conforms to the slopes, valleys, and mountains without sinking into the geometry or floating above it.
- Test projectiles: Fire at mountains and valleys to ensure they explode on the true geometry surface.
- Test paint: Ensure paint stamps correctly orient themselves to the slopes.

## Alternatives Considered

- **Authored GLTF Models:** Modeling planets in Blender. _Rejected_ because syncing custom geometry collisions deterministically between a Node.js server and a web client is complex and heavy compared to a shared mathematical noise function.
