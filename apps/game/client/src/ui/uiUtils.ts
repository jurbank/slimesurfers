import { type PlayerSlotDefinition } from "@splat/content/modes/gameModes.ts";

export function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

export function swatchBackground(slot: PlayerSlotDefinition): {
  backgroundImage: string;
  backgroundSize: string;
} {
  const c = cssColor(slot.color);
  switch (slot.patternId) {
    case 1:
      return {
        backgroundImage: `repeating-linear-gradient(0deg,${c} 0px,${c} 5px,rgba(255,255,255,0.55) 5px,rgba(255,255,255,0.55) 9px)`,
        backgroundSize: "auto",
      };
    case 2:
      return {
        backgroundImage: `radial-gradient(circle,rgba(255,255,255,0.65) 28%,transparent 28%),linear-gradient(${c},${c})`,
        backgroundSize: "10px 10px,auto",
      };
    case 3:
      return {
        backgroundImage: `repeating-linear-gradient(45deg,${c},${c} 4px,rgba(255,255,255,0.55) 4px,rgba(255,255,255,0.55) 8px)`,
        backgroundSize: "auto",
      };
    case 4:
      return {
        backgroundImage: `repeating-linear-gradient(90deg,${c} 0px,${c} 5px,rgba(255,255,255,0.55) 5px,rgba(255,255,255,0.55) 9px)`,
        backgroundSize: "auto",
      };
    case 5:
      return {
        backgroundImage: `repeating-linear-gradient(0deg,${c} 0px,${c} 5px,rgba(0,0,0,0.35) 5px,rgba(0,0,0,0.35) 9px)`,
        backgroundSize: "auto",
      };
    case 6:
      return {
        backgroundImage: `radial-gradient(circle,rgba(0,0,0,0.45) 28%,transparent 28%),linear-gradient(${c},${c})`,
        backgroundSize: "10px 10px,auto",
      };
    case 7:
      return {
        backgroundImage: `repeating-conic-gradient(${c} 0% 25%,rgba(255,255,255,0.55) 0% 50%)`,
        backgroundSize: "10px 10px",
      };
    default:
      return { backgroundImage: `linear-gradient(${c},${c})`, backgroundSize: "auto" };
  }
}
