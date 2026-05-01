import { useEffect, useRef } from "react";
import type { EditorConfig, PerformanceStats, PreviewSpawnState } from "../types.ts";
import type { TrackState } from "../tools/tracks/TrackTypes.ts";
import { EditorScene } from "./EditorScene.ts";

interface PlanetPreviewProps {
  initialConfig: EditorConfig;
  initialTracks: TrackState[];
  initialPreviewSpawn: PreviewSpawnState;
  onScene: (scene: EditorScene) => void;
  onTrackChange: (track: TrackState) => void;
  onTrackPointSelectionChange: (pointId: string | null) => void;
  onPreviewSpawnChange: (spawn: PreviewSpawnState) => void;
  onPerformanceStats: (stats: PerformanceStats) => void;
}

export function PlanetPreview({
  initialConfig,
  initialTracks,
  initialPreviewSpawn,
  onScene,
  onTrackChange,
  onTrackPointSelectionChange,
  onPreviewSpawnChange,
  onPerformanceStats,
}: PlanetPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const { width, height } = container.getBoundingClientRect();
    const scene = new EditorScene(
      canvas,
      width || container.clientWidth,
      height || container.clientHeight,
      initialConfig,
      initialTracks,
      initialPreviewSpawn,
      onTrackChange,
      onTrackPointSelectionChange,
      onPreviewSpawnChange,
      onPerformanceStats,
    );
    onScene(scene);

    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width: w, height: h } = entry.contentRect;
      scene.resize(w, h);
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      scene.dispose();
    };
    // initialConfig and onScene are intentionally not in deps — scene is created once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} tabIndex={0} className="block w-full h-full" />
    </div>
  );
}
