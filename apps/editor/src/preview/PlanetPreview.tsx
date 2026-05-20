import { useEffect, useRef } from "react";
import type {
  EditorConfig,
  EditorSculptState,
  EditorTerrainFeature,
  PerformanceStats,
  PreviewSpawnState,
} from "../types.ts";
import type { RailState } from "../tools/rails/RailTypes.ts";
import { EditorScene } from "./EditorScene.ts";

interface PlanetPreviewProps {
  initialConfig: EditorConfig;
  initialRails: RailState[];
  initialPreviewSpawn: PreviewSpawnState;
  onScene: (scene: EditorScene) => void;
  onRailChange: (rail: RailState) => void;
  onRailPointSelectionChange: (pointId: string | null) => void;
  onTerrainFeatureChange: (feature: EditorTerrainFeature) => void;
  onTerrainFeaturePointSelectionChange: (pointId: string | null) => void;
  onSculptChange: (planetId: string, sculpt: EditorSculptState) => void;
  onPreviewSpawnChange: (spawn: PreviewSpawnState) => void;
  onPerformanceStats: (stats: PerformanceStats) => void;
  onPlanetSelected: (id: string) => void;
}

export function PlanetPreview({
  initialConfig,
  initialRails,
  initialPreviewSpawn,
  onScene,
  onRailChange,
  onRailPointSelectionChange,
  onTerrainFeatureChange,
  onTerrainFeaturePointSelectionChange,
  onSculptChange,
  onPreviewSpawnChange,
  onPerformanceStats,
  onPlanetSelected,
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
      initialRails,
      initialPreviewSpawn,
      onRailChange,
      onRailPointSelectionChange,
      onTerrainFeatureChange,
      onTerrainFeaturePointSelectionChange,
      onSculptChange,
      onPreviewSpawnChange,
      onPerformanceStats,
      onPlanetSelected,
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
