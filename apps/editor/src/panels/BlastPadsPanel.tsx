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
  onPadsChange: (pads: EditorBlastPad[]) => void;
  onSelectionChange: (padId: string | null) => void;
  onToolChange: (state: BlastPadToolState) => void;
}

export function BlastPadsPanel({
  config,
  planetId,
  selectedPadId,
  onPadsChange,
  onSelectionChange,
  onToolChange,
}: BlastPadsPanelProps) {
  const [mode, setMode] = useState<BlastPadEditMode | null>("place");
  const padsOnPlanet = useMemo(
    () => config.blastPads.filter((pad) => pad.planetId === planetId),
    [config.blastPads, planetId],
  );
  const selectedPad =
    config.blastPads.find((p) => p.id === selectedPadId && p.planetId === planetId) ?? null;
  const toolChangeRef = useRef(onToolChange);
  toolChangeRef.current = onToolChange;

  useEffect(() => {
    toolChangeRef.current({
      mode,
      sourcePlanetId: planetId,
      pads: config.blastPads,
      selectedPadId,
    });
  }, [config.blastPads, mode, planetId, selectedPadId]);

  useEffect(() => {
    return () => {
      toolChangeRef.current({
        mode: null,
        sourcePlanetId: planetId,
        pads: [],
        selectedPadId: null,
      });
    };
  }, [planetId]);

  function commitPad(nextPad: EditorBlastPad) {
    onPadsChange(config.blastPads.map((p) => (p.id === nextPad.id ? nextPad : p)));
  }

  function addPad() {
    const id = nextPadId(new Set(config.blastPads.map((p) => p.id)));
    const newPad = defaultEditorBlastPad(id, planetId);
    onPadsChange([...config.blastPads, newPad]);
    onSelectionChange(newPad.id);
    setMode("move");
  }

  function deletePad(padId: string) {
    onPadsChange(config.blastPads.filter((p) => p.id !== padId));
    if (selectedPadId === padId) onSelectionChange(null);
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
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={addPad}
            className="py-1.5 text-xs rounded bg-cyan-500 text-black font-semibold hover:bg-cyan-400 transition-colors"
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
        <p className="text-xs text-zinc-500">
          Pads are aim-and-fire launchers. The player walks onto a charged pad, aims freely, and
          holds Space to charge launch speed.
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
                <span className="font-mono">{pad.launchSpeed.toFixed(0)} wu/s</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      {selectedPad && (
        <>
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
              label="Max Launch Speed"
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

/** Stable orthonormal basis for the plane perpendicular to `normal`. */
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
  const v: [number, number, number] = [
    normal[1] * u[2] - normal[2] * u[1],
    normal[2] * u[0] - normal[0] * u[2],
    normal[0] * u[1] - normal[1] * u[0],
  ];
  return { u, v };
}
