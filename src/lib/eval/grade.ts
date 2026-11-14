// 12 問評価の採点（純粋関数。API を呼ばない）
import { normalizeText } from "@/lib/ingest/normalize";
import { type Chunk, type Citation, NOT_FOUND_MESSAGE, type SearchResponse } from "@/lib/types";
import type { TestQuestion } from "./test-questions";

/** 照合用の正規化: NFKC・部首文字・空白・カンマ除去・「か月」表記ゆれ */
export function normalizeForMatch(s: string): string {
  return normalizeText(s)
    .replace(/[\s,、]/g, "")
    .replace(/[かカケヵ]月/g, "ヶ月");
}

export type FactResult = { correct: boolean; hit: string[]; missing: string[] };

/** 必須要素がすべて回答に含まれるか（'a|b' はどちらか一方で可） */
export function gradeFacts(answer: string, facts: string[]): FactResult {
  const a = normalizeForMatch(answer);
  const hit: string[] = [];
  const missing: string[] = [];
  for (const fact of facts) {
    const ok = fact.split("|").some((alt) => a.includes(normalizeForMatch(alt)));
    (ok ? hit : missing).push(fact);
  }
  return { correct: missing.length === 0, hit, missing };
}

export type PageRef = { fileName: string; page: number };

export type ExpectedPages = {
  /** 出典として許容するページ（出典文書 × 出典セクションの全ページ） */
  allowed: PageRef[];
  /** 答えの必須要素が書かれたページ（少なくとも 1 つは引用されている必要がある） */
  required: PageRef[];
};

/**
 * 正解の出典ページを PDF のチャンクから決める（評価実行前に固定するルール）。
 * - allowed: 出典文書 × 出典セクション（見出し）に属するチャンクの全ページ
 * - required: そのうち必須要素を含むチャンクのページ（見つからなければ allowed と同じ）
 */
export function expectedPages(q: TestQuestion, facts: string[], chunksByFile: Map<string, Chunk[]>): ExpectedPages {
  const allowed = new Map<string, PageRef>();
  const required = new Map<string, PageRef>();
  q.sourceDocs.forEach((doc, i) => {
    const fileName = `${doc}.pdf`;
    const section = q.sourceSections[i] ?? q.sourceSections[0];
    const inSection = (chunksByFile.get(fileName) ?? []).filter(
      (c) => c.heading !== null && normalizeForMatch(c.heading) === normalizeForMatch(section ?? ""),
    );
    const withFact = inSection.filter((c) =>
      facts.some((f) => f.split("|").some((alt) => normalizeForMatch(c.content).includes(normalizeForMatch(alt)))),
    );
    for (const c of inSection) allowed.set(`${fileName}#${c.page}`, { fileName, page: c.page });
    for (const c of withFact.length > 0 ? withFact : inSection) required.set(`${fileName}#${c.page}`, { fileName, page: c.page });
  });
  return { allowed: [...allowed.values()], required: [...required.values()] };
}

export type CitationResult = {
  /** 引用ファイルがすべて出典文書に含まれ、少なくとも 1 つある */
  fileCorrect: boolean;
  /** 引用ページがすべて許容ページに含まれ、かつ必須ページを 1 つ以上含む */
  pageCorrect: boolean;
  cited: string[];
  allowed: string[];
  required: string[];
};

const key = (r: PageRef) => `${r.fileName} p.${r.page}`;

export function gradeCitations(citations: Citation[], expected: ExpectedPages): CitationResult {
  const files = new Set(expected.allowed.map((e) => e.fileName));
  const allowed = new Set(expected.allowed.map(key));
  const required = new Set(expected.required.map(key));
  const cited = citations.map((c) => key(c));
  return {
    fileCorrect: cited.length > 0 && citations.every((c) => files.has(c.fileName)),
    pageCorrect: cited.length > 0 && cited.every((k) => allowed.has(k)) && cited.some((k) => required.has(k)),
    cited,
    allowed: [...allowed],
    required: [...required],
  };
}

/** 該当なし問題: found=false かつ固定文言、出典なし */
export function isNotFoundResponse(r: SearchResponse): boolean {
  return !r.found && r.answer === NOT_FOUND_MESSAGE && r.citations.length === 0;
}
