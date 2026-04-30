import type { SoundCategory } from "../systems/sound/soundSystem.ts";

interface AudioAsset {
  url: string;
  category: SoundCategory;
  volume: number;
}

export const AUDIO: Record<string, AudioAsset> = {
  // SFX
  pow: { url: "/audio/pew_pow.mp3", category: "sfx", volume: 0.5 },
  gunDry: { url: "/audio/gun_dry.mp3", category: "sfx", volume: 0.5 },
  bazookaPow: { url: "/audio/bazooka_pow.mp3", category: "sfx", volume: 0.7 },
  riflePow: { url: "/audio/rifle_pow.mp3", category: "sfx", volume: 0.75 },
  skiLaunch: { url: "/audio/ski_launch.mp3", category: "sfx", volume: 0.25 },
  splat1: { url: "/audio/splat1.mp3", category: "sfx", volume: 0.75 },
  splat2: { url: "/audio/splat2.mp3", category: "sfx", volume: 0.8 },
  splat3: { url: "/audio/splat3.mp3", category: "sfx", volume: 0.8 },
  // player land trick
  bigSplat: { url: "/audio/splat4.mp3", category: "sfx", volume: 0.7 },
  weaponPickup: { url: "/audio/weapon_pickup.mp3", category: "sfx", volume: 0.8 },
  playerKillSplat: { url: "/audio/big_splat.mp3", category: "sfx", volume: 1 },
};
