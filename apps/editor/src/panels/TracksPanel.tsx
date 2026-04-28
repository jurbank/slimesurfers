import { useEffect, useRef, useState } from "react";
import {
  createDefaultTrackState,
  type TrackEditMode,
  type TrackPoint,
  type TrackState,
  type TrackToolState,
} from "../tools/tracks/TrackTypes.ts";
import { Section } from "./ui/Section.tsx";
import { Slider } from "./ui/Slider.tsx";

const EDIT_MODES: { id: TrackEditMode; label: string }[] = [
  { id: "add", label: "Add" },
  { id: "move", label: "Move" },
  { id: "delete", label: "Delete" },
];

interface TracksPanelProps {
  tracks: TrackState[];
  activeTrackId: string;
  selectedPointId: string | null;
  onActiveTrackChange: (trackId: string) => void;
  onTracksChange: (
    tracks: TrackState[],
    activeTrackId: string,
    selectedPointId: string | null,
  ) => void;
  onTrackChange: (track: TrackState) => void;
  onTrackToolChange: (state: TrackToolState) => void;
  onPointSelectionChange: (pointId: string | null) => void;
}

export function TracksPanel({
  tracks,
  activeTrackId,
  selectedPointId,
  onActiveTrackChange,
  onTracksChange,
  onTrackChange,
  onTrackToolChange,
  onPointSelectionChange,
}: TracksPanelProps) {
  const [mode, setMode] = useState<TrackEditMode | null>("add");
  const activeTrack = tracks.find((track) => track.id === activeTrackId) ?? tracks[0];
  const trackRef = useRef(activeTrack);
  const selectedPoint = activeTrack?.points.find((point) => point.id === selectedPointId) ?? null;

  useEffect(() => {
    if (!activeTrack) return;
    trackRef.current = activeTrack;
    onTrackToolChange({ mode, track: activeTrack, selectedPointId });
  }, [activeTrack, mode, onTrackToolChange, selectedPointId]);

  useEffect(() => {
    return () => {
      onTrackToolChange({ mode: null, track: trackRef.current, selectedPointId: null });
    };
  }, [onTrackToolChange]);

  function updateActiveTrack(nextTrack: TrackState, nextSelectedPointId = selectedPointId) {
    onTrackChange(nextTrack);
    onTrackToolChange({ mode, track: nextTrack, selectedPointId: nextSelectedPointId });
  }

  function replaceTracks(
    nextTracks: TrackState[],
    nextActiveTrackId = activeTrackId,
    nextSelectedPointId: string | null = selectedPointId,
  ) {
    onTracksChange(nextTracks, nextActiveTrackId, nextSelectedPointId);
    const nextActiveTrack = nextTracks.find((track) => track.id === nextActiveTrackId);
    if (nextActiveTrack) {
      onTrackToolChange({
        mode,
        track: nextActiveTrack,
        selectedPointId: nextSelectedPointId,
      });
    }
  }

  function handleModeClick(nextMode: TrackEditMode) {
    setMode((current) => (current === nextMode ? null : nextMode));
  }

  function addTrack() {
    const track = createDefaultTrackState();
    replaceTracks([...tracks, track], track.id, null);
  }

  function duplicateTrack() {
    if (!activeTrack) return;
    const duplicate: TrackState = {
      ...activeTrack,
      id: createDefaultTrackState().id,
      name: `${activeTrack.name} Copy`,
      points: activeTrack.points.map((point) => ({ ...point, id: createPointId() })),
    };
    replaceTracks([...tracks, duplicate], duplicate.id, null);
  }

  function deleteTrack() {
    if (tracks.length <= 1 || !activeTrack) return;
    const nextTracks = tracks.filter((track) => track.id !== activeTrack.id);
    replaceTracks(nextTracks, nextTracks[0].id, null);
  }

  function clearTrack() {
    if (!activeTrack) return;
    updateActiveTrack({ ...activeTrack, points: [] }, null);
    onPointSelectionChange(null);
  }

  function selectPoint(pointId: string | null) {
    onPointSelectionChange(pointId);
    if (activeTrack) onTrackToolChange({ mode, track: activeTrack, selectedPointId: pointId });
  }

  function updatePoint(pointId: string, patch: Partial<TrackPoint>) {
    if (!activeTrack) return;
    const nextTrack = {
      ...activeTrack,
      points: activeTrack.points.map((point) =>
        point.id === pointId ? { ...point, ...patch } : point,
      ),
    };
    updateActiveTrack(nextTrack, pointId);
  }

  function insertAfterSelected() {
    if (!activeTrack || !selectedPoint) return;
    const index = activeTrack.points.findIndex((point) => point.id === selectedPoint.id);
    if (index < 0) return;
    const next = activeTrack.points[(index + 1) % activeTrack.points.length];
    if (!next) return;
    const normal = averageNormal(selectedPoint.normal, next.normal);
    const inserted: TrackPoint = {
      id: createPointId(),
      normal,
      width: selectedPoint.width,
      bank: selectedPoint.bank,
    };
    const points = [...activeTrack.points];
    points.splice(index + 1, 0, inserted);
    updateActiveTrack({ ...activeTrack, points }, inserted.id);
    onPointSelectionChange(inserted.id);
  }

  function deleteSelectedPoint() {
    if (!activeTrack || !selectedPointId) return;
    updateActiveTrack(
      {
        ...activeTrack,
        points: activeTrack.points.filter((point) => point.id !== selectedPointId),
      },
      null,
    );
    onPointSelectionChange(null);
  }

  if (!activeTrack) return null;

  return (
    <div className="space-y-4">
      <Section title="Tracks">
        <div className="space-y-1">
          {tracks.map((track) => (
            <button
              key={track.id}
              onClick={() => onActiveTrackChange(track.id)}
              className={`w-full text-left px-3 py-2 rounded border transition-colors ${
                activeTrack.id === track.id
                  ? "bg-cyan-500 text-black border-cyan-400"
                  : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"
              }`}
            >
              <span className="block text-xs font-semibold">{track.name}</span>
              <span
                className={`block text-[11px] mt-0.5 ${
                  activeTrack.id === track.id ? "text-black/70" : "text-zinc-500"
                }`}
              >
                {track.points.length} points
              </span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1 pt-1">
          <button
            onClick={addTrack}
            className="py-1 text-xs rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
          >
            New
          </button>
          <button
            onClick={duplicateTrack}
            className="py-1 text-xs rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
          >
            Duplicate
          </button>
          <button
            onClick={deleteTrack}
            disabled={tracks.length <= 1}
            className="py-1 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800 transition-colors"
          >
            Delete
          </button>
        </div>
      </Section>

      <Section title="Builder">
        <input
          value={activeTrack.name}
          onChange={(e) => updateActiveTrack({ ...activeTrack, name: e.target.value })}
          className="w-full px-2 py-1 text-xs bg-zinc-800 text-zinc-200 border border-zinc-700 rounded focus:outline-none focus:border-cyan-500"
        />
        <div className="grid grid-cols-3 gap-1">
          {EDIT_MODES.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleModeClick(id)}
              className={`py-1 text-xs rounded transition-colors ${
                mode === id
                  ? "bg-cyan-500 text-black font-semibold"
                  : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1 pt-1">
          <button
            onClick={() => updateActiveTrack({ ...activeTrack, closed: !activeTrack.closed })}
            className={`py-1 text-xs rounded transition-colors ${
              activeTrack.closed
                ? "bg-cyan-500 text-black font-semibold"
                : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
            }`}
          >
            Closed Loop
          </button>
          <button
            onClick={clearTrack}
            className="py-1 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Clear
          </button>
        </div>
        <p className="text-xs text-zinc-500 pt-1">Space + drag to orbit</p>
      </Section>

      <Section title="Shape">
        <Slider
          label="Track Width"
          value={activeTrack.width}
          min={2}
          max={24}
          step={0.5}
          decimals={1}
          onChange={(width) => updateActiveTrack({ ...activeTrack, width })}
        />
        <Slider
          label="Banking"
          value={activeTrack.bank}
          min={-25}
          max={25}
          step={1}
          decimals={0}
          onChange={(bank) => updateActiveTrack({ ...activeTrack, bank })}
        />
        <Slider
          label="Segments"
          value={activeTrack.segmentsPerCurve}
          min={4}
          max={32}
          step={1}
          decimals={0}
          onChange={(segmentsPerCurve) => updateActiveTrack({ ...activeTrack, segmentsPerCurve })}
        />
      </Section>

      <Section title="Points">
        <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
          {activeTrack.points.map((point, index) => (
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
                {point.width ?? activeTrack.width}/{point.bank ?? activeTrack.bank}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">Control Points</span>
          <span className="font-mono text-zinc-300">{activeTrack.points.length}</span>
        </div>
      </Section>

      {selectedPoint && (
        <Section title="Selected Point">
          <Slider
            label="Point Width"
            value={selectedPoint.width ?? activeTrack.width}
            min={2}
            max={24}
            step={0.5}
            decimals={1}
            onChange={(width) => updatePoint(selectedPoint.id, { width })}
          />
          <Slider
            label="Point Bank"
            value={selectedPoint.bank ?? activeTrack.bank}
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
              disabled={activeTrack.points.length < 2}
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
