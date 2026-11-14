// 検索経路の最小確認（DB への書き込みなし・キーや資料本文は表示しない）
// 使い方: npm run check:search
//   1. 実経路: 質問 Embedding（Voyage）→ match_chunks（Supabase 読み取り）。Claude は呼ばずに件数と判定を確認
//   2. Claude: ダミー資料 1 件で「答えられる質問」「答えられない質問」を各 1 回
import { answerWith } from "@/lib/rag/answer";
import { generateAnswer } from "@/lib/rag/generate";
import { matchChunks } from "@/lib/rag/retrieve";
import { embedQuery } from "@/lib/embedding/voyage";
import { ANSWER_EFFORT, CLAUDE_MODEL, RETRIEVAL } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NOT_FOUND_MESSAGE, type RetrievedChunk } from "@/lib/types";

console.log(`設定: model=${CLAUDE_MODEL} / effort=${ANSWER_EFFORT}（RAG_CLAUDE_EFFORT${process.env.RAG_CLAUDE_EFFORT ? "" : " 未設定 → 既定値"}）/ しきい値 ${RETRIEVAL.matchThreshold} / 上位 ${RETRIEVAL.matchCount} 件\n`);

let failed = 0;
const report = (ok: boolean, msg: string) => {
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${msg}`);
};

// ---- 1. 実経路（Voyage + Supabase、Claude は呼ばない） ----
{
  const db = createSupabaseAdminClient();
  let hits = -1;
  let claudeCalled = false;
  const res = await answerWith("育児休業について教えてください。", {
    embedQuery: (q) => embedQuery(q),
    search: async (e) => {
      const r = await matchChunks(db, e, { threshold: RETRIEVAL.matchThreshold, count: RETRIEVAL.matchCount });
      hits = r.length;
      return r;
    },
    generate: async () => {
      claudeCalled = true;
      return { found: false, answer: NOT_FOUND_MESSAGE, source_ids: [] };
    },
  });
  console.log(`[実経路] 検索ヒット ${hits} 件（しきい値 ${RETRIEVAL.matchThreshold}）/ 回答生成（この確認ではスタブ）の呼び出し: ${claudeCalled ? "あり" : "なし"}`);
  if (hits === 0) report(res.answer === NOT_FOUND_MESSAGE && !claudeCalled, `0 件 → Claude を呼ばず「${res.answer}」`);
  else report(true, `ヒットあり（取り込み済みの DB）→ 判定: ${res.found ? "回答" : "該当なし"}`);
}

// ---- 2. Claude（ダミー資料） ----
const dummy: RetrievedChunk[] = [
  {
    id: 1,
    file_name: "dummy-rules.pdf",
    doc_title: "ダミー規程",
    page: 3,
    heading: "1. 備品の貸出",
    content: "会議室のプロジェクターは総務部で貸し出す。貸出期間は最長3日とする。",
    similarity: 0.9,
  },
];
{
  const r = await generateAnswer("プロジェクターは何日まで借りられますか？", dummy);
  report(r.found && r.source_ids.includes(1) && r.answer.includes("3日"), `[Claude] 答えられる質問 → found=${r.found} / 出典 id=${JSON.stringify(r.source_ids)} / 回答に「3日」${r.answer.includes("3日") ? "あり" : "なし"}`);
}
{
  const r = await generateAnswer("社員食堂の営業時間は？", dummy);
  report(!r.found && r.answer === NOT_FOUND_MESSAGE, `[Claude] 資料にない質問 → found=${r.found} / 回答="${r.answer.slice(0, 30)}"`);
}

console.log(failed === 0 ? "\n結果: すべて成功" : `\n結果: ${failed} 件失敗`);
process.exit(failed === 0 ? 0 : 1);
