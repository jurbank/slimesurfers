import { useEffect, useState } from "react";
import {
  defaultEditorPlanet,
  type BrushFalloff,
  type BrushMode,
  type BrushState,
  type EditorPlanet,
} from "../types.ts";
import type { TerrainStampKind, TerrainStampState } from "../tools/terrain/TerrainStampTypes.ts";
import { BrushSettings } from "./ui/BrushSettings.tsx";
import { ColorSwatch } from "./ui/ColorSwatch.tsx";
import { Section } from "./ui/Section.tsx";
import { Slider } from "./ui/Slider.tsx";
import { GridSelector } from "./ui/GridSelector.tsx";

const BRUSH_MODES: { id: BrushMode; label: string }[] = [
  { id: "raise", label: "Raise" },
  { id: "lower", label: "Lower" },
  { id: "smooth", label: "Smooth" },
  { id: "flatten", label: "Flatten" },
];

const STAMP_TYPES: { id: TerrainStampKind; label: string }[] = [
  { id: "crater", label: "Crater" },
  { id: "ridge", label: "Ridge" },
  { id: "crevasse", label: "Crevasse" },
  { id: "mesa", label: "Mesa" },
];

interface TerrainPanelProps {
  planet: EditorPlanet;
  onTerrainChange: (t: EditorPlanet["terrain"]) => void;
  onColorsChange: (c: EditorPlanet["colors"]) => void;
  onBrushChange: (state: BrushState | null) => void;
  onTerrainStampChange: (state: TerrainStampState | null) => void;
}

export function TerrainPanel({
  planet,
  onTerrainChange,
  onColorsChange,
  onBrushChange,
  onTerrainStampChange,
}: TerrainPanelProps) {
  const t = planet.terrain;
  const c = planet.colors;

  const [brushMode, setBrushMode] = useState<BrushMode | null>(null);
  const [brushSize, setBrushSize] = useState(8);
  const [brushStrength, setBrushStrength] = useState(0.5);
  const [brushFalloff, setBrushFalloff] = useState<BrushFalloff>("smooth");
  const [stampKind, setStampKind] = useState<TerrainStampKind | null>(null);
  const [stampSize, setStampSize] = useState(10);
  const [stampStrength, setStampStrength] = useState(5);
  const [stampRotation, setStampRotation] = useState(0);
  const [stampRoughness, setStampRoughness] = useState(0.15);
  const [stampFalloff, setStampFalloff] = useState<BrushFalloff>("smooth");

  useEffect(() => {
    return () => {
      onBrushChange(null);
      onTerrainStampChange(null);
    };
    // callbacks are stable (useCallback in App)
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
    if (next) {
      setStampKind(null);
      onTerrainStampChange(null);
    }
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

  function notifyStamp(
    kind: TerrainStampKind | null,
    size: number,
    strength: number,
    rotation: number,
    falloff: BrushFalloff,
    roughness: number,
  ) {
    onTerrainStampChange(kind ? { kind, size, strength, rotation, falloff, roughness } : null);
  }

  function handleStampClick(kind: TerrainStampKind) {
    const next = stampKind === kind ? null : kind;
    setStampKind(next);
    if (next) {
      setBrushMode(null);
      onBrushChange(null);
    }
    notifyStamp(next, stampSize, stampStrength, stampRotation, stampFalloff, stampRoughness);
  }

  function handleStampSizeChange(v: number) {
    setStampSize(v);
    if (stampKind) {
      notifyStamp(stampKind, v, stampStrength, stampRotation, stampFalloff, stampRoughness);
    }
  }

  function handleStampStrengthChange(v: number) {
    setStampStrength(v);
    if (stampKind)
      notifyStamp(stampKind, stampSize, v, stampRotation, stampFalloff, stampRoughness);
  }

  function handleStampRotationChange(v: number) {
    setStampRotation(v);
    if (stampKind)
      notifyStamp(stampKind, stampSize, stampStrength, v, stampFalloff, stampRoughness);
  }

  function handleStampFalloffChange(v: BrushFalloff) {
    setStampFalloff(v);
    if (stampKind)
      notifyStamp(stampKind, stampSize, stampStrength, stampRotation, v, stampRoughness);
  }

  function handleStampRoughnessChange(v: number) {
    setStampRoughness(v);
    if (stampKind) notifyStamp(stampKind, stampSize, stampStrength, stampRotation, stampFalloff, v);
  }

  function setT<K extends keyof EditorPlanet["terrain"]>(key: K, val: EditorPlanet["terrain"][K]) {
    onTerrainChange({ ...t, [key]: val });
  }

  function setC<K extends keyof EditorPlanet["colors"]>(key: K, val: EditorPlanet["colors"][K]) {
    onColorsChange({ ...c, [key]: val });
  }

  function resetShape() {
    const d = defaultEditorPlanet("_").terrain;
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
    const d = defaultEditorPlanet("_").terrain;
    onTerrainChange({
      ...t,
      waterLevel: d.waterLevel,
      sandBand: d.sandBand,
      rockLevel: d.rockLevel,
      snowLevel: d.snowLevel,
    });
  }

  function resetColors() {
    onColorsChange(defaultEditorPlanet("_").colors);
  }

  return (
    <div className="space-y-4">
      <Section title="Sculpt">
        <GridSelector
          items={BRUSH_MODES}
          selectedId={brushMode}
          onSelect={(id) => handleModeClick(id as BrushMode)}
          columns={4}
        />
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

      <Section title="Stamps">
        <GridSelector
          items={STAMP_TYPES}
          selectedId={stampKind}
          onSelect={(id) => handleStampClick(id as TerrainStampKind)}
          columns={2}
        />
        {stampKind && (
          <div className="mt-3 space-y-2">
            <Slider
              label="Size"
              value={stampSize}
              min={2}
              max={28}
              step={0.5}
              decimals={1}
              onChange={handleStampSizeChange}
            />
            <Slider
              label={stampKind === "crevasse" ? "Depth" : "Height"}
              value={stampStrength}
              min={0.5}
              max={18}
              step={0.25}
              decimals={2}
              onChange={handleStampStrengthChange}
            />
            {(stampKind === "ridge" || stampKind === "crevasse") && (
              <Slider
                label="Rotation"
                value={stampRotation}
                min={0}
                max={180}
                step={1}
                decimals={0}
                onChange={handleStampRotationChange}
              />
            )}
            <Slider
              label="Roughness"
              value={stampRoughness}
              min={0}
              max={1}
              step={0.01}
              onChange={handleStampRoughnessChange}
            />
            <div className="space-y-1.5 pt-1">
              <label className="text-xs text-zinc-400">Blend</label>
              <GridSelector
                items={[
                  { id: "smooth", label: "Smooth" },
                  { id: "linear", label: "Linear" },
                  { id: "sharp", label: "Sharp" },
                ]}
                selectedId={stampFalloff}
                onSelect={(id) => handleStampFalloffChange(id as BrushFalloff)}
                columns={3}
              />
            </div>
            <p className="text-xs text-zinc-500 pt-1">Click terrain to commit a stamp</p>
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
