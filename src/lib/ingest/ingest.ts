import type { Chunk, PageText } from "@/lib/types";
import { chunkDocument } from "./chunk";
import { type ChunkStore, toRows } from "./store";

export type IngestDeps = {
  extract: (filePath: string) => Promise<PageText[]>;
  embedDocuments: (texts: string[]) => Promise<number[][]>;
  store: ChunkStore;
};

export type FileIngestResult = {
  fileName: string;
  pages: number;
  chunks: number;
};

/** PDF 1 本を抽出・分割する（DB / API に触れない） */
export async function prepareFile(filePath: string, extract: IngestDeps["extract"]): Promise<{ pages: PageText[]; chunks: Chunk[] }> {
  const pages = await extract(filePath);
  if (pages.length === 0) throw new Error(`${filePath}: ページがありません`);
  const chunks = chunkDocument(pages);
  if (chunks.length === 0) throw new Error(`${filePath}: テキストを抽出できませんでした（画像のみの PDF の可能性）`);
  return { pages, chunks };
}

/**
 * PDF 1 本を取り込む。ファイル単位で入れ替えるので何度実行しても同じ結果になる。
 * 順序: 抽出 → 分割 → Embedding（すべて成功してから）→ 削除 → 追加
 * → Embedding で失敗しても既存データは消えない。
 */
export async function ingestFile(filePath: string, deps: IngestDeps): Promise<FileIngestResult> {
  const { pages, chunks } = await prepareFile(filePath, deps.extract);
  const embeddings = await deps.embedDocuments(chunks.map((c) => c.embeddingText));
  const rows = toRows(chunks, embeddings);

  const fileName = chunks[0].fileName;
  await deps.store.deleteByFile(fileName);
  await deps.store.insert(rows);
  return { fileName, pages: pages.length, chunks: rows.length };
}
