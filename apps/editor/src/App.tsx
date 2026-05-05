import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { validateRuntimeMapData } from "@splat/content/map/runtimeMapData.ts";
import { PerformancePanel } from "./panels/PerformancePanel.tsx";
import { PlanetPanel } from "./panels/PlanetPanel.tsx";
import { PropsPanel } from "./panels/PropsPanel.tsx";
import { ShadersPanel } from "./panels/ShadersPanel.tsx";
import { SpawnsPanel } from "./panels/SpawnsPanel.tsx";
import { TerrainPanel } from "./panels/TerrainPanel.tsx";
import { TracksPanel } from "./panels/TracksPanel.tsx";
import { PlanetPreview } from "./preview/PlanetPreview.tsx";
import type { EditorScene } from "./preview/EditorScene.ts";
import {
  createDefaultTrackState,
  type TrackState,
  type TrackToolState,
} from "./tools/tracks/TrackTypes.ts";
import {
  defaultEditorConfig,
  defaultEditorPlanet,
  GEOMETRY_TERRAIN_KEYS,
  type BrushState,
  type EditorConfig,
  type EditorPlanet,
  type PerformanceStats,
  type PreviewSpawnState,
  type PropBrushState,
} from "./types.ts";
import { editorStateToRuntimeMap } from "./export.ts";

type Panel = "planets" | "terrain" | "shaders" | "props" | "tracks" | "spawns";

const PANELS: { id: Panel; label: string }[] = [
  { id: "planets", label: "Planets" },
  { id: "terrain", label: "Terrain" },
  { id: "shaders", label: "Shaders" },
  { id: "props", label: "Props" },
  { id: "tracks", label: "Tracks" },
  { id: "spawns", label: "Spawns" },
];

const REBUILD_DELAY_MS = 600;
const LOCAL_SAVE_KEY = "slime-surfers-editor-save";

interface EditorSaveState {
  version: 1;
  savedAt: string;
  config: EditorConfig;
  tracks: {
    version: 1;
    tracks: TrackState[];
  };
  activeTrackId: string;
  previewSpawn?: PreviewSpawnState;
  mapName?: string;
}

interface InitialEditorState {
  config: EditorConfig;
  tracks: TrackState[];
  activeTrackId: string;
  previewSpawn: PreviewSpawnState;
  mapName: string;
}

export function App() {
  const initialState = useRef<InitialEditorState>(createInitialEditorState()).current;
  const [activePanel, setActivePanel] = useState<Panel>("terrain");
  const [config, setConfig] = useState<EditorConfig>(initialState.config);
  const [tracks, setTracks] = useState<TrackState[]>(initialState.tracks);
  const [activeTrackId, setActiveTrackId] = useState(initialState.activeTrackId);
  const [previewSpawn, setPreviewSpawn] = useState<PreviewSpawnState>(initialState.previewSpawn);
  const [mapName, setMapName] = useState(initialState.mapName);
  const [spawnPlacementActive, setSpawnPlacementActive] = useState(false);
  const [selectedTrackPointId, setSelectedTrackPointId] = useState<string | null>(null);
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "cleared" | "error">("idle");
  const [previewActive, setPreviewActive] = useState(false);
  const [activePlanetId, setActivePlanetId] = useState(
    () => initialState.config.planets[0]?.id ?? "planet-0",
  );
  const configRef = useRef<EditorConfig>(config);
  const tracksRef = useRef<TrackState[]>(tracks);
  const activeTrackIdRef = useRef(activeTrackId);
  const previewSpawnRef = useRef<PreviewSpawnState>(previewSpawn);
  const selectedTrackPointIdRef = useRef<string | null>(selectedTrackPointId);
  const previewActiveRef = useRef(false);
  const activePlanetIdRef = useRef(activePlanetId);
  const sceneRef = useRef<EditorScene | null>(null);
  const rebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScene = useCallback((scene: EditorScene) => {
    sceneRef.current = scene;
    scene.setTracks(tracksRef.current);
    scene.setPreviewSpawn(previewSpawnRef.current);
    scene.setPreviewActive(previewActiveRef.current);
    const activeTrack = tracksRef.current.find((track) => track.id === activeTrackIdRef.current);
    if (activeTrack) {
      scene.setTrackToolState({
        mode: null,
        track: activeTrack,
        selectedPointId: selectedTrackPointIdRef.current,
      });
    }
  }, []);

  const handleBrushChange = useCallback((state: BrushState | null) => {
    sceneRef.current?.setBrushState(state);
  }, []);

  const handlePropBrushChange = useCallback((state: PropBrushState | null) => {
    sceneRef.current?.setPropBrushState(state);
  }, []);

  const handleTrackChange = useCallback((nextTrack: TrackState) => {
    setSaveStatus("idle");
    const nextTracks = tracksRef.current.map((track) =>
      track.id === nextTrack.id ? nextTrack : track,
    );
    tracksRef.current = nextTracks;
    sceneRef.current?.setTracks(nextTracks);
    setTracks(nextTracks);
  }, []);

  const handleTrackToolChange = useCallback((state: TrackToolState) => {
    sceneRef.current?.setTrackToolState(state);
  }, []);

  const handleTrackPointSelectionChange = useCallback((pointId: string | null) => {
    selectedTrackPointIdRef.current = pointId;
    setSelectedTrackPointId(pointId);
  }, []);

  const handlePreviewSpawnChange = useCallback((spawn: PreviewSpawnState) => {
    setSaveStatus("idle");
    previewSpawnRef.current = spawn;
    setPreviewSpawn(spawn);
  }, []);

  const handleSpawnPlacementActiveChange = useCallback((active: boolean) => {
    setSpawnPlacementActive(active);
    sceneRef.current?.setSpawnPlacementActive(active);
  }, []);

  const resetPreviewSpawn = useCallback(() => {
    const spawn: PreviewSpawnState = { normal: [0, 1, 0] };
    handlePreviewSpawnChange(spawn);
    sceneRef.current?.setPreviewSpawn(spawn);
  }, [handlePreviewSpawnChange]);

  const togglePreview = useCallback(() => {
    const next = !previewActiveRef.current;
    previewActiveRef.current = next;
    if (next) setSpawnPlacementActive(false);
    setPreviewActive(next);
    sceneRef.current?.setPreviewActive(next);
  }, []);

  const setActiveTrack = useCallback((trackId: string) => {
    setSaveStatus("idle");
    activeTrackIdRef.current = trackId;
    selectedTrackPointIdRef.current = null;
    setActiveTrackId(trackId);
    setSelectedTrackPointId(null);
    const activeTrack = tracksRef.current.find((track) => track.id === trackId);
    if (activeTrack) {
      sceneRef.current?.setTrackToolState({
        mode: null,
        track: activeTrack,
        selectedPointId: null,
      });
    }
  }, []);

  const handleTracksChange = useCallback(
    (nextTracks: TrackState[], nextActiveTrackId: string, nextSelectedPointId: string | null) => {
      setSaveStatus("idle");
      tracksRef.current = nextTracks;
      activeTrackIdRef.current = nextActiveTrackId;
      selectedTrackPointIdRef.current = nextSelectedPointId;
      sceneRef.current?.setTracks(nextTracks);
      setTracks(nextTracks);
      setActiveTrackId(nextActiveTrackId);
      setSelectedTrackPointId(nextSelectedPointId);
    },
    [],
  );

  const scheduleRebuild = useCallback(() => {
    if (rebuildTimerRef.current) clearTimeout(rebuildTimerRef.current);
    rebuildTimerRef.current = setTimeout(() => {
      sceneRef.current?.rebuildPlanet(configRef.current);
    }, REBUILD_DELAY_MS);
  }, []);

  const handleActivePlanetChange = useCallback((id: string) => {
    activePlanetIdRef.current = id;
    setActivePlanetId(id);
    const planet = configRef.current.planets.find((p) => p.id === id);
    if (planet) sceneRef.current?.setActivePlanet(id, planet.center);
  }, []);

  function handlePlanetsChange(planets: EditorPlanet[]) {
    setSaveStatus("idle");
    const prev = configRef.current;
    const next = { ...prev, planets };
    configRef.current = next;

    if (!planets.find((p) => p.id === activePlanetIdRef.current)) {
      const firstId = planets[0]?.id ?? "";
      activePlanetIdRef.current = firstId;
      setActivePlanetId(firstId);
    }

    setConfig(next);
    sceneRef.current?.updateUniforms(next);

    const activeId = activePlanetIdRef.current;
    const activeRadiusChanged =
      planets.find((p) => p.id === activeId)?.radius !==
      prev.planets.find((p) => p.id === activeId)?.radius;
    if (activeRadiusChanged) {
      sceneRef.current?.rebuildPlanet(next);
      sceneRef.current?.rebuildWater(next);
    }
  }

  function handleTerrainChange(terrain: EditorPlanet["terrain"]) {
    setSaveStatus("idle");
    const activeId = activePlanetIdRef.current;
    const prevPlanet =
      configRef.current.planets.find((p) => p.id === activeId) ?? configRef.current.planets[0]!;
    const planets = configRef.current.planets.map((p) =>
      p.id === activeId ? { ...p, terrain } : p,
    );
    const next = { ...configRef.current, planets };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);

    if (terrain.waterLevel !== prevPlanet.terrain.waterLevel) {
      sceneRef.current?.rebuildWater(next);
    }

    const needsRebuild = (Object.keys(terrain) as (keyof typeof terrain)[]).some(
      (k) => GEOMETRY_TERRAIN_KEYS.has(k) && terrain[k] !== prevPlanet.terrain[k],
    );
    if (needsRebuild) scheduleRebuild();
  }

  function handleColorsChange(colors: EditorPlanet["colors"]) {
    setSaveStatus("idle");
    const activeId = activePlanetIdRef.current;
    const planets = configRef.current.planets.map((p) =>
      p.id === activeId ? { ...p, colors } : p,
    );
    const next = { ...configRef.current, planets };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);
  }

  function handlePlanetChange(planet: EditorPlanet) {
    setSaveStatus("idle");
    const activeId = activePlanetIdRef.current;
    const planets = configRef.current.planets.map((p) => (p.id === activeId ? planet : p));
    const next = { ...configRef.current, planets };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);
  }

  function handleShadersChange(shaders: EditorConfig["shaders"]) {
    setSaveStatus("idle");
    const next = { ...configRef.current, shaders };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);
  }

  function handleSaveLocal() {
    const saved = saveEditorState(
      configRef.current,
      tracksRef.current,
      activeTrackIdRef.current,
      previewSpawnRef.current,
      mapName,
    );
    setSaveStatus(saved ? "saved" : "error");
  }

  function handleClearLocalSave() {
    const cleared = clearEditorState();
    setSaveStatus(cleared ? "cleared" : "error");
    if (cleared) window.location.reload();
  }

  return (
    <div className="flex h-screen bg-zinc-900 text-zinc-100 overflow-hidden">
      <aside className="w-56 border-r border-zinc-700 flex flex-col shrink-0">
        <div className="p-4 border-b border-zinc-700">
          <h1 className="text-sm font-bold tracking-widest uppercase text-cyan-400">
            World Editor
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">Slime Surfers</p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {PANELS.map(({ id, label }) => (
            <NavItem
              key={id}
              active={activePanel === id}
              onClick={() => {
                if (id !== "terrain") sceneRef.current?.setBrushState(null);
                if (id !== "props") sceneRef.current?.setPropBrushState(null);
                if (id !== "spawns") {
                  setSpawnPlacementActive(false);
                  sceneRef.current?.setSpawnPlacementActive(false);
                }
                if (id !== "tracks") {
                  const activeTrack = tracksRef.current.find(
                    (track) => track.id === activeTrackIdRef.current,
                  );
                  if (activeTrack) {
                    sceneRef.current?.setTrackToolState({
                      mode: null,
                      track: activeTrack,
                      selectedPointId: selectedTrackPointIdRef.current,
                    });
                  }
                }
                setActivePanel(id);
              }}
            >
              {label}
            </NavItem>
          ))}
        </nav>
        <div className="border-t border-zinc-700 p-3 overflow-y-auto max-h-[55vh]">
          <PerformancePanel stats={performanceStats} />
        </div>
      </aside>

      <main className="flex-1 relative bg-zinc-950 min-w-0">
        <PlanetPreview
          initialConfig={config}
          initialTracks={tracks}
          initialPreviewSpawn={previewSpawn}
          onScene={handleScene}
          onTrackChange={handleTrackChange}
          onTrackPointSelectionChange={handleTrackPointSelectionChange}
          onPreviewSpawnChange={handlePreviewSpawnChange}
          onPerformanceStats={setPerformanceStats}
          onPlanetSelected={handleActivePlanetChange}
        />
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          <button
            onClick={togglePreview}
            title={previewActive ? "Stop preview" : "Play preview"}
            className={`min-w-24 px-3 py-2 flex items-center justify-center gap-1.5 border rounded font-semibold text-xs transition-colors ${
              previewActive
                ? "bg-amber-400 hover:bg-amber-300 border-amber-300 text-black"
                : "bg-emerald-500/90 hover:bg-emerald-400 border-emerald-400 text-black"
            }`}
          >
            {previewActive ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="6" y="5" width="4" height="14" />
                <rect x="14" y="5" width="4" height="14" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="6 3 20 12 6 21 6 3" />
              </svg>
            )}
            {previewActive ? "Stop" : "Play"}
          </button>
          <button
            onClick={handleSaveLocal}
            title="Save to this browser"
            className="min-w-24 px-3 py-2 flex items-center justify-center gap-1.5 bg-cyan-500/90 hover:bg-cyan-400 border border-cyan-400 rounded text-black font-semibold text-xs transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            {saveStatus === "saved"
              ? "Saved"
              : saveStatus === "cleared"
                ? "Cleared"
                : saveStatus === "error"
                  ? "Save failed"
                  : "Save"}
          </button>
          <button
            onClick={handleClearLocalSave}
            title="Clear saved data"
            className="px-2 py-2 flex items-center justify-center bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-600 rounded text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
          <button
            onClick={() => sceneRef.current?.resetCamera()}
            title="Reset camera"
            className="px-2 py-2 flex items-center gap-1.5 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-600 rounded text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </main>

      <aside className="w-72 border-l border-zinc-700 flex flex-col shrink-0">
        <div className="p-4 border-b border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-300 capitalize">{activePanel}</h2>
          {config.planets.length > 1 &&
            (activePanel === "terrain" || activePanel === "shaders" || activePanel === "props") && (
              <p className="text-xs text-cyan-500 mt-0.5">{activePlanetId}</p>
            )}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {activePanel === "planets" && (
            <PlanetPanel
              config={config}
              activePlanetId={activePlanetId}
              onPlanetsChange={handlePlanetsChange}
              onActivePlanetChange={handleActivePlanetChange}
            />
          )}
          {activePanel === "terrain" && (
            <TerrainPanel
              planet={config.planets.find((p) => p.id === activePlanetId) ?? config.planets[0]!}
              onTerrainChange={handleTerrainChange}
              onColorsChange={handleColorsChange}
              onBrushChange={handleBrushChange}
            />
          )}
          {activePanel === "shaders" && (
            <ShadersPanel
              planet={config.planets.find((p) => p.id === activePlanetId) ?? config.planets[0]!}
              shaders={config.shaders}
              onPlanetChange={handlePlanetChange}
              onShadersChange={handleShadersChange}
            />
          )}
          {activePanel === "props" && <PropsPanel onPropBrushChange={handlePropBrushChange} />}
          {activePanel === "tracks" && (
            <TracksPanel
              tracks={tracks}
              activeTrackId={activeTrackId}
              selectedPointId={selectedTrackPointId}
              onActiveTrackChange={setActiveTrack}
              onTracksChange={handleTracksChange}
              onTrackChange={handleTrackChange}
              onTrackToolChange={handleTrackToolChange}
              onPointSelectionChange={handleTrackPointSelectionChange}
            />
          )}
          {activePanel === "spawns" && (
            <SpawnsPanel
              spawn={previewSpawn}
              placementActive={spawnPlacementActive}
              onPlacementActiveChange={handleSpawnPlacementActiveChange}
              onReset={resetPreviewSpawn}
            />
          )}
        </div>
        <div className="p-4 border-t border-zinc-700 space-y-2">
          <input
            value={mapName}
            onChange={(e) => setMapName(e.target.value)}
            placeholder="Map name"
            className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-600 rounded text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={() =>
              exportMap(configRef.current, tracksRef.current, previewSpawnRef.current, mapName)
            }
            className="w-full px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded text-sm transition-colors"
          >
            Export Map
          </button>
          <button
            onClick={() =>
              exportConfig(configRef.current, tracksRef.current, previewSpawnRef.current)
            }
            className="w-full px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-xs transition-colors"
          >
            Export Editor Config
          </button>
        </div>
      </aside>
    </div>
  );
}

function exportConfig(config: EditorConfig, tracks: TrackState[], previewSpawn: PreviewSpawnState) {
  const payload = {
    ...config,
    tracks: {
      version: 1,
      tracks,
    },
    previewSpawn,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "slime-surfers-editor-config.json";
  a.click();
  URL.revokeObjectURL(url);
}

function exportMap(
  config: EditorConfig,
  tracks: TrackState[],
  previewSpawn: PreviewSpawnState,
  mapName: string,
) {
  const map = editorStateToRuntimeMap(config, tracks, previewSpawn, mapName || "Untitled Map");
  const result = validateRuntimeMapData(map);
  if (!result.valid) {
    alert(`Export failed:\n${result.errors.map((e) => `${e.field}: ${e.message}`).join("\n")}`);
    return;
  }
  const blob = new Blob([JSON.stringify(map, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${map.mapId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function createInitialEditorState(): InitialEditorState {
  const saved = loadEditorState();
  if (saved) {
    return {
      config: saved.config,
      tracks: saved.tracks.tracks,
      activeTrackId: saved.activeTrackId,
      previewSpawn: saved.previewSpawn ?? { normal: [0, 1, 0] },
      mapName: saved.mapName ?? "My Map",
    };
  }

  const track = createDefaultTrackState();
  return {
    config: defaultEditorConfig(),
    tracks: [track],
    activeTrackId: track.id,
    previewSpawn: { normal: [0, 1, 0] },
    mapName: "My Map",
  };
}

function createEditorSaveState(
  config: EditorConfig,
  tracks: TrackState[],
  activeTrackId: string,
  previewSpawn: PreviewSpawnState,
  mapName: string,
): EditorSaveState {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    config,
    tracks: {
      version: 1,
      tracks,
    },
    activeTrackId,
    previewSpawn,
    mapName,
  };
}

function saveEditorState(
  config: EditorConfig,
  tracks: TrackState[],
  activeTrackId: string,
  previewSpawn: PreviewSpawnState,
  mapName: string,
): boolean {
  try {
    localStorage.setItem(
      LOCAL_SAVE_KEY,
      JSON.stringify(createEditorSaveState(config, tracks, activeTrackId, previewSpawn, mapName)),
    );
    return true;
  } catch {
    return false;
  }
}

function clearEditorState(): boolean {
  try {
    localStorage.removeItem(LOCAL_SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

function loadEditorState(): EditorSaveState | null {
  const raw = localStorage.getItem(LOCAL_SAVE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<EditorSaveState>;
    if (parsed.version !== 1) return null;
    if (!parsed.config || !parsed.tracks || parsed.tracks.version !== 1) return null;
    if (!Array.isArray(parsed.tracks.tracks) || parsed.tracks.tracks.length === 0) return null;

    const cfg = parsed.config as unknown as Record<string, unknown>;
    if (!Array.isArray(cfg.planets)) {
      const legacyPlanet = (
        typeof cfg.planet === "object" && cfg.planet !== null ? cfg.planet : {}
      ) as Record<string, unknown>;
      const base = defaultEditorPlanet("planet-0");
      cfg.planets = [{ ...base, ...legacyPlanet, id: "planet-0" }];
      delete cfg.planet;
    }

    const activeTrackId =
      typeof parsed.activeTrackId === "string" &&
      parsed.tracks.tracks.some((track) => track.id === parsed.activeTrackId)
        ? parsed.activeTrackId
        : parsed.tracks.tracks[0].id;

    return {
      version: 1,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
      config: parsed.config,
      tracks: {
        version: 1,
        tracks: parsed.tracks.tracks,
      },
      activeTrackId,
      mapName: typeof parsed.mapName === "string" ? parsed.mapName : undefined,
    };
  } catch {
    return null;
  }
}

function NavItem({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
        active ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
