import * as THREE from "three";
import { EMOTE_CONFIG, getEmoteDefinition } from "@splat/content/emotes/emoteDefs.ts";

interface EmoteBubbleEntry {
  playerId: string;
  element: HTMLDivElement;
  ageMs: number;
}

export class EmoteBubbleSystem {
  private readonly root: HTMLDivElement;
  private readonly entries: EmoteBubbleEntry[] = [];
  private readonly screenPos = new THREE.Vector3();

  constructor() {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      overflow: "hidden",
      zIndex: "21",
    });
    document.body.appendChild(this.root);
  }

  show(playerId: string, emoteIds: string[]): void {
    this.clearPlayer(playerId);

    const element = document.createElement("div");
    Object.assign(element.style, {
      position: "absolute",
      transform: "translate(-50%, -50%)",
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "5px 7px",
      border: "1px solid rgba(255, 255, 255, 0.45)",
      borderRadius: "8px",
      background: "rgba(10, 16, 20, 0.78)",
      boxShadow: "0 8px 22px rgba(0, 0, 0, 0.3)",
      font: "24px system-ui, sans-serif",
      lineHeight: "1",
      whiteSpace: "nowrap",
      willChange: "transform, opacity",
    });

    for (const emoteId of emoteIds) {
      const emote = getEmoteDefinition(emoteId);
      if (!emote) continue;
      const item = document.createElement("span");
      item.textContent = emote.glyph;
      element.append(item);
    }
    if (element.childElementCount === 0) return;

    this.root.appendChild(element);
    this.entries.push({ playerId, element, ageMs: 0 });
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
      if (!mesh || entry.ageMs >= EMOTE_CONFIG.displayDurationMs) {
        entry.element.remove();
        this.entries.splice(i, 1);
        continue;
      }

      const visibleDistanceSq = EMOTE_CONFIG.visibleDistance * EMOTE_CONFIG.visibleDistance;
      if (mesh.position.distanceToSquared(camera.position) > visibleDistanceSq) {
        entry.element.style.display = "none";
        continue;
      }
      entry.element.style.display = "flex";

      this.screenPos.copy(mesh.position);
      this.screenPos.y += 2.05;
      this.screenPos.project(camera);
      const x = (this.screenPos.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-this.screenPos.y * 0.5 + 0.5) * window.innerHeight;
      const fadeStartMs = EMOTE_CONFIG.displayDurationMs - EMOTE_CONFIG.fadeDurationMs;
      const fadeProgress =
        entry.ageMs <= fadeStartMs ? 0 : (entry.ageMs - fadeStartMs) / EMOTE_CONFIG.fadeDurationMs;
      const alpha = Math.max(0, 1 - fadeProgress);
      entry.element.style.opacity = alpha.toFixed(3);
      entry.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  }

  clearPlayer(playerId: string): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]!;
      if (entry.playerId !== playerId) continue;
      entry.element.remove();
      this.entries.splice(i, 1);
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
