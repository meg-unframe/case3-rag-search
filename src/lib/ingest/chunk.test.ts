import { describe, expect, it } from "vitest";
import { chunkDocument } from "./chunk";
import { isHeading, joinWrappedLines, normalizeText, scanRadicals } from "./normalize";

describe("normalizeText", () => {
  it("康煕部首・部首補助の文字を通常の漢字に変換する", () => {
    // ⽇(U+2F47) ⽉(U+2F49) は NFKC、⻑(U+2ED1) ⺠(U+2EA0) は個別マップ
    const t = normalizeText("改定⽇ 2025年7⽉ 上⻑ 国⺠");
    expect(t).toBe("改定日 2025年7月 上長 国民");
    expect(scanRadicals(t)).toEqual([]);
  });
});

describe("isHeading", () => {
  it.each([
    ["第2章 休日・休暇", true],
    ["1. パスワード管理", true],
    ["2. デバイス・PC の取り扱い", true],
    ["3. 情報システム部が2営業日以内にアカウントを発行する。", false], // 手順の箇条書き
    ["リモートワークは週3日までとする。", false],
  ])("%s → %s", (line, expected) => {
    expect(isHeading(line)).toBe(expected);
  });
});

describe("joinWrappedLines", () => {
  it("本文幅で折り返された行だけを結合する", () => {
    const lines = [
      "タクシーの利用は原則禁止。ただし22:00以降の業務や重い機材の運搬時は、理由を添えて申請",
      "すれば認める。",
      "Slack(社内コミュニケーション)",
      "1Password(パスワード管理)",
    ];
    expect(joinWrappedLines(lines)).toEqual([
      "タクシーの利用は原則禁止。ただし22:00以降の業務や重い機材の運搬時は、理由を添えて申請すれば認める。",
      "Slack(社内コミュニケーション)",
      "1Password(パスワード管理)",
    ]);
  });
});

describe("chunkDocument", () => {
  const pages = [
    {
      fileName: "doc.pdf",
      page: 1,
      text: "テスト規程\n改定日: 2025年1月1日\n1. 申請\n申請は前日までに行う。\n2. 承認の流れ\n1. 申請する。\n2. 上長が承認する。",
    },
    { fileName: "doc.pdf", page: 2, text: "3. 2営業日以内に発行する。\n3. 返却\n返却は最終日までに行う。" },
  ];
  const chunks = chunkDocument(pages);

  it("ページをまたがず、ページ番号を保持する", () => {
    expect(chunks.map((c) => [c.page, c.heading])).toEqual([
      [1, "文書情報"],
      [1, "1. 申請"],
      [1, "2. 承認の流れ"],
      [2, "2. 承認の流れ"], // 見出しは次ページへ引き継ぐ
      [2, "3. 返却"],
    ]);
  });

  it("embeddingText に文書タイトルと見出しを前置する", () => {
    expect(chunks[3].embeddingText).toBe("テスト規程 > 2. 承認の流れ\n3. 2営業日以内に発行する。");
    expect(chunks[3].content).toBe("3. 2営業日以内に発行する。");
  });

  it("chunkIndex はファイル内の通し番号", () => {
    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it("長いセクションは行単位で分割し、1行重ねる", () => {
    const long = { fileName: "x.pdf", page: 1, text: "T\n1. 見出し\n" + ["あ".repeat(30), "い".repeat(30), "う".repeat(30)].join("\n") };
    const parts = chunkDocument([long], { maxChars: 60, overlapLines: 1 }).filter((c) => c.heading === "1. 見出し");
    expect(parts.map((c) => c.content.split("\n").map((l) => l[0]).join(""))).toEqual(["あい", "いう"]);
  });
});
