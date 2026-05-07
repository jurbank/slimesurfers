import {
  defaultEditorPlanet,
  defaultEditorConfig,
  type EditorConfig,
  type EditorPlanet,
  type ShaderBlendMode,
} from "../types.ts";
import { ColorSwatch } from "./ui/ColorSwatch.tsx";
import { Section } from "./ui/Section.tsx";
import { Slider } from "./ui/Slider.tsx";

interface ShadersPanelProps {
  planet: EditorPlanet;
  shaders: EditorConfig["shaders"];
  onPlanetChange: (p: EditorPlanet) => void;
  onShadersChange: (s: EditorConfig["shaders"]) => void;
  mode?: "all" | "cel" | "atmosphere" | "lighting";
}

const BLEND_MODES: { value: ShaderBlendMode; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "additive", label: "Additive" },
  { value: "multiply", label: "Multiply" },
];

export function ShadersPanel({
  planet,
  shaders,
  onPlanetChange,
  onShadersChange,
  mode = "all",
}: ShadersPanelProps) {
  const { cel } = shaders;
  const { atmosphere, lighting } = planet;

  function setCel<K extends keyof EditorConfig["shaders"]["cel"]>(
    key: K,
    val: EditorConfig["shaders"]["cel"][K],
  ) {
    onShadersChange({ ...shaders, cel: { ...cel, [key]: val } });
  }

  function setAtmo<K extends keyof EditorPlanet["atmosphere"]>(
    key: K,
    val: EditorPlanet["atmosphere"][K],
  ) {
    onPlanetChange({ ...planet, atmosphere: { ...atmosphere, [key]: val } });
  }

  function setCloud<K extends keyof EditorPlanet["atmosphere"]["clouds"]>(
    key: K,
    val: EditorPlanet["atmosphere"]["clouds"][K],
  ) {
    onPlanetChange({
      ...planet,
      atmosphere: {
        ...atmosphere,
        clouds: { ...atmosphere.clouds, [key]: val },
      },
    });
  }

  function setPuff<K extends keyof EditorPlanet["atmosphere"]["clouds"]["puffs"]>(
    key: K,
    val: EditorPlanet["atmosphere"]["clouds"]["puffs"][K],
  ) {
    onPlanetChange({
      ...planet,
      atmosphere: {
        ...atmosphere,
        clouds: {
          ...atmosphere.clouds,
          puffs: { ...atmosphere.clouds.puffs, [key]: val },
        },
      },
    });
  }

  function setLighting<K extends keyof EditorPlanet["lighting"]>(
    key: K,
    val: EditorPlanet["lighting"][K],
  ) {
    onPlanetChange({ ...planet, lighting: { ...lighting, [key]: val } });
  }

  function resetLighting() {
    onPlanetChange({ ...planet, lighting: defaultEditorPlanet("_").lighting });
  }

  function resetCel() {
    onShadersChange({ ...shaders, cel: defaultEditorConfig().shaders.cel });
  }

  function resetAtmosphere() {
    onPlanetChange({ ...planet, atmosphere: defaultEditorPlanet("_").atmosphere });
  }

  function renderShaderToggle(checked: boolean, onChange: (checked: boolean) => void) {
    return (
      <input
        type="checkbox"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 accent-cyan-400"
      />
    );
  }

  function renderBlendMode(value: ShaderBlendMode, onChange: (value: ShaderBlendMode) => void) {
    return (
      <label className="flex items-center justify-between gap-3 text-xs text-zinc-400">
        <span>Blend</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as ShaderBlendMode)}
          className="w-28 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-cyan-500"
        >
          {BLEND_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="space-y-4">
      {(mode === "all" || mode === "lighting") && (
        <Section title="Lighting" onReset={resetLighting}>
          <Slider
            label="Sun Azimuth"
            value={lighting.sunAzimuth}
            min={0}
            max={360}
            step={1}
            decimals={0}
            onChange={(v) => setLighting("sunAzimuth", v)}
          />
          <Slider
            label="Sun Elevation"
            value={lighting.sunElevation}
            min={0}
            max={90}
            step={1}
            decimals={0}
            onChange={(v) => setLighting("sunElevation", v)}
          />
          <Slider
            label="Sun Intensity"
            value={lighting.sunIntensity}
            min={0}
            max={3}
            step={0.05}
            onChange={(v) => setLighting("sunIntensity", v)}
          />
          <Slider
            label="Ambient"
            value={lighting.ambientIntensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setLighting("ambientIntensity", v)}
          />
          <ColorSwatch
            label="Rim Color"
            value={lighting.rimColor}
            onChange={(v) => setLighting("rimColor", v)}
          />
          <Slider
            label="Rim Strength"
            value={lighting.rimStrength}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => setLighting("rimStrength", v)}
          />
          <Slider
            label="Rim Power"
            value={lighting.rimPower}
            min={1}
            max={10}
            step={0.1}
            decimals={1}
            onChange={(v) => setLighting("rimPower", v)}
          />
        </Section>
      )}

      {(mode === "all" || mode === "cel") && (
        <Section
          title="Cel Shading"
          headerControl={renderShaderToggle(cel.enabled, (checked) => setCel("enabled", checked))}
          onReset={resetCel}
        >
          <Slider
            label="Bands"
            value={cel.bands}
            min={1}
            max={8}
            step={0.5}
            decimals={1}
            onChange={(v) => setCel("bands", v)}
          />
          <Slider
            label="Band Softness"
            value={cel.softness}
            min={0}
            max={0.15}
            step={0.005}
            decimals={3}
            onChange={(v) => setCel("softness", v)}
          />
          <Slider
            label="Hatch Strength"
            value={cel.hatchStrength}
            min={0}
            max={0.5}
            step={0.01}
            onChange={(v) => setCel("hatchStrength", v)}
          />
          <Slider
            label="Hatch Scale"
            value={cel.hatchScale}
            min={1}
            max={12}
            step={0.5}
            decimals={1}
            onChange={(v) => setCel("hatchScale", v)}
          />
        </Section>
      )}

      {(mode === "all" || mode === "atmosphere") && (
        <Section
          title="Atmosphere Shader"
          headerControl={renderShaderToggle(atmosphere.enabled, (checked) =>
            setAtmo("enabled", checked),
          )}
          onReset={resetAtmosphere}
        >
          <ColorSwatch
            label="Color"
            value={atmosphere.color}
            onChange={(v) => setAtmo("color", v)}
          />
          {renderBlendMode(atmosphere.blendMode, (value) => setAtmo("blendMode", value))}
          <Slider
            label="Height"
            value={atmosphere.height}
            min={2}
            max={40}
            step={0.5}
            decimals={1}
            onChange={(v) => setAtmo("height", v)}
          />
          <Slider
            label="Intensity"
            value={atmosphere.intensity}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => setAtmo("intensity", v)}
          />
          <Slider
            label="Opacity"
            value={atmosphere.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setAtmo("opacity", v)}
          />
          <Slider
            label="Fresnel Power"
            value={atmosphere.fresnelPower}
            min={0.5}
            max={8}
            step={0.1}
            decimals={1}
            onChange={(v) => setAtmo("fresnelPower", v)}
          />
          <Slider
            label="Falloff"
            value={atmosphere.falloffPower}
            min={0.5}
            max={4}
            step={0.1}
            decimals={1}
            onChange={(v) => setAtmo("falloffPower", v)}
          />
          <Section
            title="Wispy Clouds"
            defaultOpen={false}
            headerControl={renderShaderToggle(atmosphere.clouds.enabled, (checked) =>
              setCloud("enabled", checked),
            )}
          >
            <ColorSwatch
              label="Color"
              value={atmosphere.clouds.color}
              onChange={(v) => setCloud("color", v)}
            />
            {renderBlendMode(atmosphere.clouds.blendMode, (value) => setCloud("blendMode", value))}
            <Slider
              label="Height"
              value={atmosphere.clouds.height}
              min={16}
              max={90}
              step={0.5}
              decimals={1}
              onChange={(v) => setCloud("height", v)}
            />
            <Slider
              label="Thickness"
              value={atmosphere.clouds.thickness}
              min={0.5}
              max={16}
              step={0.5}
              decimals={1}
              onChange={(v) => setCloud("thickness", v)}
            />
            <Slider
              label="Density"
              value={atmosphere.clouds.density}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setCloud("density", v)}
            />
            <Slider
              label="Opacity"
              value={atmosphere.clouds.opacity}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setCloud("opacity", v)}
            />
            <Slider
              label="Volume"
              value={atmosphere.clouds.coverageScale}
              min={1}
              max={9}
              step={0.1}
              decimals={1}
              onChange={(v) => setCloud("coverageScale", v)}
            />
            <Slider
              label="Movement"
              value={atmosphere.clouds.movementSpeed}
              min={0}
              max={0.6}
              step={0.01}
              onChange={(v) => setCloud("movementSpeed", v)}
            />
          </Section>
          <Section
            title="Puffy Clouds"
            defaultOpen={false}
            headerControl={renderShaderToggle(atmosphere.clouds.puffs.enabled, (checked) =>
              setPuff("enabled", checked),
            )}
          >
            <ColorSwatch
              label="Color"
              value={atmosphere.clouds.puffs.color}
              onChange={(v) => setPuff("color", v)}
            />
            {renderBlendMode(atmosphere.clouds.puffs.blendMode, (value) =>
              setPuff("blendMode", value),
            )}
            <Slider
              label="Height"
              value={atmosphere.clouds.puffs.height}
              min={0}
              max={60}
              step={0.5}
              decimals={1}
              onChange={(v) => setPuff("height", v)}
            />
            <Slider
              label="Thickness"
              value={atmosphere.clouds.puffs.thickness}
              min={1}
              max={20}
              step={0.5}
              decimals={1}
              onChange={(v) => setPuff("thickness", v)}
            />
            <Slider
              label="Density"
              value={atmosphere.clouds.puffs.density}
              min={0}
              max={20}
              step={0.5}
              decimals={1}
              onChange={(v) => setPuff("density", v)}
            />
            <Slider
              label="Size"
              value={atmosphere.clouds.puffs.size}
              min={8}
              max={40}
              step={0.5}
              decimals={1}
              onChange={(v) => setPuff("size", v)}
            />
            <Slider
              label="Opacity"
              value={atmosphere.clouds.puffs.opacity}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setPuff("opacity", v)}
            />
            <Slider
              label="Ground Shadows"
              value={atmosphere.clouds.puffs.shadowStrength}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setPuff("shadowStrength", v)}
            />
            <Slider
              label="Movement"
              value={atmosphere.clouds.puffs.movementSpeed}
              min={0}
              max={0.6}
              step={0.01}
              onChange={(v) => setPuff("movementSpeed", v)}
            />
          </Section>
        </Section>
      )}
    </div>
  );
}
