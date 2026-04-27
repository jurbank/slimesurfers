import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LeaderboardEntry } from "@splat/protocol/network/serverMessages.ts";

interface SaveMatchOptions {
  entries: Array<LeaderboardEntry & { placement: number; playerUuid?: string; isBot?: boolean }>;
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

    const rows = opts.entries
      .filter(
        (e): e is typeof e & { playerUuid: string } => e.playerUuid != null && e.isBot !== true,
      )
      .map((e) => ({
        id: e.playerUuid,
        name: e.name,
        placement: e.placement,
        paintScore: e.paintScore,
        killCount: e.killCount,
        deathCount: e.deathCount,
        slimeColor: e.slimeColor,
        patternId: e.patternId,
      }));

    if (rows.length === 0) return;

    const { error } = await this.client.rpc("record_match_results", {
      results: rows,
    });

    if (error) {
      console.error("[SupabaseService] Failed to record match results:", error.message);
    }
  }
}
