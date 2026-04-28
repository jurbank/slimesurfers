import { useEffect, useState } from "react";
import {
  defaultEditorConfig,
  type BrushFalloff,
  type BrushMode,
  type BrushState,
  type EditorConfig,
} from "../types.ts";
import { BrushSettings } from "./ui/BrushSettings.tsx";
import { ColorSwatch } from "./ui/ColorSwatch.tsx";
import { Section } from "./ui/Section.tsx";
import { Slider } from "./ui/Slider.tsx";

const BRUSH_MODES: { id: BrushMode; label: string }[] = [
  { id: "raise", label: "Raise" },
  { id: "lower", label: "Lower" },
  { id: "smooth", label: "Smooth" },
  { id: "flatten", label: "Flatten" },
];

interface TerrainPanelProps {
  config: EditorConfig;
  onTerrainChange: (t: EditorConfig["terrain"]) => void;
  onColorsChange: (c: EditorConfig["colors"]) => void;
  onBrushChange: (state: BrushState | null) => void;
}

export function TerrainPanel({
  config,
  onTerrainChange,
  onColorsChange,
  onBrushChange,
}: TerrainPanelProps) {
  const t = config.terrain;
  const c = config.colors;

  const [brushMode, setBrushMode] = useState<BrushMode | null>(null);
  const [brushSize, setBrushSize] = useState(8);
  const [brushStrength, setBrushStrength] = useState(0.5);
  const [brushFalloff, setBrushFalloff] = useState<BrushFalloff>("smooth");

  useEffect(() => {
    return () => {
      onBrushChange(null);
    };
    // onBrushChange is stable (useCallback in App)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function notifyBrush(
    mode: BrushMode | null,
    size: number,
    strength: number,
    falloff: BrushFalloff,
  ) {
    onBrushChange(mode ? { mode, size, strength, falloff } : null);
  }

  function handleModeClick(mode: BrushMode) {
    const next = brushMode === mode ? null : mode;
    setBrushMode(next);
    notifyBrush(next, brushSize, brushStrength, brushFalloff);
  }

  function handleSizeChange(v: number) {
    setBrushSize(v);
    if (brushMode) notifyBrush(brushMode, v, brushStrength, brushFalloff);
  }

  function handleStrengthChange(v: number) {
    setBrushStrength(v);
    if (brushMode) notifyBrush(brushMode, brushSize, v, brushFalloff);
  }

  function handleFalloffChange(v: BrushFalloff) {
    setBrushFalloff(v);
    if (brushMode) notifyBrush(brushMode, brushSize, brushStrength, v);
  }

  function setT<K extends keyof EditorConfig["terrain"]>(key: K, val: EditorConfig["terrain"][K]) {
    onTerrainChange({ ...t, [key]: val });
  }

  function setC<K extends keyof EditorConfig["colors"]>(key: K, val: EditorConfig["colors"][K]) {
    onColorsChange({ ...c, [key]: val });
  }

  function resetShape() {
    const d = defaultEditorConfig().terrain;
    onTerrainChange({
      ...t,
      seed: d.seed,
      baseAmplitude: d.baseAmplitude,
      frequency: d.frequency,
      octaves: d.octaves,
      lacunarity: d.lacunarity,
      persistence: d.persistence,
      heightSmoothingStrength: d.heightSmoothingStrength,
      heightSmoothingSampleAngle: d.heightSmoothingSampleAngle,
      icosahedronDetail: d.icosahedronDetail,
    });
  }

  function resetBiomes() {
    const d = defaultEditorConfig().terrain;
    onTerrainChange({
      ...t,
      waterLevel: d.waterLevel,
      sandBand: d.sandBand,
      rockLevel: d.rockLevel,
      snowLevel: d.snowLevel,
    });
  }

  function resetColors() {
    onColorsChange(defaultEditorConfig().colors);
  }

  return (
    <div className="space-y-4">
      <Section title="Sculpt">
        <div className="grid grid-cols-4 gap-1">
          {BRUSH_MODES.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleModeClick(id)}
              className={`py-1 text-xs rounded transition-colors ${
                brushMode === id
                  ? "bg-cyan-500 text-black font-semibold"
                  : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {brushMode && (
          <div className="mt-3 space-y-2">
            <BrushSettings
              size={brushSize}
              strength={brushStrength}
              falloff={brushFalloff}
              onSizeChange={handleSizeChange}
              onStrengthChange={handleStrengthChange}
              onFalloffChange={handleFalloffChange}
            />
            <p className="text-xs text-zinc-500 pt-1">Alt + drag to orbit</p>
          </div>
        )}
      </Section>

      <Section title="Shape" onReset={resetShape}>
        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400">Seed</label>
          <input
            type="number"
            value={t.seed}
            onChange={(e) => setT("seed", parseInt(e.target.value) || 0)}
            className="w-24 px-2 py-0.5 text-xs font-mono bg-zinc-800 text-zinc-200 border border-zinc-700 rounded focus:outline-none focus:border-cyan-500"
          />
        </div>
        <Slider
          label="Amplitude"
          value={t.baseAmplitude}
          min={5}
          max={100}
          step={0.5}
          decimals={1}
          onChange={(v) => setT("baseAmplitude", v)}
        />
        <Slider
          label="Frequency"
          value={t.frequency}
          min={0.3}
          max={5}
          step={0.05}
          onChange={(v) => setT("frequency", v)}
        />
        <Slider
          label="Octaves"
          value={t.octaves}
          min={1}
          max={8}
          step={1}
          decimals={0}
          onChange={(v) => setT("octaves", v)}
        />
        <Slider
          label="Lacunarity"
          value={t.lacunarity}
          min={1}
          max={4}
          step={0.05}
          onChange={(v) => setT("lacunarity", v)}
        />
        <Slider
          label="Persistence"
          value={t.persistence}
          min={0.1}
          max={0.9}
          step={0.01}
          onChange={(v) => setT("persistence", v)}
        />
        <Slider
          label="Smoothing"
          value={t.heightSmoothingStrength}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setT("heightSmoothingStrength", v)}
        />
        <Slider
          label="Mesh Detail"
          value={t.icosahedronDetail}
          min={10}
          max={60}
          step={5}
          decimals={0}
          onChange={(v) => setT("icosahedronDetail", v)}
        />
      </Section>

      <Section title="Biomes" onReset={resetBiomes}>
        <Slider
          label="Water Level"
          value={t.waterLevel}
          min={-15}
          max={5}
          step={0.1}
          onChange={(v) => setT("waterLevel", v)}
        />
        <Slider
          label="Sand Band"
          value={t.sandBand}
          min={0.2}
          max={8}
          step={0.1}
          onChange={(v) => setT("sandBand", v)}
        />
        <Slider
          label="Rock Level"
          value={t.rockLevel}
          min={1}
          max={20}
          step={0.2}
          onChange={(v) => setT("rockLevel", v)}
        />
        <Slider
          label="Snow Level"
          value={t.snowLevel}
          min={3}
          max={30}
          step={0.2}
          onChange={(v) => setT("snowLevel", v)}
        />
      </Section>

      <Section title="Colors" onReset={resetColors}>
        <ColorSwatch label="Sand" value={c.sand} onChange={(v) => setC("sand", v)} />
        <ColorSwatch label="Grass" value={c.grass} onChange={(v) => setC("grass", v)} />
        <ColorSwatch label="Rock" value={c.rock} onChange={(v) => setC("rock", v)} />
        <ColorSwatch label="Snow" value={c.snow} onChange={(v) => setC("snow", v)} />
        <ColorSwatch
          label="Deep Water"
          value={c.waterDeep}
          onChange={(v) => setC("waterDeep", v)}
        />
      </Section>
    </div>
  );
}
