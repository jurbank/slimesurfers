import { defaultEditorPlanet, type EditorConfig, type EditorPlanet } from "../types.ts";
import { Section } from "./ui/Section.tsx";
import { Slider } from "./ui/Slider.tsx";

interface PlanetPanelProps {
  config: EditorConfig;
  activePlanetId: string;
  onPlanetsChange: (planets: EditorPlanet[]) => void;
  onActivePlanetChange: (id: string) => void;
  onResetActivePlanet: () => void;
  showPlanetList?: boolean;
}

function nextPlanetId(planets: EditorPlanet[]): string {
  const ids = new Set(planets.map((p) => p.id));
  for (let i = 0; ; i++) {
    const candidate = `planet-${i}`;
    if (!ids.has(candidate)) return candidate;
  }
}

export function PlanetPanel({
  config,
  activePlanetId,
  onPlanetsChange,
  onActivePlanetChange,
  onResetActivePlanet,
  showPlanetList = true,
}: PlanetPanelProps) {
  const planets = config.planets;
  const activePlanet = planets.find((p) => p.id === activePlanetId) ?? planets[0]!;
  const activeIndex = planets.findIndex((p) => p.id === activePlanetId);

  function updateActivePlanet(patch: Partial<EditorPlanet>) {
    onPlanetsChange(planets.map((p) => (p.id === activePlanetId ? { ...p, ...patch } : p)));
  }

  function updateCenter(axis: "x" | "y" | "z", value: number) {
    updateActivePlanet({ center: { ...activePlanet.center, [axis]: value } });
  }

  function addPlanet() {
    const id = nextPlanetId(planets);
    const base = defaultEditorPlanet(id, { x: 400, y: 0, z: 0 });
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const nextPlanet = {
      ...base,
      terrain: { ...base.terrain, seed },
      props: { ...base.props, seed },
    };
    onPlanetsChange([...planets, nextPlanet]);
    onActivePlanetChange(id);
  }

  function removeActivePlanet() {
    if (planets.length <= 1) return;
    onPlanetsChange(planets.filter((p) => p.id !== activePlanetId));
  }

  return (
    <div className="space-y-4">
      {showPlanetList && (
        <div className="space-y-1">
          {planets.map((planet, index) => (
            <button
              key={planet.id}
              onClick={() => onActivePlanetChange(planet.id)}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                planet.id === activePlanetId
                  ? "bg-cyan-900/40 border border-cyan-600 text-cyan-300"
                  : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
              }`}
            >
              {planet.id}
              {index === 0 ? " (main)" : ""}
            </button>
          ))}
          <button
            onClick={addPlanet}
            className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            + Add planet
          </button>
        </div>
      )}

      <Section title={`Edit: ${activePlanet.id}`} defaultOpen>
        <Slider
          label="Radius"
          value={activePlanet.radius}
          min={20}
          max={300}
          step={1}
          decimals={0}
          onChange={(v) => updateActivePlanet({ radius: v })}
        />
        <Slider
          label="Center X"
          value={activePlanet.center.x}
          min={-2000}
          max={2000}
          step={1}
          decimals={0}
          onChange={(v) => updateCenter("x", v)}
        />
        <Slider
          label="Center Y"
          value={activePlanet.center.y}
          min={-2000}
          max={2000}
          step={1}
          decimals={0}
          onChange={(v) => updateCenter("y", v)}
        />
        <Slider
          label="Center Z"
          value={activePlanet.center.z}
          min={-2000}
          max={2000}
          step={1}
          decimals={0}
          onChange={(v) => updateCenter("z", v)}
        />
        {activeIndex > 0 && (
          <button
            onClick={removeActivePlanet}
            className="mt-1 w-full px-2 py-1 bg-zinc-800 hover:bg-red-900/60 border border-zinc-700 hover:border-red-700 rounded text-xs text-zinc-400 hover:text-red-300 transition-colors"
          >
            Remove planet
          </button>
        )}
        <button
          onClick={onResetActivePlanet}
          className="mt-1 w-full px-2 py-1 bg-zinc-800 hover:bg-amber-900/50 border border-zinc-700 hover:border-amber-700 rounded text-xs text-zinc-400 hover:text-amber-200 transition-colors"
        >
          Reset planet
        </button>
      </Section>
    </div>
  );
}
