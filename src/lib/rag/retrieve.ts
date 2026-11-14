import type { SupabaseClient } from "@supabase/supabase-js";
import type { RetrievedChunk } from "@/lib/types";

export type MatchOptions = { threshold: number; count: number };

/** supabase/migrations/0001_init.sql の match_chunks を service_role で呼ぶ */
export async function matchChunks(
  db: SupabaseClient,
  embedding: number[],
  { threshold, count }: MatchOptions,
): Promise<RetrievedChunk[]> {
  const { data, error } = await db.rpc("match_chunks", {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: count,
  });
  if (error) throw new Error(`関連文書の検索に失敗しました（${error.code ?? ""} ${error.message}）`);
  return (data ?? []) as RetrievedChunk[];
}
