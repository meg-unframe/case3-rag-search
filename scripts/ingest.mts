// PDF → チャンク → Embedding → Supabase へ保存。
// 実装は feature/ingest ブランチ（.worktrees/ingest）で行う。キー不要の確認は npm run ingest:dry。
//
// 実装予定:
//   1. data/pdfs/*.pdf を extractPdfPages → chunkDocument（scripts/inspect-chunks.mts と同じ）
//   2. Voyage voyage-4 に embeddingText を input_type: "document" でバッチ送信（1 リクエスト最大 1,000 件）
//   3. 返ってきた次元が EMBEDDING.dimension(1024) と一致するか検証
//   4. ファイル単位で delete → insert（何度実行しても同じ結果になる）
import { missingEnv } from "@/lib/env";

const missing = missingEnv("supabasePublic", "supabaseSecret", "voyage");
if (missing.length > 0) {
  console.error(`取り込みに必要な環境変数が未設定です: ${missing.join(", ")}`);
  console.error("キーなしでチャンク分割だけ確認する場合は npm run ingest:dry を使ってください。");
  process.exit(1);
}
console.error("取り込み処理は未実装です（feature/ingest で実装予定）。");
process.exit(1);
