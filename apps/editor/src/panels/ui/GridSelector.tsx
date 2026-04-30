import type { ReactNode } from "react";

interface GridSelectorItem {
  id: string;
  label: string;
  preview?: ReactNode;
}

interface GridSelectorProps {
  items: GridSelectorItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  columns?: number;
}

export function GridSelector({ items, selectedId, onSelect, columns = 2 }: GridSelectorProps) {
  const gridCols =
    {
      2: "grid-cols-2",
      3: "grid-cols-3",
      4: "grid-cols-4",
    }[columns as 2 | 3 | 4] || "grid-cols-2";

  return (
    <div className={`grid ${gridCols} gap-2`}>
      {items.map(({ id, label, preview }) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={`flex flex-col gap-2 text-left p-2 rounded border transition-all ${
            selectedId === id
              ? "bg-cyan-500 text-black border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.3)]"
              : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600"
          }`}
        >
          <span className="block text-[10px] font-bold uppercase tracking-wider truncate px-1">
            {label}
          </span>
          {preview && (
            <div className="w-full flex justify-center bg-black/20 rounded-sm py-1">
              {preview}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
