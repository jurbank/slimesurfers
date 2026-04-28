import type { SoundCategory } from "../systems/soundSystem.ts";

interface AudioAsset {
  url: string;
  category: SoundCategory;
  volume: number;
}

export const AUDIO: Record<string, AudioAsset> = {
  // SFX
  pow: { url: "/audio/pew_pow.mp3", category: "sfx", volume: 0.6 },
  skiLaunch: { url: "/audio/ski_launch.mp3", category: "sfx", volume: 0.3 },
  splat1: { url: "/audio/splat1.mp3", category: "sfx", volume: 0.75 },
  splat2: { url: "/audio/splat2.mp3", category: "sfx", volume: 0.8 },
  splat3: { url: "/audio/splat3.mp3", category: "sfx", volume: 0.8 },
  trickLandSplat: { url: "/audio/splat2.mp3", category: "sfx", volume: 0.9 },
  playerKillSplat: { url: "/audio/splat2.mp3", category: "sfx", volume: 1 },
};
