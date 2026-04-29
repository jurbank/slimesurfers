import type { BotEmoteTemperament } from "@splat/content/emotes/emoteDefs.ts";

const DEFAULT_PLANET_RADIUS = 50;
const DEFAULT_TERRITORY_ROWS = 12;
const DEFAULT_IMPACT_STAMP_RADIUS = 0.03;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface BotBehaviorProfile {
  aggression: number;
  prefersSurfBias: number;
  prefersAttackBias: number;
  prefersTerritoryBias: number;
}

export interface BotConfigEntry extends Partial<BotBehaviorProfile> {
  name?: string;
  emoteTemperament?: BotEmoteTemperament;
  emoteFrequency?: number;
}

export interface WeightedBotConfigEntry extends BotConfigEntry {
  weight: number;
}

export function resolveBotBehaviorProfile(
  override: Partial<BotBehaviorProfile> = {},
): BotBehaviorProfile {
  const defaults = GAME_CONFIG.bot.behaviorDefaults;
  return {
    aggression: clamp(override.aggression ?? defaults.aggression, 0, 10),
    prefersSurfBias: Math.max(0, override.prefersSurfBias ?? defaults.prefersSurfBias),
    prefersAttackBias: Math.max(0, override.prefersAttackBias ?? defaults.prefersAttackBias),
    prefersTerritoryBias: Math.max(
      0,
      override.prefersTerritoryBias ?? defaults.prefersTerritoryBias,
    ),
  };
}

export function resolveBotEmoteTemperament(override?: BotEmoteTemperament): BotEmoteTemperament {
  return override ?? GAME_CONFIG.bot.emoteDefaults.temperament;
}

export function resolveBotEmoteFrequency(override?: number): number {
  return clamp(override ?? GAME_CONFIG.bot.emoteDefaults.frequency, 0, 1);
}

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
    radius: 100,
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
    friendlyPaintRechargePerSecond: 30,
    submergedRechargePerSecond: 55,
    rechargeDelayMs: 180,
  },

  // -- Pickups ---------------------------------------------------------------
  pickups: {
    collectRadius: 1.5,
    hoverHeight: 2.6,
  },

  // -- Respawn ---------------------------------------------------------------
  respawn: {
    durationSeconds: 5,
    dropInHeight: 3,
  },

  // -- Paint -----------------------------------------------------------------
  paint: {
    territoryCellSurfaceSize: (Math.PI * DEFAULT_PLANET_RADIUS) / DEFAULT_TERRITORY_ROWS,
    impactStampSurfaceRadius: DEFAULT_PLANET_RADIUS * DEFAULT_IMPACT_STAMP_RADIUS * Math.PI,
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
    splatBloomFrames: 8,
    splatBloomOvershootScale: 1.1,
    splatBloomStartScale: 0.2,
    secondaryDropletMinCount: 8,
    secondaryDropletMaxCount: 15,
    secondaryDropletSpreadRadiusMultiplier: 2,
    secondaryDropletMinRadiusMultiplier: 0.05,
    secondaryDropletMaxRadiusMultiplier: 0.2,
    secondaryDropletMaxDelayFrames: 4,
    secondaryDropletMaxAnimatedPerStamp: 4,
    maxActiveAnimatedSplats: 24,
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

  // -- Air Tricks ------------------------------------------------------------
  tricks: {
    minAirTimeMs: 220,
    inputWindowMs: 450,
    trickCooldownMs: 180,
    maxCombo: 5,
    slimeCostPerTrick: 4,
    minSlimeToTrick: 8,
    baseDropCount: 1,
    dropsPerCombo: 1,
    maxDropsPerTrick: 6,
    radiusMultiplier: 1.4,
    comboRadiusBonus: 0.15,
    maxRadiusMultiplier: 4.2,
    spreadRadius: 2.4,
    spinDegreesPerSecond: 720,
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
    durationSeconds: 15 * 60,
    countdownSeconds: 10,
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
    gravityAcceleration: 25,
    surfaceSnapDistance: 0.6,
    arenaReturnDistance: 90,
    arenaReturnAcceleration: 15,
    moveSpeed: 10,
    jumpImpulse: 18,
    boostAcceleration: 15,
    airBoostAcceleration: 10,
    anchorGravityMultiplier: 2.6,
    collisionRadius: 0.5,
    /** Distance from planet surface to player center of mass. Must be > collisionRadius
     *  so the mesh bottom (standingHeight - collisionRadius) floats above the surface. */
    standingHeight: 1.0,
    friendlyPaintSpeedMultiplier: 40.0,
    enemySpeedMultiplier: 0.7,
    groundedDeceleration: 0.5,
    surfSpeedMultiplier: 2.2,
    surfAccelerationMultiplier: 2.0,
    surfDisturbanceMinSpeed: 1.5,
    waterSkiSpeedMultiplier: 3.8,
    waterSkiAccelerationMultiplier: 1.5,
    waterSkiFriction: 0.9,
    waterSkiLateralDrag: 4.0,
  },

  // -- Terrain ---------------------------------------------------------------
  terrain: {
    seed: 42,
    baseAmplitude: 54.0,
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
      shallowColor: [0.38, 0.9, 0.95] as const,
      shallowDepth: 8.0,
      shallowOpacity: 0.74,
      opaqueDepth: 4.5,
      coastalGlowDepth: 1.5,
      coastalGlowStrength: 0.18,
      shoreFadeDepth: 4.0,
      shoreLineColor: [0.78, 0.96, 1.0] as const,
      shoreLineStrength: 1.2,
      shoreBandFrequency: 2.8,
      shoreBandSpeed: 0.25,
      shoreBandSharpness: 9.0,
      rimColor: [0.5, 0.8, 1.0] as const,
      specularPower: 64.0,
      specularStrength: 0.4,
      waveSpeed: 1.2,
      waveAmplitude: 0.15,
      rippleScale: 0.22,
      rippleStrength: 0.12,
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
    terrain: {
      sandColor: 0xd4c078,
      grassColor: 0x3da33d,
      rockColor: 0x8a8a7a,
      snowColor: 0xeef4f8,
    },
    cel: {
      enabled: true,
      bands: 3.0,
      softness: 0.02,
      outlineThickness: 0.06,
      outlineColor: [0.1, 0.1, 0.1] as const,
      hatchStrength: 0.15,
      hatchScale: 5.0,
    },
    props: {
      enabled: true,
      seed: 12345,
      treeDensity: 400,
      cactusDensity: 200,
      rocketEnabled: true,
    },
  },

  // -- Rails -----------------------------------------------------------------
  rail: {
    snapDistance: 4.0,
    minEntrySpeed: 8.0,
    paintCorridorRadius: 8.0,
    paintStampSpacing: 4.0,
    maxGrindSpeed: 65.0,
    carveAccelerationPerSecond: 12.0,
    visualRadius: 0.4,
  },

  // -- Bots ------------------------------------------------------------------
  bot: {
    // Desired total players in the room, including humans. Missing slots are filled with bots.
    targetPopulation: 3,
    // Max distance at which a bot looks for enemies to track or engage.
    scanRadius: 60,
    // Max distance at which a bot is allowed to start shooting a tracked target.
    shootRadius: 40,
    // Fastest possible delay before reacting to a newly seen target or state change.
    minReactionTimeMs: 250,
    // Slowest possible delay before reacting; higher values make bots feel less snappy.
    maxReactionTimeMs: 800,
    // Best-case aim error radius in world units; lower values make close shots more precise.
    minAccuracyRadius: 0.5,
    // Worst-case aim error radius in world units; higher values make inaccurate bots miss wider.
    maxAccuracyRadius: 4.5,
    // Fastest allowed gap between shots once a bot has decided to fire.
    minFireRateMs: 200,
    // Slowest allowed gap between shots; higher values reduce sustained pressure.
    maxFireRateMs: 1200,
    // If slime drops below this, the bot prioritizes refilling instead of continuing pressure.
    refillSlimeThreshold: 20,
    behaviorDefaults: {
      aggression: 5,
      prefersSurfBias: 0.3,
      prefersAttackBias: 0.4,
      prefersTerritoryBias: 0.6,
    },
    emoteDefaults: {
      temperament: "playful" as BotEmoteTemperament,
      frequency: 0.2,
    },
    // Authored bots with stable names and hand-tuned behavior.
    namedBots: [
      {
        name: "SlimeMaster",
        prefersSurfBias: 0.2,
        prefersAttackBias: 0.35,
        prefersTerritoryBias: 1.0,
        aggression: 3,
        emoteTemperament: "proud",
        emoteFrequency: 0.35,
      },
      {
        name: "N00bHunter",
        prefersSurfBias: 0.15,
        prefersAttackBias: 1.0,
        prefersTerritoryBias: 0.2,
        aggression: 7,
        emoteTemperament: "taunting",
        emoteFrequency: 0.25,
      },
      {
        name: "Slip360",
        prefersSurfBias: 1.0,
        prefersAttackBias: 0.2,
        prefersTerritoryBias: 0.35,
        aggression: 1,
        emoteTemperament: "playful",
        emoteFrequency: 0.5,
      },
    ] as BotConfigEntry[],
    // Procedurally generated bots sampled from a weighted mix of behavior profiles.
    generatedBots: {
      count: 0,
      mix: [] as WeightedBotConfigEntry[],
    },
  },

  // -- Debug -----------------------------------------------------------------
  debug: {
    showColliders: false,
    showPaintColliders: false,
  },
} as const;

export function getPaintTerritoryDimensions(planetRadius = GAME_CONFIG.planet.radius): {
  rows: number;
  cols: number;
} {
  const rows = Math.max(
    1,
    Math.round((Math.PI * planetRadius) / GAME_CONFIG.paint.territoryCellSurfaceSize),
  );
  const cols = Math.max(
    1,
    Math.round((2 * Math.PI * planetRadius) / GAME_CONFIG.paint.territoryCellSurfaceSize),
  );
  return { rows, cols };
}

export function getPaintStampAngularRadius(planetRadius = GAME_CONFIG.planet.radius): number {
  return clamp(GAME_CONFIG.paint.impactStampSurfaceRadius / planetRadius, 0, Math.PI);
}

export function getPlanetSurfaceChordRadius(
  surfaceRadius: number,
  planetRadius = GAME_CONFIG.planet.radius,
): number {
  return 2 * Math.sin(clamp(surfaceRadius / planetRadius, 0, Math.PI) * 0.5);
}

export function getPaintStampChordRadius(planetRadius = GAME_CONFIG.planet.radius): number {
  return getPlanetSurfaceChordRadius(GAME_CONFIG.paint.impactStampSurfaceRadius, planetRadius);
}

export const PLANET_POSITIONS = Array.from({ length: GAME_CONFIG.planet.count }, (_, i) => ({
  id: `planet-${i}`,
  x: (i - (GAME_CONFIG.planet.count - 1) / 2) * GAME_CONFIG.planet.interPlanetDistance,
  y: 0,
  z: 0,
}));
