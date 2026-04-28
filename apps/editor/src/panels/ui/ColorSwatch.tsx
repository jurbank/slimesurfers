interface ColorSwatchProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

export function ColorSwatch({ label, value, onChange }: ColorSwatchProps) {
  const hex = "#" + value.toString(16).padStart(6, "0");
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-zinc-400">{label}</label>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-zinc-500">{hex}</span>
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(parseInt(e.target.value.slice(1), 16))}
          className="w-7 h-5 cursor-pointer border-0 p-0 bg-transparent rounded"
        />
      </div>
    </div>
  );
}
