import { useState } from "react";
import type { ReactNode } from "react";
import { PlanetPreview } from "./preview/PlanetPreview.tsx";

type Panel = "terrain" | "shaders" | "props" | "spawns";

const PANELS: { id: Panel; label: string }[] = [
  { id: "terrain", label: "Terrain" },
  { id: "shaders", label: "Shaders" },
  { id: "props", label: "Props" },
  { id: "spawns", label: "Spawns" },
];

export function App() {
  const [activePanel, setActivePanel] = useState<Panel>("terrain");

  return (
    <div className="flex h-screen bg-zinc-900 text-zinc-100 overflow-hidden">
      <aside className="w-56 border-r border-zinc-700 flex flex-col shrink-0">
        <div className="p-4 border-b border-zinc-700">
          <h1 className="text-sm font-bold tracking-widest uppercase text-cyan-400">
            World Editor
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">Slime Surfers</p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {PANELS.map(({ id, label }) => (
            <NavItem key={id} active={activePanel === id} onClick={() => setActivePanel(id)}>
              {label}
            </NavItem>
          ))}
        </nav>
      </aside>

      <main className="flex-1 relative bg-zinc-950 min-w-0">
        <PlanetPreview />
      </main>

      <aside className="w-72 border-l border-zinc-700 flex flex-col shrink-0">
        <div className="p-4 border-b border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-300 capitalize">{activePanel}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-zinc-500 text-sm">
          {activePanel} panel — coming soon
        </div>
        <div className="p-4 border-t border-zinc-700">
          <button className="w-full px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded text-sm transition-colors">
            Export Config
          </button>
        </div>
      </aside>
    </div>
  );
}

function NavItem({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
        active ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
