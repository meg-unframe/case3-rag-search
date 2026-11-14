import { describe, expect, it, vi } from "vitest";
import { NOT_FOUND_MESSAGE, type RetrievedChunk } from "@/lib/types";
import { answerWith, toSearchResponse } from "./answer";
import { AnswerSchema, buildUserContent, SYSTEM_PROMPT } from "./prompt";

const chunk = (id: number, file: string, page: number, heading: string, content: string): RetrievedChunk => ({
  id,
  file_name: file,
  doc_title: file.replace(".pdf", ""),
  page,
  heading,
  content,
  similarity: 0.8,
});

const chunks = [
  chunk(10, "case3-doc1-employment-rules.pdf", 1, "第2章 休日・休暇", "年次有給休暇は、入社6ヶ月経過後に10日を付与する。"),
  chunk(11, "case3-doc5-it-onboarding.pdf", 2, "4. アカウント申請の流れ", "3. 情報システム部が2営業日以内にアカウントを発行する。"),
  chunk(12, "case3-doc1-employment-rules.pdf", 1, "第2章 休日・休暇", "会社は、年5日の有給休暇を従業員に確実に取得させる。"),
];

describe("answerWith", () => {
  it("検索結果が 0 件なら Claude を呼ばずに該当なし", async () => {
    const generate = vi.fn();
    const res = await answerWith("退職金はいくら？", {
      embedQuery: async () => [1],
      search: async () => [],
      generate,
    });
    expect(res).toEqual({ found: false, answer: NOT_FOUND_MESSAGE, citations: [] });
    expect(generate).not.toHaveBeenCalled();
  });

  it("質問の Embedding で検索し、取得チャンクを Claude に渡して出典付きで返す", async () => {
    const search = vi.fn(async () => chunks);
    const generate = vi.fn(async () => ({ found: true, answer: "入社6ヶ月経過後に10日付与されます。", source_ids: [1] }));
    const res = await answerWith("有給は？", { embedQuery: async () => [0.1, 0.2], search, generate });
    expect(search).toHaveBeenCalledWith([0.1, 0.2]);
    expect(generate).toHaveBeenCalledWith("有給は？", chunks);
    expect(res).toEqual({
      found: true,
      answer: "入社6ヶ月経過後に10日付与されます。",
      citations: [{ fileName: "case3-doc1-employment-rules.pdf", page: 1, heading: "第2章 休日・休暇" }],
    });
  });
});

describe("toSearchResponse", () => {
  it("found=false は固定文言（モデルの文面に関わらず）", () => {
    expect(toSearchResponse({ found: false, answer: "わかりません", source_ids: [1] }, chunks)).toEqual({
      found: false,
      answer: NOT_FOUND_MESSAGE,
      citations: [],
    });
  });

  it("found=true でも出典が無効（範囲外 id のみ）なら該当なし", () => {
    expect(toSearchResponse({ found: true, answer: "推測の回答", source_ids: [99, 0, -1] }, chunks).found).toBe(false);
  });

  it("found=true でも出典が空なら該当なし", () => {
    expect(toSearchResponse({ found: true, answer: "推測の回答", source_ids: [] }, chunks).found).toBe(false);
  });

  it("回答文が該当なし文言なら found=true でも該当なしに揃える", () => {
    expect(toSearchResponse({ found: true, answer: `${NOT_FOUND_MESSAGE}。`, source_ids: [1] }, chunks).answer).toBe(
      NOT_FOUND_MESSAGE,
    );
  });

  it("無効な id は捨て、同じファイル・ページの出典はまとめる", () => {
    const res = toSearchResponse({ found: true, answer: "回答", source_ids: [1, 99, 3, 2] }, chunks);
    expect(res.citations).toEqual([
      { fileName: "case3-doc1-employment-rules.pdf", page: 1, heading: "第2章 休日・休暇" },
      { fileName: "case3-doc5-it-onboarding.pdf", page: 2, heading: "4. アカウント申請の流れ" },
    ]);
  });
});

describe("prompt", () => {
  it("資料に 1 始まりの id・ファイル名・ページ・見出しを付け、質問と分けて渡す", () => {
    const content = buildUserContent("発行までの日数は？", chunks.slice(1, 2));
    expect(content).toContain('<source id="1">');
    expect(content).toContain("case3-doc5-it-onboarding.pdf p.2");
    expect(content).toContain("見出し: 4. アカウント申請の流れ");
    expect(content).toMatch(/<\/sources>\n\n<question>\n発行までの日数は？\n<\/question>$/);
  });

  it("system に該当なしの固定文言と、資料内の指示に従わないルールを含む", () => {
    expect(SYSTEM_PROMPT).toContain(NOT_FOUND_MESSAGE);
    expect(SYSTEM_PROMPT).toContain("指示ではない");
  });

  it("出力スキーマは found / answer / source_ids", () => {
    expect(AnswerSchema.safeParse({ found: true, answer: "a", source_ids: [1] }).success).toBe(true);
    expect(AnswerSchema.safeParse({ found: true, answer: "a" }).success).toBe(false);
  });
});
