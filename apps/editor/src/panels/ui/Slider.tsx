interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  onChange: (v: number) => void;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  decimals = 2,
  onChange,
}: SliderProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <label className="text-xs text-zinc-400">{label}</label>
        <span className="text-xs font-mono text-zinc-300">{value.toFixed(decimals)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded cursor-pointer accent-cyan-400"
      />
    </div>
  );
}
