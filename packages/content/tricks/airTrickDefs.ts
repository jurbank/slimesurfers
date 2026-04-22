import { InputKey } from "@splat/protocol/network/clientMessages.ts";

export type AirTrickAnimation = "yawSpin" | "boardRoll" | "boardFlip";

export interface AirTrickDefinition {
  id: string;
  name: string;
  kind: "spin" | "sequence";
  animation: AirTrickAnimation;
  soundKey: string;
  comboValue: number;
  paintMultiplier: number;
  degrees?: number;
  sequence?: readonly number[];
}

export const AIR_TRICKS = {
  kickflip: {
    id: "kickflip",
    name: "Kickflip",
    kind: "sequence",
    sequence: [InputKey.Left, InputKey.Right],
    animation: "boardRoll",
    soundKey: "skiLaunch",
    comboValue: 1,
    paintMultiplier: 1.1,
  },
  tailGrab: {
    id: "tailGrab",
    name: "Tail Grab",
    kind: "sequence",
    sequence: [InputKey.Backward, InputKey.Forward],
    animation: "boardFlip",
    soundKey: "skiLaunch",
    comboValue: 1,
    paintMultiplier: 1.15,
  },
  spin360: {
    id: "spin360",
    name: "360",
    kind: "spin",
    degrees: 360,
    animation: "yawSpin",
    soundKey: "skiLaunch",
    comboValue: 1,
    paintMultiplier: 1,
  },
  spin720: {
    id: "spin720",
    name: "720",
    kind: "spin",
    degrees: 720,
    animation: "yawSpin",
    soundKey: "skiLaunch",
    comboValue: 2,
    paintMultiplier: 1.3,
  },
  spin1080: {
    id: "spin1080",
    name: "1080",
    kind: "spin",
    degrees: 1080,
    animation: "yawSpin",
    soundKey: "skiLaunch",
    comboValue: 3,
    paintMultiplier: 1.7,
  },
} as const satisfies Record<string, AirTrickDefinition>;

export type AirTrickId = keyof typeof AIR_TRICKS;

export const AIR_TRICK_DEFS: readonly AirTrickDefinition[] = Object.values(AIR_TRICKS);

export function getAirTrickDefinition(trickId: string): AirTrickDefinition {
  return AIR_TRICKS[trickId as AirTrickId] ?? AIR_TRICKS.kickflip;
}
