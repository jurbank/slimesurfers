import { InputKey } from "@splat/protocol/network/clientMessages.ts";

export type AirTrickAnimation = "yawSpin" | "boardRoll" | "boardFlip" | "frontFlip" | "backFlip";

export interface AirTrickDefinition {
  id: string;
  name: string;
  kind: "spin" | "flip" | "sequence";
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
  corkscrew: {
    id: "corkscrew",
    name: "Corkscrew",
    kind: "sequence",
    sequence: [InputKey.Forward, InputKey.Left, InputKey.Backward],
    animation: "boardRoll",
    soundKey: "skiLaunch",
    comboValue: 2,
    paintMultiplier: 1.8,
  },
  rodeo720: {
    id: "rodeo720",
    name: "Rodeo 720",
    kind: "sequence",
    sequence: [InputKey.Backward, InputKey.Left, InputKey.Forward, InputKey.Right],
    animation: "backFlip",
    soundKey: "skiLaunch",
    comboValue: 3,
    paintMultiplier: 2.3,
  },
  slimecopter: {
    id: "slimecopter",
    name: "Slimecopter",
    kind: "sequence",
    sequence: [InputKey.Left, InputKey.Forward, InputKey.Right, InputKey.Backward],
    animation: "yawSpin",
    soundKey: "skiLaunch",
    comboValue: 4,
    paintMultiplier: 2.8,
  },
  planetBreaker: {
    id: "planetBreaker",
    name: "Planet Breaker",
    kind: "sequence",
    sequence: [InputKey.Forward, InputKey.Backward, InputKey.Left, InputKey.Right],
    animation: "boardFlip",
    soundKey: "skiLaunch",
    comboValue: 5,
    paintMultiplier: 3.2,
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
  frontflip: {
    id: "frontflip",
    name: "Frontflip",
    kind: "flip",
    degrees: 360,
    animation: "frontFlip",
    soundKey: "skiLaunch",
    comboValue: 1,
    paintMultiplier: 1.15,
  },
  doubleFrontflip: {
    id: "doubleFrontflip",
    name: "Double Frontflip",
    kind: "flip",
    degrees: 720,
    animation: "frontFlip",
    soundKey: "skiLaunch",
    comboValue: 2,
    paintMultiplier: 1.35,
  },
  tripleFrontflip: {
    id: "tripleFrontflip",
    name: "Triple Frontflip",
    kind: "flip",
    degrees: 1080,
    animation: "frontFlip",
    soundKey: "skiLaunch",
    comboValue: 3,
    paintMultiplier: 1.65,
  },
  backflip: {
    id: "backflip",
    name: "Backflip",
    kind: "flip",
    degrees: -360,
    animation: "backFlip",
    soundKey: "skiLaunch",
    comboValue: 1,
    paintMultiplier: 1.15,
  },
  doubleBackflip: {
    id: "doubleBackflip",
    name: "Double Backflip",
    kind: "flip",
    degrees: -720,
    animation: "backFlip",
    soundKey: "skiLaunch",
    comboValue: 2,
    paintMultiplier: 1.35,
  },
  tripleBackflip: {
    id: "tripleBackflip",
    name: "Triple Backflip",
    kind: "flip",
    degrees: -1080,
    animation: "backFlip",
    soundKey: "skiLaunch",
    comboValue: 3,
    paintMultiplier: 1.65,
  },
} as const satisfies Record<string, AirTrickDefinition>;

export type AirTrickId = keyof typeof AIR_TRICKS;

export const AIR_TRICK_DEFS: readonly AirTrickDefinition[] = Object.values(AIR_TRICKS);

export function getAirTrickDefinition(trickId: string): AirTrickDefinition {
  return AIR_TRICKS[trickId as AirTrickId] ?? AIR_TRICKS.kickflip;
}
