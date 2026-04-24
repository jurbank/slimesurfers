import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LeaderboardEntry } from "@splat/protocol/network/serverMessages.ts";

interface SaveMatchOptions {
  roomId: string;
  gameMode: string;
  playerCount: number;
  durationSeconds: number;
  startedAt: Date;
  entries: Array<LeaderboardEntry & { placement: number; playerUuid?: string }>;
}

export class SupabaseService {
  private readonly client: SupabaseClient | null;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.warn(
        "[SupabaseService] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — match results will not be saved.",
      );
      this.client = null;
      return;
    }
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }

  async saveMatch(opts: SaveMatchOptions): Promise<void> {
    if (!this.client) return;

    const { data: match, error: matchError } = await this.client
      .from("matches")
      .insert({
        room_id: opts.roomId,
        game_mode: opts.gameMode,
        player_count: opts.playerCount,
        duration_seconds: opts.durationSeconds,
        started_at: opts.startedAt.toISOString(),
      })
      .select("id")
      .single();

    if (matchError || !match) {
      console.error("[SupabaseService] Failed to insert match:", matchError?.message);
      return;
    }

    // Ensure player rows exist — guards against cleared tables while auth sessions persist
    const playerUuids = opts.entries
      .map((e) => e.playerUuid)
      .filter((id): id is string => id != null);
    if (playerUuids.length > 0) {
      const { error: playerError } = await this.client.from("players").upsert(
        playerUuids.map((id) => ({ id })),
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (playerError) {
        console.error("[SupabaseService] Failed to upsert players:", playerError.message);
      }
    }

    const rows = opts.entries.map((entry) => ({
      match_id: (match as { id: string }).id,
      player_id: entry.playerUuid ?? null,
      player_name: entry.name,
      placement: entry.placement,
      paint_score: entry.paintScore,
      kill_count: entry.killCount,
      death_count: entry.deathCount,
      slime_color: entry.slimeColor,
      pattern_id: entry.patternId,
    }));

    const { error: resultsError } = await this.client.from("match_results").insert(rows);

    if (resultsError) {
      console.error("[SupabaseService] Failed to insert match_results:", resultsError.message);
    }
  }
}
