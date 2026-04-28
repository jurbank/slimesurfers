import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { PropsPanel } from "./panels/PropsPanel.tsx";
import { ShadersPanel } from "./panels/ShadersPanel.tsx";
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
  GEOMETRY_TERRAIN_KEYS,
  type BrushState,
  type EditorConfig,
  type PropBrushState,
} from "./types.ts";

type Panel = "terrain" | "shaders" | "props" | "tracks" | "spawns";

const PANELS: { id: Panel; label: string }[] = [
  { id: "terrain", label: "Terrain" },
  { id: "shaders", label: "Shaders" },
  { id: "props", label: "Props" },
  { id: "tracks", label: "Tracks" },
  { id: "spawns", label: "Spawns" },
];

const REBUILD_DELAY_MS = 600;

export function App() {
  const [activePanel, setActivePanel] = useState<Panel>("terrain");
  const [config, setConfig] = useState<EditorConfig>(defaultEditorConfig);
  const initialTrack = useRef<TrackState>(createDefaultTrackState());
  const [tracks, setTracks] = useState<TrackState[]>([initialTrack.current]);
  const [activeTrackId, setActiveTrackId] = useState(initialTrack.current.id);
  const [selectedTrackPointId, setSelectedTrackPointId] = useState<string | null>(null);
  const configRef = useRef<EditorConfig>(config);
  const tracksRef = useRef<TrackState[]>(tracks);
  const activeTrackIdRef = useRef(activeTrackId);
  const selectedTrackPointIdRef = useRef<string | null>(selectedTrackPointId);
  const sceneRef = useRef<EditorScene | null>(null);
  const rebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScene = useCallback((scene: EditorScene) => {
    sceneRef.current = scene;
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
    const nextTracks = tracksRef.current.map((track) =>
      track.id === nextTrack.id ? nextTrack : track,
    );
    tracksRef.current = nextTracks;
    setTracks(nextTracks);
  }, []);

  const handleTrackToolChange = useCallback((state: TrackToolState) => {
    sceneRef.current?.setTrackToolState(state);
  }, []);

  const handleTrackPointSelectionChange = useCallback((pointId: string | null) => {
    selectedTrackPointIdRef.current = pointId;
    setSelectedTrackPointId(pointId);
  }, []);

  const setActiveTrack = useCallback((trackId: string) => {
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
      tracksRef.current = nextTracks;
      activeTrackIdRef.current = nextActiveTrackId;
      selectedTrackPointIdRef.current = nextSelectedPointId;
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

  function handleTerrainChange(terrain: EditorConfig["terrain"]) {
    const prev = configRef.current.terrain;
    const next = { ...configRef.current, terrain };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);

    const waterLevelChanged = terrain.waterLevel !== prev.waterLevel;
    if (waterLevelChanged) sceneRef.current?.rebuildWater(next);

    const needsRebuild = (Object.keys(terrain) as (keyof typeof terrain)[]).some(
      (k) => GEOMETRY_TERRAIN_KEYS.has(k) && terrain[k] !== prev[k],
    );
    if (needsRebuild) scheduleRebuild();
  }

  function handleColorsChange(colors: EditorConfig["colors"]) {
    const next = { ...configRef.current, colors };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);
  }

  function handleShadersChange(shaders: EditorConfig["shaders"]) {
    const next = { ...configRef.current, shaders };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);
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
      </aside>

      <main className="flex-1 relative bg-zinc-950 min-w-0">
        <PlanetPreview
          initialConfig={config}
          onScene={handleScene}
          onTrackChange={handleTrackChange}
          onTrackPointSelectionChange={handleTrackPointSelectionChange}
        />
        <button
          onClick={() => sceneRef.current?.resetCamera()}
          title="Reset camera"
          className="absolute bottom-4 right-4 px-2 py-2 flex items-center gap-1.5 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-600 rounded text-zinc-400 hover:text-zinc-100 transition-colors"
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
      </main>

      <aside className="w-72 border-l border-zinc-700 flex flex-col shrink-0">
        <div className="p-4 border-b border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-300 capitalize">{activePanel}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {activePanel === "terrain" && (
            <TerrainPanel
              config={config}
              onTerrainChange={handleTerrainChange}
              onColorsChange={handleColorsChange}
              onBrushChange={handleBrushChange}
            />
          )}
          {activePanel === "shaders" && (
            <ShadersPanel config={config} onShadersChange={handleShadersChange} />
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
          {activePanel === "spawns" && <p className="text-xs text-zinc-600 mt-2">Coming soon</p>}
        </div>
        <div className="p-4 border-t border-zinc-700">
          <button
            onClick={() => exportConfig(configRef.current, tracksRef.current)}
            className="w-full px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded text-sm transition-colors"
          >
            Export Config
          </button>
        </div>
      </aside>
    </div>
  );
}

function exportConfig(config: EditorConfig, tracks: TrackState[]) {
  const payload = {
    ...config,
    tracks: {
      version: 1,
      tracks,
    },
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
