import { useEffect, useState, type ReactNode } from "react";
import type { PropBrushState, PropId } from "../types.ts";
import { Section } from "./ui/Section.tsx";
import { Slider } from "./ui/Slider.tsx";
import { GridSelector } from "./ui/GridSelector.tsx";
import { PropPreview } from "./ui/PropPreview.tsx";

const NATURE_PROPS: { id: PropId; label: string; preview: ReactNode }[] = [
  {
    id: "lowPolyTree",
    label: "Low Poly",
    preview: <PropPreview propId="lowPolyTree" />,
  },
  {
    id: "palmTree",
    label: "Palm",
    preview: <PropPreview propId="palmTree" />,
  },
  {
    id: "mushroom",
    label: "Mushroom",
    preview: <PropPreview propId="mushroom" />,
  },
  {
    id: "cactus",
    label: "Cactus",
    preview: <PropPreview propId="cactus" />,
  },
  {
    id: "bush",
    label: "Bush",
    preview: <PropPreview propId="bush" />,
  },
  {
    id: "flower",
    label: "Flower",
    preview: <PropPreview propId="flower" />,
  },
];

const SKATE_PARK_PROPS: { id: PropId; label: string; preview: ReactNode }[] = [
  {
    id: "ramp",
    label: "Ramp",
    preview: <PropPreview propId="ramp" />,
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
    setSelectedProp(next as PropId);
    notifyBrush(next as PropId, brushSize, density, scale);
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
      <Section title="Nature">
        <GridSelector
          items={NATURE_PROPS}
          selectedId={selectedProp}
          onSelect={(id) => handlePropClick(id as PropId)}
        />
        {selectedProp &&
          NATURE_PROPS.some((prop) => prop.id === selectedProp) &&
          renderBrushSettings()}
      </Section>

      <Section title="Skate Park">
        <GridSelector
          items={SKATE_PARK_PROPS}
          selectedId={selectedProp}
          onSelect={(id) => handlePropClick(id as PropId)}
        />
        {selectedProp &&
          SKATE_PARK_PROPS.some((prop) => prop.id === selectedProp) &&
          renderBrushSettings()}
      </Section>
    </div>
  );
}
