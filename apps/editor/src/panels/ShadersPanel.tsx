import { defaultEditorConfig, type EditorConfig } from "../types.ts";
import { ColorSwatch } from "./ui/ColorSwatch.tsx";
import { Section } from "./ui/Section.tsx";
import { Slider } from "./ui/Slider.tsx";

interface ShadersPanelProps {
  config: EditorConfig;
  onShadersChange: (s: EditorConfig["shaders"]) => void;
}

export function ShadersPanel({ config, onShadersChange }: ShadersPanelProps) {
  const { cel, atmosphere, lighting } = config.shaders;

  function setCel<K extends keyof EditorConfig["shaders"]["cel"]>(
    key: K,
    val: EditorConfig["shaders"]["cel"][K],
  ) {
    onShadersChange({ ...config.shaders, cel: { ...cel, [key]: val } });
  }

  function setAtmo<K extends keyof EditorConfig["shaders"]["atmosphere"]>(
    key: K,
    val: EditorConfig["shaders"]["atmosphere"][K],
  ) {
    onShadersChange({ ...config.shaders, atmosphere: { ...atmosphere, [key]: val } });
  }

  function setLighting<K extends keyof EditorConfig["shaders"]["lighting"]>(
    key: K,
    val: EditorConfig["shaders"]["lighting"][K],
  ) {
    onShadersChange({ ...config.shaders, lighting: { ...lighting, [key]: val } });
  }

  function resetLighting() {
    onShadersChange({ ...config.shaders, lighting: defaultEditorConfig().shaders.lighting });
  }

  function resetCel() {
    onShadersChange({ ...config.shaders, cel: defaultEditorConfig().shaders.cel });
  }

  function resetAtmosphere() {
    onShadersChange({ ...config.shaders, atmosphere: defaultEditorConfig().shaders.atmosphere });
  }

  return (
    <div className="space-y-4">
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

      <Section title="Cel Shading" onReset={resetCel}>
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

      <Section title="Atmosphere" onReset={resetAtmosphere}>
        <ColorSwatch label="Color" value={atmosphere.color} onChange={(v) => setAtmo("color", v)} />
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
      </Section>
    </div>
  );
}
