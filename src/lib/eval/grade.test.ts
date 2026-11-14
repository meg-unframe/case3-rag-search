import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Chunk } from "@/lib/types";
import { NOT_FOUND_MESSAGE } from "@/lib/types";
import { expectedPages, gradeCitations, gradeFacts, isNotFoundResponse, normalizeForMatch } from "./grade";
import { parseCsv, toTestQuestions } from "./test-questions";

describe("gradeFacts", () => {
  it("表記ゆれ（か月・全角・カンマ）を吸収する", () => {
    expect(gradeFacts("入社6か月経過後に１０日付与されます。", ["6ヶ月", "10日"]).correct).toBe(true);
    expect(gradeFacts("月額3,000円です", ["3000円"]).correct).toBe(true);
  });
  it("要素が欠けたら不正解とし、欠けた要素を返す", () => {
    expect(gradeFacts("月45時間までです", ["45時間", "360時間"])).toEqual({
      correct: false,
      hit: ["45時間"],
      missing: ["360時間"],
    });
  });
  it("| はどれか一方で可", () => {
    expect(gradeFacts("security@techbridge.co.jp へ30分以内", ["情報システム部|security@techbridge.co.jp", "30分"]).correct).toBe(true);
  });
  it("normalizeForMatch", () => {
    expect(normalizeForMatch("11：00〜15：00")).toBe("11:00〜15:00");
  });
});

describe("expectedPages", () => {
  const chunk = (fileName: string, page: number, heading: string, content: string): Chunk => ({
    fileName,
    docTitle: "",
    page,
    chunkIndex: 0,
    heading,
    content,
    embeddingText: "",
  });
  const byFile = new Map([
    [
      "doc5.pdf",
      [
        chunk("doc5.pdf", 1, "4. アカウント申請の流れ", "1. 申請する。2. 上長が承認する。"),
        chunk("doc5.pdf", 2, "4. アカウント申請の流れ", "3. 情報システム部が2営業日以内に発行する。"),
      ],
    ],
  ]);
  const q = { no: 9, question: "", expectedAnswer: "", sourceDocs: ["doc5"], sourceSections: ["4. アカウント申請の流れ"], expectNotFound: false };

  it("許容はセクション全ページ、必須は要素を含むページ", () => {
    const e = expectedPages(q, ["2営業日"], byFile);
    expect(e.allowed.map((p) => p.page)).toEqual([1, 2]);
    expect(e.required).toEqual([{ fileName: "doc5.pdf", page: 2 }]);
  });
  it("必須要素が見つからなければセクション全ページが必須", () => {
    expect(expectedPages(q, ["存在しない"], byFile).required.map((p) => p.page)).toEqual([1, 2]);
  });
});

describe("gradeCitations", () => {
  const expected = { allowed: [{ fileName: "a.pdf", page: 1 }, { fileName: "a.pdf", page: 2 }], required: [{ fileName: "a.pdf", page: 1 }] };
  it("ファイル・ページとも正しい", () => {
    expect(gradeCitations([{ fileName: "a.pdf", page: 1, heading: null }], expected)).toMatchObject({ fileCorrect: true, pageCorrect: true });
  });
  it("必須ページを含まなければページ不正（同じセクションの別ページのみ）", () => {
    expect(gradeCitations([{ fileName: "a.pdf", page: 2, heading: null }], expected)).toMatchObject({ fileCorrect: true, pageCorrect: false });
  });
  it("必須ページ＋同じセクションの続きページは正", () => {
    const r = gradeCitations([{ fileName: "a.pdf", page: 1, heading: null }, { fileName: "a.pdf", page: 2, heading: null }], expected);
    expect(r).toMatchObject({ fileCorrect: true, pageCorrect: true });
  });
  it("セクション外のページが混ざれば不正", () => {
    const r = gradeCitations([{ fileName: "a.pdf", page: 1, heading: null }, { fileName: "a.pdf", page: 3, heading: null }], expected);
    expect(r.pageCorrect).toBe(false);
  });
  it("余計な出典が混ざれば不正", () => {
    const r = gradeCitations([{ fileName: "a.pdf", page: 1, heading: null }, { fileName: "b.pdf", page: 1, heading: null }], expected);
    expect(r).toMatchObject({ fileCorrect: false, pageCorrect: false });
  });
  it("出典なしは不正", () => {
    expect(gradeCitations([], expected)).toMatchObject({ fileCorrect: false, pageCorrect: false });
  });
});

describe("isNotFoundResponse", () => {
  it("固定文言・found=false・出典なしのときだけ true", () => {
    expect(isNotFoundResponse({ found: false, answer: NOT_FOUND_MESSAGE, citations: [] })).toBe(true);
    expect(isNotFoundResponse({ found: true, answer: "育児休業は…", citations: [] })).toBe(false);
  });
});

// テスト質問 CSV は教材のため Git に含めない。配置されているときだけ実行する（data/README.md）
const hasQuestions = existsSync(join(process.cwd(), "data/eval/test-questions.csv"));

describe.skipIf(!hasQuestions)("評価データの整合性（配置時のみ）", () => {
  it("答えがある 10 問すべてに必須要素が定義され、期待回答に含まれている", () => {
    const qs = toTestQuestions(parseCsv(readFileSync(join(process.cwd(), "data/eval/test-questions.csv"), "utf8")));
    const facts = JSON.parse(readFileSync(join(process.cwd(), "data/eval/key-facts.json"), "utf8")) as Record<string, string[]>;
    const answerable = qs.filter((q) => !q.expectNotFound);
    expect(answerable).toHaveLength(10);
    expect(qs.filter((q) => q.expectNotFound)).toHaveLength(2);
    for (const q of answerable) {
      expect(facts[String(q.no)], `Q${q.no}`).toBeDefined();
      // 期待回答そのものは必ず正答判定になる（基準が厳しすぎないこと）
      expect(gradeFacts(q.expectedAnswer, facts[String(q.no)]).correct, `Q${q.no}`).toBe(true);
    }
  });
});
