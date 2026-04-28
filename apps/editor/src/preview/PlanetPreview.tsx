import { useEffect, useRef } from "react";
import type { EditorConfig } from "../types.ts";
import { EditorScene } from "./EditorScene.ts";

interface PlanetPreviewProps {
  initialConfig: EditorConfig;
  onScene: (scene: EditorScene) => void;
}

export function PlanetPreview({ initialConfig, onScene }: PlanetPreviewProps) {
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
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
