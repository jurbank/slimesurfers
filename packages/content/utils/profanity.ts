// Basic profanity filter utility
const BAD_WORDS = [
  "fuck",
  "shit",
  "asshole",
  "bitch",
  "bastard",
  "crap",
  "damn",
  "dick",
  "pussy",
  "faggot",
  "nigger",
  "slut",
  "whore",
];

export function isProfane(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  return BAD_WORDS.some((word) => normalized.includes(word));
}

export function cleanName(name: string): string {
  if (isProfane(name)) {
    return "Surfer" + Math.floor(Math.random() * 1000);
  }
  return name;
}
