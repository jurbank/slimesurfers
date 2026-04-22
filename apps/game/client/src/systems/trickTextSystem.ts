import * as THREE from "three";

interface TrickTextEntry {
  playerId: string;
  text: string;
  element: HTMLDivElement;
  ageMs: number;
  durationMs: number;
}

export class TrickTextSystem {
  private readonly root: HTMLDivElement;
  private readonly entries: TrickTextEntry[] = [];
  private readonly screenPos = new THREE.Vector3();

  constructor() {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      overflow: "hidden",
      zIndex: "20",
    });
    document.body.appendChild(this.root);
  }

  show(playerId: string, text: string): void {
    const element = document.createElement("div");
    element.textContent = text;
    Object.assign(element.style, {
      position: "absolute",
      transform: "translate(-50%, -50%)",
      color: "#ffffff",
      fontFamily: "system-ui, sans-serif",
      fontWeight: "800",
      fontSize: "18px",
      textShadow: "0 2px 8px rgba(0,0,0,0.75)",
      whiteSpace: "nowrap",
      willChange: "transform, opacity",
    });
    this.root.appendChild(element);
    this.entries.push({ playerId, text, element, ageMs: 0, durationMs: 950 });
  }

  update(
    dtMs: number,
    camera: THREE.Camera,
    getPlayerMesh: (playerId: string) => THREE.Object3D | null,
  ): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]!;
      entry.ageMs += dtMs;
      const mesh = getPlayerMesh(entry.playerId);
      if (!mesh || entry.ageMs >= entry.durationMs) {
        entry.element.remove();
        this.entries.splice(i, 1);
        continue;
      }

      this.screenPos.copy(mesh.position);
      this.screenPos.y += 1.25 + entry.ageMs / entry.durationMs;
      this.screenPos.project(camera);
      const x = (this.screenPos.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-this.screenPos.y * 0.5 + 0.5) * window.innerHeight;
      const alpha = Math.max(0, 1 - entry.ageMs / entry.durationMs);
      entry.element.style.opacity = alpha.toFixed(3);
      entry.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  }

  clear(): void {
    for (const entry of this.entries) {
      entry.element.remove();
    }
    this.entries.length = 0;
  }

  dispose(): void {
    this.clear();
    this.root.remove();
  }
}
