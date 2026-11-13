import "server-only";
import type { SearchResponse } from "@/lib/types";

// 検索〜回答生成の本体。実装は feature/search-api ブランチ（.worktrees/api）で行う。
//
// 実装予定の流れ:
//   1. embedQuery(question)      … Voyage voyage-4, input_type: "query", 1024 次元
//   2. matchChunks(embedding)    … supabase.rpc("match_chunks", { match_threshold, match_count })
//   3. 0 件なら Claude を呼ばず { found: false, answer: NOT_FOUND_MESSAGE, citations: [] }
//   4. generateAnswer(question, chunks) … Claude（取得チャンクのみを根拠、構造化出力）
//   5. 引用された chunk id が取得結果に含まれるものだけ citations に変換して返す

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} は未実装です`);
    this.name = "NotImplementedError";
  }
}

export async function answerQuestion(_question: string): Promise<SearchResponse> {
  throw new NotImplementedError("検索・回答生成");
}
