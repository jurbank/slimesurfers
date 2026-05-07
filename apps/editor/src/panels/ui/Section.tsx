import { useState } from "react";
import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  headerControl?: ReactNode;
  onReset?: () => void;
}

export function Section({
  title,
  children,
  defaultOpen = true,
  headerControl,
  onReset,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <div className="flex items-center justify-between border-b border-zinc-800 pt-2 pb-1">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex-1 text-left text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-400 transition-colors"
        >
          {title}
        </button>
        <div className="flex items-center gap-1">
          {headerControl}
          {onReset && (
            <button
              onClick={onReset}
              title="Reset to defaults"
              className="px-1.5 text-zinc-600 hover:text-zinc-300 transition-colors text-sm leading-none"
            >
              ↺
            </button>
          )}
          <button
            onClick={() => setOpen((o) => !o)}
            className="px-1 text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            <span
              className={`inline-block transition-transform duration-150 ${open ? "rotate-90" : ""}`}
            >
              ›
            </span>
          </button>
        </div>
      </div>
      <div
        className={`overflow-hidden transition-all duration-200 ${open ? "max-h-screen" : "max-h-0"}`}
      >
        <div className="pt-2.5 space-y-2.5">{children}</div>
      </div>
    </div>
  );
}
