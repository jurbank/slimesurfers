import type { KillEventMessage } from "@splat/protocol/network/serverMessages.ts";
import { WeaponId } from "@splat/protocol/network/weaponIds.ts";
import { KILL_LEXICON, type KillFeedBucket, type KillFeedTemplate } from "./killFeedLexicon.ts";

export interface KillFeedSegment {
  color?: number;
  text: string;
}

export interface FormattedKillFeedLine {
  involvement: "killer" | "neutral" | "victim";
  segments: KillFeedSegment[];
  templateId: string;
}

const PLACEHOLDER_PATTERN = /(\{attacker\}|\{victim\})/g;

export function formatKillFeedLine(
  event: KillEventMessage,
  localSessionId: string | null,
  previousTemplateId: string | null = null,
): FormattedKillFeedLine {
  const bucket = getKillFeedBucket(event);
  const template = pickKillTemplate(bucket, previousTemplateId);
  const involvement = getInvolvement(event, localSessionId);
  const segments: KillFeedSegment[] = [];
  const parts = template.text.split(PLACEHOLDER_PATTERN);

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (!part) continue;
    if (part === "{attacker}") {
      const prefix = parts[index - 1] ?? "";
      segments.push({
        color: event.killerSlimeColor,
        text: actorLabel(
          event.killerName,
          event.killerSessionId,
          localSessionId,
          prefix,
          "Someone",
        ),
      });
      continue;
    }
    if (part === "{victim}") {
      const prefix = parts[index - 1] ?? "";
      segments.push({
        color: event.victimSlimeColor,
        text: actorLabel(
          event.victimName,
          event.victimSessionId,
          localSessionId,
          prefix,
          "Someone",
        ),
      });
      continue;
    }
    segments.push({ text: part });
  }

  return {
    involvement,
    segments,
    templateId: template.id,
  };
}

function getKillFeedBucket(event: KillEventMessage): KillFeedBucket {
  if (event.isSelfKill) return "self";
  if (!event.killerSessionId && !event.killerName) return "orphaned";
  if (event.weaponId === WeaponId.MachineGun) return "machineGun";
  if (event.weaponId === WeaponId.Bazooka) return "bazooka";
  if (event.weaponId === WeaponId.Sniper) return "sniper";
  return "generic";
}

function pickKillTemplate(
  bucket: KillFeedBucket,
  previousTemplateId: string | null,
): KillFeedTemplate {
  const templates = [...KILL_LEXICON[bucket]];
  const filtered =
    previousTemplateId === null
      ? templates
      : templates.filter((template) => template.id !== previousTemplateId);
  const pool = filtered.length > 0 ? filtered : templates;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index] ?? templates[0]!;
}

function getInvolvement(
  event: KillEventMessage,
  localSessionId: string | null,
): FormattedKillFeedLine["involvement"] {
  if (localSessionId && event.killerSessionId === localSessionId) return "killer";
  if (localSessionId && event.victimSessionId === localSessionId) return "victim";
  return "neutral";
}

function actorLabel(
  name: string | undefined,
  sessionId: string | undefined,
  localSessionId: string | null,
  prefix: string,
  fallback: string,
): string {
  if (!localSessionId || !sessionId || sessionId !== localSessionId) {
    return name ?? fallback;
  }
  return isSentenceStart(prefix) ? "You" : "you";
}

function isSentenceStart(prefix: string): boolean {
  const alphanumeric = prefix.replace(/[^a-zA-Z0-9]/g, "");
  return alphanumeric.length === 0 || /[.!?]\s*$/.test(prefix);
}
