import { supabase } from "./supabase";

export async function broadcastNewsroomArticle(title: string, description: string, event = "newsroom_article", metadata: Record<string, string> = {}) {
  if (!supabase) return { sent: false, error: new Error("Supabase is not configured.") };
  const { error } = await supabase.functions.invoke("caleris-discord-notify", {
    body: { event, title: title.trim().slice(0, 240), description: description.trim().slice(0, 3500), ...metadata },
  });
  return { sent: !error, error };
}
