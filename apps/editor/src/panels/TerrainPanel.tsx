import { defaultEditorConfig, type EditorConfig } from "../types.ts";
import { ColorSwatch } from "./ui/ColorSwatch.tsx";
import { Section } from "./ui/Section.tsx";
import { Slider } from "./ui/Slider.tsx";

interface TerrainPanelProps {
  config: EditorConfig;
  onTerrainChange: (t: EditorConfig["terrain"]) => void;
  onColorsChange: (c: EditorConfig["colors"]) => void;
}

export function TerrainPanel({ config, onTerrainChange, onColorsChange }: TerrainPanelProps) {
  const t = config.terrain;
  const c = config.colors;

  function setT<K extends keyof EditorConfig["terrain"]>(key: K, val: EditorConfig["terrain"][K]) {
    onTerrainChange({ ...t, [key]: val });
  }

  function setC<K extends keyof EditorConfig["colors"]>(key: K, val: EditorConfig["colors"][K]) {
    onColorsChange({ ...c, [key]: val });
  }

  function resetShape() {
    const d = defaultEditorConfig().terrain;
    onTerrainChange({
      ...t,
      seed: d.seed,
      baseAmplitude: d.baseAmplitude,
      frequency: d.frequency,
      octaves: d.octaves,
      lacunarity: d.lacunarity,
      persistence: d.persistence,
      heightSmoothingStrength: d.heightSmoothingStrength,
      heightSmoothingSampleAngle: d.heightSmoothingSampleAngle,
      icosahedronDetail: d.icosahedronDetail,
    });
  }

  function resetBiomes() {
    const d = defaultEditorConfig().terrain;
    onTerrainChange({
      ...t,
      waterLevel: d.waterLevel,
      sandBand: d.sandBand,
      rockLevel: d.rockLevel,
      snowLevel: d.snowLevel,
    });
  }

  function resetColors() {
    onColorsChange(defaultEditorConfig().colors);
  }

  return (
    <div className="space-y-4">
      <Section title="Shape" onReset={resetShape}>
        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400">Seed</label>
          <input
            type="number"
            value={t.seed}
            onChange={(e) => setT("seed", parseInt(e.target.value) || 0)}
            className="w-24 px-2 py-0.5 text-xs font-mono bg-zinc-800 text-zinc-200 border border-zinc-700 rounded focus:outline-none focus:border-cyan-500"
          />
        </div>
        <Slider
          label="Amplitude"
          value={t.baseAmplitude}
          min={5}
          max={100}
          step={0.5}
          decimals={1}
          onChange={(v) => setT("baseAmplitude", v)}
        />
        <Slider
          label="Frequency"
          value={t.frequency}
          min={0.3}
          max={5}
          step={0.05}
          onChange={(v) => setT("frequency", v)}
        />
        <Slider
          label="Octaves"
          value={t.octaves}
          min={1}
          max={8}
          step={1}
          decimals={0}
          onChange={(v) => setT("octaves", v)}
        />
        <Slider
          label="Lacunarity"
          value={t.lacunarity}
          min={1}
          max={4}
          step={0.05}
          onChange={(v) => setT("lacunarity", v)}
        />
        <Slider
          label="Persistence"
          value={t.persistence}
          min={0.1}
          max={0.9}
          step={0.01}
          onChange={(v) => setT("persistence", v)}
        />
        <Slider
          label="Smoothing"
          value={t.heightSmoothingStrength}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setT("heightSmoothingStrength", v)}
        />
        <Slider
          label="Mesh Detail"
          value={t.icosahedronDetail}
          min={10}
          max={60}
          step={5}
          decimals={0}
          onChange={(v) => setT("icosahedronDetail", v)}
        />
      </Section>

      <Section title="Biomes" onReset={resetBiomes}>
        <Slider
          label="Water Level"
          value={t.waterLevel}
          min={-15}
          max={5}
          step={0.1}
          onChange={(v) => setT("waterLevel", v)}
        />
        <Slider
          label="Sand Band"
          value={t.sandBand}
          min={0.2}
          max={8}
          step={0.1}
          onChange={(v) => setT("sandBand", v)}
        />
        <Slider
          label="Rock Level"
          value={t.rockLevel}
          min={1}
          max={20}
          step={0.2}
          onChange={(v) => setT("rockLevel", v)}
        />
        <Slider
          label="Snow Level"
          value={t.snowLevel}
          min={3}
          max={30}
          step={0.2}
          onChange={(v) => setT("snowLevel", v)}
        />
      </Section>

      <Section title="Colors" onReset={resetColors}>
        <ColorSwatch label="Sand" value={c.sand} onChange={(v) => setC("sand", v)} />
        <ColorSwatch label="Grass" value={c.grass} onChange={(v) => setC("grass", v)} />
        <ColorSwatch label="Rock" value={c.rock} onChange={(v) => setC("rock", v)} />
        <ColorSwatch label="Snow" value={c.snow} onChange={(v) => setC("snow", v)} />
        <ColorSwatch
          label="Deep Water"
          value={c.waterDeep}
          onChange={(v) => setC("waterDeep", v)}
        />
      </Section>
    </div>
  );
}
