// チャット画面表示時のウォームアップ。
// 関数の起動・モジュール読み込み・Supabase（Auth / DB）への初回接続を、利用者が質問を入力している間に済ませる。
// Voyage・Claude は呼ばない（費用が発生せず、検索・回答の処理内容にも影響しない）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { EMBEDDING } from "@/lib/env";

/** 何にも一致しない検索で match_chunks（HNSW インデックスを含む）を 1 回通す。データは返らない */
export async function warmDatabase(db: SupabaseClient): Promise<void> {
  const probe = Array.from({ length: EMBEDDING.dimension }, (_, i) => (i === 0 ? 1 : 0));
  const { error } = await db.rpc("match_chunks", {
    query_embedding: probe,
    match_threshold: 2, // cosine 類似度は最大 1 なので 0 件（本文を返さない）
    match_count: 1,
  });
  if (error) throw new Error(`warmup の DB 接続に失敗しました（${error.code ?? ""}）`);
}
