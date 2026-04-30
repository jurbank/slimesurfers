import type { BrushFalloff } from "../../types.ts";
import { Slider } from "./Slider.tsx";
import { GridSelector } from "./GridSelector.tsx";

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
      <div className="space-y-1.5 pt-1">
        <label className="text-xs text-zinc-400">Falloff</label>
        <GridSelector
          items={FALLOFFS}
          selectedId={falloff}
          onSelect={(id) => onFalloffChange(id as BrushFalloff)}
          columns={3}
        />
      </div>
    </div>
  );
}
