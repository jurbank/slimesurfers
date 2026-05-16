import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

export interface GlobalLeaderboardEntry {
  id: string;
  name: string;
  slimeScore: number;
  kills: number;
  deaths: number;
  wins: number;
  matches: number;
  slimeColor: number;
  patternId: number;
}

export type GlobalLeaderboardWindow = "24h" | "week" | "all_time";

interface GlobalLeaderboardRow {
  id: string;
  name?: string | null;
  last_known_name?: string | null;
  paint_score?: number | null;
  total_paint_score?: number | null;
  kills?: number | null;
  total_kills?: number | null;
  deaths?: number | null;
  total_deaths?: number | null;
  wins?: number | null;
  total_wins?: number | null;
  matches?: number | null;
  total_matches?: number | null;
  slime_color?: number | null;
  pattern_id?: number | null;
}

export async function getOrCreatePlayerUuid(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user.id) return session.user.id;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      console.warn("[supabase] Anonymous sign-in failed:", error?.message);
      return null;
    }
    return data.user.id;
  } catch (err) {
    console.warn("[supabase] Auth error:", err);
    return null;
  }
}

export async function fetchGlobalLeaderboard(
  window: GlobalLeaderboardWindow,
  limit = 10,
): Promise<GlobalLeaderboardEntry[]> {
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_global_leaderboard", {
    row_limit: limit,
    time_window: window,
  });

  if (!rpcError) {
    return ((rpcData ?? []) as GlobalLeaderboardRow[]).map(mapGlobalLeaderboardRow);
  }

  const { data, error } = await supabase
    .from("players")
    .select(
      "id,last_known_name,total_paint_score,total_kills,total_deaths,total_matches,total_wins,slime_color,pattern_id",
    )
    .gt("total_matches", 0)
    .order("total_paint_score", { ascending: false })
    .order("total_kills", { ascending: false })
    .order("total_wins", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return ((data ?? []) as GlobalLeaderboardRow[]).map(mapGlobalLeaderboardRow);
}

function mapGlobalLeaderboardRow(row: GlobalLeaderboardRow): GlobalLeaderboardEntry {
  return {
    id: row.id,
    name: row.name || row.last_known_name || "Mystery Surfer",
    slimeScore: row.paint_score ?? row.total_paint_score ?? 0,
    kills: row.kills ?? row.total_kills ?? 0,
    deaths: row.deaths ?? row.total_deaths ?? 0,
    wins: row.wins ?? row.total_wins ?? 0,
    matches: row.matches ?? row.total_matches ?? 0,
    slimeColor: row.slime_color ?? 0x00e5ff,
    patternId: row.pattern_id ?? 0,
  };
}
