// API キー不要: PDF 抽出とチャンク分割の結果を確認する（DB には書き込まない）。
// 使い方: npm run ingest:dry [-- --full]
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { chunkDocument } from "@/lib/ingest/chunk";
import { extractPdfPages } from "@/lib/ingest/extract";
import { scanRadicals } from "@/lib/ingest/normalize";

const dir = "data/pdfs";
const full = process.argv.includes("--full");
const files = (await readdir(dir)).filter((f) => f.endsWith(".pdf")).sort();

let total = 0;
for (const f of files) {
  const pages = await extractPdfPages(join(dir, f));
  const radicals = scanRadicals(pages.map((p) => p.text).join(""));
  if (radicals.length > 0) console.warn(`⚠ ${f}: 未変換の部首文字 ${radicals.join(" ")}（normalize.ts に追加してください）`);
  const chunks = chunkDocument(pages);
  total += chunks.length;
  console.log(`\n## ${f}（${pages.length} ページ / ${chunks.length} チャンク）`);
  for (const c of chunks) {
    const body = full ? `\n${c.content}` : ` ${c.content.slice(0, 40).replace(/\n/g, " ")}…`;
    console.log(`- #${c.chunkIndex} p.${c.page} [${c.heading}] (${c.content.length}字)${body}`);
  }
}
console.log(`\n合計 ${files.length} ファイル / ${total} チャンク`);
