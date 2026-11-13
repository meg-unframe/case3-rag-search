// テスト質問 CSV の読み込みと補正。
// 教材 CSV は「期待される回答」の金額カンマ（3,000円）がクォートされておらず、
// その行だけ列が 1 つ増えている。Excel 再保存版では全行末尾に空列も付く。

export const TEST_QUESTION_HEADER = [
  "番号",
  "質問",
  "期待される回答",
  "出典文書",
  "出典セクション",
  "種別",
] as const;

export type TestQuestion = {
  no: number;
  question: string;
  expectedAnswer: string;
  sourceDocs: string[]; // 例: ["case3-doc2-expense-manual", "case3-doc4-remote-work"]
  sourceSections: string[];
  expectNotFound: boolean;
};

export type FixLog = { line: number; action: string };

/** RFC 4180 の最小実装（クォート・エスケープ対応） */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export function toCsv(rows: string[][]): string {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}

/**
 * 列ずれを補正して 6 列にそろえる。
 * 1. 末尾の空列（Excel 再保存由来）を除去
 * 2. 7 列の行は「期待される回答」(index 2) と次列を、数字,3桁数字 のときだけカンマで再結合
 * 想定外の形は推測で直さず例外にする（人が確認する）
 */
export function fixColumns(rows: string[][]): { rows: string[][]; log: FixLog[] } {
  const n = TEST_QUESTION_HEADER.length;
  const log: FixLog[] = [];
  const fixed = rows.map((orig, idx) => {
    const line = idx + 1;
    const r = [...orig];
    while (r.length > n && r.at(-1) === "") {
      r.pop();
      log.push({ line, action: "末尾の空列を除去" });
    }
    if (r.length === n + 1 && /\d$/.test(r[2]) && /^\d{3}(\D|$)/.test(r[3])) {
      const merged = `${r[2]},${r[3]}`;
      log.push({ line, action: `期待される回答を結合: "${merged}"` });
      r.splice(2, 2, merged);
    }
    if (r.length !== n) {
      throw new Error(`${line} 行目が ${r.length} 列です（想定 ${n} 列）: ${orig.join(" | ")}`);
    }
    return r;
  });
  const header = fixed[0]?.join(",");
  if (header !== TEST_QUESTION_HEADER.join(",")) {
    throw new Error(`ヘッダーが想定と異なります: ${header}`);
  }
  return { rows: fixed, log };
}

const splitMulti = (v: string) =>
  v
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== "（記載なし）");

export function toTestQuestions(rows: string[][]): TestQuestion[] {
  return rows.slice(1).map((r) => ({
    no: Number(r[0]),
    question: r[1],
    expectedAnswer: r[2],
    sourceDocs: splitMulti(r[3]),
    sourceSections: splitMulti(r[4]),
    expectNotFound: r[5].startsWith("該当なし"),
  }));
}
