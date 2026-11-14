// PDF → チャンク → Embedding（Voyage voyage-4）→ Supabase public.chunks
//
// 使い方:
//   npm run ingest                 … 取り込み計画の表示のみ（API・DB に触れない）
//   npm run ingest -- --yes        … 実際に Embedding を作成して保存（ファイル単位で入れ替え）
//   npm run ingest -- --yes --file case3-doc1-employment-rules.pdf   … 1 ファイルだけ
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { embedTexts } from "@/lib/embedding/voyage";
import { EMBEDDING, missingEnv } from "@/lib/env";
import { extractPdfPages } from "@/lib/ingest/extract";
import { ingestFile, prepareFile } from "@/lib/ingest/ingest";
import { supabaseChunkStore } from "@/lib/ingest/store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const DIR = "data/pdfs";
const args = process.argv.slice(2);
const execute = args.includes("--yes");
const fileArg = args.includes("--file") ? args[args.indexOf("--file") + 1] : undefined;

const files = (await readdir(DIR))
  .filter((f) => f.endsWith(".pdf"))
  .filter((f) => !fileArg || f === basename(fileArg))
  .sort();
if (files.length === 0) {
  console.error(fileArg ? `${fileArg} が ${DIR} にありません` : `${DIR} に PDF がありません`);
  process.exit(1);
}

// 1. 計画（キー不要）
let totalChunks = 0;
let totalChars = 0;
console.log(`取り込み対象（${EMBEDDING.model} / ${EMBEDDING.dimension} 次元）`);
for (const f of files) {
  const { pages, chunks } = await prepareFile(join(DIR, f), extractPdfPages);
  totalChunks += chunks.length;
  totalChars += chunks.reduce((n, c) => n + c.embeddingText.length, 0);
  console.log(`  - ${f}: ${pages.length} ページ / ${chunks.length} チャンク`);
}
console.log(`合計 ${files.length} ファイル / ${totalChunks} チャンク / Embedding 入力 約 ${totalChars} 文字`);

if (!execute) {
  console.log("\n確認のみ（DB は変更していません）。保存する場合は --yes を付けて実行してください。");
  process.exit(0);
}

// 2. 実行（要キー）
const missing = missingEnv("supabasePublic", "supabaseSecret", "voyage");
if (missing.length > 0) {
  console.error(`必要な環境変数が未設定です: ${missing.join(", ")}`);
  process.exit(1);
}
const store = supabaseChunkStore(createSupabaseAdminClient());
let ok = 0;
for (const f of files) {
  try {
    const r = await ingestFile(join(DIR, f), {
      extract: extractPdfPages,
      // 無料枠の RPM 制限（429）に備え、20 → 40 → 80 → 160 秒待って再試行する
      embedDocuments: (texts) => embedTexts(texts, "document", { maxRetries: 4, baseDelayMs: 20_000 }),
      store,
    });
    ok++;
    console.log(`✅ ${r.fileName}: ${r.chunks} チャンクを保存`);
  } catch (e) {
    console.error(`❌ ${f}: ${e instanceof Error ? e.message : "失敗"}`);
  }
}
console.log(`\n完了: ${ok}/${files.length} ファイル`);
process.exit(ok === files.length ? 0 : 1);
