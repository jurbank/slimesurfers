/**
 * GAME_CONFIG — authoritative game-feel constants.
 *
 * These values are shared between the server (simulation authority) and the
 * client (prediction + rendering) so that both run exactly the same physics
 * step.  Change a value here and it takes effect on both sides simultaneously.
 *
 * Unit conventions:
 *   distances  — world units  (1 wu ≈ 1 metre at planet scale)
 *   speeds     — wu / second
 *   times      — seconds unless the key ends in "Ms"
 *   angles     — radians
 */
export const GAME_CONFIG = {
  // -- Planets ---------------------------------------------------------------
  planet: {
    radius: 50,
    count: 1,
    interPlanetDistance: 200,
  },

  // -- Player ----------------------------------------------------------------
  player: {
    projectileMuzzleHeight: 1.5,
    maxHealth: 100,
    projectileDamage: 34,
    shootingRevealDurationMs: 220,
  },

  // -- Slime / Ammo ----------------------------------------------------------
  slime: {
    maxLevel: 100,
    shotCost: 12,
    passiveRechargePerSecond: 8,
    friendlyPaintRechargePerSecond: 24,
    submergedRechargePerSecond: 55,
    rechargeDelayMs: 600,
  },

  // -- Pickups ---------------------------------------------------------------
  pickups: {
    collectRadius: 1.2,
    hoverHeight: 2.6,
  },

  // -- Respawn ---------------------------------------------------------------
  respawn: {
    durationSeconds: 5,
    dropInHeight: 3,
  },

  // -- Paint -----------------------------------------------------------------
  paint: {
    territoryRows: 12,
    territoryCols: 24,
    impactStampRadius: 0.04,
    deathBurstStampCount: 9,
    deathBurstSpreadRadius: 1.4,
    deathBurstRadiusMultiplier: 3.4,
    projectileStampRadiusMultiplier: 1,
    collisionAlphaThreshold: 0.2,
    maxVisualStampsPerPlanet: 1024,
    // -- Rendering (Client Only) --
    maskResolution: 1024,
    brushSoftness: 0.1,
    edgeNoiseScale: 20.0,
    edgeNoiseStrength: 0.1,
    normalPerturbationStrength: 0.5,
    paintBlendStrength: 1.0,
    slimeFlowSpeed: 0.16,
    slimeFlowStrength: 0.08,
    slimeShineStrength: 1.15,
    slimeFresnelStrength: 0.55,
    slimeSpecularPower: 96.0,
    slimeEdgeWetness: 0.42,
    slimePoolDarkening: 0.18,
  },

  // -- Projectiles -----------------------------------------------------------
  projectile: {
    speed: 95,
    lifetimeMs: 6000,
    fireCooldownMs: 100,
    collisionRadius: 0.3,
  },

  // -- Match -----------------------------------------------------------------
  match: {
    durationSeconds: 180,
    countdownSeconds: 5,
    teamCount: 2,
    teamColors: [0x00aaff, 0xff6600] as const,
    /** Free-for-all palette — one colour per player slot (index = player.paletteIndex in FFA mode) */
    ffaColors: [
      0x00e5ff, // cyan
      0xff6200, // orange
      0x39ff14, // neon green
      0xff1493, // deep pink
      0xffe600, // yellow
      0xbf5fff, // purple
      0xff4444, // red
      0x00ffaa, // mint
    ] as const,
  },

  // -- Movement --------------------------------------------------------------
  movement: {
    gravityAcceleration: 20,
    surfaceSnapDistance: 0.6,
    arenaReturnDistance: 90,
    arenaReturnAcceleration: 15,
    moveSpeed: 8,
    jumpImpulse: 18,
    boostAcceleration: 14,
    airBoostAcceleration: 10,
    anchorGravityMultiplier: 2.6,
    collisionRadius: 0.5,
    /** Distance from planet surface to player center of mass. Must be > collisionRadius
     *  so the mesh bottom (standingHeight - collisionRadius) floats above the surface. */
    standingHeight: 1.0,
    enemySpeedMultiplier: 0.7,
    swimSpeedMultiplier: 2.2,
    swimDisturbanceMinSpeed: 1.5,
  },

  // -- Terrain ---------------------------------------------------------------
  terrain: {
    seed: 42,
    baseAmplitude: 24.0,
    frequency: 1.4,
    octaves: 3,
    lacunarity: 2.2,
    persistence: 0.45,
    heightSmoothingStrength: 0.45,
    heightSmoothingSampleAngle: 0.035,
    waterLevel: -3.0,
    snowLevel: 9.0,
    sandBand: 1.5,
    rockLevel: 7.0,
    icosahedronDetail: 50,
  },

  // -- Shaders (Client Only) --------------------------------------------------
  shaders: {
    atmosphere: {
      enabled: true,
      height: 18.0,
      color: [0.38, 0.72, 1.0] as const,
      intensity: 0.85,
      opacity: 0.42,
      fresnelPower: 2.4,
      falloffPower: 1.5,
    },
    water: {
      enabled: true,
      fresnelPower: 3.0,
      fresnelStrength: 0.6,
      glowColor: [0.3, 0.7, 1.0] as const,
      glowIntensity: 0.5,
      deepColor: [0.04, 0.22, 0.45] as const,
      surfaceColor: [0.15, 0.55, 0.85] as const,
      rimColor: [0.5, 0.8, 1.0] as const,
      specularPower: 64.0,
      specularStrength: 0.4,
      waveSpeed: 1.2,
      waveAmplitude: 0.15,
      shimmerScale: 0.15,
      shimmerSpeed: 0.3,
      opacity: 1,
    },
    clouds: {
      enabled: true,
      patches: 30,
      altitude: 42,
      altitudeVariation: 10,
      minLobesPerPatch: 4,
      maxLobesPerPatch: 7,
      minWidth: 13,
      maxWidth: 25,
      minHeight: 3.6,
      maxHeight: 7.2,
      opacity: 0.46,
      driftSpeed: 0.012,
      color: 0xf7fbff,
    },
  },

  // -- Debug -----------------------------------------------------------------
  debug: {
    showColliders: true,
    showPaintColliders: false,
  },
} as const;

export const PLANET_POSITIONS = Array.from({ length: GAME_CONFIG.planet.count }, (_, i) => ({
  id: `planet-${i}`,
  x: (i - (GAME_CONFIG.planet.count - 1) / 2) * GAME_CONFIG.planet.interPlanetDistance,
  y: 0,
  z: 0,
}));
