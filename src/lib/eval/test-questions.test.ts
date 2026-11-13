import { describe, expect, it } from "vitest";
import { fixColumns, parseCsv, toCsv, toTestQuestions } from "./test-questions";

const HEADER = "番号,質問,期待される回答,出典文書,出典セクション,種別";

describe("fixColumns", () => {
  it("金額カンマで分かれた期待される回答を結合する", () => {
    const rows = parseCsv(`${HEADER}\n5,手当は？,月額3,000円,doc2 / doc4,5. 手当 / 4. 手当,該当あり\n`);
    const { rows: fixed, log } = fixColumns(rows);
    expect(fixed[1]).toEqual(["5", "手当は？", "月額3,000円", "doc2 / doc4", "5. 手当 / 4. 手当", "該当あり"]);
    expect(log).toHaveLength(1);
  });

  it("Excel 再保存版（CRLF・末尾空列）も補正する", () => {
    const rows = parseCsv(`${HEADER},\r\n6,上限は？,1人あたり5,000円（事前承認）,doc2,3. 接待,該当あり\r\n`);
    const { rows: fixed } = fixColumns(rows);
    expect(fixed.every((r) => r.length === 6)).toBe(true);
    expect(fixed[1][2]).toBe("1人あたり5,000円（事前承認）");
  });

  it("想定外の列ずれは推測で直さずエラーにする", () => {
    const rows = parseCsv(`${HEADER}\n7,質問,回答,余分,doc,章,該当あり\n`);
    expect(() => fixColumns(rows)).toThrow(/7 列/);
  });

  it("書き出した CSV は全項目クォートされ、読み直しても同じ", () => {
    const rows = [["a,b", 'c"d']];
    expect(toCsv(rows)).toBe('"a,b","c""d"\n');
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("toTestQuestions", () => {
  it("複数出典と該当なしを解釈する", () => {
    const qs = toTestQuestions([
      HEADER.split(","),
      ["5", "q", "a", "doc2 / doc4", "s1 / s2", "該当あり"],
      ["11", "q", "a", "（記載なし）", "（記載なし）", "該当なし（ハルシネーション検証）"],
    ]);
    expect(qs[0]).toMatchObject({ no: 5, sourceDocs: ["doc2", "doc4"], expectNotFound: false });
    expect(qs[1]).toMatchObject({ no: 11, sourceDocs: [], expectNotFound: true });
  });
});
