import type { ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 pt-2 pb-1 border-b border-zinc-800">
        {title}
      </p>
      {children}
    </div>
  );
}
