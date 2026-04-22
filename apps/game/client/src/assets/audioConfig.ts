import type { SoundCategory } from "../systems/soundSystem.ts";

interface AudioAsset {
  url: string;
  category: SoundCategory;
}

export const AUDIO: Record<string, AudioAsset> = {
  // SFX
  pow: { url: "/audio/pow.mp3", category: "sfx" },
  skiLaunch: { url: "/audio/ski_launch.mp3", category: "sfx" },
};
