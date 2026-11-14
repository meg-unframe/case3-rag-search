"use client";

import { type FormEvent, useState } from "react";
import type { ApiError, SearchResponse } from "@/lib/types";

type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; result: SearchResponse }
  | { role: "error"; text: string };

export function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    setTurns((t) => [...t, { role: "user", text: q }]);
    setQuestion("");
    setLoading(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const body = (await res.json()) as SearchResponse | ApiError;
      if (!res.ok || "error" in body) {
        setTurns((t) => [...t, { role: "error", text: "error" in body ? body.error : `エラー (${res.status})` }]);
      } else {
        setTurns((t) => [...t, { role: "assistant", result: body }]);
      }
    } catch {
      setTurns((t) => [...t, { role: "error", text: "通信に失敗しました" }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-4 py-6" aria-live="polite">
        {turns.length === 0 && (
          <p className="text-sm text-zinc-500">
            就業規則・経費精算・セキュリティ・リモートワーク・ITツールについて質問できます。
          </p>
        )}
        {turns.map((t, i) => (
          <TurnView key={i} turn={t} />
        ))}
        {loading && <p className="text-sm text-zinc-500">検索しています…</p>}
      </div>
      <form onSubmit={onSubmit} className="sticky bottom-0 flex gap-2 border-t border-zinc-200 bg-background py-3 dark:border-zinc-800">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="例: 有給休暇は何日もらえますか？"
          maxLength={500}
          className="flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
        />
        <button
          disabled={loading || !question.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          送信
        </button>
      </form>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return <div className="ml-auto max-w-[85%] rounded-lg bg-zinc-100 px-4 py-2 dark:bg-zinc-800">{turn.text}</div>;
  }
  if (turn.role === "error") {
    return <p className="text-sm text-red-600 dark:text-red-400">{turn.text}</p>;
  }
  const { answer, citations, found } = turn.result;
  return (
    <div className="max-w-[85%] space-y-2 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <p className={`whitespace-pre-wrap ${found ? "" : "text-zinc-500"}`}>{answer}</p>
      {found && citations.length > 0 && (
        <ul className="space-y-0.5 border-t border-zinc-200 pt-2 text-xs text-zinc-500 dark:border-zinc-800">
          {citations.map((c) => (
            <li key={`${c.fileName}-${c.page}-${c.heading}`}>
              出典: {c.fileName} p.{c.page}
              {c.heading ? `（${c.heading}）` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
