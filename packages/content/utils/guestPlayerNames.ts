export const PLAYER_NAME_LEXICON = {
  prefixes: [
    "Slime",
    "Turbo",
    "Pixel",
    "Neon",
    "Splash",
    "Rocket",
    "Goop",
    "Drift",
    "Nova",
    "Hyper",
    "Jelly",
    "Cosmo",
  ],
  suffixes: [
    "Rider",
    "Bandit",
    "Wizard",
    "Skater",
    "Surfer",
    "Blaster",
    "Goblin",
    "Comet",
    "Ninja",
    "Pilot",
    "Sprinter",
    "Rascal",
  ],
} as const;

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0;
  return Math.abs(Math.floor(seed));
}

function lexiconIndex(seed: number, size: number, stride: number): number {
  return Math.floor(seed / stride) % size;
}

export function generateGuestPlayerName(seed = Math.floor(Math.random() * 10_000)): string {
  const normalizedSeed = normalizeSeed(seed);
  const prefix =
    PLAYER_NAME_LEXICON.prefixes[
      lexiconIndex(normalizedSeed, PLAYER_NAME_LEXICON.prefixes.length, 1)
    ]!;
  const suffix =
    PLAYER_NAME_LEXICON.suffixes[
      lexiconIndex(
        normalizedSeed,
        PLAYER_NAME_LEXICON.suffixes.length,
        PLAYER_NAME_LEXICON.prefixes.length,
      )
    ]!;
  return `${prefix} ${suffix}`;
}
