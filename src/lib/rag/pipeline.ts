import "server-only";
import { embedQuery } from "@/lib/embedding/voyage";
import { RETRIEVAL, requireEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Timer } from "@/lib/timing";
import type { SearchResponse } from "@/lib/types";
import { answerWith } from "./answer";
import { generateAnswer } from "./generate";
import { matchChunks } from "./retrieve";

/**
 * 質問 → Embedding（voyage-4, query）→ pgvector 検索 → Claude 回答（出典付き）
 * 認可チェックは呼び出し側（/api/search）で済ませていること。
 */
export async function answerQuestion(question: string, timer?: Timer): Promise<SearchResponse> {
  requireEnv("supabasePublic", "supabaseSecret", "voyage", "anthropic");
  const db = createSupabaseAdminClient();
  // 計測は各処理を包むだけで、検索・回答の内容は変えない
  const t = <T,>(name: string, fn: () => Promise<T>) => (timer ? timer.measure(name, fn) : fn());
  return answerWith(question, {
    embedQuery: (q) => t("embed", () => embedQuery(q)),
    search: (embedding) =>
      t("search", () =>
        matchChunks(db, embedding, { threshold: RETRIEVAL.matchThreshold, count: RETRIEVAL.matchCount }),
      ),
    generate: (q, chunks) => t("generate", () => generateAnswer(q, chunks)),
  });
}
