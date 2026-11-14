// 取り込み状態の確認（読み取りのみ。本文・キーは表示しない）
// 使い方: npm run check:ingest
// data/pdfs から計算した期待チャンクと、public.chunks の実データをファイル単位で比較する。
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { EMBEDDING } from "@/lib/env";
import { extractPdfPages } from "@/lib/ingest/extract";
import { prepareFile } from "@/lib/ingest/ingest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const DIR = "data/pdfs";
const files = (await readdir(DIR)).filter((f) => f.endsWith(".pdf")).sort();
const db = createSupabaseAdminClient();

type Row = { file_name: string; page: number; chunk_index: number; heading: string | null; content: string; embedding: string };
const { data, error } = await db
  .from("chunks")
  .select("file_name, page, chunk_index, heading, content, embedding")
  .order("file_name")
  .order("chunk_index");
if (error) {
  console.error(`読み取りに失敗しました: ${error.code ?? ""} ${error.message}`);
  process.exit(1);
}
const rows = (data ?? []) as Row[];

let complete = 0;
let problems = 0;
for (const f of files) {
  const { chunks } = await prepareFile(join(DIR, f), extractPdfPages);
  const got = rows.filter((r) => r.file_name === f);
  const issues: string[] = [];
  if (got.length === 0) issues.push("未取り込み");
  else {
    if (got.length !== chunks.length) issues.push(`件数不一致（期待 ${chunks.length} / 実際 ${got.length}）`);
    const idx = got.map((r) => r.chunk_index);
    if (new Set(idx).size !== idx.length) issues.push("chunk_index 重複");
    const mismatch = chunks.filter((c) => {
      const r = got.find((g) => g.chunk_index === c.chunkIndex);
      return !r || r.page !== c.page || r.heading !== c.heading || r.content !== c.content;
    }).length;
    if (mismatch > 0) issues.push(`内容・ページ不一致 ${mismatch} 件`);
    // pgvector は文字列 "[0.1,0.2,...]" で返る
    const badDim = got.filter((r) => (JSON.parse(r.embedding) as number[]).length !== EMBEDDING.dimension).length;
    if (badDim > 0) issues.push(`次元不正 ${badDim} 件`);
  }
  const pages = [...new Set(got.map((r) => r.page))].sort().join(",");
  if (issues.length === 0) complete++;
  else problems++;
  console.log(`${issues.length === 0 ? "✅" : "❌"} ${f}: ${got.length}/${chunks.length} チャンク${pages ? `（p.${pages}）` : ""}${issues.length ? ` … ${issues.join(" / ")}` : ""}`);
}
const unknown = rows.filter((r) => !files.includes(r.file_name)).length;
if (unknown > 0) console.log(`⚠ data/pdfs に無いファイルの行: ${unknown} 件`);
console.log(`\nDB 合計 ${rows.length} 行 / 完了 ${complete}/${files.length} ファイル${problems ? ` / 要対応 ${problems} ファイル` : ""}`);
process.exit(problems === 0 && unknown === 0 ? 0 : 1);
