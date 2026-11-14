// 本番（ブラウザ計測）の 12 問評価結果を採点する。API・DB は呼ばない。
// 使い方: npm run eval:grade-prod -- <ダウンロードした case3-prod-eval.json のパス>
// 採点基準は npm run eval と同じ（data/eval/key-facts.json、出典ページ規則、該当なし判定）。
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expectedPages, gradeCitations, gradeFacts, isNotFoundResponse } from "@/lib/eval/grade";
import { parseCsv, toTestQuestions } from "@/lib/eval/test-questions";
import { extractPdfPages } from "@/lib/ingest/extract";
import { prepareFile } from "@/lib/ingest/ingest";
import type { Chunk, SearchResponse } from "@/lib/types";

const TARGET_MS = 5000;
const input = process.argv[2];
if (!input) {
  console.error("使い方: npm run eval:grade-prod -- <case3-prod-eval.json>");
  process.exit(1);
}

type BrowserRecord = {
  no: number;
  status: number;
  ms: number;
  body: (SearchResponse & { error?: string }) | null;
  error: string | null;
  serverTiming?: string | null;
  region?: string | null;
  attempts: { status: number; ms: number; error: string | null }[];
};
const run = JSON.parse(await readFile(input, "utf8")) as { origin: string; ranAt: string; userAgent: string; records: BrowserRecord[] };

const questions = toTestQuestions(parseCsv(await readFile("data/eval/test-questions.csv", "utf8")));
const keyFacts = JSON.parse(await readFile("data/eval/key-facts.json", "utf8")) as Record<string, string[]>;
const chunksByFile = new Map<string, Chunk[]>();
for (const f of ["case3-doc1-employment-rules", "case3-doc2-expense-manual", "case3-doc3-security-policy", "case3-doc4-remote-work", "case3-doc5-it-onboarding"]) {
  chunksByFile.set(`${f}.pdf`, (await prepareFile(join("data/pdfs", `${f}.pdf`), extractPdfPages)).chunks);
}

const mark = (b?: boolean) => (b === undefined ? "－" : b ? "○" : "×");
const graded = questions.map((q) => {
  const r = run.records.find((x) => x.no === q.no);
  if (!r) return { no: q.no, status: "未実行" as const };
  const retries429 = r.attempts.filter((a) => a.status === 429).length;
  if (r.status === 429) return { no: q.no, status: "未評価(429)" as const, retries429 };
  if (r.status !== 200 || !r.body || "error" in r.body) {
    return { no: q.no, status: "エラー" as const, http: r.status, error: r.body?.error ?? r.error, ms: r.ms, retries429 };
  }
  const body = r.body;
  const withinTarget = r.ms <= TARGET_MS;
  const server = r.serverTiming ?? null;
  const region = r.region ?? null;
  if (q.expectNotFound) {
    return { no: q.no, status: "ok" as const, kind: "not_found", ms: r.ms, withinTarget, retries429, server, region, notFoundCorrect: isNotFoundResponse(body), answer: body.answer, cited: [] as string[] };
  }
  const facts = keyFacts[String(q.no)];
  const g = gradeFacts(body.found ? body.answer : "", facts);
  const c = gradeCitations(body.citations, expectedPages(q, facts, chunksByFile));
  return {
    no: q.no, status: "ok" as const, kind: "answerable", ms: r.ms, withinTarget, retries429, server, region,
    answerCorrect: body.found && g.correct, missingFacts: g.missing,
    fileCorrect: c.fileCorrect, pageCorrect: c.pageCorrect, cited: c.cited, answer: body.answer,
  };
});

console.log(`本番評価（ブラウザ計測）: ${run.origin} / 実行 ${run.ranAt}\n`);
for (const g of graded) {
  if (g.status !== "ok") {
    console.log(`Q${g.no} [${g.status}]${"http" in g ? ` HTTP ${g.http} ${g.error ?? ""}` : ""}`);
    continue;
  }
  const t = `${g.ms}ms(${g.withinTarget ? "5秒以内" : "5秒超"})${g.region ? ` [${g.region}]` : ""}${g.server ? ` {${g.server}}` : ""}`;
  if (g.kind === "not_found") console.log(`Q${g.no} 該当なし:${mark(g.notFoundCorrect)} ${t} 「${g.answer.slice(0, 30)}」`);
  else console.log(`Q${g.no} 正答:${mark(g.answerCorrect)} 出典ファイル:${mark(g.fileCorrect)} ページ:${mark(g.pageCorrect)} ${t} 出典=${g.cited.join(", ") || "なし"}${g.missingFacts?.length ? ` 不足=${g.missingFacts.join("/")}` : ""}`);
}

const ok = graded.filter((g) => g.status === "ok");
const ans = ok.filter((g) => g.kind === "answerable");
const nf = ok.filter((g) => g.kind === "not_found");
const times = ok.map((g) => g.ms).sort((a, b) => a - b);
console.log(`\n=== 集計（未評価・エラーは分母から除外） ===`);
console.log(`答えがある問題の正答: ${ans.filter((g) => g.answerCorrect).length}/${ans.length}`);
console.log(`該当なし判定:       ${nf.filter((g) => g.notFoundCorrect).length}/${nf.length}`);
console.log(`出典ファイル正:     ${ans.filter((g) => g.fileCorrect).length}/${ans.length}`);
console.log(`出典ページ正:       ${ans.filter((g) => g.pageCorrect).length}/${ans.length}`);
if (times.length) {
  const med = times[Math.floor((times.length - 1) / 2)];
  console.log(`応答時間（ブラウザ・通信と認証を含む）: 最小 ${times[0]} / 中央値 ${med} / 最大 ${times.at(-1)} ms（5秒以内 ${ok.filter((g) => g.withinTarget).length}/${ok.length}）`);
}
console.log(`未評価(429): ${graded.filter((g) => g.status === "未評価(429)").map((g) => `Q${g.no}`).join(", ") || "なし"} / エラー: ${graded.filter((g) => g.status === "エラー").map((g) => `Q${g.no}`).join(", ") || "なし"} / 未実行: ${graded.filter((g) => g.status === "未実行").map((g) => `Q${g.no}`).join(", ") || "なし"}`);

const out = join("data/eval/results", `prod-eval-graded-${run.ranAt.replace(/[:.]/g, "-")}.json`);
await writeFile(out, JSON.stringify({ origin: run.origin, ranAt: run.ranAt, userAgent: run.userAgent, graded }, null, 2) + "\n", "utf8");
console.log(`\n採点結果: ${out}`);
