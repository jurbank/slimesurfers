import { useEffect, useRef, useState } from "react";
import {
  createDefaultRailState,
  type RailEditMode,
  type RailPoint,
  type RailState,
  type RailToolState,
} from "../tools/rails/RailTypes.ts";
import { Section } from "./ui/Section.tsx";
import { Slider } from "./ui/Slider.tsx";
import { GridSelector } from "./ui/GridSelector.tsx";

const EDIT_MODES: { id: RailEditMode; label: string }[] = [
  { id: "add", label: "Add" },
  { id: "move", label: "Move" },
  { id: "delete", label: "Delete" },
];

interface RailsPanelProps {
  rails: RailState[];
  planetId: string;
  activeRailId: string;
  selectedPointId: string | null;
  onActiveRailChange: (railId: string) => void;
  onRailsChange: (rails: RailState[], activeRailId: string, selectedPointId: string | null) => void;
  onRailChange: (rail: RailState) => void;
  onRailToolChange: (state: RailToolState) => void;
  onPointSelectionChange: (pointId: string | null) => void;
}

export function RailsPanel({
  rails,
  planetId,
  activeRailId,
  selectedPointId,
  onActiveRailChange,
  onRailsChange,
  onRailChange,
  onRailToolChange,
  onPointSelectionChange,
}: RailsPanelProps) {
  const [mode, setMode] = useState<RailEditMode | null>("add");
  const planetRails = rails.filter((rail) => rail.planetId === planetId);
  const activeRail = planetRails.find((rail) => rail.id === activeRailId) ?? planetRails[0];
  const railRef = useRef<RailState | null>(activeRail ?? null);
  const selectedPoint = activeRail?.points.find((point) => point.id === selectedPointId) ?? null;

  useEffect(() => {
    if (activeRail && activeRail.id !== activeRailId) onActiveRailChange(activeRail.id);
  }, [activeRail, activeRailId, onActiveRailChange]);

  useEffect(() => {
    if (!activeRail) return;
    railRef.current = activeRail;
    onRailToolChange({ mode, rail: activeRail, selectedPointId });
  }, [activeRail, mode, onRailToolChange, selectedPointId]);

  useEffect(() => {
    return () => {
      if (railRef.current) {
        onRailToolChange({ mode: null, rail: railRef.current, selectedPointId: null });
      }
    };
  }, [onRailToolChange]);

  function updateActiveRail(nextRail: RailState, nextSelectedPointId = selectedPointId) {
    onRailChange(nextRail);
    onRailToolChange({ mode, rail: nextRail, selectedPointId: nextSelectedPointId });
  }

  function replaceRails(
    nextPlanetRails: RailState[],
    nextActiveRailId = activeRailId,
    nextSelectedPointId: string | null = selectedPointId,
  ) {
    const otherRails = rails.filter((rail) => rail.planetId !== planetId);
    const nextRails = [...otherRails, ...nextPlanetRails];
    onRailsChange(nextRails, nextActiveRailId, nextSelectedPointId);
    const nextActiveRail = nextPlanetRails.find((rail) => rail.id === nextActiveRailId);
    if (nextActiveRail) {
      onRailToolChange({
        mode,
        rail: nextActiveRail,
        selectedPointId: nextSelectedPointId,
      });
    }
  }

  function handleModeClick(nextMode: RailEditMode) {
    setMode((current) => (current === nextMode ? null : nextMode));
  }

  function addRail() {
    const rail = createDefaultRailState(undefined, planetId);
    replaceRails([...planetRails, rail], rail.id, null);
  }

  function duplicateRail() {
    if (!activeRail) return;
    const duplicate: RailState = {
      ...activeRail,
      id: createDefaultRailState(undefined, planetId).id,
      planetId,
      name: `${activeRail.name} Copy`,
      points: activeRail.points.map((point) => ({ ...point, id: createPointId() })),
    };
    replaceRails([...planetRails, duplicate], duplicate.id, null);
  }

  function deleteRail() {
    if (planetRails.length <= 1 || !activeRail) return;
    const nextRails = planetRails.filter((rail) => rail.id !== activeRail.id);
    replaceRails(nextRails, nextRails[0].id, null);
  }

  function clearRail() {
    if (!activeRail) return;
    updateActiveRail({ ...activeRail, points: [] }, null);
    onPointSelectionChange(null);
  }

  function selectPoint(pointId: string | null) {
    onPointSelectionChange(pointId);
    if (activeRail) onRailToolChange({ mode, rail: activeRail, selectedPointId: pointId });
  }

  function updatePoint(pointId: string, patch: Partial<RailPoint>) {
    if (!activeRail) return;
    const nextRail = {
      ...activeRail,
      points: activeRail.points.map((point) =>
        point.id === pointId ? { ...point, ...patch } : point,
      ),
    };
    updateActiveRail(nextRail, pointId);
  }

  function insertAfterSelected() {
    if (!activeRail || !selectedPoint) return;
    const index = activeRail.points.findIndex((point) => point.id === selectedPoint.id);
    if (index < 0) return;
    const next = activeRail.points[(index + 1) % activeRail.points.length];
    if (!next) return;
    const normal = averageNormal(selectedPoint.normal, next.normal);
    const inserted: RailPoint = {
      id: createPointId(),
      normal,
      width: selectedPoint.width,
      bank: selectedPoint.bank,
    };
    const points = [...activeRail.points];
    points.splice(index + 1, 0, inserted);
    updateActiveRail({ ...activeRail, points }, inserted.id);
    onPointSelectionChange(inserted.id);
  }

  function deleteSelectedPoint() {
    if (!activeRail || !selectedPointId) return;
    updateActiveRail(
      {
        ...activeRail,
        points: activeRail.points.filter((point) => point.id !== selectedPointId),
      },
      null,
    );
    onPointSelectionChange(null);
  }

  if (!activeRail) return null;

  return (
    <div className="space-y-4">
      <Section title="Rails">
        <GridSelector
          items={planetRails.map((t) => ({
            id: t.id,
            label: t.name,
            description: `${t.points.length} pts`,
          }))}
          selectedId={activeRailId}
          onSelect={onActiveRailChange}
          columns={2}
        />
        <div className="grid grid-cols-3 gap-1 pt-1">
          <button
            onClick={addRail}
            className="py-1 text-xs rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
          >
            New
          </button>
          <button
            onClick={duplicateRail}
            className="py-1 text-xs rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
          >
            Duplicate
          </button>
          <button
            onClick={deleteRail}
            disabled={planetRails.length <= 1}
            className="py-1 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800 transition-colors"
          >
            Delete
          </button>
        </div>
      </Section>

      <Section title="Builder">
        <input
          value={activeRail.name}
          onChange={(e) => updateActiveRail({ ...activeRail, name: e.target.value })}
          className="w-full px-2 py-1 text-xs bg-zinc-800 text-zinc-200 border border-zinc-700 rounded focus:outline-none focus:border-cyan-500 mb-2"
        />
        <GridSelector
          items={EDIT_MODES}
          selectedId={mode}
          onSelect={(id) => handleModeClick(id as RailEditMode)}
          columns={3}
        />
        <div className="grid grid-cols-2 gap-1 pt-2">
          <button
            onClick={() => updateActiveRail({ ...activeRail, closed: !activeRail.closed })}
            className={`py-1 text-xs rounded transition-colors ${
              activeRail.closed
                ? "bg-cyan-500 text-black font-semibold"
                : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
            }`}
          >
            Closed Loop
          </button>
          <button
            onClick={clearRail}
            className="py-1 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Clear
          </button>
        </div>
        <p className="text-xs text-zinc-500 pt-1">Space + drag to orbit</p>
      </Section>

      <Section title="Shape">
        <Slider
          label="Rail Width"
          value={activeRail.width}
          min={2}
          max={24}
          step={0.5}
          decimals={1}
          onChange={(width) => updateActiveRail({ ...activeRail, width })}
        />
        <Slider
          label="Banking"
          value={activeRail.bank}
          min={-25}
          max={25}
          step={1}
          decimals={0}
          onChange={(bank) => updateActiveRail({ ...activeRail, bank })}
        />
        <Slider
          label="Segments"
          value={activeRail.segmentsPerCurve}
          min={4}
          max={32}
          step={1}
          decimals={0}
          onChange={(segmentsPerCurve) => updateActiveRail({ ...activeRail, segmentsPerCurve })}
        />
      </Section>

      <Section title="Points">
        <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
          {activeRail.points.map((point, index) => (
            <button
              key={point.id}
              onClick={() => selectPoint(point.id)}
              className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs transition-colors ${
                selectedPointId === point.id
                  ? "bg-cyan-500 text-black font-semibold"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              <span>Point {index + 1}</span>
              <span className="font-mono">
                {point.width ?? activeRail.width}/{point.bank ?? activeRail.bank}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">Control Points</span>
          <span className="font-mono text-zinc-300">{activeRail.points.length}</span>
        </div>
      </Section>

      {selectedPoint && (
        <Section title="Selected Point">
          <Slider
            label="Point Width"
            value={selectedPoint.width ?? activeRail.width}
            min={2}
            max={24}
            step={0.5}
            decimals={1}
            onChange={(width) => updatePoint(selectedPoint.id, { width })}
          />
          <Slider
            label="Point Bank"
            value={selectedPoint.bank ?? activeRail.bank}
            min={-25}
            max={25}
            step={1}
            decimals={0}
            onChange={(bank) => updatePoint(selectedPoint.id, { bank })}
          />
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => updatePoint(selectedPoint.id, { width: undefined })}
              className="py-1 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Reset W
            </button>
            <button
              onClick={() => updatePoint(selectedPoint.id, { bank: undefined })}
              className="py-1 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Reset B
            </button>
            <button
              onClick={insertAfterSelected}
              disabled={activeRail.points.length < 2}
              className="py-1 text-xs rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 disabled:opacity-40 transition-colors"
            >
              Insert
            </button>
          </div>
          <button
            onClick={deleteSelectedPoint}
            className="w-full py-1 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Delete Selected
          </button>
        </Section>
      )}
    </div>
  );
}

function createPointId(): string {
  return `point-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

function averageNormal(a: [number, number, number], b: [number, number, number]) {
  const x = a[0] + b[0];
  const y = a[1] + b[1];
  const z = a[2] + b[2];
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len] as [number, number, number];
}
