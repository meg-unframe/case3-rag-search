// 12 問評価（本番と同じ検索・回答経路を使う。DB は読み取りのみ）
// 使い方: npm run eval [-- --pace 21000]
//
// - 応答時間 = 質問 Embedding + match_chunks + Claude 回答生成（サーバー内処理。HTTP・認証の往復は含まない）
// - 429 は 30 → 60 → 120 秒待って再試行。解消しなければ「未評価」（不正解に数えない）
// - 429 以外の失敗は「エラー」（不正解に数えない）
// - Voyage 無料枠（3 RPM）に合わせ、問ごとに --pace ミリ秒あける（待機は応答時間に含めない）
import Anthropic from "@anthropic-ai/sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { embedQuery, VoyageError } from "@/lib/embedding/voyage";
import { ANSWER_EFFORT, CLAUDE_MODEL, EMBEDDING, RETRIEVAL } from "@/lib/env";
import { expectedPages, gradeCitations, gradeFacts, isNotFoundResponse } from "@/lib/eval/grade";
import { parseCsv, toTestQuestions } from "@/lib/eval/test-questions";
import { extractPdfPages } from "@/lib/ingest/extract";
import { prepareFile } from "@/lib/ingest/ingest";
import { answerWith } from "@/lib/rag/answer";
import { generateAnswer } from "@/lib/rag/generate";
import { matchChunks } from "@/lib/rag/retrieve";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Chunk, RetrievedChunk, SearchResponse } from "@/lib/types";

const TARGET_MS = 5000;
const RETRY_WAITS_MS = [30_000, 60_000, 120_000];
const args = process.argv.slice(2);
const PACE_MS = args.includes("--pace") ? Number(args[args.indexOf("--pace") + 1]) : 21_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const questions = toTestQuestions(parseCsv(await readFile("data/eval/test-questions.csv", "utf8")));
const keyFacts = JSON.parse(await readFile("data/eval/key-facts.json", "utf8")) as Record<string, string[]>;

// 正解ページ算出用にローカル PDF をチャンク化（DB・API 不使用）
const chunksByFile = new Map<string, Chunk[]>();
for (const f of ["case3-doc1-employment-rules", "case3-doc2-expense-manual", "case3-doc3-security-policy", "case3-doc4-remote-work", "case3-doc5-it-onboarding"]) {
  const { chunks } = await prepareFile(join("data/pdfs", `${f}.pdf`), extractPdfPages);
  chunksByFile.set(`${f}.pdf`, chunks);
}

const db = createSupabaseAdminClient();

type Status = "ok" | "unevaluated_429" | "error";
type Record_ = {
  no: number;
  question: string;
  kind: "answerable" | "not_found";
  status: Status;
  error?: string;
  retries429: number;
  ms?: { total: number; embed: number; search: number; generate: number };
  claudeCalled?: boolean;
  retrieved?: { file: string; page: number; similarity: number }[];
  response?: SearchResponse;
  answerCorrect?: boolean;
  missingFacts?: string[];
  notFoundCorrect?: boolean;
  citation?: ReturnType<typeof gradeCitations>;
  withinTarget?: boolean;
};

const is429 = (e: unknown) =>
  (e instanceof VoyageError && e.status === 429) || e instanceof Anthropic.RateLimitError;

async function runOnce(question: string) {
  const t: number[] = [performance.now()];
  let retrieved: RetrievedChunk[] = [];
  let claudeCalled = false;
  const response = await answerWith(question, {
    embedQuery: async (q) => {
      const v = await embedQuery(q, { maxRetries: 0 }); // 429 は外側で待機・再試行
      t.push(performance.now());
      return v;
    },
    search: async (e) => {
      retrieved = await matchChunks(db, e, { threshold: RETRIEVAL.matchThreshold, count: RETRIEVAL.matchCount });
      t.push(performance.now());
      return retrieved;
    },
    generate: async (q, c) => {
      claudeCalled = true;
      return generateAnswer(q, c);
    },
  });
  const end = performance.now();
  const [start, afterEmbed, afterSearch] = t;
  return {
    response,
    claudeCalled,
    retrieved,
    ms: {
      total: Math.round(end - start),
      embed: Math.round(afterEmbed - start),
      search: Math.round(afterSearch - afterEmbed),
      generate: Math.round(end - afterSearch),
    },
  };
}

console.log(`評価開始: ${questions.length} 問 / model=${CLAUDE_MODEL} effort=${ANSWER_EFFORT} / ${EMBEDDING.model} / しきい値 ${RETRIEVAL.matchThreshold} 上位 ${RETRIEVAL.matchCount} 件 / 間隔 ${PACE_MS}ms\n`);
const records: Record_[] = [];

for (const [i, q] of questions.entries()) {
  if (i > 0) await sleep(PACE_MS);
  const rec: Record_ = { no: q.no, question: q.question, kind: q.expectNotFound ? "not_found" : "answerable", status: "ok", retries429: 0 };
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await runOnce(q.question);
      Object.assign(rec, {
        status: "ok",
        response: r.response,
        ms: r.ms,
        claudeCalled: r.claudeCalled,
        retrieved: r.retrieved.map((c) => ({ file: c.file_name, page: c.page, similarity: Number(c.similarity.toFixed(3)) })),
        withinTarget: r.ms.total <= TARGET_MS,
      });
      break;
    } catch (e) {
      if (is429(e) && attempt < RETRY_WAITS_MS.length) {
        rec.retries429++;
        console.log(`  Q${q.no}: 429 → ${RETRY_WAITS_MS[attempt] / 1000} 秒待って再試行`);
        await sleep(RETRY_WAITS_MS[attempt]);
        continue;
      }
      rec.status = is429(e) ? "unevaluated_429" : "error";
      rec.error = e instanceof Error ? `${e.name}${"status" in e ? ` ${String((e as { status?: number }).status)}` : ""}` : "unknown";
      break;
    }
  }

  if (rec.status === "ok" && rec.response) {
    if (q.expectNotFound) rec.notFoundCorrect = isNotFoundResponse(rec.response);
    else {
      const facts = keyFacts[String(q.no)];
      const g = gradeFacts(rec.response.found ? rec.response.answer : "", facts);
      rec.answerCorrect = rec.response.found && g.correct;
      rec.missingFacts = g.missing;
      rec.citation = gradeCitations(rec.response.citations, expectedPages(q, facts, chunksByFile));
    }
  }
  records.push(rec);

  const mark = (b?: boolean) => (b === undefined ? "－" : b ? "○" : "×");
  if (rec.status !== "ok") console.log(`Q${q.no} [${rec.status === "error" ? "エラー" : "未評価(429)"}] ${rec.error}`);
  else if (q.expectNotFound)
    console.log(`Q${q.no} 該当なし判定:${mark(rec.notFoundCorrect)} ${rec.ms!.total}ms Claude:${rec.claudeCalled ? "呼出" : "未呼出"} 「${rec.response!.answer.slice(0, 40)}」`);
  else
    console.log(
      `Q${q.no} 正答:${mark(rec.answerCorrect)} 出典ファイル:${mark(rec.citation?.fileCorrect)} ページ:${mark(rec.citation?.pageCorrect)} ${rec.ms!.total}ms 「${rec.response!.answer.slice(0, 50)}」 出典=${rec.citation?.cited.join(", ") || "なし"}`,
    );
}

// ---- 集計 ----
const ok = records.filter((r) => r.status === "ok");
const ans = ok.filter((r) => r.kind === "answerable");
const nf = ok.filter((r) => r.kind === "not_found");
const times = ok.map((r) => r.ms!.total).sort((a, b) => a - b);
const pct = (p: number) => times[Math.min(times.length - 1, Math.ceil((p / 100) * times.length) - 1)];
const summary = {
  evaluated: ok.length,
  unevaluated429: records.filter((r) => r.status === "unevaluated_429").map((r) => r.no),
  errors: records.filter((r) => r.status === "error").map((r) => ({ no: r.no, error: r.error })),
  answerable: { evaluated: ans.length, correct: ans.filter((r) => r.answerCorrect).length },
  notFound: { evaluated: nf.length, correct: nf.filter((r) => r.notFoundCorrect).length },
  citations: {
    evaluated: ans.length,
    fileCorrect: ans.filter((r) => r.citation?.fileCorrect).length,
    pageCorrect: ans.filter((r) => r.citation?.pageCorrect).length,
  },
  latencyMs: times.length ? { min: times[0], median: pct(50), p90: pct(90), max: times.at(-1), withinTarget: ok.filter((r) => r.withinTarget).length } : null,
  config: { model: CLAUDE_MODEL, effort: ANSWER_EFFORT, embedding: EMBEDDING.model, threshold: RETRIEVAL.matchThreshold, topK: RETRIEVAL.matchCount, targetMs: TARGET_MS },
};

console.log(`\n=== 集計（未評価・エラーは分母から除外） ===`);
console.log(`答えがある問題の正答: ${summary.answerable.correct}/${summary.answerable.evaluated}`);
console.log(`該当なし判定:       ${summary.notFound.correct}/${summary.notFound.evaluated}`);
console.log(`出典ファイル正:     ${summary.citations.fileCorrect}/${summary.citations.evaluated}`);
console.log(`出典ページ正:       ${summary.citations.pageCorrect}/${summary.citations.evaluated}`);
if (summary.latencyMs)
  console.log(`応答時間: 最小 ${summary.latencyMs.min} / 中央値 ${summary.latencyMs.median} / p90 ${summary.latencyMs.p90} / 最大 ${summary.latencyMs.max} ms（5秒以内 ${summary.latencyMs.withinTarget}/${ok.length}）`);
console.log(`未評価(429): ${summary.unevaluated429.length ? summary.unevaluated429.map((n) => `Q${n}`).join(", ") : "なし"} / エラー: ${summary.errors.length ? JSON.stringify(summary.errors) : "なし"}`);

await mkdir("data/eval/results", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = join("data/eval/results", `eval-${stamp}.json`);
await writeFile(out, JSON.stringify({ runAt: new Date().toISOString(), summary, records }, null, 2) + "\n", "utf8");
console.log(`\n詳細: ${out}`);
