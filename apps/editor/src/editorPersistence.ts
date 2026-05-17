import {
  createDefaultRailState,
  type RailExport,
  type RailState,
} from "./tools/rails/RailTypes.ts";
import {
  defaultEditorConfig,
  defaultEditorPlanet,
  type EditorConfig,
  type EditorPlanet,
  type EditorSculptState,
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
  return {
    ...config,
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
      };
    }),
  };
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
