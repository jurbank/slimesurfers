import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

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
