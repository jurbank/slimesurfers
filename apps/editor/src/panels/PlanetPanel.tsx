import { defaultEditorConfig, type EditorConfig, type EditorPlanet } from "../types.ts";
import { Section } from "./ui/Section.tsx";
import { Slider } from "./ui/Slider.tsx";

interface PlanetPanelProps {
  config: EditorConfig;
  onPlanetsChange: (planets: EditorPlanet[]) => void;
}

function nextPlanetId(planets: EditorPlanet[]): string {
  const ids = new Set(planets.map((p) => p.id));
  for (let i = 0; ; i++) {
    const candidate = `planet-${i}`;
    if (!ids.has(candidate)) return candidate;
  }
}

export function PlanetPanel({ config, onPlanetsChange }: PlanetPanelProps) {
  const planets = config.planets;

  function updatePlanet(index: number, patch: Partial<EditorPlanet>) {
    const next = planets.map((p, i) => (i === index ? { ...p, ...patch } : p));
    onPlanetsChange(next);
  }

  function updateCenter(index: number, axis: "x" | "y" | "z", value: number) {
    updatePlanet(index, { center: { ...planets[index]!.center, [axis]: value } });
  }

  function addPlanet() {
    const id = nextPlanetId(planets);
    const defaultRadius = defaultEditorConfig().planets[0]!.radius;
    onPlanetsChange([...planets, { id, center: { x: 400, y: 0, z: 0 }, radius: defaultRadius }]);
  }

  function removePlanet(index: number) {
    if (planets.length <= 1) return;
    onPlanetsChange(planets.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {planets.map((planet, index) => (
        <Section
          key={planet.id}
          title={index === 0 ? `${planet.id} (main)` : planet.id}
          defaultOpen={index === 0}
        >
          <Slider
            label="Radius"
            value={planet.radius}
            min={20}
            max={300}
            step={1}
            decimals={0}
            onChange={(v) => updatePlanet(index, { radius: v })}
          />
          <Slider
            label="Center X"
            value={planet.center.x}
            min={-2000}
            max={2000}
            step={1}
            decimals={0}
            onChange={(v) => updateCenter(index, "x", v)}
          />
          <Slider
            label="Center Y"
            value={planet.center.y}
            min={-2000}
            max={2000}
            step={1}
            decimals={0}
            onChange={(v) => updateCenter(index, "y", v)}
          />
          <Slider
            label="Center Z"
            value={planet.center.z}
            min={-2000}
            max={2000}
            step={1}
            decimals={0}
            onChange={(v) => updateCenter(index, "z", v)}
          />
          {index > 0 && (
            <button
              onClick={() => removePlanet(index)}
              className="mt-1 w-full px-2 py-1 bg-zinc-800 hover:bg-red-900/60 border border-zinc-700 hover:border-red-700 rounded text-xs text-zinc-400 hover:text-red-300 transition-colors"
            >
              Remove planet
            </button>
          )}
        </Section>
      ))}
      <button
        onClick={addPlanet}
        className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-300 transition-colors"
      >
        + Add planet
      </button>
    </div>
  );
}
