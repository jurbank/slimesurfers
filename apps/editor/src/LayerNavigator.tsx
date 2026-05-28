import { useEffect, useState } from "react";
import type { EditorConfig } from "./types.ts";

export type LayerSelection =
  | { kind: "global"; panel: "cel" | "spawns" }
  | {
      kind: "planet";
      planetId: string;
      panel: "planet" | "terrain" | "props" | "rails" | "blastPads" | "atmosphere" | "lighting";
    };

export function getLayerTitle(layer: LayerSelection): string {
  if (layer.kind === "global") {
    return layer.panel === "cel" ? "Cel Shading" : "Spawns";
  }
  if (layer.panel === "planet") return "Planet";
  if (layer.panel === "atmosphere") return "Atmosphere";
  if (layer.panel === "rails") return "Rails";
  if (layer.panel === "blastPads") return "Blast Pads";
  return layer.panel[0].toUpperCase() + layer.panel.slice(1);
}

export function isLayerSelected(current: LayerSelection, target: LayerSelection): boolean {
  if (current.kind !== target.kind) return false;
  if (current.kind === "global" && target.kind === "global") return current.panel === target.panel;
  if (current.kind === "planet" && target.kind === "planet") {
    return current.planetId === target.planetId && current.panel === target.panel;
  }
  return false;
}

export function LayerNavigator({
  config,
  selectedLayer,
  activePlanetId,
  onSelectLayer,
  onAddPlanet,
}: {
  config: EditorConfig;
  selectedLayer: LayerSelection;
  activePlanetId: string;
  onSelectLayer: (layer: LayerSelection) => void;
  onAddPlanet: () => void;
}) {
  const [expandedPlanets, setExpandedPlanets] = useState<Set<string>>(
    () => new Set([config.planets[0]?.id ?? "planet-0"]),
  );
  const [expandedAtmospheres, setExpandedAtmospheres] = useState<Set<string>>(
    () => new Set([config.planets[0]?.id ?? "planet-0"]),
  );

  useEffect(() => {
    if (selectedLayer.kind !== "planet") return;
    setExpandedPlanets((current) => {
      if (current.has(selectedLayer.planetId)) return current;
      return new Set(current).add(selectedLayer.planetId);
    });
    if (selectedLayer.panel === "atmosphere" || selectedLayer.panel === "lighting") {
      setExpandedAtmospheres((current) => {
        if (current.has(selectedLayer.planetId)) return current;
        return new Set(current).add(selectedLayer.planetId);
      });
    }
  }, [selectedLayer]);

  function togglePlanet(planetId: string) {
    setExpandedPlanets((current) => toggleSetValue(current, planetId));
  }

  function toggleAtmosphere(planetId: string) {
    setExpandedAtmospheres((current) => toggleSetValue(current, planetId));
  }

  return (
    <nav className="flex-1 p-2 overflow-y-auto">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        Map
      </div>
      <div className="space-y-0.5">
        <LayerButton
          label="Solar System"
          active={false}
          depth={0}
          onClick={() => onSelectLayer({ kind: "global", panel: "cel" })}
        />
        <LayerButton
          label="Cel Shading"
          active={isLayerSelected(selectedLayer, { kind: "global", panel: "cel" })}
          depth={1}
          onClick={() => onSelectLayer({ kind: "global", panel: "cel" })}
        />
        <LayerButton
          label="Spawns"
          active={isLayerSelected(selectedLayer, { kind: "global", panel: "spawns" })}
          depth={1}
          onClick={() => onSelectLayer({ kind: "global", panel: "spawns" })}
        />
      </div>

      <div className="mt-3 space-y-2">
        {config.planets.map((planet, index) => (
          <div key={planet.id} className="space-y-0.5">
            <LayerGroupButton
              label={`${planet.id}${index === 0 ? " (default)" : ""}`}
              active={
                expandedPlanets.has(planet.id) ||
                isLayerSelected(selectedLayer, {
                  kind: "planet",
                  planetId: planet.id,
                  panel: "planet",
                })
              }
              depth={0}
              accent={planet.id === activePlanetId}
              open={expandedPlanets.has(planet.id)}
              onToggle={() => togglePlanet(planet.id)}
            />
            {expandedPlanets.has(planet.id) && (
              <>
                <LayerButton
                  label="Terrain"
                  active={isLayerSelected(selectedLayer, {
                    kind: "planet",
                    planetId: planet.id,
                    panel: "terrain",
                  })}
                  depth={1}
                  onClick={() =>
                    onSelectLayer({ kind: "planet", planetId: planet.id, panel: "terrain" })
                  }
                />
                <LayerButton
                  label="Props"
                  active={isLayerSelected(selectedLayer, {
                    kind: "planet",
                    planetId: planet.id,
                    panel: "props",
                  })}
                  depth={1}
                  onClick={() =>
                    onSelectLayer({ kind: "planet", planetId: planet.id, panel: "props" })
                  }
                />
                <LayerButton
                  label="Rails"
                  active={isLayerSelected(selectedLayer, {
                    kind: "planet",
                    planetId: planet.id,
                    panel: "rails",
                  })}
                  depth={1}
                  onClick={() =>
                    onSelectLayer({ kind: "planet", planetId: planet.id, panel: "rails" })
                  }
                />
                <LayerButton
                  label="Blast Pads"
                  active={isLayerSelected(selectedLayer, {
                    kind: "planet",
                    planetId: planet.id,
                    panel: "blastPads",
                  })}
                  depth={1}
                  onClick={() =>
                    onSelectLayer({ kind: "planet", planetId: planet.id, panel: "blastPads" })
                  }
                />
                <LayerGroupButton
                  label="Atmosphere"
                  active={
                    expandedAtmospheres.has(planet.id) ||
                    isLayerSelected(selectedLayer, {
                      kind: "planet",
                      planetId: planet.id,
                      panel: "atmosphere",
                    })
                  }
                  depth={1}
                  open={expandedAtmospheres.has(planet.id)}
                  onToggle={() => toggleAtmosphere(planet.id)}
                />
                {expandedAtmospheres.has(planet.id) && (
                  <>
                    <LayerButton
                      label="Atmosphere Shader"
                      active={isLayerSelected(selectedLayer, {
                        kind: "planet",
                        planetId: planet.id,
                        panel: "atmosphere",
                      })}
                      depth={2}
                      onClick={() =>
                        onSelectLayer({
                          kind: "planet",
                          planetId: planet.id,
                          panel: "atmosphere",
                        })
                      }
                    />
                    <LayerButton
                      label="Lighting"
                      active={isLayerSelected(selectedLayer, {
                        kind: "planet",
                        planetId: planet.id,
                        panel: "lighting",
                      })}
                      depth={2}
                      onClick={() =>
                        onSelectLayer({ kind: "planet", planetId: planet.id, panel: "lighting" })
                      }
                    />
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={onAddPlanet}
        className="mt-3 w-full px-3 py-2 rounded border border-zinc-700 bg-zinc-800 text-left text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
      >
        + Planet
      </button>
    </nav>
  );
}

function toggleSetValue(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function LayerGroupButton({
  label,
  active,
  depth,
  open,
  accent = false,
  onToggle,
}: {
  label: string;
  active: boolean;
  depth: 0 | 1 | 2;
  open: boolean;
  accent?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex w-full items-center rounded transition-colors ${
        active
          ? "bg-cyan-900/45 text-cyan-200"
          : accent
            ? "text-cyan-400 hover:bg-zinc-800"
            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      }`}
      title={open ? "Collapse" : "Expand"}
    >
      <span
        className={`py-1.5 text-zinc-500 transition-colors ${
          depth === 0 ? "pl-2" : depth === 1 ? "pl-5" : "pl-8"
        }`}
      >
        <span
          className={`inline-block transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </span>
      <span className="min-w-0 flex-1 py-1.5 pr-2 text-left text-xs">{label}</span>
    </button>
  );
}

function LayerButton({
  label,
  active,
  depth,
  accent = false,
  onClick,
}: {
  label: string;
  active: boolean;
  depth: 0 | 1 | 2;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left py-1.5 rounded text-xs transition-colors ${
        depth === 0 ? "pl-2 pr-2" : depth === 1 ? "pl-5 pr-2" : "pl-8 pr-2"
      } ${
        active
          ? "bg-cyan-900/45 text-cyan-200"
          : accent
            ? "text-cyan-400 hover:bg-zinc-800"
            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}
