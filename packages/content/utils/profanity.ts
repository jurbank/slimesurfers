// Basic profanity filter utility
import { generateGuestPlayerName } from "./guestPlayerNames.ts";

export const PLAYER_NAME_MAX_LENGTH = 20;

const BAD_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "bastard",
  "crap",
  "damn",
  "asshole",
  "dumbass",
  "nazi",
  "chink",
  "gook",
  "kike",
  "hitler",
  "nigger",
  "nigga",
  "boobs",
  "penis",
  "dick",
  "cock",
  "vagina",
  "pussy",
  "gay",
  "slut",
  "whore",
  "faggot",
  "retard",
  "nigga",
  "n1gger",
  "n1gga",
  "negro",
  "n3gro",
  "n!gger",
  "n!gga",
  "faggot",
  "fag",
  "f4ggot",
  "f4g",
  "f@ggot",
  "f@g",
  "fagg0t",
  "f@gg0t",
  "chink",
  "gook",
  "spic",
  "kike",
  "kyke",
  "ch1nk",
  "g00k",
  "sp1c",
  "k1ke",
  "retard",
  "r3tard",
  "muslim",
  "muslims",
  "jewish",
  "jew",
  "tard",
  "cunt",
  "r3t@rd",
  "ret@rd",
  "c*nt",
  "c@nt",
  "hitler",
  "nazi",
  "h1tler",
  "n4zi",
  "h!tler",
  "naz1",
  "n@zi",
  "h1tl3r",
  "rape",
  "r4pe",
  "rapist",
  "r4pist",
  "r@pe",
  "r@pist",
  "r@p1st",
  "r4p1st",
  "kill yourself",
  "kys",
  "suicide",
  "su1c1de",
  "k1ll yourself",
  "k!ll yourself",
  "whore",
  "wh0re",
  "sl*t",
  "b!tch",
  "b*tch",
  "h0e",
  "hoe",
  "penis",
  "vagina",
  "pussy",
  "dick",
  "cock",
  "p3nis",
  "v@gina",
  "p*ssy",
  "d!ck",
  "c0ck",
  "cum",
  "jizz",
  "porn",
  "anal",
  "c*m",
  "j!zz",
  "p0rn",
  "@nal",
  "@nus",
  "blowjob",
  "bl0wjob",
  "handjob",
  "h@ndjob",
  "rimjob",
  "r1mjob",
  "dildo",
  "d1ldo",
  "vibrator",
  "v1brator",
  "buttplug",
  "buttp1ug",
  "orgasm",
  "0rgasm",
  "orgy",
  "0rgy",
  "gangbang",
  "g@ngbang",
  "masturbate",
  "m@sturbate",
  "jackoff",
  "j@ckoff",
  "wank",
  "w@nk",
  "asshole",
  "@sshole",
  "a$$hole",
  "a$$h0le",
  "a**hole",
  "a**h0le",
  "shit",
  "sh1t",
  "sh!t",
  "bullshit",
  "bullsh1t",
  "f*ck",
  "fuck",
  "fuk",
  "fucker",
  "f*cker",
  "motherfucker",
  "motherf*cker",
  "m0therf*cker",
  "m0therfucker",
  "tits",
  "t1ts",
  "boobs",
  "b00bs",
  "titties",
  "t1tties",
];

const LEETSPEAK_CHARS: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
};

function fallbackName(): string {
  return generateGuestPlayerName();
}

function stripControlCharacters(text: string): string {
  let stripped = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127) continue;
    stripped += char;
  }
  return stripped;
}

export function normalizePlayerName(name: unknown): string {
  if (typeof name !== "string") return "";

  return stripControlCharacters(name.normalize("NFKC"))
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PLAYER_NAME_MAX_LENGTH)
    .trim();
}

export function isProfane(text: string): boolean {
  const compact = normalizePlayerName(text)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  let normalized = "";
  for (const char of compact) {
    normalized += LEETSPEAK_CHARS[char] ?? char;
  }
  return BAD_WORDS.some((word) => normalized.includes(word));
}

export function cleanName(name: unknown, fallback = fallbackName()): string {
  const normalized = normalizePlayerName(name);
  if (normalized.length === 0 || isProfane(normalized)) return fallback;
  return normalized;
}
