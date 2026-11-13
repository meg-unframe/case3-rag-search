// 教材のテスト質問 CSV を補正して data/eval/test-questions.csv に書き出す。
// 使い方: npm run eval:fix-csv [-- 入力パス]
import { readFile, writeFile } from "node:fs/promises";
import { fixColumns, parseCsv, toCsv, toTestQuestions } from "@/lib/eval/test-questions";

const input = process.argv[2] ?? "data/eval/raw/case3-test-questions.csv";
const output = "data/eval/test-questions.csv";

const raw = parseCsv(await readFile(input, "utf8"));
console.log(`入力: ${input}（${raw.length} 行、列数 ${[...new Set(raw.map((r) => r.length))].join("/")}）`);

const { rows, log } = fixColumns(raw);
for (const l of log) console.log(`  ${l.line} 行目: ${l.action}`);

await writeFile(output, toCsv(rows), "utf8");

// 書き出したファイルを読み直して検証
const check = parseCsv(await readFile(output, "utf8"));
const bad = check.filter((r) => r.length !== 6);
if (bad.length > 0) throw new Error(`検証失敗: 6 列でない行が ${bad.length} 行あります`);
const qs = toTestQuestions(check);
console.log(`出力: ${output}（質問 ${qs.length} 問、全行 6 列、該当なし ${qs.filter((q) => q.expectNotFound).length} 問）`);
