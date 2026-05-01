import type { PreviewSpawnState } from "../types.ts";
import { Section } from "./ui/Section.tsx";

interface SpawnsPanelProps {
  spawn: PreviewSpawnState;
  placementActive: boolean;
  onPlacementActiveChange: (active: boolean) => void;
  onReset: () => void;
}

export function SpawnsPanel({
  spawn,
  placementActive,
  onPlacementActiveChange,
  onReset,
}: SpawnsPanelProps) {
  return (
    <div className="space-y-4">
      <Section title="Preview Spawn">
        <button
          onClick={() => onPlacementActiveChange(!placementActive)}
          className={`w-full py-2 text-xs rounded font-semibold transition-colors ${
            placementActive
              ? "bg-cyan-500 text-black hover:bg-cyan-400"
              : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
          }`}
        >
          {placementActive ? "Placing Spawn" : "Place Spawn"}
        </button>
        <button
          onClick={onReset}
          className="w-full py-1 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          Reset to North Pole
        </button>
        <div className="grid grid-cols-3 gap-1 text-xs font-mono text-zinc-300">
          <div className="rounded bg-zinc-800 px-1.5 py-1 text-center">
            {spawn.normal[0].toFixed(2)}
          </div>
          <div className="rounded bg-zinc-800 px-1.5 py-1 text-center">
            {spawn.normal[1].toFixed(2)}
          </div>
          <div className="rounded bg-zinc-800 px-1.5 py-1 text-center">
            {spawn.normal[2].toFixed(2)}
          </div>
        </div>
      </Section>
    </div>
  );
}
