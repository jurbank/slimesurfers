import { useEffect, useState } from "react";
import type { PropBrushState, PropId } from "../types.ts";
import { Section } from "./ui/Section.tsx";
import { Slider } from "./ui/Slider.tsx";

const TREE_PROPS: { id: PropId; label: string; description: string }[] = [
  {
    id: "lowPolyTree",
    label: "Low Poly Tree",
    description: "Paintable trunk and canopy instances",
  },
  {
    id: "palmTree",
    label: "Palm Tree",
    description: "Tapered trunk with low poly fronds",
  },
];

const SKATE_PARK_PROPS: { id: PropId; label: string; description: string }[] = [
  {
    id: "ramp",
    label: "Ramp",
    description: "Low poly skate ramp instance",
  },
];

interface PropsPanelProps {
  onPropBrushChange: (state: PropBrushState | null) => void;
}

export function PropsPanel({ onPropBrushChange }: PropsPanelProps) {
  const [selectedProp, setSelectedProp] = useState<PropId | null>(null);
  const [brushSize, setBrushSize] = useState(5);
  const [density, setDensity] = useState(3);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    return () => {
      onPropBrushChange(null);
    };
    // onPropBrushChange is stable (useCallback in App)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function notifyBrush(
    propId: PropId | null,
    size: number,
    nextDensity: number,
    nextScale: number,
  ) {
    onPropBrushChange(propId ? { propId, size, density: nextDensity, scale: nextScale } : null);
  }

  function handlePropClick(propId: PropId) {
    const next = selectedProp === propId ? null : propId;
    setSelectedProp(next);
    notifyBrush(next, brushSize, density, scale);
  }

  function handleSizeChange(v: number) {
    setBrushSize(v);
    if (selectedProp) notifyBrush(selectedProp, v, density, scale);
  }

  function handleDensityChange(v: number) {
    setDensity(v);
    if (selectedProp) notifyBrush(selectedProp, brushSize, v, scale);
  }

  function handleScaleChange(v: number) {
    setScale(v);
    if (selectedProp) notifyBrush(selectedProp, brushSize, density, v);
  }

  function renderPropButtons(props: { id: PropId; label: string; description: string }[]) {
    return (
      <div className="space-y-2">
        {props.map(({ id, label, description }) => (
          <button
            key={id}
            onClick={() => handlePropClick(id)}
            className={`w-full text-left px-3 py-2 rounded border transition-colors ${
              selectedProp === id
                ? "bg-cyan-500 text-black border-cyan-400"
                : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"
            }`}
          >
            <span className="block text-xs font-semibold">{label}</span>
            <span
              className={`block text-[11px] mt-0.5 ${
                selectedProp === id ? "text-black/70" : "text-zinc-500"
              }`}
            >
              {description}
            </span>
          </button>
        ))}
      </div>
    );
  }

  function renderBrushSettings() {
    return (
      <div className="mt-3 space-y-2">
        <Slider
          label="Brush Size"
          value={brushSize}
          min={1}
          max={18}
          step={0.5}
          decimals={1}
          onChange={handleSizeChange}
        />
        <Slider
          label="Density"
          value={density}
          min={1}
          max={8}
          step={1}
          decimals={0}
          onChange={handleDensityChange}
        />
        <Slider
          label="Scale"
          value={scale}
          min={0.5}
          max={2}
          step={0.05}
          onChange={handleScaleChange}
        />
        <p className="text-xs text-zinc-500 pt-1">Space + drag to orbit</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Section title="Trees">
        {renderPropButtons(TREE_PROPS)}
        {selectedProp &&
          TREE_PROPS.some((prop) => prop.id === selectedProp) &&
          renderBrushSettings()}
      </Section>

      <Section title="Skate Park">{renderPropButtons(SKATE_PARK_PROPS)}</Section>
    </div>
  );
}
