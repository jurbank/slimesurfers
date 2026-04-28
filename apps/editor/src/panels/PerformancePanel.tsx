import type { PerformanceStats } from "../types.ts";
import { Section } from "./ui/Section.tsx";

interface PerformancePanelProps {
  stats: PerformanceStats | null;
}

export function PerformancePanel({ stats }: PerformancePanelProps) {
  if (!stats) {
    return <p className="text-xs text-zinc-600 mt-2">Waiting for scene metrics...</p>;
  }

  return (
    <div className="space-y-4">
      <Section title="Frame">
        <MetricRow label="Draw Calls" value={formatNumber(stats.totals.drawCalls)} />
        <MetricRow label="Rendered Tris" value={formatNumber(stats.totals.triangles)} />
        <MetricRow label="Meshes" value={formatNumber(stats.totals.meshes)} />
        <MetricRow label="Instances" value={formatNumber(stats.totals.instances)} />
        <MetricRow label="Shader Mats" value={formatNumber(stats.totals.shaderMaterials)} />
        <MetricRow label="Transparent" value={formatNumber(stats.totals.transparentObjects)} />
        <MetricRow label="Geometries" value={formatNumber(stats.totals.geometries)} />
        <MetricRow label="Textures" value={formatNumber(stats.totals.textures)} />
      </Section>

      <Section title="Scene Cost">
        <div className="space-y-2">
          {stats.groups.map((group) => (
            <div key={group.id} className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-300">{group.label}</span>
                <span className="font-mono text-[11px] text-cyan-300">
                  {formatNumber(group.triangles)} tris
                </span>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-1 text-[11px] text-zinc-500">
                <span>{formatNumber(group.drawCalls)} calls</span>
                <span>{formatNumber(group.meshes)} meshes</span>
                <span>{formatNumber(group.instances ?? 0)} inst</span>
              </div>
              {group.notes && <p className="mt-1 text-[11px] text-zinc-600">{group.notes}</p>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono text-zinc-200">{value}</span>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}
