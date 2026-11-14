import { describe, expect, it } from "vitest";
import { DEFAULT_ANSWER_EFFORT, RETRIEVAL, resolveAnswerEffort } from "./env";

describe("resolveAnswerEffort", () => {
  it("既定値は評価済みの medium", () => {
    expect(DEFAULT_ANSWER_EFFORT).toBe("medium");
    expect(resolveAnswerEffort({})).toBe("medium");
  });

  it("RAG_CLAUDE_EFFORT を読む", () => {
    expect(resolveAnswerEffort({ RAG_CLAUDE_EFFORT: "high" })).toBe("high");
    expect(resolveAnswerEffort({ RAG_CLAUDE_EFFORT: " low " })).toBe("low");
  });

  it("CLAUDE_EFFORT（Claude Code 側の変数）は読まない", () => {
    expect(resolveAnswerEffort({ CLAUDE_EFFORT: "low" })).toBe("medium");
    expect(resolveAnswerEffort({ CLAUDE_EFFORT: "max", RAG_CLAUDE_EFFORT: "high" })).toBe("high");
  });

  it("不正な値は既定値に戻す", () => {
    expect(resolveAnswerEffort({ RAG_CLAUDE_EFFORT: "ultra" })).toBe("medium");
    expect(resolveAnswerEffort({ RAG_CLAUDE_EFFORT: "" })).toBe("medium");
  });
});

describe("検索しきい値（評価時の設定を維持）", () => {
  it("未設定時は 0.3 / 上位 5 件", () => {
    // テスト環境では RAG_MATCH_* を設定していない前提
    expect(RETRIEVAL.matchThreshold).toBe(0.3);
    expect(RETRIEVAL.matchCount).toBe(5);
  });
});
