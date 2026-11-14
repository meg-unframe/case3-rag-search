import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PageText } from "@/lib/types";
import { extractPdfPages } from "./extract";
import { ingestFile, prepareFile } from "./ingest";
import { type ChunkRow, type ChunkStore, toRows } from "./store";

const pages: PageText[] = [
  { fileName: "doc.pdf", page: 1, text: "テスト規程\n1. 申請\n申請は前日までに行う。" },
  { fileName: "doc.pdf", page: 2, text: "2. 返却\n返却は最終日までに行う。" },
];

function memoryStore() {
  const rows: ChunkRow[] = [];
  const calls: string[] = [];
  const store: ChunkStore = {
    async deleteByFile(f) {
      calls.push(`delete:${f}`);
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].file_name === f) rows.splice(i, 1);
    },
    async insert(r) {
      calls.push(`insert:${r.length}`);
      rows.push(...r);
    },
  };
  return { store, rows, calls };
}

const fakeEmbed = async (texts: string[]) => texts.map((_, i) => [i]);

describe("ingestFile", () => {
  it("ファイル名・ページ番号・見出し・Embedding を対応づけて保存する", async () => {
    const { store, rows } = memoryStore();
    const res = await ingestFile("x", { extract: async () => pages, embedDocuments: fakeEmbed, store });
    expect(res).toEqual({ fileName: "doc.pdf", pages: 2, chunks: 3 });
    expect(rows.map((r) => [r.file_name, r.page, r.chunk_index, r.heading, r.embedding[0]])).toEqual([
      ["doc.pdf", 1, 0, "文書情報", 0],
      ["doc.pdf", 1, 1, "1. 申請", 1],
      ["doc.pdf", 2, 2, "2. 返却", 2],
    ]);
  });

  it("Embedding には文書名と見出しを前置したテキストを渡す", async () => {
    const embed = vi.fn(fakeEmbed);
    await ingestFile("x", { extract: async () => pages, embedDocuments: embed, store: memoryStore().store });
    expect(embed.mock.calls[0][0][1]).toBe("テスト規程 > 1. 申請\n申請は前日までに行う。");
  });

  it("再実行してもファイル単位で入れ替わり、重複しない", async () => {
    const { store, rows } = memoryStore();
    const deps = { extract: async () => pages, embedDocuments: fakeEmbed, store };
    await ingestFile("x", deps);
    await ingestFile("x", deps);
    expect(rows).toHaveLength(3);
  });

  it("Embedding が失敗したら既存データを削除しない", async () => {
    const { store, calls } = memoryStore();
    const failing = async () => {
      throw new Error("voyage down");
    };
    await expect(ingestFile("x", { extract: async () => pages, embedDocuments: failing, store })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("削除 → 追加の順に実行する", async () => {
    const { store, calls } = memoryStore();
    await ingestFile("x", { extract: async () => pages, embedDocuments: fakeEmbed, store });
    expect(calls).toEqual(["delete:doc.pdf", "insert:3"]);
  });
});

describe("toRows", () => {
  it("件数が合わなければエラー", () => {
    expect(() => toRows([], [[1]])).toThrow(/一致しません/);
  });
});

describe("教材 PDF（キー不要・DB 不使用）", () => {
  const dir = join(process.cwd(), "data/pdfs");
  it.each([
    ["case3-doc1-employment-rules.pdf", 2],
    ["case3-doc2-expense-manual.pdf", 2],
    ["case3-doc3-security-policy.pdf", 2],
    ["case3-doc4-remote-work.pdf", 1],
    ["case3-doc5-it-onboarding.pdf", 2],
  ])("%s: 全ページからチャンクができ、ページ番号が実ページ内に収まる", async (file, pageCount) => {
    const { pages, chunks } = await prepareFile(join(dir, file), extractPdfPages);
    expect(pages).toHaveLength(pageCount);
    expect(new Set(chunks.map((c) => c.page))).toEqual(new Set(Array.from({ length: pageCount }, (_, i) => i + 1)));
    expect(chunks.every((c) => c.fileName === file && c.content.length > 0)).toBe(true);
  });

  it("テスト質問の根拠がページ情報つきで含まれる", async () => {
    const all = (
      await Promise.all(
        ["case3-doc1-employment-rules.pdf", "case3-doc5-it-onboarding.pdf", "case3-doc2-expense-manual.pdf"].map(
          async (f) => (await prepareFile(join(dir, f), extractPdfPages)).chunks,
        ),
      )
    ).flat();
    const find = (s: string) => all.find((c) => c.content.includes(s));
    expect(find("入社6ヶ月経過後に10日")).toMatchObject({ page: 1, heading: "第2章 休日・休暇" });
    expect(find("2営業日以内")).toMatchObject({ page: 2, heading: "4. アカウント申請の流れ" });
    expect(find("1人あたり5,000円")).toMatchObject({ page: 1, heading: "3. 接待交際費" });
  });
});
