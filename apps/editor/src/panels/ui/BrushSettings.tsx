import type { BrushFalloff } from "../../types.ts";
import { Slider } from "./Slider.tsx";

const FALLOFFS: { id: BrushFalloff; label: string }[] = [
  { id: "smooth", label: "Smooth" },
  { id: "linear", label: "Linear" },
  { id: "sharp", label: "Sharp" },
];

interface BrushSettingsProps {
  size: number;
  strength: number;
  falloff: BrushFalloff;
  onSizeChange: (v: number) => void;
  onStrengthChange: (v: number) => void;
  onFalloffChange: (v: BrushFalloff) => void;
}

export function BrushSettings({
  size,
  strength,
  falloff,
  onSizeChange,
  onStrengthChange,
  onFalloffChange,
}: BrushSettingsProps) {
  return (
    <div className="space-y-2">
      <Slider
        label="Size"
        value={size}
        min={1}
        max={25}
        step={0.5}
        decimals={1}
        onChange={onSizeChange}
      />
      <Slider
        label="Strength"
        value={strength}
        min={0}
        max={1}
        step={0.01}
        onChange={onStrengthChange}
      />
      <div className="flex items-center justify-between">
        <label className="text-xs text-zinc-400">Falloff</label>
        <div className="flex gap-1">
          {FALLOFFS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onFalloffChange(id)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                falloff === id
                  ? "bg-cyan-500 text-black font-semibold"
                  : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
