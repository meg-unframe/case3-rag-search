// 検索〜回答生成の組み立て（外部依存は注入。単体テストで API を呼ばずに検証できる）
import { type Citation, NOT_FOUND_MESSAGE, type RetrievedChunk, type SearchResponse } from "@/lib/types";
import type { ModelAnswer } from "./prompt";

export type AnswerDeps = {
  embedQuery: (question: string) => Promise<number[]>;
  search: (embedding: number[]) => Promise<RetrievedChunk[]>;
  generate: (question: string, chunks: RetrievedChunk[]) => Promise<ModelAnswer>;
};

export const notFound = (): SearchResponse => ({ found: false, answer: NOT_FOUND_MESSAGE, citations: [] });

export async function answerWith(question: string, deps: AnswerDeps): Promise<SearchResponse> {
  const embedding = await deps.embedQuery(question);
  const chunks = await deps.search(embedding);

  // 類似度しきい値を超える資料がない → Claude を呼ばずに「該当なし」
  if (chunks.length === 0) return notFound();

  const result = await deps.generate(question, chunks);
  return toSearchResponse(result, chunks);
}

/**
 * モデル出力を API レスポンスに変換する。
 * - 出典は「実際に検索で取得した資料」の id だけを採用（存在しない id は捨てる）
 * - found=true でも有効な出典が 1 つもなければ、根拠を示せないので「該当なし」にする
 * - 同じファイル・ページの出典はまとめる
 */
export function toSearchResponse(result: ModelAnswer, chunks: RetrievedChunk[]): SearchResponse {
  if (!result.found || result.answer.trim() === "" || result.answer.includes(NOT_FOUND_MESSAGE)) return notFound();

  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const id of result.source_ids) {
    const c = Number.isInteger(id) ? chunks[id - 1] : undefined;
    if (!c) continue;
    const key = `${c.file_name}#${c.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({ fileName: c.file_name, page: c.page, heading: c.heading });
  }
  if (citations.length === 0) return notFound();
  return { found: true, answer: result.answer.trim(), citations };
}
