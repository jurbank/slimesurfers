import {
  createDefaultRailState,
  type RailExport,
  type RailState,
} from "./tools/rails/RailTypes.ts";
import {
  defaultEditorConfig,
  defaultEditorPlanet,
  type EditorBlastPad,
  type EditorConfig,
  type EditorPlanet,
  type EditorSculptState,
  type EditorTerrainFeature,
  type PreviewSpawnState,
} from "./types.ts";

const LOCAL_SAVE_KEY = "slime-surfers-editor-save";

interface EditorSaveState {
  version: 1;
  savedAt: string;
  config: EditorConfig;
  rails: RailExport;
  activeRailId: string;
  previewSpawn?: PreviewSpawnState;
  mapName?: string;
}

export interface InitialEditorState {
  config: EditorConfig;
  rails: RailState[];
  activeRailId: string;
  previewSpawn: PreviewSpawnState;
  mapName: string;
}

export function createInitialEditorState(): InitialEditorState {
  const saved = loadEditorState();
  if (saved) {
    return {
      config: saved.config,
      rails: saved.rails.rails,
      activeRailId: saved.activeRailId,
      previewSpawn: saved.previewSpawn ?? {
        planetId: saved.config.planets[0]?.id,
        normal: [0, 1, 0],
      },
      mapName: saved.mapName ?? "My Map",
    };
  }

  const rail = createDefaultRailState();
  return {
    config: defaultEditorConfig(),
    rails: [rail],
    activeRailId: rail.id,
    previewSpawn: { planetId: "planet-0", normal: [0, 1, 0] },
    mapName: "My Map",
  };
}

export function saveEditorState(
  config: EditorConfig,
  rails: RailState[],
  activeRailId: string,
  previewSpawn: PreviewSpawnState,
  mapName: string,
): boolean {
  try {
    const state: EditorSaveState = {
      version: 1,
      savedAt: new Date().toISOString(),
      config,
      rails: { version: 1, rails },
      activeRailId,
      previewSpawn,
      mapName,
    };
    localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearEditorState(): boolean {
  try {
    localStorage.removeItem(LOCAL_SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function nextPlanetId(planets: EditorPlanet[]): string {
  const ids = new Set(planets.map((p) => p.id));
  for (let i = 0; ; i++) {
    const candidate = `planet-${i}`;
    if (!ids.has(candidate)) return candidate;
  }
}

function loadEditorState(): EditorSaveState | null {
  const raw = localStorage.getItem(LOCAL_SAVE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<EditorSaveState>;
    if (parsed.version !== 1) return null;
    if (!parsed.config) return null;
    const savedRails = getSavedRails(parsed);
    if (!savedRails || savedRails.length === 0) return null;

    const cfg = parsed.config as unknown as Record<string, unknown>;
    if (!Array.isArray(cfg.planets)) {
      const legacyPlanet = (
        typeof cfg.planet === "object" && cfg.planet !== null ? cfg.planet : {}
      ) as Record<string, unknown>;
      const base = defaultEditorPlanet("planet-0");
      cfg.planets = [{ ...base, ...legacyPlanet, id: "planet-0" }];
      delete cfg.planet;
    }
    parsed.config = normalizeEditorConfig(parsed.config as EditorConfig);

    const planetIds = new Set(parsed.config.planets.map((planet) => planet.id));
    const fallbackPlanetId = parsed.config.planets[0]?.id ?? "planet-0";
    const migratedRails = savedRails.map((rail) => ({
      ...rail,
      planetId:
        typeof rail.planetId === "string" && planetIds.has(rail.planetId)
          ? rail.planetId
          : fallbackPlanetId,
    }));

    const savedActiveRailId = parsed.activeRailId;
    const activeRailId =
      typeof savedActiveRailId === "string" &&
      migratedRails.some((rail) => rail.id === savedActiveRailId)
        ? savedActiveRailId
        : migratedRails[0].id;

    return {
      version: 1,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
      config: parsed.config,
      rails: { version: 1, rails: migratedRails },
      activeRailId,
      previewSpawn: parsed.previewSpawn,
      mapName: typeof parsed.mapName === "string" ? parsed.mapName : undefined,
    };
  } catch {
    return null;
  }
}

function getSavedRails(parsed: Partial<EditorSaveState>): RailState[] | null {
  if (parsed.rails?.version === 1 && Array.isArray(parsed.rails.rails)) {
    return parsed.rails.rails;
  }
  return null;
}

function normalizeEditorConfig(config: EditorConfig): EditorConfig {
  const baseConfig = defaultEditorConfig();
  const planetIds = new Set(
    config.planets.map((planet, index) =>
      typeof planet.id === "string" ? planet.id : `planet-${index}`,
    ),
  );
  return {
    ...config,
    blastPads: normalizeEditorBlastPads(
      (config as unknown as { blastPads?: unknown }).blastPads,
      planetIds,
    ),
    shaders: {
      ...baseConfig.shaders,
      ...config.shaders,
      cel: {
        ...baseConfig.shaders.cel,
        ...config.shaders?.cel,
      },
    },
    planets: config.planets.map((planet, index) => {
      const id = typeof planet.id === "string" ? planet.id : `planet-${index}`;
      const base = defaultEditorPlanet(id);
      const savedPuffs = planet.atmosphere?.clouds?.puffs;
      const puffsWereOldDefaults =
        (savedPuffs?.density === 0.38 &&
          savedPuffs.opacity === 0.58 &&
          savedPuffs.thickness === 6) ||
        (savedPuffs?.density === 0.68 && savedPuffs.height === 10 && savedPuffs.size === 6);
      return {
        ...base,
        ...planet,
        id,
        terrain: { ...base.terrain, ...planet.terrain },
        colors: { ...base.colors, ...planet.colors },
        atmosphere: {
          ...base.atmosphere,
          ...planet.atmosphere,
          blendMode: planet.atmosphere?.blendMode ?? base.atmosphere.blendMode,
          clouds: {
            ...base.atmosphere.clouds,
            ...planet.atmosphere?.clouds,
            blendMode: planet.atmosphere?.clouds?.blendMode ?? base.atmosphere.clouds.blendMode,
            puffs: {
              ...base.atmosphere.clouds.puffs,
              ...planet.atmosphere?.clouds?.puffs,
              ...(puffsWereOldDefaults ? base.atmosphere.clouds.puffs : {}),
              blendMode:
                planet.atmosphere?.clouds?.puffs?.blendMode ??
                base.atmosphere.clouds.puffs.blendMode,
            },
          },
        },
        lighting: { ...base.lighting, ...planet.lighting },
        props: { ...base.props, ...planet.props },
        sculpt: normalizeSculptState(
          planet.sculpt,
          planet.terrain?.icosahedronDetail ?? base.sculpt.detail,
        ),
        terrainFeatures: normalizeTerrainFeatures(planet.terrainFeatures),
      };
    }),
  };
}

function normalizeTerrainFeatures(
  features: EditorTerrainFeature[] | undefined,
): EditorTerrainFeature[] {
  if (!Array.isArray(features)) return [];
  return features
    .flatMap((feature, index): EditorTerrainFeature[] => {
      if (feature?.kind === "jump") {
        const normal = Array.isArray(feature.normal) ? feature.normal : [0, 1, 0];
        const tangent = Array.isArray(feature.tangent) ? feature.tangent : [1, 0, 0];
        return [
          {
            id:
              typeof feature.id === "string" && feature.id.trim()
                ? feature.id
                : `jump-${index + 1}`,
            kind: "jump",
            name:
              typeof feature.name === "string" && feature.name.trim()
                ? feature.name
                : `Jump ${index + 1}`,
            enabled: typeof feature.enabled === "boolean" ? feature.enabled : true,
            normal: [
              Number.isFinite(normal[0]) ? normal[0] : 0,
              Number.isFinite(normal[1]) ? normal[1] : 1,
              Number.isFinite(normal[2]) ? normal[2] : 0,
            ] as [number, number, number],
            tangent: [
              Number.isFinite(tangent[0]) ? tangent[0] : 1,
              Number.isFinite(tangent[1]) ? tangent[1] : 0,
              Number.isFinite(tangent[2]) ? tangent[2] : 0,
            ] as [number, number, number],
            width: Number.isFinite(feature.width) && feature.width > 0 ? feature.width : 24,
            length: Number.isFinite(feature.length) && feature.length > 0 ? feature.length : 34,
            height: Number.isFinite(feature.height) ? feature.height : 10,
            edgeFalloff:
              Number.isFinite(feature.edgeFalloff) && feature.edgeFalloff >= 0
                ? feature.edgeFalloff
                : 8,
            smoothing: Number.isFinite(feature.smoothing)
              ? Math.max(0, Math.min(1, feature.smoothing))
              : 1,
          },
        ];
      }

      if (feature?.kind !== "slope" || !Array.isArray(feature.points)) return [];
      return [
        {
          id:
            typeof feature.id === "string" && feature.id.trim() ? feature.id : `slope-${index + 1}`,
          kind: "slope",
          name:
            typeof feature.name === "string" && feature.name.trim()
              ? feature.name
              : `Slope ${index + 1}`,
          enabled: typeof feature.enabled === "boolean" ? feature.enabled : true,
          width: Number.isFinite(feature.width) && feature.width > 0 ? feature.width : 26,
          bank: Number.isFinite(feature.bank) ? feature.bank : 0,
          edgeFalloff:
            Number.isFinite(feature.edgeFalloff) && feature.edgeFalloff >= 0
              ? feature.edgeFalloff
              : 8,
          smoothing: Number.isFinite(feature.smoothing)
            ? Math.max(0, Math.min(1, feature.smoothing))
            : 0.9,
          transitionLength:
            Number.isFinite(feature.transitionLength) && feature.transitionLength >= 0
              ? feature.transitionLength
              : 0,
          points: feature.points
            .filter((point) => Array.isArray(point.normal) && point.normal.length === 3)
            .map((point, pointIndex) => ({
              id:
                typeof point.id === "string" && point.id.trim()
                  ? point.id
                  : `slope-${index + 1}-point-${pointIndex + 1}`,
              normal: [
                Number.isFinite(point.normal[0]) ? point.normal[0] : 0,
                Number.isFinite(point.normal[1]) ? point.normal[1] : 1,
                Number.isFinite(point.normal[2]) ? point.normal[2] : 0,
              ] as [number, number, number],
              heightOffset: Number.isFinite(point.heightOffset) ? point.heightOffset : 0,
              width: Number.isFinite(point.width) && point.width! > 0 ? point.width : undefined,
              bank: Number.isFinite(point.bank) ? point.bank : undefined,
              edgeFalloff:
                Number.isFinite(point.edgeFalloff) && point.edgeFalloff! >= 0
                  ? point.edgeFalloff
                  : undefined,
              smoothing: Number.isFinite(point.smoothing)
                ? Math.max(0, Math.min(1, point.smoothing!))
                : undefined,
            })),
        },
      ];
    })
    .filter((feature) => feature.kind !== "slope" || feature.points.length >= 2);
}

function normalizeEditorBlastPads(pads: unknown, planetIds: Set<string>): EditorBlastPad[] {
  if (!Array.isArray(pads)) return [];
  const out: EditorBlastPad[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < pads.length; i++) {
    const raw = pads[i] as Partial<EditorBlastPad> | undefined;
    if (!raw || typeof raw !== "object") continue;
    if (typeof raw.planetId !== "string" || !planetIds.has(raw.planetId)) continue;
    if (typeof raw.targetPlanetId !== "string" || !planetIds.has(raw.targetPlanetId)) continue;
    if (raw.planetId === raw.targetPlanetId) continue;
    const id =
      typeof raw.id === "string" && raw.id.trim() !== "" && !seenIds.has(raw.id)
        ? raw.id
        : `blast-pad-${i + 1}`;
    seenIds.add(id);
    out.push({
      id,
      planetId: raw.planetId,
      targetPlanetId: raw.targetPlanetId,
      normal: coerceUnitVec3(raw.normal, [0, 1, 0]),
      tangent: coerceUnitVec3(raw.tangent, [1, 0, 0]),
      targetNormal: coerceUnitVec3(raw.targetNormal, [0, 1, 0]),
      radius: coerceFinitePositive(raw.radius, 5),
      launchSpeed: coerceFinitePositive(raw.launchSpeed, 78),
      upwardBias: Number.isFinite(raw.upwardBias) ? (raw.upwardBias as number) : 0.45,
    });
  }
  return out;
}

function coerceUnitVec3(
  value: unknown,
  fallback: [number, number, number],
): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return fallback;
  const len = Math.hypot(x, y, z);
  if (len < 1e-6) return fallback;
  return [x / len, y / len, z / len];
}

function coerceFinitePositive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeSculptState(
  sculpt: EditorSculptState | undefined,
  detail: number,
): EditorSculptState {
  if (!sculpt || !Array.isArray(sculpt.samples)) {
    return { detail, vertexCount: 0, samples: [] };
  }
  return {
    detail: Number.isFinite(sculpt.detail) ? sculpt.detail : detail,
    vertexCount: Number.isFinite(sculpt.vertexCount) ? sculpt.vertexCount : 0,
    samples: sculpt.samples
      .filter((sample) => Number.isInteger(sample.index) && Number.isFinite(sample.value))
      .map((sample) => ({ index: sample.index, value: sample.value })),
  };
}
