import { BOT_EMOTE_LEXICONS, EMOTE_CONFIG } from "@splat/content/emotes/emoteDefs.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import { type SimPlayerState } from "./simState.ts";

export function drainBotEmoteEvents(
  players: ReadonlyMap<string, SimPlayerState>,
  lastEmotePostMs: Map<string, number>,
  matchPhase: MatchPhase,
  dtMs: number,
  nowMs: number,
): { playerId: string; emoteIds: string[] }[] {
  if (matchPhase !== MatchPhase.Active) return [];
  const events: { playerId: string; emoteIds: string[] }[] = [];
  const cooldownMs = EMOTE_CONFIG.postCooldownMs;
  for (const bot of players.values()) {
    if (!bot.isBot || bot.respawnTimer > 0 || !bot.botEmoteTemperament) continue;
    const lastPostMs = lastEmotePostMs.get(bot.sessionId) ?? 0;
    if (nowMs - lastPostMs < cooldownMs) continue;
    const frequency = Math.max(0, Math.min(1, bot.botEmoteFrequency ?? 0));
    if (frequency <= 0) continue;
    const chance = frequency * (dtMs / cooldownMs);
    if (Math.random() >= chance) continue;
    const lexicon = BOT_EMOTE_LEXICONS[bot.botEmoteTemperament];
    if (!lexicon || lexicon.length === 0) continue;
    const emoteCount = Math.random() < 0.2 ? 2 : 1;
    const emoteIds: string[] = [];
    for (let i = 0; i < emoteCount; i++) {
      const choice = lexicon[Math.floor(Math.random() * lexicon.length)];
      if (!choice || emoteIds.includes(choice)) continue;
      emoteIds.push(choice);
    }
    if (emoteIds.length === 0) continue;
    lastEmotePostMs.set(bot.sessionId, nowMs);
    events.push({ playerId: bot.sessionId, emoteIds });
  }
  return events;
}

export function tryPostEmote(
  sessionId: string,
  nowMs: number,
  lastEmotePostMs: Map<string, number>,
): boolean {
  const lastPostMs = lastEmotePostMs.get(sessionId) ?? 0;
  if (nowMs - lastPostMs < EMOTE_CONFIG.postCooldownMs) return false;
  lastEmotePostMs.set(sessionId, nowMs);
  return true;
}
