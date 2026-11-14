import "server-only";
import { embedQuery } from "@/lib/embedding/voyage";
import { RETRIEVAL, requireEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SearchResponse } from "@/lib/types";
import { answerWith } from "./answer";
import { generateAnswer } from "./generate";
import { matchChunks } from "./retrieve";

/**
 * 質問 → Embedding（voyage-4, query）→ pgvector 検索 → Claude 回答（出典付き）
 * 認可チェックは呼び出し側（/api/search）で済ませていること。
 */
export async function answerQuestion(question: string): Promise<SearchResponse> {
  requireEnv("supabasePublic", "supabaseSecret", "voyage", "anthropic");
  const db = createSupabaseAdminClient();
  return answerWith(question, {
    embedQuery: (q) => embedQuery(q),
    search: (embedding) =>
      matchChunks(db, embedding, { threshold: RETRIEVAL.matchThreshold, count: RETRIEVAL.matchCount }),
    generate: generateAnswer,
  });
}
