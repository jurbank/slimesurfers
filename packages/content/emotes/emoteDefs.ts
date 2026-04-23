export const EMOTE_CONFIG = {
  maxSelected: 3,
  maxPostPayloadIds: 6,
  postCooldownMs: 4000,
  displayDurationMs: 5500,
  fadeDurationMs: 650,
  visibleDistance: 65,
} as const;

export const EMOTE_DEFS = [
  { id: "smile", label: "Smile", glyph: "🙂" },
  { id: "laugh", label: "Laugh", glyph: "😄" },
  { id: "wave", label: "Wave", glyph: "👋" },
  { id: "leaf", label: "Leaf", glyph: "🍃" },
  { id: "target", label: "Target", glyph: "🎯" },
  { id: "warning", label: "Warning", glyph: "⚠️" },
  { id: "fire", label: "Fire", glyph: "🔥" },
  { id: "heart", label: "Heart", glyph: "💚" },
  { id: "skull", label: "Skull", glyph: "💀" },
  { id: "eyes", label: "Eyes", glyph: "👀" },
  { id: "thinking", label: "Thinking", glyph: "🤔" },
  { id: "cool", label: "Cool", glyph: "😎" },
  { id: "cry", label: "Cry", glyph: "😭" },
  { id: "angry", label: "Angry", glyph: "😡" },
  { id: "star", label: "Star", glyph: "⭐" },
  { id: "sparkles", label: "Sparkles", glyph: "✨" },
  { id: "zap", label: "Zap", glyph: "⚡" },
  { id: "bomb", label: "Bomb", glyph: "💣" },
  { id: "rocket", label: "Rocket", glyph: "🚀" },
  { id: "crown", label: "Crown", glyph: "👑" },
  { id: "trophy", label: "Trophy", glyph: "🏆" },
  { id: "clown", label: "Clown", glyph: "🤡" },
  { id: "poop", label: "Poop", glyph: "💩" },
  { id: "ok", label: "OK", glyph: "👌" },
  { id: "thumbsUp", label: "Thumbs Up", glyph: "👍" },
  { id: "thumbsDown", label: "Thumbs Down", glyph: "👎" },
  { id: "pray", label: "Pray", glyph: "🙏" },
  { id: "no", label: "No", glyph: "🚫" },
  { id: "question", label: "Question", glyph: "❓" },
  { id: "exclamation", label: "Exclamation", glyph: "❗" },
  { id: "sweat", label: "Sweat", glyph: "😅" },
  { id: "shush", label: "Shush", glyph: "🤫" },
  { id: "salute", label: "Salute", glyph: "🫡" },
  { id: "party", label: "Party", glyph: "🥳" },
  { id: "sleep", label: "Sleep", glyph: "😴" },
  { id: "money", label: "Money", glyph: "🤑" },
] as const;

export type EmoteId = (typeof EMOTE_DEFS)[number]["id"];

const EMOTE_IDS = new Set<string>(EMOTE_DEFS.map((emote) => emote.id));

export function isEmoteId(value: string): value is EmoteId {
  return EMOTE_IDS.has(value);
}

export function getEmoteDefinition(id: string): (typeof EMOTE_DEFS)[number] | undefined {
  return EMOTE_DEFS.find((emote) => emote.id === id);
}
