import { useEffect, useMemo, useRef, useState } from "react";
import { defaultEditorBlastPad, type EditorBlastPad, type EditorConfig } from "../types.ts";
import type { BlastPadEditMode, BlastPadToolState } from "../tools/blastPads/BlastPadTypes.ts";
import { Section } from "./ui/Section.tsx";
import { Slider } from "./ui/Slider.tsx";

const EDIT_MODES: { id: BlastPadEditMode; label: string }[] = [
  { id: "place", label: "Place" },
  { id: "move", label: "Move" },
  { id: "delete", label: "Delete" },
];

interface BlastPadsPanelProps {
  config: EditorConfig;
  planetId: string;
  selectedPadId: string | null;
  pickTargetForPadId: string | null;
  onPadsChange: (pads: EditorBlastPad[]) => void;
  onSelectionChange: (padId: string | null) => void;
  onToolChange: (state: BlastPadToolState) => void;
  onPickTargetForPadId: (padId: string | null) => void;
}

export function BlastPadsPanel({
  config,
  planetId,
  selectedPadId,
  pickTargetForPadId,
  onPadsChange,
  onSelectionChange,
  onToolChange,
  onPickTargetForPadId,
}: BlastPadsPanelProps) {
  const [mode, setMode] = useState<BlastPadEditMode | null>("place");
  const padsOnPlanet = useMemo(
    () => config.blastPads.filter((pad) => pad.planetId === planetId),
    [config.blastPads, planetId],
  );
  const selectedPad =
    config.blastPads.find((p) => p.id === selectedPadId && p.planetId === planetId) ?? null;
  const otherPlanets = useMemo(
    () => config.planets.filter((p) => p.id !== planetId),
    [config.planets, planetId],
  );
  const canAdd = otherPlanets.length > 0;
  const toolChangeRef = useRef(onToolChange);
  toolChangeRef.current = onToolChange;

  useEffect(() => {
    toolChangeRef.current({
      mode,
      sourcePlanetId: planetId,
      pads: config.blastPads,
      selectedPadId,
      pickTargetForPadId,
    });
  }, [config.blastPads, mode, pickTargetForPadId, planetId, selectedPadId]);

  // When the panel unmounts (layer switch / planet change), clear the tool.
  useEffect(() => {
    return () => {
      toolChangeRef.current({
        mode: null,
        sourcePlanetId: planetId,
        pads: [],
        selectedPadId: null,
        pickTargetForPadId: null,
      });
    };
  }, [planetId]);

  function commitPad(nextPad: EditorBlastPad) {
    onPadsChange(config.blastPads.map((p) => (p.id === nextPad.id ? nextPad : p)));
  }

  function addPad() {
    if (!canAdd) return;
    const targetId = otherPlanets[0]!.id;
    const source = config.planets.find((p) => p.id === planetId);
    const target = config.planets.find((p) => p.id === targetId);
    if (!source || !target) return;
    const id = nextPadId(new Set(config.blastPads.map((p) => p.id)));
    const base = defaultEditorBlastPad(id, planetId, targetId);
    // Mirror the canvas Place flow: derive tangent + landing normal from the
    // source/target geometry so a freshly-created pad never ships with the
    // placeholder [0, 1, 0] landing pointing at the destination's north pole.
    const newPad: EditorBlastPad = {
      ...base,
      tangent: tangentTowardTarget(source, base.normal, target),
      targetNormal: landingNormalFromSource(source, base.normal, target),
    };
    onPadsChange([...config.blastPads, newPad]);
    onSelectionChange(newPad.id);
    setMode("move");
  }

  function deletePad(padId: string) {
    onPadsChange(config.blastPads.filter((p) => p.id !== padId));
    if (selectedPadId === padId) onSelectionChange(null);
  }

  function selectTarget(nextTargetId: string) {
    if (!selectedPad || selectedPad.targetPlanetId === nextTargetId) return;
    const target = config.planets.find((p) => p.id === nextTargetId);
    const source = config.planets.find((p) => p.id === selectedPad.planetId);
    if (!target || !source) return;
    const newTargetNormal = landingNormalFromSource(source, selectedPad.normal, target);
    commitPad({
      ...selectedPad,
      targetPlanetId: nextTargetId,
      targetNormal: newTargetNormal,
    });
  }

  function aimTangentAtTarget() {
    if (!selectedPad) return;
    const source = config.planets.find((p) => p.id === selectedPad.planetId);
    const target = config.planets.find((p) => p.id === selectedPad.targetPlanetId);
    if (!source || !target) return;
    const tangent = tangentTowardTarget(source, selectedPad.normal, target);
    commitPad({ ...selectedPad, tangent });
  }

  function setHeadingDeg(headingDeg: number) {
    if (!selectedPad) return;
    const tangent = tangentFromHeading(selectedPad.normal, headingDeg);
    commitPad({ ...selectedPad, tangent });
  }

  const headingDeg = selectedPad ? headingFromTangent(selectedPad.normal, selectedPad.tangent) : 0;

  return (
    <div className="space-y-4">
      <Section title="Blast Pads">
        {!canAdd && (
          <p className="text-xs text-amber-400">
            Add a second planet before placing pads — pads require a destination.
          </p>
        )}
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={addPad}
            disabled={!canAdd}
            className="py-1.5 text-xs rounded bg-cyan-500 text-black font-semibold hover:bg-cyan-400 disabled:opacity-40 disabled:hover:bg-cyan-500 transition-colors"
          >
            + New Pad
          </button>
          <button
            onClick={() => selectedPad && deletePad(selectedPad.id)}
            disabled={!selectedPad}
            className="py-1.5 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
          >
            Delete Selected
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1 pt-1">
          {EDIT_MODES.map((option) => (
            <button
              key={option.id}
              onClick={() => setMode((current) => (current === option.id ? null : option.id))}
              className={`py-1.5 text-xs rounded font-semibold transition-colors ${
                mode === option.id
                  ? "bg-cyan-500 text-black"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500 pt-1">
          {mode === "place"
            ? "Click the source planet to place a pad."
            : mode === "move"
              ? "Drag the orange marker to slide the pad."
              : mode === "delete"
                ? "Click a marker to remove that pad."
                : "Pick a tool above."}
        </p>
      </Section>

      <Section title={`Pads on ${planetId}`}>
        {padsOnPlanet.length === 0 ? (
          <p className="text-xs text-zinc-500">No pads on this planet yet.</p>
        ) : (
          <div className="space-y-1">
            {padsOnPlanet.map((pad) => (
              <button
                key={pad.id}
                onClick={() => onSelectionChange(pad.id)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${
                  selectedPadId === pad.id
                    ? "bg-cyan-500 text-black font-semibold"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                <span>{pad.id}</span>
                <span className="font-mono">→ {pad.targetPlanetId}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      {selectedPad && (
        <>
          <Section title="Destination">
            <label className="block text-xs text-zinc-400">Target Planet</label>
            <select
              value={selectedPad.targetPlanetId}
              onChange={(e) => selectTarget(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-cyan-500"
            >
              {otherPlanets.map((planet) => (
                <option key={planet.id} value={planet.id}>
                  {planet.id}
                </option>
              ))}
            </select>
            <button
              onClick={() =>
                onPickTargetForPadId(pickTargetForPadId === selectedPad.id ? null : selectedPad.id)
              }
              className={`w-full py-1.5 text-xs rounded font-semibold transition-colors ${
                pickTargetForPadId === selectedPad.id
                  ? "bg-amber-400 text-black hover:bg-amber-300"
                  : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
              }`}
            >
              {pickTargetForPadId === selectedPad.id
                ? "Click a destination planet…"
                : "Set Landing on Target"}
            </button>
            <div className="grid grid-cols-3 gap-1 text-xs font-mono text-zinc-400">
              <div className="rounded bg-zinc-800 px-1.5 py-1 text-center">
                {selectedPad.targetNormal[0].toFixed(2)}
              </div>
              <div className="rounded bg-zinc-800 px-1.5 py-1 text-center">
                {selectedPad.targetNormal[1].toFixed(2)}
              </div>
              <div className="rounded bg-zinc-800 px-1.5 py-1 text-center">
                {selectedPad.targetNormal[2].toFixed(2)}
              </div>
            </div>
          </Section>

          <Section title="Aim">
            <Slider
              label="Heading"
              value={headingDeg}
              min={0}
              max={360}
              step={1}
              decimals={0}
              onChange={setHeadingDeg}
            />
            <button
              onClick={aimTangentAtTarget}
              className="w-full py-1.5 text-xs rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
            >
              Aim at Target
            </button>
          </Section>

          <Section title="Launch Tuning">
            <Slider
              label="Pad Radius"
              value={selectedPad.radius}
              min={2}
              max={15}
              step={0.5}
              decimals={1}
              onChange={(radius) => commitPad({ ...selectedPad, radius })}
            />
            <Slider
              label="Launch Speed"
              value={selectedPad.launchSpeed}
              min={40}
              max={140}
              step={1}
              decimals={0}
              onChange={(launchSpeed) => commitPad({ ...selectedPad, launchSpeed })}
            />
            <Slider
              label="Upward Bias"
              value={selectedPad.upwardBias}
              min={-0.5}
              max={1.5}
              step={0.05}
              decimals={2}
              onChange={(upwardBias) => commitPad({ ...selectedPad, upwardBias })}
            />
          </Section>
        </>
      )}
    </div>
  );
}

function nextPadId(existing: ReadonlySet<string>): string {
  for (let i = 1; ; i++) {
    const candidate = `blast-pad-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
}

function tangentTowardTarget(
  source: { center: { x: number; y: number; z: number }; radius: number },
  normal: [number, number, number],
  target: { center: { x: number; y: number; z: number } },
): [number, number, number] {
  const nx = normal[0];
  const ny = normal[1];
  const nz = normal[2];
  const padX = source.center.x + nx * source.radius;
  const padY = source.center.y + ny * source.radius;
  const padZ = source.center.z + nz * source.radius;
  let dx = target.center.x - padX;
  let dy = target.center.y - padY;
  let dz = target.center.z - padZ;
  const dot = dx * nx + dy * ny + dz * nz;
  dx -= dot * nx;
  dy -= dot * ny;
  dz -= dot * nz;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) {
    // Pad is at the target's pole — pick any tangent.
    const ref = Math.abs(ny) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    const px = ref[0] - (ref[0] * nx + ref[1] * ny + ref[2] * nz) * nx;
    const py = ref[1] - (ref[0] * nx + ref[1] * ny + ref[2] * nz) * ny;
    const pz = ref[2] - (ref[0] * nx + ref[1] * ny + ref[2] * nz) * nz;
    const plen = Math.hypot(px, py, pz);
    return [px / plen, py / plen, pz / plen];
  }
  return [dx / len, dy / len, dz / len];
}

function landingNormalFromSource(
  source: { center: { x: number; y: number; z: number }; radius: number },
  sourceNormal: [number, number, number],
  target: { center: { x: number; y: number; z: number } },
): [number, number, number] {
  const padX = source.center.x + sourceNormal[0] * source.radius;
  const padY = source.center.y + sourceNormal[1] * source.radius;
  const padZ = source.center.z + sourceNormal[2] * source.radius;
  const dx = padX - target.center.x;
  const dy = padY - target.center.y;
  const dz = padZ - target.center.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return [0, 1, 0];
  return [dx / len, dy / len, dz / len];
}

function tangentFromHeading(
  normal: [number, number, number],
  headingDeg: number,
): [number, number, number] {
  const basis = tangentPlaneBasis(normal);
  const rad = (headingDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x = basis.u[0] * cos + basis.v[0] * sin;
  const y = basis.u[1] * cos + basis.v[1] * sin;
  const z = basis.u[2] * cos + basis.v[2] * sin;
  return [x, y, z];
}

function headingFromTangent(
  normal: [number, number, number],
  tangent: [number, number, number],
): number {
  const basis = tangentPlaneBasis(normal);
  const cosT = tangent[0] * basis.u[0] + tangent[1] * basis.u[1] + tangent[2] * basis.u[2];
  const sinT = tangent[0] * basis.v[0] + tangent[1] * basis.v[1] + tangent[2] * basis.v[2];
  const deg = (Math.atan2(sinT, cosT) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/** Stable orthonormal basis for the plane perpendicular to `normal`. The `u`
 *  axis is the projection of world-+x (or world-+y if normal is too close to
 *  +x), giving a deterministic heading=0 direction independent of pad pose. */
function tangentPlaneBasis(normal: [number, number, number]): {
  u: [number, number, number];
  v: [number, number, number];
} {
  const ref: [number, number, number] = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const dot = ref[0] * normal[0] + ref[1] * normal[1] + ref[2] * normal[2];
  const ux = ref[0] - dot * normal[0];
  const uy = ref[1] - dot * normal[1];
  const uz = ref[2] - dot * normal[2];
  const ulen = Math.hypot(ux, uy, uz);
  const u: [number, number, number] = [ux / ulen, uy / ulen, uz / ulen];
  // v = normal × u, also unit length.
  const v: [number, number, number] = [
    normal[1] * u[2] - normal[2] * u[1],
    normal[2] * u[0] - normal[0] * u[2],
    normal[0] * u[1] - normal[1] * u[0],
  ];
  return { u, v };
}
