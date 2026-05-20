import { useEffect, useState } from "react";
import {
  defaultEditorPlanet,
  type BrushFalloff,
  type BrushMode,
  type BrushState,
  type EditorPlanet,
  type EditorTerrainFeature,
  type EditorTerrainSlopeFeature,
  type TerrainFeatureEditMode,
  type TerrainFeatureToolState,
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

const FEATURE_EDIT_MODES: { id: TerrainFeatureEditMode; label: string }[] = [
  { id: "add", label: "Add" },
  { id: "move", label: "Move" },
  { id: "delete", label: "Delete" },
];

interface TerrainPanelProps {
  planet: EditorPlanet;
  onTerrainChange: (t: EditorPlanet["terrain"]) => void;
  onColorsChange: (c: EditorPlanet["colors"]) => void;
  onTerrainFeaturesChange: (features: EditorTerrainFeature[]) => void;
  selectedFeaturePointId: string | null;
  onTerrainFeatureToolChange: (state: TerrainFeatureToolState | null) => void;
  onTerrainFeaturePointSelectionChange: (pointId: string | null) => void;
  onBrushChange: (state: BrushState | null) => void;
  onTerrainStampChange: (state: TerrainStampState | null) => void;
}

export function TerrainPanel({
  planet,
  onTerrainChange,
  onColorsChange,
  onTerrainFeaturesChange,
  selectedFeaturePointId,
  onTerrainFeatureToolChange,
  onTerrainFeaturePointSelectionChange,
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
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(
    planet.terrainFeatures[0]?.id ?? null,
  );
  const [featureMode, setFeatureMode] = useState<TerrainFeatureEditMode | null>("move");
  const selectedFeature =
    planet.terrainFeatures.find((feature) => feature.id === selectedFeatureId) ?? null;
  const selectedFeaturePoint =
    selectedFeature?.kind === "slope"
      ? (selectedFeature.points.find((point) => point.id === selectedFeaturePointId) ?? null)
      : null;

  useEffect(() => {
    return () => {
      onBrushChange(null);
      onTerrainStampChange(null);
      onTerrainFeatureToolChange(null);
    };
    // callbacks are stable (useCallback in App)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelectedFeatureId((current) =>
      current && planet.terrainFeatures.some((feature) => feature.id === current)
        ? current
        : (planet.terrainFeatures[0]?.id ?? null),
    );
  }, [planet.id, planet.terrainFeatures]);

  useEffect(() => {
    onTerrainFeatureToolChange(
      selectedFeature
        ? {
            mode: selectedFeature.kind === "jump" ? "move" : featureMode,
            feature: selectedFeature,
            selectedPointId: selectedFeature.kind === "slope" ? selectedFeaturePointId : null,
          }
        : null,
    );
  }, [featureMode, onTerrainFeatureToolChange, selectedFeature, selectedFeaturePointId]);

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

  function createSlopeFeature(): EditorTerrainFeature {
    const index = planet.terrainFeatures.length + 1;
    return {
      id: `slope-${Date.now().toString(36)}`,
      kind: "slope",
      name: `Slope ${index}`,
      enabled: true,
      width: 30,
      bank: 0,
      edgeFalloff: 10,
      smoothing: 0.9,
      transitionLength: 0,
      points: [
        { id: `slope-${index}-start`, normal: [0.18, 0.96, 0.2], heightOffset: 8 },
        { id: `slope-${index}-end`, normal: [0.58, 0.58, 0.57], heightOffset: -10 },
      ],
    };
  }

  function createJumpFeature(): EditorTerrainFeature {
    const index = planet.terrainFeatures.length + 1;
    const placement = inferJumpPlacement();
    return {
      id: `jump-${Date.now().toString(36)}`,
      kind: "jump",
      name: `Jump ${index}`,
      enabled: true,
      normal: placement.normal,
      tangent: placement.tangent,
      width: 24,
      length: 34,
      height: 10,
      edgeFalloff: 8,
      smoothing: 1,
    };
  }

  function addSlopeFeature() {
    const feature = createSlopeFeature();
    setSelectedFeatureId(feature.id);
    onTerrainFeaturePointSelectionChange(
      feature.kind === "slope" ? (feature.points[0]?.id ?? null) : null,
    );
    onTerrainFeaturesChange([...planet.terrainFeatures, feature]);
  }

  function addJumpFeature() {
    const feature = createJumpFeature();
    setSelectedFeatureId(feature.id);
    onTerrainFeaturePointSelectionChange(null);
    onTerrainFeaturesChange([...planet.terrainFeatures, feature]);
  }

  function updateFeature(featureId: string, patch: Partial<EditorTerrainFeature>) {
    onTerrainFeaturesChange(
      planet.terrainFeatures.map((feature) =>
        feature.id === featureId ? ({ ...feature, ...patch } as EditorTerrainFeature) : feature,
      ),
    );
  }

  function updateFeaturePoint(
    featureId: string,
    pointIndex: number,
    patch: Partial<EditorTerrainSlopeFeature["points"][number]>,
  ) {
    onTerrainFeaturesChange(
      planet.terrainFeatures.map((feature) =>
        feature.id === featureId && feature.kind === "slope"
          ? {
              ...feature,
              points: feature.points.map((point, index) =>
                index === pointIndex ? { ...point, ...patch } : point,
              ),
            }
          : feature,
      ),
    );
  }

  function averageNormal(
    a: [number, number, number],
    b: [number, number, number],
  ): [number, number, number] {
    const x = a[0] + b[0];
    const y = a[1] + b[1];
    const z = a[2] + b[2];
    const len = Math.hypot(x, y, z);
    if (len < 1e-8) return [a[0], a[1], a[2]];
    return [x / len, y / len, z / len];
  }

  function normalizedTuple(x: number, y: number, z: number): [number, number, number] {
    const len = Math.hypot(x, y, z);
    return len > 1e-8 ? [x / len, y / len, z / len] : [1, 0, 0];
  }

  function inferJumpPlacement(): {
    normal: [number, number, number];
    tangent: [number, number, number];
  } {
    if (selectedFeature?.kind !== "slope") return { normal: [0, 1, 0], tangent: [1, 0, 0] };
    const pointIndex = Math.max(0, selectedPointIndex(selectedFeature));
    const point = selectedFeature.points[pointIndex];
    if (!point) return { normal: [0, 1, 0], tangent: [1, 0, 0] };
    const neighbor =
      selectedFeature.points[Math.min(selectedFeature.points.length - 1, pointIndex + 1)] ??
      selectedFeature.points[Math.max(0, pointIndex - 1)] ??
      point;
    const [nx, ny, nz] = point.normal;
    const dx = neighbor.normal[0] - nx;
    const dy = neighbor.normal[1] - ny;
    const dz = neighbor.normal[2] - nz;
    const dot = dx * nx + dy * ny + dz * nz;
    return {
      normal: point.normal,
      tangent: normalizedTuple(dx - nx * dot, dy - ny * dot, dz - nz * dot),
    };
  }

  function insertPointAfterSelected(feature: EditorTerrainSlopeFeature) {
    if (feature.points.length < 2) return;
    const selectedIndex = Math.max(
      0,
      feature.points.findIndex((point) => point.id === selectedFeaturePointId),
    );
    const nextIndex = Math.min(feature.points.length - 1, selectedIndex + 1);
    const current = feature.points[selectedIndex]!;
    const next = feature.points[nextIndex] ?? current;
    const inserted = {
      id: `slope-point-${Date.now().toString(36)}`,
      normal: averageNormal(current.normal, next.normal),
      heightOffset: (current.heightOffset + next.heightOffset) * 0.5,
      width: current.width ?? next.width,
      bank:
        current.bank !== undefined || next.bank !== undefined
          ? ((current.bank ?? feature.bank) + (next.bank ?? feature.bank)) * 0.5
          : undefined,
      edgeFalloff:
        current.edgeFalloff !== undefined || next.edgeFalloff !== undefined
          ? ((current.edgeFalloff ?? feature.edgeFalloff) +
              (next.edgeFalloff ?? feature.edgeFalloff)) *
            0.5
          : undefined,
      smoothing:
        current.smoothing !== undefined || next.smoothing !== undefined
          ? ((current.smoothing ?? feature.smoothing) + (next.smoothing ?? feature.smoothing)) * 0.5
          : undefined,
    };
    const points = [...feature.points];
    points.splice(selectedIndex + 1, 0, inserted);
    updateFeature(feature.id, { points });
    onTerrainFeaturePointSelectionChange(inserted.id);
  }

  function deleteSelectedPoint(feature: EditorTerrainSlopeFeature) {
    if (!selectedFeaturePointId || feature.points.length <= 2) return;
    const index = feature.points.findIndex((point) => point.id === selectedFeaturePointId);
    if (index < 0) return;
    const points = feature.points.filter((point) => point.id !== selectedFeaturePointId);
    updateFeature(feature.id, { points });
    onTerrainFeaturePointSelectionChange(points[Math.min(index, points.length - 1)]?.id ?? null);
  }

  function selectedPointIndex(feature: EditorTerrainSlopeFeature): number {
    return feature.points.findIndex((point) => point.id === selectedFeaturePointId);
  }

  function clearPointOverride(
    feature: EditorTerrainSlopeFeature,
    key: "width" | "edgeFalloff" | "bank" | "smoothing",
  ) {
    const pointIndex = selectedPointIndex(feature);
    if (pointIndex < 0) return;
    updateFeaturePoint(feature.id, pointIndex, { [key]: undefined });
  }

  function overrideSummary(point: EditorTerrainSlopeFeature["points"][number]): string {
    const labels = [
      point.width !== undefined ? "W" : "",
      point.edgeFalloff !== undefined ? "E" : "",
      point.bank !== undefined ? "B" : "",
      point.smoothing !== undefined ? "S" : "",
    ].filter(Boolean);
    return labels.length > 0 ? labels.join("/") : "default";
  }

  function removeSelectedFeature() {
    if (!selectedFeatureId) return;
    const next = planet.terrainFeatures.filter((feature) => feature.id !== selectedFeatureId);
    setSelectedFeatureId(next[0]?.id ?? null);
    onTerrainFeaturePointSelectionChange(null);
    onTerrainFeaturesChange(next);
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

      <Section title="Terrain Features">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={addSlopeFeature}
              className="px-3 py-2 rounded border border-cyan-600 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 text-xs font-semibold"
            >
              Add Slope
            </button>
            <button
              type="button"
              onClick={addJumpFeature}
              className="px-3 py-2 rounded border border-emerald-600 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-xs font-semibold"
            >
              Add Jump
            </button>
          </div>
          {planet.terrainFeatures.length > 0 && (
            <div className="grid grid-cols-1 gap-1">
              {planet.terrainFeatures.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  onClick={() => {
                    setSelectedFeatureId(feature.id);
                    onTerrainFeaturePointSelectionChange(
                      feature.kind === "slope" ? (feature.points[0]?.id ?? null) : null,
                    );
                  }}
                  className={`px-2 py-1.5 rounded border text-left text-xs ${
                    selectedFeatureId === feature.id
                      ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
                      : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  {feature.name}
                  <span className="ml-1 text-[10px] text-zinc-500">{feature.kind}</span>
                </button>
              ))}
            </div>
          )}
          {planet.terrainFeatures
            .filter((feature) => feature.id === selectedFeatureId)
            .map((feature) => (
              <div key={feature.id} className="pt-2 space-y-2">
                {feature.kind === "slope" && (
                  <GridSelector
                    items={FEATURE_EDIT_MODES}
                    selectedId={featureMode}
                    onSelect={(id) =>
                      setFeatureMode((current) =>
                        current === id ? null : (id as TerrainFeatureEditMode),
                      )
                    }
                    columns={3}
                  />
                )}
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={feature.enabled}
                    onChange={(e) => updateFeature(feature.id, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
                <Slider
                  label="Width"
                  value={feature.width}
                  min={8}
                  max={80}
                  step={1}
                  decimals={0}
                  onChange={(width) => updateFeature(feature.id, { width })}
                />
                <Slider
                  label="Edge"
                  value={feature.edgeFalloff}
                  min={0}
                  max={32}
                  step={1}
                  decimals={0}
                  onChange={(edgeFalloff) => updateFeature(feature.id, { edgeFalloff })}
                />
                {feature.kind === "jump" && (
                  <>
                    <Slider
                      label="Length"
                      value={feature.length}
                      min={8}
                      max={90}
                      step={1}
                      decimals={0}
                      onChange={(length) => updateFeature(feature.id, { length })}
                    />
                    <Slider
                      label="Lip Height"
                      value={feature.height}
                      min={-20}
                      max={32}
                      step={0.5}
                      decimals={1}
                      onChange={(height) => updateFeature(feature.id, { height })}
                    />
                  </>
                )}
                {feature.kind === "slope" && (
                  <Slider
                    label="Bank"
                    value={feature.bank}
                    min={-24}
                    max={24}
                    step={0.5}
                    decimals={1}
                    onChange={(bank) => updateFeature(feature.id, { bank })}
                  />
                )}
                <Slider
                  label="Smooth"
                  value={feature.smoothing}
                  min={0}
                  max={1}
                  step={0.01}
                  decimals={2}
                  onChange={(smoothing) => updateFeature(feature.id, { smoothing })}
                />
                {feature.kind === "slope" && (
                  <>
                    <Slider
                      label="Transition"
                      value={feature.transitionLength}
                      min={0}
                      max={80}
                      step={1}
                      decimals={0}
                      onChange={(transitionLength) =>
                        updateFeature(feature.id, { transitionLength })
                      }
                    />
                    <Slider
                      label="Start Height"
                      value={feature.points[0]?.heightOffset ?? 0}
                      min={-32}
                      max={32}
                      step={0.5}
                      decimals={1}
                      onChange={(height) =>
                        updateFeaturePoint(feature.id, 0, { heightOffset: height })
                      }
                    />
                    <Slider
                      label="End Height"
                      value={feature.points[feature.points.length - 1]?.heightOffset ?? 0}
                      min={-32}
                      max={32}
                      step={0.5}
                      decimals={1}
                      onChange={(height) =>
                        updateFeaturePoint(feature.id, feature.points.length - 1, {
                          heightOffset: height,
                        })
                      }
                    />
                    <div className="space-y-1 pt-1">
                      <div className="text-xs text-zinc-400">Points</div>
                      <div className="grid grid-cols-2 gap-1">
                        {feature.points.map((point, index) => (
                          <button
                            key={point.id}
                            type="button"
                            onClick={() => onTerrainFeaturePointSelectionChange(point.id)}
                            className={`px-2 py-1 rounded border text-xs ${
                              selectedFeaturePointId === point.id
                                ? "border-yellow-400 bg-yellow-400/15 text-yellow-100"
                                : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                            }`}
                          >
                            <span>Point {index + 1}</span>
                            <span className="block text-[10px] text-zinc-500">
                              H {point.heightOffset.toFixed(1)} · {overrideSummary(point)}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => insertPointAfterSelected(feature)}
                          disabled={!selectedFeaturePointId}
                          className="px-2 py-1 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 disabled:opacity-40 disabled:hover:bg-zinc-700 text-xs"
                        >
                          Insert
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSelectedPoint(feature)}
                          disabled={!selectedFeaturePointId || feature.points.length <= 2}
                          className="px-2 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800 text-xs"
                        >
                          Delete Point
                        </button>
                      </div>
                    </div>
                  </>
                )}
                {feature.kind === "slope" && selectedFeaturePoint && (
                  <div className="space-y-2">
                    <Slider
                      label="Point Height"
                      value={selectedFeaturePoint.heightOffset}
                      min={-32}
                      max={32}
                      step={0.5}
                      decimals={1}
                      onChange={(height) => {
                        const pointIndex = feature.points.findIndex(
                          (point) => point.id === selectedFeaturePoint.id,
                        );
                        if (pointIndex >= 0) {
                          updateFeaturePoint(feature.id, pointIndex, { heightOffset: height });
                        }
                      }}
                    />
                    <Slider
                      label="Point Width"
                      value={selectedFeaturePoint.width ?? feature.width}
                      min={8}
                      max={80}
                      step={1}
                      decimals={0}
                      onChange={(width) => {
                        const pointIndex = feature.points.findIndex(
                          (point) => point.id === selectedFeaturePoint.id,
                        );
                        if (pointIndex >= 0) updateFeaturePoint(feature.id, pointIndex, { width });
                      }}
                    />
                    {selectedFeaturePoint.width !== undefined && (
                      <button
                        type="button"
                        onClick={() => clearPointOverride(feature, "width")}
                        className="w-full px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 text-xs"
                      >
                        Inherit Width
                      </button>
                    )}
                    <Slider
                      label="Point Edge"
                      value={selectedFeaturePoint.edgeFalloff ?? feature.edgeFalloff}
                      min={0}
                      max={32}
                      step={1}
                      decimals={0}
                      onChange={(edgeFalloff) => {
                        const pointIndex = feature.points.findIndex(
                          (point) => point.id === selectedFeaturePoint.id,
                        );
                        if (pointIndex >= 0)
                          updateFeaturePoint(feature.id, pointIndex, { edgeFalloff });
                      }}
                    />
                    {selectedFeaturePoint.edgeFalloff !== undefined && (
                      <button
                        type="button"
                        onClick={() => clearPointOverride(feature, "edgeFalloff")}
                        className="w-full px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 text-xs"
                      >
                        Inherit Edge
                      </button>
                    )}
                    <Slider
                      label="Point Bank"
                      value={selectedFeaturePoint.bank ?? feature.bank}
                      min={-24}
                      max={24}
                      step={0.5}
                      decimals={1}
                      onChange={(bank) => {
                        const pointIndex = feature.points.findIndex(
                          (point) => point.id === selectedFeaturePoint.id,
                        );
                        if (pointIndex >= 0) updateFeaturePoint(feature.id, pointIndex, { bank });
                      }}
                    />
                    {selectedFeaturePoint.bank !== undefined && (
                      <button
                        type="button"
                        onClick={() => clearPointOverride(feature, "bank")}
                        className="w-full px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 text-xs"
                      >
                        Inherit Bank
                      </button>
                    )}
                    <Slider
                      label="Point Smooth"
                      value={selectedFeaturePoint.smoothing ?? feature.smoothing}
                      min={0}
                      max={1}
                      step={0.01}
                      decimals={2}
                      onChange={(smoothing) => {
                        const pointIndex = feature.points.findIndex(
                          (point) => point.id === selectedFeaturePoint.id,
                        );
                        if (pointIndex >= 0)
                          updateFeaturePoint(feature.id, pointIndex, { smoothing });
                      }}
                    />
                    {selectedFeaturePoint.smoothing !== undefined && (
                      <button
                        type="button"
                        onClick={() => clearPointOverride(feature, "smoothing")}
                        className="w-full px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 text-xs"
                      >
                        Inherit Smooth
                      </button>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={removeSelectedFeature}
                  className="w-full px-3 py-1.5 rounded border border-red-900/70 bg-red-950/40 hover:bg-red-950 text-red-300 text-xs"
                >
                  Delete Feature
                </button>
              </div>
            ))}
        </div>
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
